import { Link, useLocation } from "react-router-dom";
import useCompanyContext from "@/hooks/useCompanyContext";
import { getWorkforceNavChildren } from "@/lib/workforceNav.js";

/**
 * Compact Workforce links for small screens when the nested sidebar is collapsed.
 */
export default function WorkforceSubnav() {
  const location = useLocation();
  const { hasPermission } = useCompanyContext();
  const children = getWorkforceNavChildren(hasPermission);

  if (!children.length) return null;

  return (
    <nav
      className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
      aria-label="Workforce sections"
    >
      {children.map((child) => {
        const path = String(child.url || "").split("?")[0];
        const active =
          location.pathname === path ||
          (path !== "/" && location.pathname.startsWith(`${path}/`));
        return (
          <Link
            key={child.id}
            to={child.url}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {child.title}
          </Link>
        );
      })}
    </nav>
  );
}
