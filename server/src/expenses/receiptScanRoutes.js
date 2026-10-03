/**
 * POST /api/company/receipts?op=prepare|extract|review|confirm|discard — Scan Receipt.
 *
 * Mounted inside the existing api/company function (no new Vercel function). Lifecycle:
 *   prepare (server picks the upload path) → upload (browser → private receipts bucket, storage RLS) → extract (optional server provider)
 *   → review (supplier match + duplicate check) → confirm (final validation → expense) | discard
 *
 * Every op: bearer session → company resolved server-side (loadCompanyMembership, never a client
 * company id) → not POS-only staff → company plan includes `expenses`. The receipt path must be in the
 * caller's own folder of that company. Company data is read/written with the caller's JWT so RLS and the
 * plan trigger also apply. Errors returned to the browser are plain sentences; details are logged.
 */
import { randomUUID } from "node:crypto";
import { normalizeRequestBody } from "../validateBody.js";
import { getUserFromRequest as defaultGetUser } from "../supabaseAuth.js";
import { loadCompanyMembership, companyMembershipOptions } from "../companyRouteAccess.js";
import { assertUserHasFeature, UpgradeRequiredError } from "../featureGate.js";
import { isPosOnlyStaff } from "../../../shared/posStaffInvite.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import {
  buildReceiptStoragePath,
  receiptExtensionForMime,
  findDuplicateCandidates,
  matchSupplier,
  normalizeReceiptExtraction,
  parseMoney,
  parseReceiptDate,
  parseReceiptStoragePath,
  isEmptyExtraction,
  validateReceiptExpenseSubmission,
  sniffReceiptMediaType,
  RECEIPT_EXTRACTION_VERSION,
} from "../../../shared/expenses/receiptScan.js";
import { consumePersistedRateLimit } from "../rateLimit/consumeRateLimit.js";
import { createReceiptScanRepo } from "./receiptScanRepo.js";
import { ReceiptExtractionError, resolveReceiptExtractionProvider } from "./receiptExtractionProviders.js";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SHA256_RE = /^[0-9a-f]{64}$/;
const EXTRACT_LIMIT = { hits: 40, windowMs: 60 * 60 * 1000 };

export const RECEIPT_MESSAGES = Object.freeze({
  unauthorized: "Your session has ended. Sign in again to continue.",
  noCompany: "You're not part of a business on Paidly yet.",
  posStaff: "Till staff can't add expenses. Ask a manager to record this receipt.",
  upgrade: "Expenses and receipt scanning are part of the Business and Growth plans.",
  receiptNotYours: "This receipt belongs to another upload. Please upload it again.",
  receiptMissing: "We couldn't find the uploaded receipt. Please upload it again.",
  receiptAttached: "This receipt is already attached to another expense.",
  unreadable: "We couldn't read this receipt clearly. You can enter the details manually.",
  notReceipt: "This image doesn't appear to contain a readable receipt.",
  extractBusy: "Receipt reading is busy right now. You can enter the details manually.",
  tooMany: "You've scanned a lot of receipts in the last hour. Enter this one manually or try again later.",
  duplicate: "This looks like a receipt that's already been added.",
  supplier: "Choose a supplier from your list, or leave it blank.",
  saveFailed: "We couldn't save this expense. Your receipt is still attached — please try again.",
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

/** Owners, company admins and managers see the whole company's receipts/expenses (matches can_view_org_financials). */
function canViewCompanyFinancials(membership) {
  return membership.membershipRole === "owner" || membership.companyRole === "admin" || membership.companyRole === "manager";
}

function publicDuplicate(d) {
  return {
    id: d.expense.id,
    vendor: d.expense.vendor || null,
    date: d.expense.date || null,
    amount: d.expense.amount != null ? Number(d.expense.amount) : null,
    reason: d.reason,
    strength: d.strength,
  };
}

/**
 * @param {{
 *   getUserFromRequest?: typeof defaultGetUser,
 *   adminClient?: any,
 *   userClientFor?: (token: string) => any,
 *   loadMembership?: (userId: string, req: any) => Promise<any>,
 *   assertFeature?: (userId: string, feature: string, companyId: string) => Promise<void>,
 *   repoFor?: (ctx: { userClient: any, adminClient: any }) => ReturnType<typeof createReceiptScanRepo>,
 *   provider?: { id: string, extract: (input: { data: string, mediaType: string }) => Promise<unknown> } | null,
 *   rateLimit?: (key: string, hits: number, windowMs: number) => Promise<{ ok: boolean, retryAfterSeconds?: number }>,
 *   today?: () => string | undefined,
 *   log?: (message: string, detail?: unknown) => void,
 * }} [deps]
 */
export function createReceiptScanHandler(deps = {}) {
  const getUser = deps.getUserFromRequest || defaultGetUser;
  const log = deps.log || ((message, detail) => console.error(`[receipts] ${message}`, detail ?? ""));
  const rateLimit = deps.rateLimit || consumePersistedRateLimit;
  let adminClientCache = deps.adminClient || null;
  const adminClient = async () => {
    if (!adminClientCache) adminClientCache = (await import("../supabaseAdmin.js")).supabaseAdmin;
    return adminClientCache;
  };
  const userClientFor =
    deps.userClientFor ||
    (async (token) => (await import("../supabaseAnon.js")).getSupabaseUserClient(token));
  const loadMembership =
    deps.loadMembership ||
    (async (userId, req) => loadCompanyMembership(await adminClient(), userId, companyMembershipOptions(req)));
  const assertFeature =
    deps.assertFeature ||
    (async (userId, feature, companyId) => assertUserHasFeature(await adminClient(), userId, feature, { companyId }));
  const repoFor = deps.repoFor || createReceiptScanRepo;
  const providerResolved = "provider" in deps ? deps.provider : undefined;
  const getProvider = () => (providerResolved !== undefined ? providerResolved : resolveReceiptExtractionProvider());

  /** Auth → company → POS scope → plan. Returns a context or writes the response. */
  async function gate(req, res) {
    const { user } = await getUser(req);
    const token = bearerToken(req);
    if (!user || !token) return { response: fail(res, 401, "UNAUTHORIZED", RECEIPT_MESSAGES.unauthorized) };
    const membership = await loadMembership(user.id, req);
    if (!membership?.orgId) return { response: fail(res, 403, "NO_COMPANY", RECEIPT_MESSAGES.noCompany) };
    if (isPosOnlyStaff({ ...membership, isOrgOwner: membership.membershipRole === "owner" })) {
      return { response: fail(res, 403, "POS_SCOPE", RECEIPT_MESSAGES.posStaff) };
    }
    try {
      await assertFeature(user.id, "expenses", membership.orgId);
    } catch (err) {
      if (err instanceof UpgradeRequiredError || err?.code === "UPGRADE_REQUIRED") {
        return { response: fail(res, 403, "UPGRADE_REQUIRED", RECEIPT_MESSAGES.upgrade, { feature: "expenses" }) };
      }
      throw err;
    }
    const userClient = await userClientFor(token);
    if (!userClient) throw new Error("Supabase user client unavailable (SUPABASE_URL / anon key missing)");
    const repo = repoFor({ userClient, adminClient: await adminClient() });
    return { ctx: { user, membership, orgId: membership.orgId, repo } };
  }

  /** The path must be {server company}/receipts/{caller}/…; anything else is someone else's upload. */
  function ownReceiptPath(rawPath, ctx) {
    const parsed = parseReceiptStoragePath(rawPath);
    if (!parsed) return null;
    if (parsed.orgId !== String(ctx.orgId).toLowerCase()) return null;
    if (parsed.userId !== String(ctx.user.id).toLowerCase()) return null;
    return String(rawPath).toLowerCase();
  }

  async function duplicatesFor(ctx, candidate) {
    const sources = await ctx.repo.findDuplicateSources(ctx.orgId, candidate);
    return findDuplicateCandidates(candidate, sources);
  }

  // ── prepare ──────────────────────────────────────────────────────────────────────────────
  /** Where to upload: the server picks the company folder and a random file id. */
  async function prepare(req, res, ctx, body) {
    const extension = receiptExtensionForMime(String(body.media_type || ""));
    if (!extension) return fail(res, 422, "UNSUPPORTED_FILE", "Use a JPG, PNG, WEBP or PDF receipt.");
    const receiptPath = buildReceiptStoragePath({ orgId: ctx.orgId, userId: ctx.user.id, fileId: randomUUID(), extension });
    return send(res, 200, {
      ok: true,
      receipt_path: receiptPath,
      extraction_available: Boolean(getProvider()),
      can_manage_suppliers: canViewCompanyFinancials(ctx.membership),
    });
  }

  // ── extract ──────────────────────────────────────────────────────────────────────────────
  async function extract(req, res, ctx, body) {
    const provider = getProvider();
    if (!provider) return send(res, 200, { ok: true, available: false });

    const path = ownReceiptPath(body.receipt_path, ctx);
    if (!path) return fail(res, 403, "RECEIPT_NOT_OWNED", RECEIPT_MESSAGES.receiptNotYours);

    const budget = await rateLimit(`receipt-extract:${ctx.user.id}`, EXTRACT_LIMIT.hits, EXTRACT_LIMIT.windowMs);
    if (!budget.ok) return fail(res, 429, "RATE_LIMITED", RECEIPT_MESSAGES.tooMany, { retry_after_seconds: budget.retryAfterSeconds });

    if (!(await ctx.repo.receiptExists(path))) return fail(res, 404, "RECEIPT_MISSING", RECEIPT_MESSAGES.receiptMissing);

    let input;
    const image = body.image && typeof body.image === "object" ? body.image : null;
    if (image) {
      const mediaType = String(image.media_type || "").toLowerCase();
      const data = typeof image.data === "string" ? image.data.replace(/^data:[^,]*,/, "") : "";
      const bytes = Math.floor((data.length * 3) / 4);
      if (!IMAGE_TYPES.has(mediaType) || !data || bytes > MAX_IMAGE_BYTES || !/^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 256))) {
        return fail(res, 422, "INVALID_IMAGE", RECEIPT_MESSAGES.unreadable);
      }
      // The label is the browser's claim; the first bytes are the truth.
      if (sniffReceiptMediaType(Buffer.from(data.slice(0, 24), "base64")) !== mediaType) {
        return fail(res, 422, "INVALID_IMAGE", RECEIPT_MESSAGES.unreadable);
      }
      input = { data, mediaType };
    } else if (path.endsWith(".pdf")) {
      const buffer = await ctx.repo.downloadReceipt(path);
      if (buffer.length > MAX_PDF_BYTES || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
        return fail(res, 422, "INVALID_FILE", RECEIPT_MESSAGES.unreadable);
      }
      input = { data: buffer.toString("base64"), mediaType: "application/pdf" };
    } else {
      return fail(res, 422, "INVALID_IMAGE", RECEIPT_MESSAGES.unreadable);
    }

    let raw;
    try {
      raw = await provider.extract(input);
    } catch (err) {
      const code = err instanceof ReceiptExtractionError ? err.code : "provider_error";
      log(`extraction failed (${provider.id}/${code})`, err?.message || err);
      await ctx.repo.writeAudit({
        actor: ctx.user,
        orgId: ctx.orgId,
        action: "receipt.processing_failed",
        description: "Receipt could not be read automatically",
        metadata: { receipt_path: path, provider: provider.id, reason: code },
      });
      return send(res, 200, {
        ok: false,
        available: true,
        code: "EXTRACTION_FAILED",
        error: code === "rate_limited" || code === "timeout" ? RECEIPT_MESSAGES.extractBusy : RECEIPT_MESSAGES.unreadable,
      });
    }

    const normalized = normalizeReceiptExtraction(raw);
    if (!normalized.ok) {
      log(`provider ${provider.id} returned an invalid shape`, normalized.issues);
      return send(res, 200, { ok: false, available: true, code: "EXTRACTION_FAILED", error: RECEIPT_MESSAGES.unreadable });
    }
    if (normalized.issues.length) log(`provider ${provider.id} output had dropped fields`, normalized.issues);
    const extraction = normalized.extraction;
    const notReceipt = extraction.isReceipt === false;
    await ctx.repo.writeAudit({
      actor: ctx.user,
      orgId: ctx.orgId,
      action: "receipt.processed",
      description: "Receipt read for review",
      metadata: { receipt_path: path, provider: provider.id, not_receipt: notReceipt, empty: isEmptyExtraction(extraction) },
    });
    if (notReceipt) {
      return send(res, 200, { ok: false, available: true, code: "NOT_A_RECEIPT", error: RECEIPT_MESSAGES.notReceipt });
    }
    return send(res, 200, {
      ok: true,
      available: true,
      provider: provider.id,
      extraction_version: RECEIPT_EXTRACTION_VERSION,
      extraction,
    });
  }

  // ── review ───────────────────────────────────────────────────────────────────────────────
  async function review(req, res, ctx, body) {
    const receiptPath = body.receipt_path ? ownReceiptPath(body.receipt_path, ctx) : null;
    if (body.receipt_path && !receiptPath) return fail(res, 403, "RECEIPT_NOT_OWNED", RECEIPT_MESSAGES.receiptNotYours);
    const sha256 = typeof body.sha256 === "string" && SHA256_RE.test(body.sha256.toLowerCase()) ? body.sha256.toLowerCase() : null;
    const total = parseMoney(body.total);
    const date = typeof body.date === "string" ? parseReceiptDate(body.date) : null;
    const vendor = typeof body.vendor === "string" ? body.vendor.slice(0, 120) : "";
    const receiptNumber = typeof body.receipt_number === "string" ? body.receipt_number.trim().slice(0, 60) || null : null;

    const [suppliers, duplicates] = await Promise.all([
      ctx.repo.listSuppliers(ctx.orgId),
      duplicatesFor(ctx, { sha256, receiptNumber, vendor, total, date }),
    ]);
    const match = matchSupplier({ name: vendor, vatNumber: typeof body.vat_number === "string" ? body.vat_number : "" }, suppliers);
    return send(res, 200, {
      ok: true,
      supplier_match: {
        kind: match.kind,
        supplier: match.supplier ? { id: match.supplier.id, name: match.supplier.name } : null,
      },
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
      can_manage_suppliers: canViewCompanyFinancials(ctx.membership),
      duplicates: duplicates.map(publicDuplicate),
    });
  }

  // ── confirm ──────────────────────────────────────────────────────────────────────────────
  async function confirm(req, res, ctx, body) {
    const operationId = parseUuid(body.client_operation_id);
    if (!operationId) return fail(res, 422, "VALIDATION_FAILED", RECEIPT_MESSAGES.generic, { errors: {} });

    const receiptPath = ownReceiptPath(body.receipt_path, ctx);
    if (!receiptPath) return fail(res, 403, "RECEIPT_NOT_OWNED", RECEIPT_MESSAGES.receiptNotYours);

    // A retried Save (lost response, double tap) returns the expense the first call created.
    const existing = await ctx.repo.findExpenseByOperation(ctx.orgId, operationId);
    if (existing) return send(res, 200, { ok: true, expense: existing, replayed: true });

    const checked = validateReceiptExpenseSubmission(body, { today: deps.today?.() });
    if (!checked.ok) {
      const status = checked.code === "VAT_REVIEW_REQUIRED" ? 409 : 422;
      const first = Object.values(checked.errors)[0] || RECEIPT_MESSAGES.generic;
      return fail(res, status, checked.code, first, { errors: checked.errors });
    }
    const value = checked.value;

    let supplierName = null;
    if (value.supplier_id) {
      const supplier = await ctx.repo.supplierInCompany(ctx.orgId, value.supplier_id);
      if (!supplier) return fail(res, 422, "INVALID_SUPPLIER", RECEIPT_MESSAGES.supplier, { errors: { supplier_id: RECEIPT_MESSAGES.supplier } });
      supplierName = supplier.name || null;
    }

    if (!(await ctx.repo.receiptExists(receiptPath))) return fail(res, 409, "RECEIPT_MISSING", RECEIPT_MESSAGES.receiptMissing);

    const sha256 = typeof body.sha256 === "string" && SHA256_RE.test(body.sha256.toLowerCase()) ? body.sha256.toLowerCase() : null;
    const vendor = value.vendor || supplierName;
    const duplicates = await duplicatesFor(ctx, {
      sha256,
      receiptNumber: value.receipt_number,
      vendor,
      supplierId: value.supplier_id,
      total: value.amount,
      date: value.date,
    });
    const duplicateAcknowledged = body.duplicate_acknowledged === true;
    if (duplicates.length && !duplicateAcknowledged) {
      return fail(res, 409, "POSSIBLE_DUPLICATE", RECEIPT_MESSAGES.duplicate, { duplicates: duplicates.map(publicDuplicate) });
    }

    const editedFields = Array.isArray(body.edited_fields)
      ? body.edited_fields.filter((f) => typeof f === "string" && /^[a-z_]{1,30}$/.test(f)).slice(0, 20)
      : [];
    const extractionSource = ["server", "on_device", "manual"].includes(body.extraction_source) ? body.extraction_source : "manual";

    const row = {
      org_id: ctx.orgId,
      created_by_id: ctx.user.id,
      expense_number: `EXP-${Date.now()}`,
      amount: value.amount,
      date: value.date,
      vendor,
      supplier_id: value.supplier_id,
      category: value.category,
      description: value.description,
      payment_method: value.payment_method,
      vat: value.vat,
      subtotal: value.subtotal,
      vat_rate: value.vat_rate,
      receipt_number: value.receipt_number,
      receipt_path: receiptPath,
      receipt_sha256: sha256,
      line_items: value.line_items,
      notes: value.notes,
      is_claimable: value.is_claimable,
      capture_source: "receipt_scan",
      client_operation_id: operationId,
      receipt_review: {
        vat_status: value.vat_status,
        vat_acknowledged: body.vat_acknowledged === true,
        duplicate_acknowledged: duplicates.length > 0 && duplicateAcknowledged,
        extraction_source: extractionSource,
        // Rules that produced the values the person reviewed (null for manual entry).
        extraction_version: extractionSource === "manual" ? null : RECEIPT_EXTRACTION_VERSION,
        edited_fields: editedFields,
      },
    };

    let expense;
    try {
      expense = await ctx.repo.insertExpense(row);
    } catch (err) {
      const code = String(err?.code || "");
      const detail = `${err?.message || ""} ${err?.details || ""} ${err?.hint || ""}`;
      if (code === "23505" && /client_operation/.test(detail)) {
        const winner = await ctx.repo.findExpenseByOperation(ctx.orgId, operationId);
        if (winner) return send(res, 200, { ok: true, expense: winner, replayed: true });
      }
      if (code === "23505" && /receipt_path/.test(detail)) {
        return fail(res, 409, "RECEIPT_ALREADY_ATTACHED", RECEIPT_MESSAGES.receiptAttached);
      }
      if (code === "23503" && /supplier/i.test(detail)) {
        return fail(res, 422, "INVALID_SUPPLIER", RECEIPT_MESSAGES.supplier, { errors: { supplier_id: RECEIPT_MESSAGES.supplier } });
      }
      if (code === "P0001" && /UPGRADE|SUBSCRIPTION|PLAN/i.test(detail)) {
        return fail(res, 403, "UPGRADE_REQUIRED", RECEIPT_MESSAGES.upgrade, { feature: "expenses" });
      }
      if (code === "42501") return fail(res, 403, "FORBIDDEN", RECEIPT_MESSAGES.posStaff);
      log("expense insert failed", { code, message: err?.message });
      return fail(res, 500, "SAVE_FAILED", RECEIPT_MESSAGES.saveFailed);
    }

    await ctx.repo.writeAudit({
      actor: ctx.user,
      orgId: ctx.orgId,
      action: "expense.created_from_receipt",
      description: "Expense added from a scanned receipt",
      metadata: {
        expense_id: expense.id,
        receipt_path: receiptPath,
        vat_status: value.vat_status,
        duplicate_acknowledged: row.receipt_review.duplicate_acknowledged,
        extraction_source: extractionSource,
        extraction_version: row.receipt_review.extraction_version,
        edited_fields: editedFields,
      },
    });
    return send(res, 201, { ok: true, expense });
  }

  // ── discard ──────────────────────────────────────────────────────────────────────────────
  async function discard(req, res, ctx, body) {
    const path = ownReceiptPath(body.receipt_path, ctx);
    if (!path) return fail(res, 403, "RECEIPT_NOT_OWNED", RECEIPT_MESSAGES.receiptNotYours);
    try {
      // Storage RLS refuses to delete a receipt an expense points to.
      await ctx.repo.removeReceipt(path);
    } catch (err) {
      log("discard failed", err?.message || err);
      return send(res, 200, { ok: true, removed: false });
    }
    await ctx.repo.writeAudit({
      actor: ctx.user,
      orgId: ctx.orgId,
      action: "receipt.discarded",
      description: "Scanned receipt discarded before saving",
      metadata: { receipt_path: path },
    });
    return send(res, 200, { ok: true, removed: true });
  }

  const OPS = { prepare, extract, review, confirm, discard };

  return async function handleReceiptScan(req, res) {
    const requestId = randomUUID();
    if (req.method !== "POST") {
      res.setHeader?.("Allow", "POST, OPTIONS");
      return fail(res, 405, "METHOD_NOT_ALLOWED", RECEIPT_MESSAGES.generic);
    }
    const body = normalizeRequestBody(req);
    const op = String(req.query?.op || body.op || "").toLowerCase();
    const handler = OPS[op];
    if (!handler) return fail(res, 404, "NOT_FOUND", RECEIPT_MESSAGES.generic);
    try {
      const { ctx, response } = await gate(req, res);
      if (!ctx) return response;
      return await handler(req, res, ctx, body);
    } catch (err) {
      log(`${op} failed (${requestId})`, err?.stack || err?.message || err);
      return fail(res, 500, "SERVER_ERROR", op === "confirm" ? RECEIPT_MESSAGES.saveFailed : RECEIPT_MESSAGES.generic);
    }
  };
}

let defaultHandler;
export function handleReceiptScanRoute(req, res) {
  defaultHandler ||= createReceiptScanHandler();
  return defaultHandler(req, res);
}
