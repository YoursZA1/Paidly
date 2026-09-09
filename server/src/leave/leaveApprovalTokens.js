import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  hashLeaveApprovalToken,
  leaveApprovalExpiry,
  leaveApprovalTokenMatches,
} from "../../../shared/workforce/leaveApprovalToken.js";

export async function issueLeaveApprovalToken({
  orgId,
  leaveRequestId,
  approverMembershipId,
  startDate,
}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashLeaveApprovalToken(token);
  const expiresAt = leaveApprovalExpiry({ startDate });
  const { error } = await supabaseAdmin.from("leave_approval_tokens").insert({
    org_id: orgId,
    leave_request_id: leaveRequestId,
    approver_membership_id: approverMembershipId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { token, expiresAt };
}

export async function lookupLeaveApprovalToken(presentedToken) {
  const tokenHash = hashLeaveApprovalToken(presentedToken);
  const { data } = await supabaseAdmin
    .from("leave_approval_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!data?.id) return null;
  if (!leaveApprovalTokenMatches(presentedToken, data.token_hash)) return null;
  return data;
}

export async function claimLeaveApprovalToken({ tokenId, decision, ip }) {
  const { data, error } = await supabaseAdmin
    .from("leave_approval_tokens")
    .update({
      used_at: new Date().toISOString(),
      used_ip: ip || null,
      decision,
    })
    .eq("id", tokenId)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function invalidateLeaveApprovalTokens(leaveRequestId) {
  await supabaseAdmin
    .from("leave_approval_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("leave_request_id", leaveRequestId)
    .is("used_at", null);
}
