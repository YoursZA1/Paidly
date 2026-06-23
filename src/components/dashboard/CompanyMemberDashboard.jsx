import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import RoleBasedDashboardPanel from "@/components/dashboard/RoleBasedDashboardPanel";
import MyWorkspaceSummary from "@/components/dashboard/MyWorkspaceSummary";
import CompanyOverviewPanel from "@/components/dashboard/CompanyOverviewPanel";
import useCompanyContext from "@/hooks/useCompanyContext";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Unified company-member dashboard — employees and invited managers/admins see only
 * tools permitted for their role within their linked company (org).
 */
export default function CompanyMemberDashboard() {
  const { companyRoleLabel } = useCompanyContext();
  const { profile } = useUserProfileQuery();
  const { authUser } = useAuth();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const user = profile ?? authUser;
  const displayName = user?.full_name || user?.company_name || "there";
  const companyName =
    profile?.company_name || profile?.business?.company_name || profile?.business?.name || null;

  return (
    <div className="min-h-full w-full min-w-0 mobile-page">
      <div className="responsive-page-shell w-full min-w-0 py-2 sm:py-6 md:py-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="mb-4 sm:mb-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs sm:text-[11px] font-semibold tracking-[0.1em] text-muted-foreground/70 uppercase mb-0.5 sm:mb-1 hidden sm:block">
                {greeting}
              </p>
              <h1 className="text-base sm:text-2xl md:text-[28px] font-bold text-foreground mb-0.5 sm:mb-1 font-display leading-tight">
                {displayName}
              </h1>
              <p className="finbank-body text-xs sm:text-sm text-muted-foreground">
                {companyName
                  ? `${companyName} — your dashboard shows only what your role can access.`
                  : "Your dashboard shows only what your role can access within your company."}
              </p>
            </div>
            <Badge variant="outline" className="gap-1 capitalize shrink-0">
              <Shield className="h-3 w-3" aria-hidden />
              {companyRoleLabel}
            </Badge>
          </div>
        </motion.div>

        {/* Self data — every member sees only their own records. */}
        <MyWorkspaceSummary />

        {/* Company data — managers/admins only (gated on VIEW_TEAM_MEMBERS inside the panel). */}
        <CompanyOverviewPanel />

        {/* Quick actions — permission-filtered links. */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
            Quick actions
          </h2>
          <RoleBasedDashboardPanel />
        </section>
      </div>
    </div>
  );
}
