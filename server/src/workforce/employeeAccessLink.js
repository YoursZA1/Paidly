import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { sendHtmlEmail } from "../sendInvoice.js";
import { resolvePublicAppOrigin } from "../companyInviteAppUrl.js";
import { generateSecurePayslipPdf } from "../payroll/payrollService.js";
import { applyForLeaveForMembership, previewLeaveApplicationForMembership } from "../leave/leaveService.js";
import { resolveEntitlementForCompany } from "../billing/entitlements.js";
import { familyHasFeature } from "../subscriptionPlans.js";
import { isDemoOrgId, logDemo } from "../demo/demoMode.js";
import { isSecureRequest, parseCookieHeader } from "../pos/posAccessSession.js";
import { getEmployeeProfile } from "./employeeListQuery.js";
import { isValidPortalSlug } from "../../../shared/workforce/portalSlug.js";
import {
  EMPLOYEE_ACCESS_COOKIE,
  EMPLOYEE_ACCESS_REQUEST_LIMIT,
  EMPLOYEE_ACCESS_SENT_MESSAGE,
  EMPLOYEE_ACCESS_TTL_SECONDS,
  employeeAccessExpiresAt,
  employeeAccessLinkPath,
  employeeAccessRemainingSeconds,
  normalizeEmploymentEmail,
  selectPortalMembership,
} from "../../../shared/workforce/employeeAccessLink.js";

const MEMBERSHIP_COLS =
  "id, org_id, user_id, role, job_function, invited_email, invited_name, employee_number, job_title, department, employment_status, disabled_at, portal_revoked_at";

function json(res, status, body) {
  return res.status(status).json(body);
}

function hashEmployeeAccessToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function generateEmployeeAccessToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function missingGrantsTable(error) {
  const msg = String(error?.message || "");
  return error?.code === "42P01" || error?.code === "PGRST205" || /employee_portal_access_grants/i.test(msg);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmployeeAccessCookie(token, { maxAgeSeconds = EMPLOYEE_ACCESS_TTL_SECONDS, secure = true } = {}) {
  const parts = [
    `${EMPLOYEE_ACCESS_COOKIE}=${encodeURIComponent(String(token || ""))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function readEmployeeAccessToken(req) {
  const cookies = parseCookieHeader(req?.headers?.cookie);
  return String(cookies[EMPLOYEE_ACCESS_COOKIE] || "").trim();
}

function clientAddress(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || "");
}

const requestHits = new Map();

function tooManyRequests(key) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const recent = (requestHits.get(key) || []).filter((at) => now - at < windowMs);
  recent.push(now);
  requestHits.set(key, recent);
  return recent.length > 8;
}

async function loadPortalOrg(slug) {
  if (!isValidPortalSlug(slug)) return null;
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name, portal_slug")
    .eq("portal_slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function membershipsForEmail(orgId, email) {
  const { data: invited, error: invitedError } = await supabaseAdmin
    .from("memberships")
    .select(MEMBERSHIP_COLS)
    .eq("org_id", orgId)
    .ilike("invited_email", email);
  if (invitedError) throw invitedError;

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .ilike("email", email);
  if (profileError) throw profileError;
  const userIds = (profiles || []).map((row) => row.id).filter(Boolean);
  let byUser = [];
  if (userIds.length) {
    const { data, error } = await supabaseAdmin
      .from("memberships")
      .select(MEMBERSHIP_COLS)
      .eq("org_id", orgId)
      .in("user_id", userIds);
    if (error) throw error;
    byUser = data || [];
  }
  const profileEmail = new Map((profiles || []).map((row) => [row.id, row.email]));
  const merged = new Map();
  for (const row of [...(invited || []), ...byUser]) {
    if (!row?.id || merged.has(row.id)) continue;
    merged.set(row.id, { ...row, profile_email: profileEmail.get(row.user_id) || null });
  }
  return [...merged.values()];
}

function allowanceTotal(allowances) {
  if (!Array.isArray(allowances)) return null;
  const total = allowances.reduce((sum, row) => sum + (Number(row?.amount) || 0), 0);
  return Number.isFinite(total) ? total : null;
}

function publicDetails(bundle, { companyName, expiresAt, email, avatarUrl }) {
  const employee = bundle?.employee || {};
  return {
    ok: true,
    expires_at: expiresAt,
    company_name: companyName || null,
    employee: {
      name: employee.full_name || employee.invited_name || employee.name || "Employee",
      email: email || employee.email || null,
      phone: employee.phone || null,
      avatar_url: avatarUrl || null,
      employee_number: employee.employee_number || null,
      job_title: employee.job_title || null,
      department: employee.department || null,
      employment_status: employee.employment_status || null,
      employment_start_date: employee.employment_start_date || null,
    },
    payslips: (bundle?.payslips || []).map((row) => ({
      id: row.id,
      payslip_number: row.payslip_number,
      pay_period_start: row.pay_period_start,
      pay_period_end: row.pay_period_end,
      pay_date: row.pay_date,
      basic_salary: row.basic_salary ?? null,
      allowances: allowanceTotal(row.allowances),
      gross_pay: row.gross_pay ?? null,
      tax_deduction: row.tax_deduction ?? null,
      total_deductions: row.total_deductions ?? null,
      net_pay: row.net_pay ?? null,
      status: row.status || null,
    })),
    leave_balances: (bundle?.leave_balances || []).map((row) => ({
      id: row.id,
      leave_type_id: row.leave_type_id || null,
      name: row.leave_types?.name || row.leave_types?.code || "Leave",
      available: row.available ?? null,
      accrued: row.accrued ?? null,
      used: row.used ?? null,
      pending: row.pending ?? null,
      entitled: row.entitled ?? null,
      note: row.note || null,
      cycle_label: row.cycle_label || null,
    })),
    leave_requests: (bundle?.leave_requests || []).map((row) => ({
      id: row.id,
      status: row.status,
      start_date: row.start_date,
      end_date: row.end_date,
      working_days: row.working_days,
      name: row.leave_types?.name || "Leave",
    })),
    documents: (bundle?.documents || []).map((row) => ({
      id: row.id,
      title: row.title || row.type || "Document",
      type: row.type || null,
      status: row.status || null,
      created_at: row.created_at || null,
      files: [],
    })),
    can_apply_leave: false,
  };
}

async function loadGrant(token) {
  const raw = String(token || "").trim();
  if (raw.length < 32) return { grant: null, missingTable: false };
  const { data, error } = await supabaseAdmin
    .from("employee_portal_access_grants")
    .select("id, org_id, membership_id, email, expires_at, revoked_at")
    .eq("token_hash", hashEmployeeAccessToken(raw))
    .maybeSingle();
  if (error) {
    if (missingGrantsTable(error)) return { grant: null, missingTable: true };
    throw error;
  }
  if (!data || data.revoked_at) return { grant: null, missingTable: false };
  if (employeeAccessRemainingSeconds(data.expires_at) <= 0) return { grant: null, missingTable: false };
  return { grant: data, missingTable: false };
}

async function sessionPayload(grant) {
  const [orgRes, membershipRes] = await Promise.all([
    supabaseAdmin.from("organizations").select("id, name").eq("id", grant.org_id).maybeSingle(),
    supabaseAdmin.from("memberships").select(MEMBERSHIP_COLS).eq("id", grant.membership_id).eq("org_id", grant.org_id).maybeSingle(),
  ]);
  const row = membershipRes.data;
  if (membershipRes.error || !row || row.portal_revoked_at || !selectPortalMembership([{ ...row, profile_email: grant.email }], grant.email)) {
    return null;
  }
  let bundle = { employee: row };
  try {
    bundle = await getEmployeeProfile(
      grant.org_id,
      grant.membership_id,
      { actorMembershipId: grant.membership_id, canManagePayroll: false, canViewTeam: false },
      { sections: "payslips,leave,documents" }
    );
  } catch (err) {
    console.error("[employee-access] profile", err?.message || err);
  }
  let avatarUrl = null;
  const userId = bundle?.employee?.user_id || row.user_id;
  if (userId) {
    const { data: person } = await supabaseAdmin.from("profiles").select("avatar_url, phone").eq("id", userId).maybeSingle();
    avatarUrl = person?.avatar_url || null;
    if (person?.phone && bundle.employee && !bundle.employee.phone) bundle.employee.phone = person.phone;
  }
  const details = publicDetails(bundle, {
    companyName: orgRes.data?.name || null,
    expiresAt: grant.expires_at,
    email: grant.email,
    avatarUrl,
  });
  await attachDocumentFiles(grant.org_id, details);
  details.can_apply_leave = await orgAllowsLeave(grant.org_id);
  return details;
}

async function orgAllowsLeave(orgId) {
  try {
    const ent = await resolveEntitlementForCompany(supabaseAdmin, orgId);
    return Boolean(ent?.access) && familyHasFeature(ent.family, "leave_management");
  } catch (err) {
    console.warn("[employee-access] leave entitlement", err?.message || err);
    return false;
  }
}

async function attachDocumentFiles(orgId, details) {
  const ids = (details.documents || []).map((row) => row.id).filter(Boolean);
  if (!ids.length) return;
  const { data, error } = await supabaseAdmin
    .from("document_attachments")
    .select("id, document_id, file_name")
    .eq("org_id", orgId)
    .in("document_id", ids);
  if (error) return;
  const byDoc = new Map();
  for (const file of data || []) {
    const list = byDoc.get(file.document_id) || [];
    list.push({ id: file.id, file_name: file.file_name || "File" });
    byDoc.set(file.document_id, list);
  }
  details.documents = details.documents.map((row) => ({ ...row, files: byDoc.get(row.id) || [] }));
}

function requestOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) return resolvePublicAppOrigin();
  return `${proto}://${host}`;
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function requireGrant(req, res) {
  const loaded = await loadGrant(readEmployeeAccessToken(req));
  if (loaded.missingTable) {
    json(res, 503, { error: "Employee access links are not available yet." });
    return null;
  }
  if (!loaded.grant) {
    json(res, 401, { error: "This link has expired. Enter your email to get a new one." });
    return null;
  }
  return loaded.grant;
}

async function downloadPayslip(req, res, grant) {
  const id = String(req.query?.id || "").trim();
  if (!id) return json(res, 400, { error: "Choose a payslip to download." });
  const { data: slip, error } = await supabaseAdmin
    .from("payslips")
    .select("id")
    .eq("id", id)
    .eq("org_id", grant.org_id)
    .eq("membership_id", grant.membership_id)
    .maybeSingle();
  if (error) throw error;
  if (!slip) return json(res, 404, { error: "Payslip not found." });
  const pdf = await generateSecurePayslipPdf(grant.org_id, slip.id, {
    deliveryMethod: "download",
    actorId: null,
  });
  const filename = String(pdf.filename || "payslip.pdf").replace(/["\r\n]/g, "");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).send(pdf.content);
}

async function documentDownloadUrl(req, res, grant) {
  const id = String(req.query?.id || "").trim();
  if (!id) return json(res, 400, { error: "Choose a document to download." });
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, public_share_token")
    .eq("id", id)
    .eq("org_id", grant.org_id)
    .eq("membership_id", grant.membership_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return json(res, 404, { error: "Document not found." });
  let token = String(data.public_share_token || "").trim();
  if (!token) {
    token = crypto.randomUUID();
    const updated = await supabaseAdmin
      .from("documents")
      .update({ public_share_token: token })
      .eq("id", data.id)
      .eq("org_id", grant.org_id)
      .eq("membership_id", grant.membership_id)
      .is("public_share_token", null)
      .select("public_share_token")
      .maybeSingle();
    if (updated.error) throw updated.error;
    token = String(updated.data?.public_share_token || "").trim();
    if (!token) {
      const again = await supabaseAdmin
        .from("documents")
        .select("public_share_token")
        .eq("id", data.id)
        .eq("org_id", grant.org_id)
        .eq("membership_id", grant.membership_id)
        .maybeSingle();
      if (again.error) throw again.error;
      token = String(again.data?.public_share_token || "").trim();
    }
  }
  if (!token) return json(res, 404, { error: "This document isn't available to download." });
  const origin = String(requestOrigin(req) || resolvePublicAppOrigin()).replace(/\/$/, "");
  const preview = String(req.query?.view || "") === "1";
  const download = preview ? "" : "&download=true";
  return json(res, 200, {
    ok: true,
    url: `${origin}/DocumentPDF?token=${encodeURIComponent(token)}${download}`,
  });
}

async function attachmentDownloadUrl(req, res, grant) {
  const id = String(req.query?.id || "").trim();
  if (!id) return json(res, 400, { error: "Choose a file to download." });
  const { data, error } = await supabaseAdmin
    .from("document_attachments")
    .select("id, file_url, document_id")
    .eq("id", id)
    .eq("org_id", grant.org_id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.document_id) return json(res, 404, { error: "File not found." });
  const owned = await supabaseAdmin
    .from("documents")
    .select("id")
    .eq("id", data.document_id)
    .eq("org_id", grant.org_id)
    .eq("membership_id", grant.membership_id)
    .maybeSingle();
  if (owned.error) throw owned.error;
  if (!owned.data) return json(res, 404, { error: "File not found." });
  const url = httpsUrl(data.file_url);
  if (!url) return json(res, 404, { error: "This file isn't available to download." });
  return json(res, 200, { ok: true, url });
}

async function submitLeave(req, res, grant) {
  if (!(await orgAllowsLeave(grant.org_id))) {
    return json(res, 403, { error: "Leave applications are not available for this company." });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const result = await applyForLeaveForMembership(grant.org_id, grant.membership_id, body, {
    origin: requestOrigin(req),
  });
  return json(res, 200, {
    ok: true,
    status: "pending",
    working_days: result?.preview?.workingDays ?? null,
  });
}

async function previewLeave(req, res, grant) {
  if (!(await orgAllowsLeave(grant.org_id))) {
    return json(res, 403, { error: "Leave applications are not available for this company." });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const preview = await previewLeaveApplicationForMembership(grant.org_id, grant.membership_id, body);
  return json(res, 200, {
    ok: Boolean(preview.ok),
    working_days: preview.workingDays ?? null,
    available: preview.available ?? null,
    remaining: preview.remainingAfterApproval ?? null,
    errors: Array.isArray(preview.errors) ? preview.errors : [],
  });
}

async function requestLink(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const slug = String(body.slug || "").trim().toLowerCase();
  const email = normalizeEmploymentEmail(body.email);
  if (!isValidPortalSlug(slug)) return json(res, 404, { error: "We couldn't find this employee portal." });
  if (!email) return json(res, 400, { error: "Enter the email on your employment record." });
  if (tooManyRequests(`${clientAddress(req)}:${slug}`)) {
    return json(res, 429, { error: "Wait a few minutes and try again." });
  }

  try {
    const org = await loadPortalOrg(slug);
    if (!org?.id) return json(res, 404, { error: "We couldn't find this employee portal." });
    if (await isDemoOrgId(org.id)) {
      logDemo("demo_message_suppressed", { channel: "email", kind: "employee_access_link" });
      return json(res, 200, { ok: true, sent: true, message: EMPLOYEE_ACCESS_SENT_MESSAGE });
    }

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = await supabaseAdmin
      .from("employee_portal_access_grants")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    if (recent.error) {
      if (missingGrantsTable(recent.error)) {
        return json(res, 503, { error: "Employee access links are not available yet." });
      }
      throw recent.error;
    }
    if ((recent.count || 0) >= EMPLOYEE_ACCESS_REQUEST_LIMIT) {
      return json(res, 200, { ok: true, sent: true, message: EMPLOYEE_ACCESS_SENT_MESSAGE });
    }

    const membership = selectPortalMembership(await membershipsForEmail(org.id, email), email);
    if (!membership) return json(res, 200, { ok: true, sent: true, message: EMPLOYEE_ACCESS_SENT_MESSAGE });

    const token = generateEmployeeAccessToken();
    const expiresAt = employeeAccessExpiresAt();
    const inserted = await supabaseAdmin.from("employee_portal_access_grants").insert({
      org_id: org.id,
      membership_id: membership.id,
      email,
      token_hash: hashEmployeeAccessToken(token),
      expires_at: expiresAt,
    });
    if (inserted.error) {
      if (missingGrantsTable(inserted.error)) {
        return json(res, 503, { error: "Employee access links are not available yet." });
      }
      throw inserted.error;
    }

    const link = employeeAccessLinkPath(slug, token, resolvePublicAppOrigin());
    const safeCompany = escapeHtml(org.name || "your employer");
    const sent = await sendHtmlEmail(
      email,
      `Your employee details link for ${org.name || "your employer"}`,
      `<p>Use this link to open your employee record, payslips, leave, and documents at ${safeCompany}.</p>
       <p><a href="${escapeHtml(link)}">Open my employee details</a></p>
       <p>This link expires in 24 hours. It is not a permanent login. If you did not ask for it, you can ignore this email.</p>`
    );
    if (!sent?.success) {
      await supabaseAdmin.from("employee_portal_access_grants").delete().eq("token_hash", hashEmployeeAccessToken(token));
      return json(res, 503, { error: "We couldn't send the link. Try again in a moment." });
    }
    return json(res, 200, { ok: true, sent: true, message: EMPLOYEE_ACCESS_SENT_MESSAGE });
  } catch (err) {
    console.error("[employee-access] request", err?.message || err);
    return json(res, 500, { error: "We couldn't send the link. Try again in a moment." });
  }
}

async function redeemLink(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const token = String(body.token || "").trim();
  try {
    const loaded = await loadGrant(token);
    if (loaded.missingTable) return json(res, 503, { error: "Employee access links are not available yet." });
    if (!loaded.grant) return json(res, 401, { error: "This link has expired. Enter your email to get a new one." });
    const payload = await sessionPayload(loaded.grant);
    if (!payload) return json(res, 401, { error: "This link has expired. Enter your email to get a new one." });
    const maxAge = employeeAccessRemainingSeconds(loaded.grant.expires_at);
    res.setHeader(
      "Set-Cookie",
      buildEmployeeAccessCookie(token, { maxAgeSeconds: maxAge, secure: isSecureRequest(req) })
    );
    return json(res, 200, payload);
  } catch (err) {
    console.error("[employee-access] redeem", err?.message || err);
    return json(res, 500, { error: "We couldn't open this link. Try again." });
  }
}

async function readSession(req, res) {
  try {
    const loaded = await loadGrant(readEmployeeAccessToken(req));
    if (loaded.missingTable) return json(res, 503, { error: "Employee access links are not available yet." });
    if (!loaded.grant) return json(res, 401, { error: "This link has expired. Enter your email to get a new one." });
    const payload = await sessionPayload(loaded.grant);
    if (!payload) return json(res, 401, { error: "This link has expired. Enter your email to get a new one." });
    return json(res, 200, payload);
  } catch (err) {
    console.error("[employee-access] session", err?.message || err);
    return json(res, 500, { error: "We couldn't open your employee details." });
  }
}

function endSession(req, res) {
  res.setHeader("Set-Cookie", buildEmployeeAccessCookie("", { maxAgeSeconds: 0, secure: isSecureRequest(req) }));
  return json(res, 200, { ok: true });
}

/**
 * /api/company/employee-access
 * op=request emails a 24-hour link to the address on the employment record.
 * op=redeem and op=session open only that employee's details.
 */
export async function handleEmployeeAccessLink(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const op = String(req.query?.op || "").trim().toLowerCase();
  if (req.method === "POST" && op === "request") return requestLink(req, res);
  if (req.method === "POST" && op === "redeem") return redeemLink(req, res);
  if (req.method === "GET" && op === "session") return readSession(req, res);
  if (req.method === "POST" && op === "end") return endSession(req, res);
  if (op === "payslip-pdf" || op === "document" || op === "attachment" || op === "leave" || op === "leave-preview") {
    try {
      const grant = await requireGrant(req, res);
      if (!grant) return undefined;
      if (req.method === "GET" && op === "payslip-pdf") return await downloadPayslip(req, res, grant);
      if (req.method === "GET" && op === "document") return await documentDownloadUrl(req, res, grant);
      if (req.method === "GET" && op === "attachment") return await attachmentDownloadUrl(req, res, grant);
      if (req.method === "POST" && op === "leave") return await submitLeave(req, res, grant);
      if (req.method === "POST" && op === "leave-preview") return await previewLeave(req, res, grant);
      return json(res, 405, { error: "Method not allowed" });
    } catch (err) {
      const status = Number(err?.status) || 500;
      console.error("[employee-access]", op, err?.message || err);
      if (err?.code === "PAYSLIP_ID_REQUIRED") {
        return json(res, 422, {
          error: "Add a valid South African ID number on Personal details. The payslip download uses that number.",
        });
      }
      return json(res, status >= 400 && status < 600 ? status : 500, {
        error: status >= 500 ? "We couldn't complete that. Try again." : err?.message || "We couldn't complete that.",
      });
    }
  }
  return json(res, 405, { error: "Method not allowed" });
}
