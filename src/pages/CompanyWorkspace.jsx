import { Navigate } from "react-router-dom";
import { Shield } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import RoleBasedDashboardPanel from "@/components/dashboard/RoleBasedDashboardPanel";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import useCompanyContext from "@/hooks/useCompanyContext";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { createPageUrl } from "@/utils";

export default function CompanyWorkspacePage() {
  const { loading, error, ctx, companyRoleLabel, refresh } = useCompanyContext();
  const { profile } = useUserProfileQuery();

  if (loading) return <AuthBootstrapShell />;

  if (error) {
    return (
      <PageTemplate>
        <PageTemplate.Body>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
            <p className="font-medium text-foreground">Could not load company workspace</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" className="mt-4" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        </PageTemplate.Body>
      </PageTemplate>
    );
  }

  if (!ctx?.companyId) {
    return <Navigate to={createPageUrl("Dashboard")} replace />;
  }

  const companyName =
    profile?.company_name ||
    profile?.business?.company_name ||
    profile?.business?.name ||
    null;

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Company workspace"
          description={
            companyName
              ? `${companyName} — your view adapts to your role and company permissions.`
              : "One dashboard — your view adapts to your role and company permissions."
          }
        >
          <Badge variant="outline" className="gap-1 capitalize">
            <Shield className="h-3 w-3" />
            {companyRoleLabel}
          </Badge>
        </PageHeader>
      </PageTemplate.Header>
      <PageTemplate.Body>
        <RoleBasedDashboardPanel />
      </PageTemplate.Body>
    </PageTemplate>
  );
}
