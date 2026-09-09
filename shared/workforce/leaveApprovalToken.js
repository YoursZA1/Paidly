// @ts-check

import crypto from "node:crypto";

/**
 * Hash a leave-approval token. The raw token is never stored.
 * @param {string} token
 */
export function hashLeaveApprovalToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

/**
 * @param {{ now?: Date, startDate?: string | Date | null, ttlDays?: number }} [opts]
 */
export function leaveApprovalExpiry(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const ttlDays = Number.isFinite(opts.ttlDays) ? Number(opts.ttlDays) : 7;
  const fromTtl = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const start = opts.startDate ? new Date(opts.startDate) : null;
  if (start && Number.isFinite(start.getTime()) && start.getTime() < fromTtl.getTime()) {
    return start.toISOString();
  }
  return fromTtl.toISOString();
}

/**
 * Public approval payload. No salary, bank, ID, email, or attachments.
 * @param {{
 *   employeeName?: string,
 *   leaveTypeName?: string,
 *   startDate?: string,
 *   endDate?: string,
 *   workingDays?: number,
 *   currentBalance?: number | null,
 *   remainingAfterApproval?: number | null,
 *   reason?: string,
 *   companyName?: string,
 *   alreadyDecided?: boolean,
 *   status?: string,
 * }} input
 */
export function publicLeaveApprovalView(input = {}) {
  return {
    employee_name: String(input.employeeName || "Employee").trim() || "Employee",
    leave_type: String(input.leaveTypeName || "Leave").trim() || "Leave",
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    working_days: Number(input.workingDays) || 0,
    current_balance: input.currentBalance == null ? null : Number(input.currentBalance),
    remaining_after_approval:
      input.remainingAfterApproval == null ? null : Number(input.remainingAfterApproval),
    reason: String(input.reason || "").slice(0, 200),
    company_name: String(input.companyName || "Paidly"),
    already_decided: Boolean(input.alreadyDecided),
    status: input.status || "pending",
  };
}

/**
 * Compare stored hash to a presented token using a constant-time check.
 * @param {string} presentedToken
 * @param {string} storedHash
 */
export function leaveApprovalTokenMatches(presentedToken, storedHash) {
  const computed = hashLeaveApprovalToken(presentedToken);
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(String(storedHash || ""), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
