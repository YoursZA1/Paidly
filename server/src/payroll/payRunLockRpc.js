import { supabaseAdmin } from "./payrollGate.js";
import { isMissingLockRpc, mapPayRunLockResult } from "../../../shared/payroll/payRunLock.js";

export async function claimPayRunForCalculate(orgId, runId) {
  const { data, error } = await supabaseAdmin.rpc("claim_pay_run_for_calculate", {
    p_org_id: orgId,
    p_run_id: runId,
  });
  if (error && isMissingLockRpc(error)) return { fallback: true };
  return mapPayRunLockResult(data, error);
}

export async function commitPayRunCalculate(orgId, runId, payload) {
  const { data, error } = await supabaseAdmin.rpc("commit_pay_run_calculate", {
    p_org_id: orgId,
    p_run_id: runId,
    p_items: payload.items,
    p_leave_fingerprint: payload.leaveFingerprint,
    p_gross_total: payload.grossTotal,
    p_deductions_total: payload.deductionsTotal,
    p_net_total: payload.netTotal,
    p_employee_count: payload.employeeCount,
  });
  if (error && isMissingLockRpc(error)) return { fallback: true };
  return mapPayRunLockResult(data, error);
}

export async function lockOpenPayRunsForLeave(orgId, start, end, balanceId = null) {
  const { data, error } = await supabaseAdmin.rpc("lock_open_pay_runs_for_leave", {
    p_org_id: orgId,
    p_start: start,
    p_end: end,
    p_balance_id: balanceId,
  });
  if (error && isMissingLockRpc(error)) return { fallback: true };
  return mapPayRunLockResult(data, error);
}
