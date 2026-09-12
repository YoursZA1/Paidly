import { Navigate, useLocation, useParams } from "react-router-dom";
import useCompanyContext from "@/hooks/useCompanyContext";
import { createPageUrl } from "@/utils";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";
import { parseUuid } from "@shared/ids/uuid.js";
import { canViewEmployeeProfile, hasCompanyPermission, PERMISSIONS } from "@/lib/companyPermissions";

/**
 * Route guard for company-scoped pages (permission-based, not role string checks).
 *
 * @param {{ permission: string, children: React.ReactNode, redirectTo?: string }} props
 */
export default function RequireCompanyPermission({ permission, children, redirectTo }) {
  const { loading, hasPermission, ctx } = useCompanyContext();

  if (loading) return <AuthBootstrapShell />;

  if (!ctx?.companyId) {
    if (redirectTo) return <Navigate to={redirectTo} replace />;
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Access restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Company membership is required to view this page.
          </p>
        </div>
      </div>
    );
  }

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

/**
 * `/employees/:id` is VIEW_OWN_PROFILE plus a membership-scope check.
 * Self may open their own profile; team access requires VIEW_TEAM_MEMBERS.
 */
export function RequireEmployeeProfileAccess({ children }) {
  const { id } = useParams();
  const location = useLocation();
  const { loading, ctx } = useCompanyContext();
  const target = parseUuid(id) || parseUuid(new URLSearchParams(location.search).get("id"));

  if (loading) return <AuthBootstrapShell />;

  if (!ctx?.companyId) {
    return <Navigate to={createPageUrl("Dashboard")} replace />;
  }

  if (!target) {
    if (!hasCompanyPermission(ctx, PERMISSIONS.VIEW_OWN_PROFILE)) {
      return <Navigate to={createPageUrl("Dashboard")} replace />;
    }
    return children;
  }

  if (!canViewEmployeeProfile(ctx, target)) {
    return <Navigate to={createPageUrl("Dashboard")} replace />;
  }

  return children;
}
