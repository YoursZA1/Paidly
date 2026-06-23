import { Navigate } from "react-router-dom";
import useCompanyContext from "@/hooks/useCompanyContext";
import { createPageUrl } from "@/utils";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";

/**
 * Blocks invited company members from solo-business routes (invoices, clients, etc.).
 * Org owners and users without a resolved company keep full access (backward compatible).
 */
export default function RequireBusinessOwner({ children, redirectTo }) {
  const { loading, showBusinessDashboard } = useCompanyContext();

  if (loading) return <AuthBootstrapShell />;

  if (!showBusinessDashboard) {
    return (
      <Navigate
        to={redirectTo || createPageUrl("employee-dashboard")}
        replace
      />
    );
  }

  return children;
}
