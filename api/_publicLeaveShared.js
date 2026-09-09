/**
 * Public leave approval by single-use hashed token.
 * Token-only access — no employee profile, payroll, or other requests.
 */
import { consumeMemoryRateLimit } from "../server/src/rateLimit/consumeRateLimit.js";
import { lookupLeaveApprovalToken, claimLeaveApprovalToken } from "../server/src/leave/leaveApprovalTokens.js";
import { decideLeaveRequest, getPublicLeaveApprovalPayload } from "../server/src/leave/leaveService.js";
import { supabaseAdmin } from "../server/src/supabaseAdmin.js";
import { writeWorkforceAudit } from "../server/src/workforce/workforceAudit.js";

function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body && typeof body === "object" ? body : {};
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function loadTokenOrReject(req, res) {
  const token = String(req.query?.token || parseJsonBody(req).token || "").trim();
  if (!token) {
    res.status(400).json({ error: "Missing approval token." });
    return null;
  }
  const limited = consumeMemoryRateLimit("leave-approval", clientIp(req), 30, 15 * 60 * 1000);
  if (!limited.ok) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return null;
  }
  const row = await lookupLeaveApprovalToken(token);
  if (!row) {
    res.status(404).json({ error: "This approval link is invalid." });
    return null;
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: "This approval link has expired." });
    return null;
  }
  return { token, row };
}

export async function handlePublicLeaveGet(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const found = await loadTokenOrReject(req, res);
    if (!found) return;
    const payload = await getPublicLeaveApprovalPayload(found.row);
    if (!payload) return res.status(404).json({ error: "Leave request not found." });
    return res.status(200).json({ ok: true, request: payload });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Could not load leave request." });
  }
}

export async function handlePublicLeaveDecide(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const found = await loadTokenOrReject(req, res);
    if (!found) return;
    const body = parseJsonBody(req);
    const action = String(body.action || "").toLowerCase();
    const approve = action === "approve" || action === "approved";
    if (!approve && action !== "decline" && action !== "reject" && action !== "rejected") {
      return res.status(400).json({ error: "Action must be approve or decline." });
    }
    if (!approve && !String(body.reason || body.comment || "").trim()) {
      return res.status(400).json({ error: "A rejection reason is required." });
    }
    if (found.row.used_at) {
      return res.status(409).json({ error: "This approval link has already been used.", code: "ALREADY_USED" });
    }
    const claimed = await claimLeaveApprovalToken({
      tokenId: found.row.id,
      decision: approve ? "approved" : "rejected",
      ip: clientIp(req),
    });
    if (!claimed) {
      return res.status(409).json({ error: "This approval link has already been used.", code: "ALREADY_USED" });
    }
    const { data: manager } = await supabaseAdmin
      .from("memberships")
      .select("id, user_id, invited_email, org_id")
      .eq("id", found.row.approver_membership_id)
      .maybeSingle();
    const contact = manager?.user_id
      ? (
          await supabaseAdmin.from("profiles").select("email").eq("id", manager.user_id).maybeSingle()
        ).data?.email
      : manager?.invited_email;
    await decideLeaveRequest(found.row.org_id, manager?.user_id || null, found.row.leave_request_id, {
      approve,
      reason: body.reason || body.comment,
      comment: body.comment,
      method: "email_link",
      actorMembership: manager,
      decidedEmail: contact || null,
      fromToken: true,
    });
    await writeWorkforceAudit({
      orgId: found.row.org_id,
      employeeId: found.row.approver_membership_id,
      action: approve ? "leave.approved_via_link" : "leave.rejected_via_link",
      after: { leave_request_id: found.row.leave_request_id },
    });
    return res.status(200).json({ ok: true, decision: approve ? "approved" : "rejected" });
  } catch (err) {
    const status = Number(err?.status) || 500;
    return res.status(status).json({ error: err?.message || "Could not decide leave request." });
  }
}
