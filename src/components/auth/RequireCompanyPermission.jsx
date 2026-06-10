import { Navigate } from "react-router-dom";
import useCompanyContext from "@/hooks/useCompanyContext";
import { createPageUrl } from "@/utils";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";

/**
 * Route guard for company-scoped pages (permission-based, not role string checks).
 *
 * @param {{ permission: string, children: React.ReactNode, redirectTo?: string }} props
 */
export default function RequireCompanyPermission({ permission, children, redirectTo }) {
  const { loading, hasPermission } = useCompanyContext();

  if (loading) return <AuthBootstrapShell />;

  if (!hasPermission(permission)) {
    if (redirectTo) return <Navigate to={redirectTo} replace />;
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Access restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You don&apos;t have permission to view this page for your company role.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

export function RequireCompanyPermissionRedirect({ permission, children }) {
  return (
    <RequireCompanyPermission permission={permission} redirectTo={createPageUrl("Dashboard")}>
      {children}
    </RequireCompanyPermission>
  );
}
