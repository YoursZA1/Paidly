import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Contact } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";
import MyPayrollPage from "@/pages/MyPayroll";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { payrollApi } from "@/services/PayrollApiService";
import { workforceApi } from "@/services/WorkforceApiService";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "@/components/CurrencySelector";
import { useAppStore } from "@/stores/useAppStore";
import {
  WORKFORCE_EXPERIENCES,
  resolveWorkforceExperience,
} from "@/lib/workforceExperience.js";
import { getWorkforceNavChildren } from "@/lib/workforceNav.js";

export default function Workforce() {
  const { loading, ctx } = useCompanyContext();
  const experience = resolveWorkforceExperience(ctx);

  if (loading) return <AuthBootstrapShell />;

  if (experience === WORKFORCE_EXPERIENCES.POS_ONLY) {
    return <Navigate to={createPageUrl("POS")} replace />;
  }

  if (experience === WORKFORCE_EXPERIENCES.MANAGER) {
    return <Navigate to={`${createPageUrl("Workforce/manager")}?tab=overview`} replace />;
  }

  if (experience === WORKFORCE_EXPERIENCES.EMPLOYEE) {
    return <EmployeeWorkforcePortal />;
  }

  return <WorkforceOverview />;
}

function EmployeeWorkforcePortal() {
  return (
    <PageTemplate>
      <PageTemplate.Body>
        <WorkforceSubnav />
        <MyPayrollPage embedded variant="portal" />
      </PageTemplate.Body>
    </PageTemplate>
  );
}

function WorkforceOverview() {
  const { hasPermission, ctx } = useCompanyContext();
  const canPayroll = hasPermission(PERMISSIONS.MANAGE_PAYROLL);
  const experience = resolveWorkforceExperience(ctx);
  const currency = useAppStore((s) => s.userProfile)?.currency || "ZAR";
  const [summary, setSummary] = useState(null);
  const [payrollOverview, setPayrollOverview] = useState(null);
  const links = getWorkforceNavChildren(hasPermission, { experience }).filter(
    (row) => row.id !== "nav-workforce-overview"
  );

  useEffect(() => {
    workforceApi
      .summary()
      .then(setSummary)
      .catch(() => setSummary(null));
    if (!canPayroll) {
      setPayrollOverview(null);
      return;
    }
    payrollApi
      .overview()
      .then(setPayrollOverview)
      .catch(() => setPayrollOverview(null));
  }, [canPayroll]);

  const lastFinalized = (payrollOverview?.runs || []).find((row) => row.finalized_at);
  const pendingInvites = summary?.workforce?.pending_invites;
  const inviteCount =
    pendingInvites == null ? summary?.workforce?.pending_onboarding ?? 0 : pendingInvites;

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Workforce"
          description="People, leave, and payroll for this organization — one membership ID."
          icon={<Contact className="h-4 w-4" />}
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <WorkforceSubnav />
        {summary ? (
          <div className="mb-6 space-y-4">
            <div>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Workforce</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Total employees" value={summary.workforce?.total ?? 0} />
                <Kpi label="Active" value={summary.workforce?.active ?? 0} />
                <Kpi label="Inactive" value={summary.workforce?.inactive ?? 0} />
                <Kpi label="Needs attention" value={summary.workforce?.needs_attention ?? 0} />
                <Kpi label="Pending invitations" value={inviteCount} />
                <Kpi label="New employees" value={summary.workforce?.new_employees ?? 0} />
                <Kpi label="On leave today" value={summary.leave?.on_leave_today ?? 0} />
                <Kpi label="Pending leave" value={summary.leave?.pending ?? 0} />
                <Kpi label="Upcoming leave" value={summary.leave?.upcoming ?? 0} />
                <Kpi label="Payslips issued" value={summary.payroll?.payslips_generated ?? 0} />
              </div>
            </div>
            {canPayroll && payrollOverview ? (
              <div>
                <h2 className="mb-2 text-sm font-medium text-muted-foreground">Payroll</h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="Pay period" value={payrollOverview.current_period?.label || "—"} />
                  <Kpi
                    label="Current run"
                    value={
                      payrollOverview.current_run?.status ||
                      (payrollOverview.current_period_covered ? "Finalized" : "Not started")
                    }
                  />
                  <Kpi
                    label="Employees in run"
                    value={
                      payrollOverview.current_run?.employee_count ?? payrollOverview.employees ?? "—"
                    }
                  />
                  <Kpi label="Gross payroll" value={formatCurrency(Number(payrollOverview.gross_payroll || 0), currency)} />
                  <Kpi
                    label="Deductions"
                    value={formatCurrency(Number(payrollOverview.total_deductions || 0), currency)}
                  />
                  <Kpi label="Net payroll" value={formatCurrency(Number(payrollOverview.total_net || 0), currency)} />
                  <Kpi label="Pending approval" value={payrollOverview.pending_payroll ?? 0} />
                  <Kpi
                    label="Last finalized"
                    value={lastFinalized?.period_label || lastFinalized?.finalized_at?.slice(0, 10) || "—"}
                  />
                  <Kpi label="Period end" value={payrollOverview.current_period?.end || "—"} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {summary?.payroll?.needs_adjustment_run ? (
          <p className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
            Leave was approved after a finalized pay run. Open Payroll and create an adjustment run so unpaid leave is not missed.
          </p>
        ) : null}
        {links.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((item) => (
              <Link
                key={item.id}
                to={item.url}
                className="rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted/40"
              >
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">Open {item.title.toLowerCase()}</p>
              </Link>
            ))}
          </div>
        ) : null}
      </PageTemplate.Body>
    </PageTemplate>
  );
}

function Kpi({ label, value }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
