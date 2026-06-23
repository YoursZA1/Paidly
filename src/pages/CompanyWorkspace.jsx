import { Navigate } from "react-router-dom";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";
import CompanyMemberDashboard from "@/components/dashboard/CompanyMemberDashboard";
import useCompanyContext from "@/hooks/useCompanyContext";
import { createPageUrl } from "@/utils";

/** Legacy alias — company members use the unified Dashboard; org owners redirect to Dashboard. */
export default function CompanyWorkspacePage() {
  const { loading, error, ctx, showBusinessDashboard } = useCompanyContext();

  if (loading) return <AuthBootstrapShell />;

  if (error || !ctx?.companyId) {
    return <Navigate to={createPageUrl("Dashboard")} replace />;
  }

  if (showBusinessDashboard) {
    return <Navigate to={createPageUrl("Dashboard")} replace />;
  }

  return <CompanyMemberDashboard />;
}
