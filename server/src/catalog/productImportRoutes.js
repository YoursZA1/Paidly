/**
 * POST /api/company/product-import?op=check|commit — Product Import (Excel / CSV / PDF).
 *
 * Mounted inside the existing api/company function (no new Vercel function). The browser reads the
 * document, maps columns and lets the person review every row; this route is the only writer:
 *
 *   check   which rows already exist in the company's catalogue (SKU → barcode → name)
 *   commit  ≤100 reviewed rows: re-validated here, duplicates re-checked here, then created / updated
 *
 * Every op: bearer session → company resolved server-side (loadCompanyMembership — a company id in the
 * body or the document is never used) → owner or company admin (the Products page is owner-only; RLS
 * alone would admit any non-till member) → plan includes inventory (products) or invoices (services).
 * Company data is read/written with the caller's JWT so RLS and the plan trigger also apply.
 *
 * Idempotent: each created row carries services.import_ref = "{import_id}:{row}", unique per company,
 * so a retried batch returns the rows it already created instead of creating them again.
 */
import { randomUUID } from "node:crypto";
import { normalizeRequestBody } from "../validateBody.js";
import { getUserFromRequest as defaultGetUser } from "../supabaseAuth.js";
import { loadCompanyMembership, companyMembershipOptions } from "../companyRouteAccess.js";
import { assertUserHasFeature, UpgradeRequiredError } from "../featureGate.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import {
  IMPORT_LIMITS,
  barcodeTakenBy,
  catalogColumnsForImport,
  classifyDuplicate,
  identifierKey,
  importRef,
  validateImportRow,
} from "../../../shared/catalog/productImport.js";
import { consumePersistedRateLimit } from "../rateLimit/consumeRateLimit.js";
import { createProductImportRepo } from "./productImportRepo.js";

const COMMIT_LIMIT = { hits: 300, windowMs: 60 * 60 * 1000 };
const CHECK_LIMIT = { hits: 300, windowMs: 60 * 60 * 1000 };
const STOCK_CONCURRENCY = 4;

export const PRODUCT_IMPORT_MESSAGES = Object.freeze({
  unauthorized: "Your session has ended. Sign in again to continue.",
  noCompany: "You're not part of a business on Paidly yet.",
  forbidden: "Only the business owner or an admin can import products.",
  upgradeProducts: "Importing stock-tracked products is part of the Business and Growth plans.",
  upgradeServices: "Your plan doesn't include the catalogue. Upgrade to import items.",
  tooMany: "That's a lot of imports in the last hour. Please wait a little and try again.",
  badRequest: "This import request wasn't valid. Please start the import again.",
  duplicate: "Already in your catalogue",
  duplicateFix: "Choose “Update existing” or “Import as new” if you want this row.",
  barcodeTaken: "Barcode already belongs to another product",
  barcodeFix: "Use a different barcode or update the existing product instead.",
  targetMissing: "The product to update wasn't found in your catalogue.",
  targetMissingFix: "Refresh the Products page and import this row again.",
  saveFailed: "This row couldn't be saved.",
  saveFailedFix: "Check the values and try importing the row again.",
  stockFailed: "Added, but the opening stock couldn't be recorded — adjust stock on the product.",
  generic: "Something went wrong. Please try again.",
});

function send(res, status, body) {
  return res.status(status).json(body);
}

function fail(res, status, code, error, extra = {}) {
  return send(res, status, { ok: false, code, error, ...extra });
}

function bearerToken(req) {
  const h = String(req.headers?.authorization || "");
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

function itemTypeOf(body) {
  return body?.item_type === "service" ? "service" : "product";
}

function isUpgradeDbError(err) {
  const detail = `${err?.message || ""} ${err?.details || ""} ${err?.hint || ""}`;
  return String(err?.code || "") === "P0001" && /UPGRADE|SUBSCRIPTION|PLAN|entitlement/i.test(detail);
}

/** Plain sentence for a failed catalogue write; the raw error is logged, never returned. */
function friendlyWriteError(err) {
  const code = String(err?.code || "");
  const detail = `${err?.message || ""} ${err?.details || ""}`.toLowerCase();
  if (code === "23505" && detail.includes("barcode")) {
    return { reason: PRODUCT_IMPORT_MESSAGES.barcodeTaken, fix: PRODUCT_IMPORT_MESSAGES.barcodeFix };
  }
  if (code === "23505") return { reason: "A product with these details already exists.", fix: PRODUCT_IMPORT_MESSAGES.duplicateFix };
  if (code === "23514" || code === "22P02" || code === "22003") {
    return { reason: "One of the values isn't valid for a product.", fix: PRODUCT_IMPORT_MESSAGES.saveFailedFix };
  }
  if (code === "42501") return { reason: PRODUCT_IMPORT_MESSAGES.forbidden, fix: "Ask the business owner to import this file." };
  return { reason: PRODUCT_IMPORT_MESSAGES.saveFailed, fix: PRODUCT_IMPORT_MESSAGES.saveFailedFix };
}

function publicExisting(e) {
  return {
    id: e.id,
    name: e.name || "",
    sku: e.sku || null,
    barcode: e.barcode || null,
    item_type: e.item_type || "service",
    category: e.category || null,
    price: e.price != null ? Number(e.price) : null,
    cost_price: e.cost_price != null ? Number(e.cost_price) : null,
    stock_quantity: e.stock_quantity != null ? Number(e.stock_quantity) : null,
    is_active: e.is_active !== false,
  };
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * @param {{
 *   getUserFromRequest?: typeof defaultGetUser,
 *   adminClient?: any,
 *   userClientFor?: (token: string) => any,
 *   loadMembership?: (userId: string, req: any) => Promise<any>,
 *   assertFeature?: (userId: string, feature: string, companyId: string) => Promise<void>,
 *   repoFor?: (ctx: { userClient: any, adminClient: any }) => ReturnType<typeof createProductImportRepo>,
 *   rateLimit?: (key: string, hits: number, windowMs: number) => Promise<{ ok: boolean, retryAfterSeconds?: number }>,
 *   log?: (message: string, detail?: unknown) => void,
 * }} [deps]
 */
export function createProductImportHandler(deps = {}) {
  const getUser = deps.getUserFromRequest || defaultGetUser;
  const log = deps.log || ((message, detail) => console.error(`[product-import] ${message}`, detail ?? ""));
  const rateLimit = deps.rateLimit || consumePersistedRateLimit;
  let adminClientCache = deps.adminClient || null;
  const adminClient = async () => {
    if (!adminClientCache) adminClientCache = (await import("../supabaseAdmin.js")).supabaseAdmin;
    return adminClientCache;
  };
  const userClientFor =
    deps.userClientFor || (async (token) => (await import("../supabaseAnon.js")).getSupabaseUserClient(token));
  const loadMembership =
    deps.loadMembership ||
    (async (userId, req) => loadCompanyMembership(await adminClient(), userId, companyMembershipOptions(req)));
  const assertFeature =
    deps.assertFeature ||
    (async (userId, feature, companyId) => assertUserHasFeature(await adminClient(), userId, feature, { companyId }));
  const repoFor = deps.repoFor || createProductImportRepo;

  /** Auth → company → owner/admin → plan. Returns a context or writes the response. */
  async function gate(req, res, itemType) {
    const { user } = await getUser(req);
    const token = bearerToken(req);
    if (!user || !token) return { response: fail(res, 401, "UNAUTHORIZED", PRODUCT_IMPORT_MESSAGES.unauthorized) };
    const membership = await loadMembership(user.id, req);
    if (!membership?.orgId) return { response: fail(res, 403, "NO_COMPANY", PRODUCT_IMPORT_MESSAGES.noCompany) };
    if (membership.companyRole !== "admin") return { response: fail(res, 403, "FORBIDDEN", PRODUCT_IMPORT_MESSAGES.forbidden) };
    const feature = itemType === "product" ? "inventory" : "invoices";
    try {
      await assertFeature(user.id, feature, membership.orgId);
    } catch (err) {
      if (err instanceof UpgradeRequiredError || err?.code === "UPGRADE_REQUIRED") {
        const message = itemType === "product" ? PRODUCT_IMPORT_MESSAGES.upgradeProducts : PRODUCT_IMPORT_MESSAGES.upgradeServices;
        return { response: fail(res, 403, "UPGRADE_REQUIRED", message, { feature }) };
      }
      throw err;
    }
    const userClient = await userClientFor(token);
    if (!userClient) throw new Error("Supabase user client unavailable (SUPABASE_URL / anon key missing)");
    const repo = repoFor({ userClient, adminClient: await adminClient() });
    return { ctx: { user, membership, orgId: membership.orgId, repo, itemType } };
  }

  function lookupKeys(values) {
    const skus = new Set();
    const barcodes = new Set();
    const names = new Set();
    for (const v of values) {
      if (v?.sku) skus.add(String(v.sku).slice(0, IMPORT_LIMITS.sku));
      if (v?.barcode) barcodes.add(String(v.barcode).slice(0, IMPORT_LIMITS.barcode));
      if (v?.name) names.add(String(v.name).slice(0, IMPORT_LIMITS.name));
    }
    return { skus: [...skus], barcodes: [...barcodes], names: [...names] };
  }

  // ── check ────────────────────────────────────────────────────────────────────────────────
  async function check(req, res, ctx, body) {
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!rows || rows.length > IMPORT_LIMITS.checkBatchSize) return fail(res, 422, "BAD_REQUEST", PRODUCT_IMPORT_MESSAGES.badRequest);
    const budget = await rateLimit(`product-import-check:${ctx.user.id}`, CHECK_LIMIT.hits, CHECK_LIMIT.windowMs);
    if (!budget.ok) return fail(res, 429, "RATE_LIMITED", PRODUCT_IMPORT_MESSAGES.tooMany, { retry_after_seconds: budget.retryAfterSeconds });

    const keys = rows.map((r) => ({
      row_number: Number(r?.row_number),
      sku: typeof r?.sku === "string" ? r.sku.trim() : "",
      barcode: typeof r?.barcode === "string" ? r.barcode.trim() : "",
      name: typeof r?.name === "string" ? r.name.trim() : "",
    }));
    const existing = await ctx.repo.findMatches(ctx.orgId, lookupKeys(keys));
    const matches = [];
    for (const k of keys) {
      if (!Number.isInteger(k.row_number)) continue;
      const dup = classifyDuplicate(k, existing);
      const taken = barcodeTakenBy(k, existing);
      if (dup || taken) {
        matches.push({
          row_number: k.row_number,
          existing_id: dup?.match.id || null,
          matched_by: dup?.matchedBy || null,
          barcode_taken_by: taken?.id || null,
        });
      }
    }
    return send(res, 200, { ok: true, existing: existing.map(publicExisting), matches });
  }

  // ── commit ───────────────────────────────────────────────────────────────────────────────
  async function commit(req, res, ctx, body) {
    const importId = parseUuid(body.import_id);
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!importId || !rows || !rows.length || rows.length > IMPORT_LIMITS.commitBatchSize) {
      return fail(res, 422, "BAD_REQUEST", PRODUCT_IMPORT_MESSAGES.badRequest);
    }
    const seenRows = new Set();
    for (const r of rows) {
      const n = Number(r?.row_number);
      if (!Number.isInteger(n) || n < 1 || n > 1_000_000 || seenRows.has(n)) return fail(res, 422, "BAD_REQUEST", PRODUCT_IMPORT_MESSAGES.badRequest);
      seenRows.add(n);
    }
    const budget = await rateLimit(`product-import-commit:${ctx.user.id}`, COMMIT_LIMIT.hits, COMMIT_LIMIT.windowMs);
    if (!budget.ok) return fail(res, 429, "RATE_LIMITED", PRODUCT_IMPORT_MESSAGES.tooMany, { retry_after_seconds: budget.retryAfterSeconds });

    const itemType = ctx.itemType;
    const standardRate = Number(body.standard_vat_rate) > 0 && Number(body.standard_vat_rate) <= 100 ? Number(body.standard_vat_rate) : undefined;
    /** @type {Map<number, { row_number: number, outcome: string, product_id?: string, reason?: string, fix?: string, warning?: string }>} */
    const results = new Map();
    const done = (rowNumber, outcome, extra = {}) => results.set(rowNumber, { row_number: rowNumber, outcome, ...extra });

    // 1. Re-validate every row here — the browser's review is never trusted.
    const work = [];
    for (const r of rows) {
      const rowNumber = Number(r.row_number);
      const action = r.action === "update" ? "update" : "create";
      const checked = validateImportRow(r.values && typeof r.values === "object" ? r.values : {}, { itemType, standardRate });
      if (checked.errors.length) {
        done(rowNumber, "failed", { reason: checked.errors[0].message, fix: checked.errors[0].fix });
        continue;
      }
      work.push({
        rowNumber,
        action,
        targetId: action === "update" ? parseUuid(r.target_id) : null,
        allowDuplicate: r.allow_duplicate === true,
        checked,
        ref: importRef(importId, rowNumber),
      });
    }

    // 2. Rows an earlier attempt of this import already created.
    const creates = work.filter((w) => w.action === "create");
    const already = new Map((await ctx.repo.findByImportRefs(ctx.orgId, creates.map((w) => w.ref))).map((row) => [row.import_ref, row]));
    const pendingStock = [];
    for (const w of creates) {
      const prior = already.get(w.ref);
      if (!prior) continue;
      done(w.rowNumber, "created", { product_id: prior.id, replayed: true });
      const wanted = w.checked.value.stock;
      if (itemType === "product" && wanted > 0 && Number(prior.stock_quantity || 0) === 0) {
        pendingStock.push({ w, productId: prior.id, repair: true });
      }
    }

    // 3. Duplicates and barcode conflicts, re-checked against the company's catalogue right now.
    const open = work.filter((w) => !results.has(w.rowNumber));
    const existing = await ctx.repo.findMatches(ctx.orgId, lookupKeys(open.map((w) => w.checked.value)));
    const targets = new Map(
      (await ctx.repo.findByIds(ctx.orgId, [...new Set(open.filter((w) => w.targetId).map((w) => w.targetId))])).map((t) => [t.id, t])
    );
    const batchBarcodes = new Map();
    const toInsert = [];
    const toUpdate = [];
    for (const w of open) {
      const value = w.checked.value;
      const target = w.action === "update" ? targets.get(w.targetId) : null;
      if (w.action === "update") {
        const typeMatches = target && (itemType === "product" ? target.item_type === "product" : target.item_type !== "product");
        if (!target || !typeMatches) {
          done(w.rowNumber, "failed", { reason: PRODUCT_IMPORT_MESSAGES.targetMissing, fix: PRODUCT_IMPORT_MESSAGES.targetMissingFix });
          continue;
        }
      }
      if (itemType === "product" && value.barcode) {
        const key = identifierKey(value.barcode);
        const taken = barcodeTakenBy(value, existing, { excludeId: target?.id || null });
        const inBatch = batchBarcodes.get(key);
        if (taken || (inBatch && inBatch !== (target?.id || w.ref))) {
          done(w.rowNumber, "failed", { reason: PRODUCT_IMPORT_MESSAGES.barcodeTaken, fix: PRODUCT_IMPORT_MESSAGES.barcodeFix });
          continue;
        }
        batchBarcodes.set(key, target?.id || w.ref);
      }
      if (w.action === "create") {
        const dup = classifyDuplicate(value, existing);
        if (dup && !w.allowDuplicate) {
          const by = dup.matchedBy === "sku" ? "SKU" : dup.matchedBy === "barcode" ? "barcode" : "name";
          done(w.rowNumber, "skipped", { reason: `${PRODUCT_IMPORT_MESSAGES.duplicate} (same ${by} as “${String(dup.match.name || "").slice(0, 60)}”).`, fix: PRODUCT_IMPORT_MESSAGES.duplicateFix, product_id: dup.match.id });
          continue;
        }
        toInsert.push(w);
      } else {
        toUpdate.push({ w, target });
      }
    }

    // 4. Create — one statement for the batch; if it fails, row by row so good rows still land.
    const insertRowFor = (w) => {
      const v = w.checked.value;
      const cols = catalogColumnsForImport(v, { itemType, provided: w.checked.provided });
      return {
        org_id: ctx.orgId,
        created_by_id: ctx.user.id,
        item_type: itemType,
        type: itemType,
        is_active: true,
        import_ref: w.ref,
        name: v.name,
        description: cols.description ?? null,
        sku: cols.sku ?? null,
        barcode: itemType === "product" ? cols.barcode ?? null : null,
        category: cols.category ?? null,
        default_unit: cols.default_unit || "unit",
        unit_of_measure: cols.unit_of_measure ?? null,
        tax_category: cols.tax_category || "standard",
        price: cols.price ?? 0,
        default_rate: cols.default_rate ?? 0,
        rate: cols.rate ?? 0,
        unit_price: cols.unit_price ?? 0,
        cost_price: itemType === "product" ? cols.cost_price ?? 0 : null,
        stock_quantity: itemType === "product" ? 0 : null,
        low_stock_threshold: itemType === "product" ? 10 : null,
        type_specific_data: v.brand ? { brand: v.brand } : null,
      };
    };
    const created = new Map();
    if (toInsert.length) {
      try {
        for (const row of await ctx.repo.insertRows(toInsert.map(insertRowFor))) created.set(row.import_ref, row.id);
      } catch (err) {
        if (isUpgradeDbError(err)) return upgradeResponse(res, itemType);
        log("bulk insert failed, retrying row by row", { code: err?.code, message: err?.message });
        for (const w of toInsert) {
          try {
            for (const row of await ctx.repo.insertRows([insertRowFor(w)])) created.set(row.import_ref, row.id);
          } catch (rowErr) {
            if (isUpgradeDbError(rowErr)) return upgradeResponse(res, itemType);
            log(`row ${w.rowNumber} insert failed`, { code: rowErr?.code, message: rowErr?.message });
            done(w.rowNumber, "failed", friendlyWriteError(rowErr));
          }
        }
      }
      // A conflict (same import_ref) means a concurrent retry created it — look it up, don't fail.
      const missing = toInsert.filter((w) => !created.has(w.ref) && !results.has(w.rowNumber));
      if (missing.length) {
        for (const row of await ctx.repo.findByImportRefs(ctx.orgId, missing.map((w) => w.ref))) created.set(row.import_ref, row.id);
      }
      for (const w of toInsert) {
        if (results.has(w.rowNumber)) continue;
        const id = created.get(w.ref);
        if (!id) {
          done(w.rowNumber, "failed", { reason: PRODUCT_IMPORT_MESSAGES.saveFailed, fix: PRODUCT_IMPORT_MESSAGES.saveFailedFix });
          continue;
        }
        done(w.rowNumber, "created", { product_id: id });
        if (itemType === "product" && w.checked.value.stock > 0) pendingStock.push({ w, productId: id, repair: false });
      }
    }

    // 5. Update — only the fields this row actually had; stock through the ledger.
    for (const { w, target } of toUpdate) {
      const v = w.checked.value;
      const patch = catalogColumnsForImport(v, { itemType, provided: w.checked.provided, onlyProvided: true });
      if (v.brand && w.checked.provided.includes("brand")) {
        const prev = target.type_specific_data && typeof target.type_specific_data === "object" ? target.type_specific_data : {};
        patch.type_specific_data = { ...prev, brand: v.brand };
      }
      try {
        if (Object.keys(patch).length) {
          const updated = await ctx.repo.updateRow(ctx.orgId, target.id, patch);
          if (!updated?.id) {
            done(w.rowNumber, "failed", { reason: PRODUCT_IMPORT_MESSAGES.targetMissing, fix: PRODUCT_IMPORT_MESSAGES.targetMissingFix });
            continue;
          }
        }
        let warning;
        if (itemType === "product" && w.checked.provided.includes("stock") && v.stock != null) {
          const delta = Math.round((v.stock - Number(target.stock_quantity || 0)) * 100) / 100;
          if (delta !== 0) {
            try {
              await ctx.repo.adjustStock(ctx.orgId, target.id, delta, "import");
            } catch (stockErr) {
              if (isUpgradeDbError(stockErr)) return upgradeResponse(res, itemType);
              log(`row ${w.rowNumber} stock adjust failed`, { code: stockErr?.code, message: stockErr?.message });
              warning = "Updated, but the stock level couldn't be changed — adjust stock on the product.";
            }
          }
        }
        done(w.rowNumber, "updated", { product_id: target.id, ...(warning ? { warning } : {}) });
      } catch (err) {
        if (isUpgradeDbError(err)) return upgradeResponse(res, itemType);
        log(`row ${w.rowNumber} update failed`, { code: err?.code, message: err?.message });
        done(w.rowNumber, "failed", friendlyWriteError(err));
      }
    }

    // 6. Opening stock for new products — one ledger movement each ("initial_stock", like Add Product).
    await mapWithConcurrency(pendingStock, STOCK_CONCURRENCY, async ({ w, productId, repair }) => {
      try {
        if (repair && (await ctx.repo.hasOpeningStock(productId))) return;
        await ctx.repo.adjustStock(ctx.orgId, productId, w.checked.value.stock, "initial_stock");
      } catch (err) {
        log(`row ${w.rowNumber} opening stock failed`, { code: err?.code, message: err?.message });
        const prev = results.get(w.rowNumber);
        results.set(w.rowNumber, { ...prev, warning: PRODUCT_IMPORT_MESSAGES.stockFailed });
      }
    });

    const ordered = rows.map((r) => results.get(Number(r.row_number))).filter(Boolean);
    const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
    for (const r of ordered) counts[r.outcome] = (counts[r.outcome] || 0) + 1;
    if (counts.created || counts.updated) {
      await ctx.repo.writeAudit({
        actor: ctx.user,
        orgId: ctx.orgId,
        action: "catalog.imported",
        description: `Imported ${counts.created} new and updated ${counts.updated} catalogue item(s)`,
        metadata: { import_id: importId, item_type: itemType, ...counts },
      });
    }
    return send(res, 200, { ok: true, results: ordered, counts });
  }

  function upgradeResponse(res, itemType) {
    const message = itemType === "product" ? PRODUCT_IMPORT_MESSAGES.upgradeProducts : PRODUCT_IMPORT_MESSAGES.upgradeServices;
    return fail(res, 403, "UPGRADE_REQUIRED", message, { feature: itemType === "product" ? "inventory" : "invoices" });
  }

  const OPS = { check, commit };

  return async function handleProductImport(req, res) {
    const requestId = randomUUID();
    if (req.method !== "POST") {
      res.setHeader?.("Allow", "POST, OPTIONS");
      return fail(res, 405, "METHOD_NOT_ALLOWED", PRODUCT_IMPORT_MESSAGES.generic);
    }
    const body = normalizeRequestBody(req);
    const op = String(req.query?.op || body.op || "").toLowerCase();
    const handler = OPS[op];
    if (!handler) return fail(res, 404, "NOT_FOUND", PRODUCT_IMPORT_MESSAGES.generic);
    try {
      const { ctx, response } = await gate(req, res, itemTypeOf(body));
      if (!ctx) return response;
      return await handler(req, res, ctx, body);
    } catch (err) {
      log(`${op} failed (${requestId})`, err?.stack || err?.message || err);
      return fail(res, 500, "SERVER_ERROR", PRODUCT_IMPORT_MESSAGES.generic);
    }
  };
}

let defaultHandler;
export function handleProductImportRoute(req, res) {
  defaultHandler ||= createProductImportHandler();
  return defaultHandler(req, res);
}
