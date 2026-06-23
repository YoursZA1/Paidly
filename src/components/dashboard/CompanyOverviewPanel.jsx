import { Link } from "react-router-dom";
import { Users, ClipboardList, Receipt, FileText, ArrowRight } from "lucide-react";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { useCompanyWorkspaceSummary } from "@/hooks/useMemberDashboardQueries";

function CompanyStat({ to, title, value, icon: Icon }) {
  const body = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{title}</p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="tabular-nums text-xl font-semibold tracking-tight text-foreground">{value}</p>
    </>
  );
  const className =
    "group block min-w-0 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm sm:px-5 sm:py-4";
  return to ? (
    <Link to={to} className={`${className} transition-colors hover:border-primary/30 hover:bg-muted/40`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function RosterSkeleton() {
  return <div className="h-40 animate-pulse rounded-xl border border-border/60 bg-muted/30" />;
}

/**
 * Company overview for managers/admins — record counts, pending approvals, and the full roster of
 * associated users. Gated on VIEW_TEAM_MEMBERS; the company query is only issued when permitted.
 */
export default function CompanyOverviewPanel() {
  const { ctx, hasPermission } = useCompanyContext();
  const canViewTeam = hasPermission(PERMISSIONS.VIEW_TEAM_MEMBERS);
  const canApprove = hasPermission(PERMISSIONS.APPROVE_LEAVE) || hasPermission(PERMISSIONS.MANAGE_LEAVE);
  const { data, isLoading } = useCompanyWorkspaceSummary(ctx, { enabled: canViewTeam });

  if (!canViewTeam) return null;

  if (isLoading || !data) {
    return (
      <section className="mb-6 sm:mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
          Company overview
        </h2>
        <RosterSkeleton />
      </section>
    );
  }

  const roster = data.members?.roster ?? [];

  return (
    <section className="mb-6 sm:mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
          Company overview
        </h2>
        <Link
          to={createPageUrl("TeamMembers")}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Manage team <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CompanyStat
          to={createPageUrl("TeamMembers")}
          title="Team Members"
          value={data.members?.count ?? 0}
          icon={Users}
        />
        <CompanyStat
          to={`${createPageUrl("Documents")}?type=leave_request&status=pending`}
          title={canApprove ? "Leave to Approve" : "Pending Leave"}
          value={data.pendingLeave ?? 0}
          icon={ClipboardList}
        />
        <CompanyStat title="Company Payslips" value={data.payslips ?? 0} icon={Receipt} />
        <CompanyStat
          to={createPageUrl("Documents")}
          title="Company Documents"
          value={data.documents ?? 0}
          icon={FileText}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border/70 px-4 py-3">
          <p className="text-sm font-medium text-foreground">All team members</p>
          <p className="text-xs text-muted-foreground">Everyone linked to your company.</p>
        </div>
        {roster.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No team members yet. Invite people from Team Members.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((m) => (
                  <tr key={m.user_id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2 text-foreground">{m.full_name || m.label}</td>
                    <td className="px-4 py-2 text-muted-foreground">{m.email || "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="capitalize">
                        {m.role_label || m.company_role}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
