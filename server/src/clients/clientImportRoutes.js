/**
 * POST /api/company/client-import?op=check|commit
 * GET  /api/company/client-import?op=runs
 *
 * Mounted inside the existing api/company function (no new Vercel function). The browser reads the
 * file; this route is the only writer. The company comes from the bearer session. A company id in
 * the body is ignored. Writes use the caller's JWT so clients RLS and the plan trigger apply.
 *
 * Owner, admin or manager only (can_view_org_financials). An employee sees only the clients they
 * created, so a duplicate check run as them would miss the rest of the business.
 *
 * Idempotent: each created row carries clients.import_ref = "{import_id}:{row}", unique per
 * organisation, so a retried batch returns the rows it already created.
 */
import { isPosOnlyStaff } from "../../../shared/posStaffInvite.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import {
  CLIENT_IMPORT_LIMITS,
  classifyAgainstExisting,
  identityKeys,
  importRef,
  safeImportFilename,
  validateClientImportRow,
} from "../../../shared/clients/clientImport.js";
import { normalizeRequestBody } from "../validateBody.js";
import { getUserFromRequest as defaultGetUser } from "../supabaseAuth.js";
import { loadCompanyMembership, companyMembershipOptions } from "../companyRouteAccess.js";
import { assertUserHasFeature, UpgradeRequiredError } from "../featureGate.js";
import { consumePersistedRateLimit } from "../rateLimit/consumeRateLimit.js";
import { createClientImportRepo } from "./clientImportRepo.js";

const HOUR = { hits: 300, windowMs: 60 * 60 * 1000 };

export const CLIENT_IMPORT_MESSAGES = Object.freeze({
  unauthorized: "Your session has ended. Sign in again to continue.",
  noCompany: "You're not part of a business on Paidly yet.",
  forbidden: "You don't have permission to import clients for this business.",
  roleRequired: "Only the business owner, an admin or a manager can import clients. Ask one of them to import this file.",
  upgrade: "Your plan doesn't include clients. Upgrade to import a customer list.",
  tooMany: "That's a lot of imports in the last hour. Please wait a little and try again.",
  badRequest: "This import request wasn't valid. Please start the import again.",
  tooManyRows: `Send at most ${CLIENT_IMPORT_LIMITS.commitBatchSize} rows at a time.`,
  tooManyCheck: `Check at most ${CLIENT_IMPORT_LIMITS.checkBatchSize} rows at a time.`,
  schema: "Client import isn't available on this database yet. Apply the latest Paidly database update, then try again.",
  duplicate: "Already in your clients",
  duplicateFix: "Choose Skip, Update existing, or Import as new on the review step.",
  uncertain: "This row matches more than one client, so it was not updated.",
  uncertainFix: "Pick one client to update, skip the row, or import it as a new client.",
  targetMissing: "The client to update wasn't found in this business.",
  targetMissingFix: "Refresh Clients and import this row again.",
  updateRefused: "This row was not updated because it doesn't reliably match that client.",
  saveFailed: "This row couldn't be saved.",
  saveFailedFix: "Check the values and try importing the row again.",
  generic: "Something went wrong. Please try again.",
});

const WRITABLE = Object.freeze([
  "name",
  "contact_person",
  "email",
  "alternate_email",
  "phone",
  "fax",
  "address",
  "tax_id",
  "website",
  "industry",
  "segment",
  "notes",
]);

/** Why the user skipped a row. Codes only — the browser never supplies report text. */
const SKIP_REASONS = Object.freeze({
  existing: { reason: "Already in your clients (same email, phone or VAT number).", duplicate: true },
  uncertain: { reason: "Might match more than one existing client, so it was skipped.", duplicate: true },
  file_duplicate: { reason: "Same email, phone or VAT number as an earlier row in this file.", duplicate: true },
  chosen: { reason: "You chose to skip this row.", duplicate: false },
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

function isSchemaError(err) {
  const code = String(err?.code || "");
  const detail = `${err?.message || ""} ${err?.details || ""}`;
  return code === "42703" || code === "42P01" || /import_ref|client_import_matches|client_import_runs/i.test(detail);
}

/**
 * The plan trigger (paidly_assert_plan_feature / paidly_assert_subscription_access) raises P0001 with
 * a hint like "UPGRADE_REQUIRED:clients" or "SUBSCRIPTION_REQUIRED:view_only". Its message is written
 * for end users. It applies to every row, so the whole batch stops instead of failing row by row.
 */
function planBlock(err) {
  if (String(err?.code || "") !== "P0001") return null;
  const hint = String(err?.hint || "");
  if (!/^(UPGRADE_REQUIRED|SUBSCRIPTION_REQUIRED|PLAN_|[A-Z_]+_LIMIT)/.test(hint)) return null;
  const message = String(err?.message || "").trim().slice(0, 300) || CLIENT_IMPORT_MESSAGES.upgrade;
  return { code: hint.startsWith("SUBSCRIPTION_REQUIRED") ? "SUBSCRIPTION_REQUIRED" : "UPGRADE_REQUIRED", message };
}

const PLAN_FIX = "Fix the plan or subscription, then retry the failed rows. Clients already imported won't be duplicated.";

function friendlyWriteError(err) {
  const code = String(err?.code || "");
  if (code === "42501") return { reason: CLIENT_IMPORT_MESSAGES.forbidden, fix: "Ask the business owner to import this file." };
  if (code === "23505") return { reason: "A client with these details already exists.", fix: CLIENT_IMPORT_MESSAGES.duplicateFix };
  if (code === "23514" || code === "22P02" || code === "22003") {
    return { reason: "One of the values isn't valid for a client.", fix: CLIENT_IMPORT_MESSAGES.saveFailedFix };
  }
  if (isSchemaError(err)) return { reason: CLIENT_IMPORT_MESSAGES.schema, fix: "Apply the latest database update, then retry the failed rows." };
  return { reason: CLIENT_IMPORT_MESSAGES.saveFailed, fix: CLIENT_IMPORT_MESSAGES.saveFailedFix };
}

function publicClient(row) {
  return {
    id: row.id,
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    tax_id: row.tax_id || "",
  };
}

function lookupKeys(values) {
  const emails = [];
  const phones = [];
  const taxes = [];
  for (const v of values) {
    const keys = identityKeys(v);
    if (keys.email) emails.push(keys.email);
    if (keys.phone) phones.push(keys.phone);
    if (keys.tax) taxes.push(keys.tax);
  }
  return { emails, phones, taxes };
}

/**
 * @param {{
 *   getUserFromRequest?: typeof defaultGetUser,
 *   adminClient?: any,
 *   userClientFor?: (token: string) => any,
 *   loadMembership?: (userId: string, req: any) => Promise<any>,
 *   assertFeature?: (userId: string, feature: string, companyId: string) => Promise<void>,
 *   repoFor?: (ctx: { userClient: any, adminClient: any }) => ReturnType<typeof createClientImportRepo>,
 *   rateLimit?: (key: string, hits: number, windowMs: number) => Promise<{ ok: boolean, retryAfterSeconds?: number }>,
 *   log?: (message: string, detail?: unknown) => void,
 * }} [deps]
 */
export function createClientImportHandler(deps = {}) {
  const getUser = deps.getUserFromRequest || defaultGetUser;
  const log = deps.log || ((message, detail) => console.error(`[client-import] ${message}`, detail ?? ""));
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
  const repoFor = deps.repoFor || createClientImportRepo;

  async function gate(req, res) {
    const { user } = await getUser(req);
    const token = bearerToken(req);
    if (!user || !token) return { response: fail(res, 401, "UNAUTHORIZED", CLIENT_IMPORT_MESSAGES.unauthorized) };
    const membership = await loadMembership(user.id, req);
    if (!membership?.orgId) return { response: fail(res, 403, "NO_COMPANY", CLIENT_IMPORT_MESSAGES.noCompany) };
    if (isPosOnlyStaff(membership)) return { response: fail(res, 403, "FORBIDDEN", CLIENT_IMPORT_MESSAGES.forbidden) };
    if (membership.companyRole !== "admin" && membership.companyRole !== "manager") {
      return { response: fail(res, 403, "FORBIDDEN", CLIENT_IMPORT_MESSAGES.roleRequired) };
    }
    try {
      await assertFeature(user.id, "clients", membership.orgId);
    } catch (err) {
      if (err?.code === "SUBSCRIPTION_REQUIRED") {
        return { response: fail(res, 403, "SUBSCRIPTION_REQUIRED", err.message || CLIENT_IMPORT_MESSAGES.upgrade) };
      }
      if (err instanceof UpgradeRequiredError || err?.code === "UPGRADE_REQUIRED") {
        return { response: fail(res, 403, "UPGRADE_REQUIRED", CLIENT_IMPORT_MESSAGES.upgrade, { feature: "clients" }) };
      }
      throw err;
    }
    const userClient = await userClientFor(token);
    if (!userClient) throw new Error("Supabase user client unavailable (SUPABASE_URL / anon key missing)");
    const repo = repoFor({ userClient, adminClient: await adminClient() });
    return { ctx: { user, membership, orgId: membership.orgId, repo } };
  }

  async function limit(res, userId, op) {
    const result = await rateLimit(`client-import:${op}:${userId}`, HOUR.hits, HOUR.windowMs);
    if (result?.ok === false) {
      if (result.retryAfterSeconds) res.setHeader?.("Retry-After", String(result.retryAfterSeconds));
      return fail(res, 429, "RATE_LIMITED", CLIENT_IMPORT_MESSAGES.tooMany);
    }
    return null;
  }

  async function check(req, res, ctx) {
    const limited = await limit(res, ctx.user.id, "check");
    if (limited) return limited;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows) return fail(res, 400, "BAD_REQUEST", CLIENT_IMPORT_MESSAGES.badRequest);
    if (rows.length > CLIENT_IMPORT_LIMITS.checkBatchSize) return fail(res, 400, "TOO_MANY", CLIENT_IMPORT_MESSAGES.tooManyCheck);
    const values = rows.map((r) => ({
      email: r?.email || "",
      phone: r?.phone || "",
      tax_id: r?.tax_id || "",
    }));
    let existing;
    try {
      existing = await ctx.repo.findMatches(ctx.orgId, lookupKeys(values));
    } catch (err) {
      if (isSchemaError(err)) return fail(res, 503, "SCHEMA", CLIENT_IMPORT_MESSAGES.schema);
      log("check failed", { code: err?.code, message: err?.message });
      return fail(res, 500, "ERROR", CLIENT_IMPORT_MESSAGES.generic);
    }
    const matches = rows.map((r, i) => {
      const found = classifyAgainstExisting(values[i], existing);
      return {
        row_number: Number(r?.row_number),
        reliable: Boolean(found?.reliable),
        matches: found?.matches || [],
      };
    });
    return send(res, 200, { ok: true, existing: existing.map(publicClient), matches });
  }

  async function commit(req, res, ctx) {
    const limited = await limit(res, ctx.user.id, "commit");
    if (limited) return limited;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const importId = parseUuid(body.import_id);
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!importId || !rows) return fail(res, 400, "BAD_REQUEST", CLIENT_IMPORT_MESSAGES.badRequest);
    if (rows.length > CLIENT_IMPORT_LIMITS.commitBatchSize) return fail(res, 400, "TOO_MANY", CLIENT_IMPORT_MESSAGES.tooManyRows);
    const filename = safeImportFilename(body.filename);

    const results = new Map();
    const done = (rowNumber, outcome, extra = {}) => {
      results.set(rowNumber, { row_number: rowNumber, outcome, ...extra });
    };

    const work = [];
    for (const r of rows) {
      const rowNumber = Number(r?.row_number);
      if (!Number.isInteger(rowNumber) || rowNumber < 1) {
        continue;
      }
      const action = r?.action === "update" || r?.action === "skip" ? r.action : "create";
      if (action === "skip") {
        const code = typeof r?.skip_reason === "string" && Object.hasOwn(SKIP_REASONS, r.skip_reason) ? r.skip_reason : "chosen";
        const why = SKIP_REASONS[code];
        done(rowNumber, "skipped", { reason: why.reason, duplicate: why.duplicate });
        continue;
      }
      const checked = validateClientImportRow(r?.values && typeof r.values === "object" ? r.values : {});
      if (checked.empty || checked.errors.length) {
        done(rowNumber, "failed", {
          reason: checked.errors[0]?.message || "This row has nothing to import.",
          fix: checked.errors[0]?.fix || "Correct the row and try again.",
        });
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

    const creates = work.filter((w) => w.action === "create");
    let already;
    try {
      already = new Map((await ctx.repo.findByImportRefs(ctx.orgId, creates.map((w) => w.ref))).map((row) => [row.import_ref, row]));
    } catch (err) {
      if (isSchemaError(err)) return fail(res, 503, "SCHEMA", CLIENT_IMPORT_MESSAGES.schema);
      log("import ref lookup failed", { code: err?.code, message: err?.message });
      return fail(res, 500, "ERROR", CLIENT_IMPORT_MESSAGES.generic);
    }
    for (const w of creates) {
      const prior = already.get(w.ref);
      if (prior) done(w.rowNumber, "created", { client_id: prior.id, replayed: true });
    }

    const open = work.filter((w) => !results.has(w.rowNumber));
    let existing = [];
    let targets = new Map();
    try {
      existing = await ctx.repo.findMatches(ctx.orgId, lookupKeys(open.map((w) => w.checked.value)));
      const ids = [...new Set(open.filter((w) => w.targetId).map((w) => w.targetId))];
      targets = new Map((await ctx.repo.findByIds(ctx.orgId, ids)).map((t) => [t.id, t]));
    } catch (err) {
      if (isSchemaError(err)) return fail(res, 503, "SCHEMA", CLIENT_IMPORT_MESSAGES.schema);
      log("duplicate lookup failed", { code: err?.code, message: err?.message });
      return fail(res, 500, "ERROR", CLIENT_IMPORT_MESSAGES.generic);
    }

    const seenInBatch = new Map();
    const toInsert = [];
    const toUpdate = [];
    for (const w of open) {
      const value = w.checked.value;
      const found = classifyAgainstExisting(value, existing);
      if (w.action === "update") {
        const target = targets.get(w.targetId);
        if (!w.targetId || !target) {
          done(w.rowNumber, "failed", { reason: CLIENT_IMPORT_MESSAGES.targetMissing, fix: CLIENT_IMPORT_MESSAGES.targetMissingFix });
          continue;
        }
        const reliable = found?.reliable && found.matches[0]?.id === target.id;
        if (!reliable) {
          const uncertain = found && !found.reliable;
          done(w.rowNumber, "failed", {
            reason: uncertain ? CLIENT_IMPORT_MESSAGES.uncertain : CLIENT_IMPORT_MESSAGES.updateRefused,
            fix: uncertain ? CLIENT_IMPORT_MESSAGES.uncertainFix : CLIENT_IMPORT_MESSAGES.duplicateFix,
          });
          continue;
        }
        toUpdate.push({ w, target });
        continue;
      }

      const keys = identityKeys(value);
      let fileHit = null;
      for (const kind of ["email", "phone", "tax"]) {
        if (keys[kind] && seenInBatch.has(`${kind}:${keys[kind]}`)) {
          fileHit = seenInBatch.get(`${kind}:${keys[kind]}`);
          break;
        }
      }
      if ((found || fileHit) && !w.allowDuplicate) {
        const who = found?.matches?.[0]?.name || `row ${fileHit}`;
        done(w.rowNumber, "skipped", {
          duplicate: true,
          reason: `${CLIENT_IMPORT_MESSAGES.duplicate} (same ${found?.matches?.[0]?.matchedBy?.[0] || "details"} as “${String(who).slice(0, 60)}”).`,
          fix: CLIENT_IMPORT_MESSAGES.duplicateFix,
          client_id: found?.matches?.[0]?.id || null,
        });
        continue;
      }
      for (const kind of ["email", "phone", "tax"]) {
        if (keys[kind] && !seenInBatch.has(`${kind}:${keys[kind]}`)) seenInBatch.set(`${kind}:${keys[kind]}`, w.rowNumber);
      }
      toInsert.push(w);
    }

    const insertRowFor = (w) => {
      const row = {
        org_id: ctx.orgId,
        created_by_id: ctx.user.id,
        import_ref: w.ref,
        pos_enabled: false,
        name: w.checked.value.name,
      };
      for (const key of WRITABLE) {
        if (key === "name") continue;
        if (w.checked.provided.includes(key)) row[key] = w.checked.value[key];
      }
      return row;
    };

    const created = new Map();
    if (toInsert.length) {
      try {
        for (const row of await ctx.repo.insertRows(toInsert.map(insertRowFor))) created.set(row.import_ref, row.id);
      } catch (err) {
        if (isSchemaError(err)) return fail(res, 503, "SCHEMA", CLIENT_IMPORT_MESSAGES.schema);
        // One insert statement: nothing in it was saved. Rows replayed from an earlier attempt stay reported.
        let stop = planBlock(err);
        if (!stop) log("bulk insert failed, retrying row by row", { code: err?.code });
        for (const w of toInsert) {
          if (stop) {
            done(w.rowNumber, "failed", { reason: stop.message, fix: PLAN_FIX });
            continue;
          }
          try {
            for (const row of await ctx.repo.insertRows([insertRowFor(w)])) created.set(row.import_ref, row.id);
          } catch (rowErr) {
            stop = planBlock(rowErr) || (isSchemaError(rowErr) ? { message: CLIENT_IMPORT_MESSAGES.schema } : null);
            if (stop) {
              done(w.rowNumber, "failed", { reason: stop.message, fix: PLAN_FIX });
              continue;
            }
            log(`row ${w.rowNumber} insert failed`, { code: rowErr?.code });
            done(w.rowNumber, "failed", friendlyWriteError(rowErr));
          }
        }
      }
      const missing = toInsert.filter((w) => !created.has(w.ref) && !results.has(w.rowNumber));
      if (missing.length) {
        try {
          for (const row of await ctx.repo.findByImportRefs(ctx.orgId, missing.map((w) => w.ref))) created.set(row.import_ref, row.id);
        } catch (err) {
          log("replay lookup failed", { code: err?.code });
        }
      }
      for (const w of toInsert) {
        if (results.has(w.rowNumber)) continue;
        const id = created.get(w.ref);
        if (!id) {
          done(w.rowNumber, "failed", { reason: CLIENT_IMPORT_MESSAGES.saveFailed, fix: CLIENT_IMPORT_MESSAGES.saveFailedFix });
          continue;
        }
        done(w.rowNumber, "created", { client_id: id });
      }
    }

    let updateStop = null;
    for (const { w, target } of toUpdate) {
      if (updateStop) {
        done(w.rowNumber, "failed", { reason: updateStop.message, fix: PLAN_FIX });
        continue;
      }
      const patch = {};
      for (const key of WRITABLE) {
        if (w.checked.provided.includes(key)) patch[key] = w.checked.value[key];
      }
      try {
        if (Object.keys(patch).length) {
          const updated = await ctx.repo.updateRow(ctx.orgId, target.id, patch);
          if (!updated?.id) {
            done(w.rowNumber, "failed", { reason: CLIENT_IMPORT_MESSAGES.targetMissing, fix: CLIENT_IMPORT_MESSAGES.targetMissingFix });
            continue;
          }
        }
        done(w.rowNumber, "updated", { client_id: target.id });
      } catch (err) {
        // Creates in this batch may already be saved, so report per row instead of failing the request.
        updateStop = planBlock(err) || (isSchemaError(err) ? { message: CLIENT_IMPORT_MESSAGES.schema } : null);
        if (updateStop) {
          done(w.rowNumber, "failed", { reason: updateStop.message, fix: PLAN_FIX });
          continue;
        }
        log(`row ${w.rowNumber} update failed`, { code: err?.code });
        done(w.rowNumber, "failed", friendlyWriteError(err));
      }
    }

    const ordered = rows.map((r) => results.get(Number(r?.row_number))).filter(Boolean);
    const counts = { created: 0, updated: 0, skipped: 0, failed: 0, replayed: 0 };
    for (const r of ordered) {
      if (r.outcome === "created" && r.replayed) counts.replayed += 1;
      else if (counts[r.outcome] != null) counts[r.outcome] += 1;
    }
    try {
      // Replayed rows were counted on the attempt that actually inserted them.
      await ctx.repo.recordRun({
        id: importId,
        orgId: ctx.orgId,
        userId: ctx.user.id,
        filename,
        counts: { created: counts.created, updated: counts.updated, skipped: counts.skipped, failed: counts.failed },
      });
    } catch (err) {
      log("history write failed", { code: err?.code });
    }
    if (counts.created || counts.updated) {
      await ctx.repo.writeAudit({
        actor: ctx.user,
        orgId: ctx.orgId,
        action: counts.updated ? "clients.import_updated" : "clients.imported",
        description: `Imported ${counts.created} new and updated ${counts.updated} client(s)`,
        metadata: { import_id: importId, filename, ...counts },
      });
    }
    return send(res, 200, { ok: true, results: ordered, counts });
  }

  async function runs(req, res, ctx) {
    try {
      const list = await ctx.repo.listRuns(ctx.orgId);
      return send(res, 200, { ok: true, runs: list });
    } catch (err) {
      if (isSchemaError(err)) return send(res, 200, { ok: true, runs: [] });
      log("history list failed", { code: err?.code });
      return fail(res, 500, "ERROR", CLIENT_IMPORT_MESSAGES.generic);
    }
  }

  return async function clientImportHandler(req, res) {
    try {
      req.body = normalizeRequestBody(req);
      const op = String(req.query?.op || "");
      if (req.method === "GET" && op === "runs") {
        const gated = await gate(req, res);
        if (gated.response) return gated.response;
        return runs(req, res, gated.ctx);
      }
      if (req.method !== "POST" || (op !== "check" && op !== "commit")) {
        return fail(res, 405, "METHOD", CLIENT_IMPORT_MESSAGES.badRequest);
      }
      const gated = await gate(req, res);
      if (gated.response) return gated.response;
      if (op === "check") return check(req, res, gated.ctx);
      return commit(req, res, gated.ctx);
    } catch (err) {
      log("unhandled", { message: err?.message });
      return fail(res, 500, "ERROR", CLIENT_IMPORT_MESSAGES.generic);
    }
  };
}

export const handleClientImportRoute = createClientImportHandler();
