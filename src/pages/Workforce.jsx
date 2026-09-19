import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Contact } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";
import WorkforcePosPanel from "@/components/workforce/WorkforcePosPanel.jsx";
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

  if (experience === WORKFORCE_EXPERIENCES.MANAGER) {
    return <Navigate to={`${createPageUrl("Workforce/manager")}?tab=overview`} replace />;
  }

  if (experience === WORKFORCE_EXPERIENCES.EMPLOYEE || experience === WORKFORCE_EXPERIENCES.POS_ONLY) {
    return <EmployeeWorkforcePortal />;
  }

  return <WorkforceOverview />;
}

function EmployeeWorkforcePortal() {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get("tab") || "home";
  return (
    <PageTemplate>
      <PageTemplate.Body>
        <WorkforceSubnav />
        {tab === "pos" ? <WorkforcePosPanel /> : <MyPayrollPage embedded variant="portal" />}
      </PageTemplate.Body>
    </PageTemplate>
  );
}

function WorkforceOverview() {
  const { hasPermission, ctx } = useCompanyContext();
  const canPayroll = hasPermission(PERMISSIONS.MANAGE_PAYROLL);
  const canViewTeam = hasPermission(PERMISSIONS.VIEW_TEAM_MEMBERS);
  const experience = resolveWorkforceExperience(ctx);
  const currency = useAppStore((s) => s.userProfile)?.currency || "ZAR";
  const [summary, setSummary] = useState(null);
  const [payrollOverview, setPayrollOverview] = useState(null);
  const [payrollMonth, setPayrollMonth] = useState(null);
  const [people, setPeople] = useState(null);
  const links = getWorkforceNavChildren(hasPermission, { experience }).filter(
    (row) => row.id !== "nav-workforce-overview"
  );

  useEffect(() => {
    workforceApi
      .summary()
      .then(setSummary)
      .catch(() => setSummary(null));
    if (canViewTeam) {
      workforceApi
        .peopleCalendar({ daysAhead: 30 })
        .then(setPeople)
        .catch(() => setPeople(null));
    }
    if (!canPayroll) {
      setPayrollOverview(null);
      setPayrollMonth(null);
      return;
    }
    payrollApi
      .overview()
      .then(setPayrollOverview)
      .catch(() => setPayrollOverview(null));
    payrollApi
      .dashboard()
      .then(setPayrollMonth)
      .catch(() => setPayrollMonth(null));
  }, [canPayroll, canViewTeam]);

  const money = (n) => formatCurrency(Number(n || 0), currency);
  const lastFinalized = (payrollOverview?.runs || []).find((row) => row.finalized_at);
  const pendingInvites = summary?.workforce?.pending_invites;
  const inviteCount =
    pendingInvites == null ? summary?.workforce?.pending_onboarding ?? 0 : pendingInvites;
  const upcomingBirthdays = (people?.upcoming || []).filter((e) => e.kind === "birthday");
  const upcomingAnniversaries = (people?.upcoming || []).filter((e) => e.kind === "work_anniversary");
  const facets = summary?.facets || {};
  const runStatus =
    payrollOverview?.current_run?.status ||
    (payrollOverview?.current_period_covered ? "finalized" : null);
  const payrollExceptions =
    Number(payrollMonth?.exceptions || 0) + Number(summary?.workforce?.incomplete_payroll || 0);

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Workforce"
          description="People, payroll, and organisation for this company — one employee record per membership."
          icon={<Contact className="h-4 w-4" />}
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <WorkforceSubnav />
        {summary ? (
          <div className="mb-6 space-y-5">
            <Section title="People" link={canViewTeam ? createPageUrl("Workforce/people-calendar") : null} linkLabel="People calendar">
              <Kpi label="Total employees" value={summary.workforce?.total ?? 0} />
              <Kpi label="Active" value={summary.workforce?.active ?? 0} />
              <Kpi label="New (30 days)" value={summary.workforce?.new_employees ?? 0} />
              <Kpi label="Pending invitations" value={inviteCount} />
              {canViewTeam ? (
                <Kpi
                  label="Birthdays (30 days)"
                  value={upcomingBirthdays.length}
                  hint={upcomingBirthdays[0] ? `Next: ${upcomingBirthdays[0].employee_name} · ${upcomingBirthdays[0].event_date}` : null}
                />
              ) : null}
              {canViewTeam ? (
                <Kpi
                  label="Work anniversaries (30 days)"
                  value={upcomingAnniversaries.length}
                  hint={
                    upcomingAnniversaries[0]
                      ? `Next: ${upcomingAnniversaries[0].employee_name} · ${upcomingAnniversaries[0].years} yr`
                      : null
                  }
                />
              ) : null}
              <Kpi label="On leave today" value={summary.leave?.on_leave_today ?? 0} />
              <Kpi label="Pending leave" value={summary.leave?.pending ?? 0} />
            </Section>

            {canPayroll && payrollOverview ? (
              <Section title="Payroll" link={createPageUrl("Workforce/reports")} linkLabel="Payroll reports">
                <Kpi
                  label="Current payroll"
                  value={runStatus ? String(runStatus).replace(/_/g, " ") : "Not started"}
                  hint={payrollOverview.current_period?.label || null}
                />
                <Kpi
                  label="Gross payroll"
                  value={money(payrollMonth?.gross_payroll ?? payrollOverview.gross_payroll)}
                  hint={payrollMonth?.finalized_runs?.length ? `Finalised · ${payrollMonth.month_label}` : "Current run"}
                />
                <Kpi label="Net payroll" value={money(payrollMonth?.net_payroll ?? payrollOverview.total_net)} />
                <Kpi label="PAYE" value={money(payrollMonth?.paye)} />
                <Kpi label="UIF (EE + ER)" value={money(payrollMonth?.uif_total)} />
                <Kpi
                  label="Payroll exceptions"
                  value={payrollExceptions}
                  hint={payrollExceptions ? "Warnings, variances or missing pay rates" : "Nothing to review"}
                />
                <Kpi label="Pending approval" value={payrollOverview.pending_payroll ?? 0} />
                <Kpi
                  label="Last finalised"
                  value={lastFinalized?.period_label || lastFinalized?.finalized_at?.slice(0, 10) || "—"}
                />
              </Section>
            ) : null}

            {canViewTeam ? (
              <Section title="Organisation" link={createPageUrl("Workforce/organisation")} linkLabel="Organogram">
                <Kpi label="Departments" value={(facets.departments || []).length} />
                <Kpi label="Managers" value={(facets.managers || []).length} />
                <Kpi label="Needs attention" value={summary.workforce?.needs_attention ?? 0} />
                <Kpi label="Awaiting reassignment" value={summary.workforce?.awaiting_reassignment ?? 0} />
              </Section>
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

function Section({ title, link, linkLabel, children }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {link ? (
          <Link to={link} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            {linkLabel}
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}

function Kpi({ label, value, hint = null }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-semibold capitalize tabular-nums">{value}</p>
        {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
