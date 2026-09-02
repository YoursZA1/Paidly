import { normalizeRequestBody } from "../validateBody.js";
import { jsonError, requirePayrollPermission, PERMISSIONS, supabaseAdmin } from "./payrollGate.js";
import {
  payrollOverview,
  syncPayrollProfiles,
  upsertPayrollProfile,
  previewCalculation,
  createPayRun,
  getPayRun,
  calculatePayRun,
  submitPayRunForApproval,
  approvePayRun,
  finalizePayRun,
  markPayRunPaid,
  cancelPayRun,
  sendPayRunPayslips,
  listStatutoryRules,
  upsertStatutoryRule,
} from "./payrollService.js";

function originFromReq(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

async function handle(res, fn) {
  try {
    const data = await fn();
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    const status = Number(err?.status) || 500;
    return jsonError(res, status, err?.message || "Payroll request failed", {
      details: err?.details,
    });
  }
}

export async function handlePayrollRoute(req, res, resolved) {
  const route = resolved?.route;
  const id = resolved?.id || null;
  const body = normalizeRequestBody(req);

  if (route === "overview") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.MANAGE_PAYROLL, { feature: "payslips" });
    if (!gate.ok) return gate.response;
    if (req.method !== "GET") return jsonError(res, 405, "Method not allowed");
    return handle(res, () => payrollOverview(gate.membership.companyId));
  }

  if (route === "preview") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.MANAGE_PAYROLL, { feature: "payslips" });
    if (!gate.ok) return gate.response;
    if (req.method !== "POST") return jsonError(res, 405, "Method not allowed");
    return handle(res, () => previewCalculation(gate.membership.companyId, body));
  }

  if (route === "profiles") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.MANAGE_PAYROLL, { feature: "payslips" });
    if (!gate.ok) return gate.response;
    if (req.method === "GET") {
      return handle(res, () => syncPayrollProfiles(gate.membership.companyId));
    }
    if (req.method === "POST" || req.method === "PATCH") {
      return handle(res, () => upsertPayrollProfile(gate.membership.companyId, gate.user.id, body));
    }
    return jsonError(res, 405, "Method not allowed");
  }

  if (route === "runs") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.MANAGE_PAYROLL, { feature: "payslips" });
    if (!gate.ok) return gate.response;
    if (req.method === "GET") {
      return handle(res, async () => {
        const { data, error } = await supabaseAdmin
          .from("pay_runs")
          .select("*")
          .eq("org_id", gate.membership.companyId)
          .order("period_start", { ascending: false })
          .limit(50);
        if (error) throw error;
        return data || [];
      });
    }
    if (req.method === "POST") {
      return handle(res, () => createPayRun(gate.membership.companyId, gate.user.id, body));
    }
    return jsonError(res, 405, "Method not allowed");
  }

  if (route === "run-by-id") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.MANAGE_PAYROLL, { feature: "payslips" });
    if (!gate.ok) return gate.response;
    if (req.method !== "GET") return jsonError(res, 405, "Method not allowed");
    return handle(res, () => getPayRun(gate.membership.companyId, id));
  }

  const runActions = {
    "run-calculate": calculatePayRun,
    "run-submit": submitPayRunForApproval,
    "run-approve": approvePayRun,
    "run-finalize": finalizePayRun,
    "run-paid": markPayRunPaid,
    "run-cancel": cancelPayRun,
  };
  if (runActions[route]) {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.MANAGE_PAYROLL, { feature: "payslips" });
    if (!gate.ok) return gate.response;
    if (req.method !== "POST") return jsonError(res, 405, "Method not allowed");
    if (route === "run-calculate") {
      return handle(res, () => calculatePayRun(gate.membership.companyId, gate.user.id, id, body));
    }
    if (route === "run-cancel") {
      return handle(res, () => cancelPayRun(gate.membership.companyId, gate.user.id, id));
    }
    return handle(res, () => runActions[route](gate.membership.companyId, gate.user.id, id));
  }

  if (route === "run-send") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.MANAGE_PAYROLL, { feature: "payslips" });
    if (!gate.ok) return gate.response;
    if (req.method !== "POST") return jsonError(res, 405, "Method not allowed");
    return handle(res, () =>
      sendPayRunPayslips(gate.membership.companyId, gate.user.id, id, originFromReq(req))
    );
  }

  if (route === "statutory") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.MANAGE_PAYROLL, { feature: "payslips" });
    if (!gate.ok) return gate.response;
    if (req.method === "GET") {
      return handle(res, () => listStatutoryRules(gate.membership.companyId));
    }
    if (req.method === "POST" || req.method === "PUT") {
      return handle(res, () => upsertStatutoryRule(gate.membership.companyId, gate.user.id, body));
    }
    return jsonError(res, 405, "Method not allowed");
  }

  if (route === "me") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.VIEW_OWN_PAYSLIPS, { feature: "payslips" });
    if (!gate.ok) return gate.response;
    if (req.method !== "GET") return jsonError(res, 405, "Method not allowed");
    return handle(res, async () => {
      const { data: profile } = await supabaseAdmin
        .from("payroll_profiles")
        .select("id, employee_number, full_name, email, job_title, department, pay_frequency, pay_type, employment_status")
        .eq("org_id", gate.membership.companyId)
        .eq("user_id", gate.user.id)
        .maybeSingle();
      const { data: payslips } = await supabaseAdmin
        .from("payslips")
        .select("id, payslip_number, pay_period_start, pay_period_end, pay_date, net_pay, gross_pay, status, employee_name")
        .eq("org_id", gate.membership.companyId)
        .eq("employee_user_id", gate.user.id)
        .order("pay_date", { ascending: false })
        .limit(36);
      return { profile, payslips: payslips || [] };
    });
  }

  return jsonError(res, 404, "Not found");
}

export function resolvePayrollRoute(req) {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
  const joined = parts.join("/").replace(/^\/+|\/+$/g, "");
  const urlPath = String(req.url || "").split("?")[0] || "";
  const fromUrl = urlPath.replace(/^\/api\/payroll\/?/, "").replace(/^\//, "");
  const path = joined || fromUrl.split("?")[0];
  const segs = path.split("/").filter(Boolean);

  const qid = req.query?.id ? String(req.query.id) : null;
  if (segs[0] === "overview" || path === "overview") return { route: "overview" };
  if (segs[0] === "preview") return { route: "preview" };
  if (segs[0] === "profiles") return { route: "profiles" };
  if (segs[0] === "statutory") return { route: "statutory" };
  if (segs[0] === "me") return { route: "me" };
  if (segs[0] === "run-calculate") return { route: "run-calculate", id: qid || segs[1] };
  if (segs[0] === "run-submit") return { route: "run-submit", id: qid || segs[1] };
  if (segs[0] === "run-approve") return { route: "run-approve", id: qid || segs[1] };
  if (segs[0] === "run-finalize") return { route: "run-finalize", id: qid || segs[1] };
  if (segs[0] === "run-paid") return { route: "run-paid", id: qid || segs[1] };
  if (segs[0] === "run-cancel") return { route: "run-cancel", id: qid || segs[1] };
  if (segs[0] === "run-send") return { route: "run-send", id: qid || segs[1] };
  if (segs[0] === "run-by-id") return { route: "run-by-id", id: qid || segs[1] };
  if (segs[0] === "runs" && segs.length === 1) return { route: "runs" };
  if (segs[0] === "runs" && segs[1] && segs[2] === "calculate") return { route: "run-calculate", id: segs[1] };
  if (segs[0] === "runs" && segs[1] && segs[2] === "submit") return { route: "run-submit", id: segs[1] };
  if (segs[0] === "runs" && segs[1] && segs[2] === "approve") return { route: "run-approve", id: segs[1] };
  if (segs[0] === "runs" && segs[1] && segs[2] === "finalize") return { route: "run-finalize", id: segs[1] };
  if (segs[0] === "runs" && segs[1] && segs[2] === "paid") return { route: "run-paid", id: segs[1] };
  if (segs[0] === "runs" && segs[1] && segs[2] === "cancel") return { route: "run-cancel", id: segs[1] };
  if (segs[0] === "runs" && segs[1] && segs[2] === "send") return { route: "run-send", id: segs[1] };
  if (segs[0] === "runs" && segs[1]) return { route: "run-by-id", id: segs[1] };

  if (req.query?.__payroll) {
    return resolvePayrollRoute({ ...req, query: { path: String(req.query.__payroll).split("/") } });
  }
  return null;
}
