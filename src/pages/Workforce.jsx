import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Contact, Shield } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";
import MyWorkspaceSummary from "@/components/dashboard/MyWorkspaceSummary";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";
import MyPayrollPage from "@/pages/MyPayroll";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { payrollApi } from "@/services/PayrollApiService";
import { workforceApi } from "@/services/WorkforceApiService";
import { createPageUrl } from "@/utils";
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
    return <Navigate to={createPageUrl("Workforce/manager")} replace />;
  }

  if (experience === WORKFORCE_EXPERIENCES.EMPLOYEE) {
    return <EmployeeWorkforcePortal />;
  }

  return <WorkforceOverview />;
}

function EmployeeWorkforcePortal() {
  const { companyRoleLabel } = useCompanyContext();
  const { profile } = useUserProfileQuery();
  const { user: authUser } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const user = profile ?? authUser;
  const displayName = user?.full_name || user?.company_name || "there";
  const companyName =
    profile?.company_name || profile?.business?.company_name || profile?.business?.name || null;

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-0.5 hidden text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70 sm:mb-1 sm:block sm:text-[11px]">
                {greeting}
              </p>
              <h1 className="mb-0.5 font-display text-base font-bold leading-tight text-foreground sm:mb-1 sm:text-2xl md:text-[28px]">
                {displayName}
              </h1>
              <p className="finbank-body text-xs text-muted-foreground sm:text-sm">
                {companyName
                  ? `${companyName} — your payslips, leave, and documents.`
                  : "Your payslips, leave, and documents."}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 gap-1 capitalize">
              <Shield className="h-3 w-3" aria-hidden />
              {companyRoleLabel}
            </Badge>
          </div>
        </motion.div>
      </PageTemplate.Header>
      <PageTemplate.Body>
        <WorkforceSubnav />
        <MyWorkspaceSummary />
        <MyPayrollPage embedded />
      </PageTemplate.Body>
    </PageTemplate>
  );
}

function WorkforceOverview() {
  const { hasPermission } = useCompanyContext();
  const canPayroll = hasPermission(PERMISSIONS.MANAGE_PAYROLL);
  const [summary, setSummary] = useState(null);
  const [payrollOverview, setPayrollOverview] = useState(null);
  const links = getWorkforceNavChildren(hasPermission).filter(
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
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Workforce" value={summary.workforce?.active ?? summary.workforce?.total ?? 0} />
            <Kpi label="Pending leave" value={summary.leave?.pending ?? 0} />
            <Kpi label="Upcoming leave" value={summary.leave?.upcoming ?? 0} />
            <Kpi label="Payslips issued" value={summary.payroll?.payslips_generated ?? 0} />
            {canPayroll && payrollOverview ? (
              <>
                <Kpi
                  label="Pay period"
                  value={payrollOverview.current_period?.label || "—"}
                />
                <Kpi
                  label="Current run"
                  value={payrollOverview.current_run?.status || (payrollOverview.current_period_covered ? "Finalized" : "Not started")}
                />
                <Kpi label="Pending pay runs" value={payrollOverview.pending_payroll ?? 0} />
                <Kpi label="Paid runs" value={payrollOverview.completed_payroll ?? 0} />
              </>
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
