import { Link } from "react-router-dom";
import { Receipt, CalendarOff, FileText, ArrowRight } from "lucide-react";
import { createPageUrl } from "@/utils";
import useCompanyContext from "@/hooks/useCompanyContext";
import { useSelfWorkspaceSummary } from "@/hooks/useMemberDashboardQueries";

function StatTile({ to, title, value, hint, icon: Icon }) {
  return (
    <Link
      to={to}
      className="group min-w-0 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/40 sm:px-5 sm:py-4"
    >
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{title}</p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="tabular-nums text-xl font-semibold leading-snug tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {hint}
        <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
    </Link>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl border border-border/60 bg-muted/30" />
      ))}
    </div>
  );
}

/**
 * "My workspace" — the signed-in member's own payslips, leave applications, and documents.
 * Rendered for every company member (employee, manager, admin); always self-scoped.
 */
export default function MyWorkspaceSummary() {
  const { ctx, companyId, loading: companyLoading } = useCompanyContext();
  const userId = ctx?.userId ?? null;
  const { data, isLoading } = useSelfWorkspaceSummary(userId, companyId);

  if (companyLoading || isLoading || !data) {
    return (
      <section className="mb-6 sm:mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
          My workspace
        </h2>
        <SummarySkeleton />
      </section>
    );
  }

  const leavePending = data.leave?.pending || 0;

  return (
    <section className="mb-6 sm:mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
        My workspace
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          to={createPageUrl("MyPayroll")}
          title="My Payroll"
          value={data.payslips?.count ?? 0}
          hint={data.payslips?.latest ? "View latest" : "View payslips"}
          icon={Receipt}
        />
        <StatTile
          to={createPageUrl("MyPayroll?tab=leave")}
          title="My Leave"
          value={data.leave?.count ?? 0}
          hint={leavePending ? `${leavePending} pending approval` : "Track requests"}
          icon={CalendarOff}
        />
        <StatTile
          to={createPageUrl("Documents")}
          title="My Documents"
          value={data.documents?.count ?? 0}
          hint="Expense claims & files"
          icon={FileText}
        />
      </div>
    </section>
  );
}
