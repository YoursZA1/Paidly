import { Link, useLocation } from "react-router-dom";
import useCompanyContext from "@/hooks/useCompanyContext";
import { getWorkforceNavChildren, isWorkforceChildActive } from "@/lib/workforceNav.js";
import { resolveWorkforceExperience } from "@/lib/workforceExperience.js";

/**
 * Compact Workforce links for small screens when the nested sidebar is collapsed.
 */
export default function WorkforceSubnav() {
  const location = useLocation();
  const { hasPermission, ctx, membershipId } = useCompanyContext();
  const children = getWorkforceNavChildren(hasPermission, {
    experience: resolveWorkforceExperience(ctx),
    membershipId,
  });

  if (!children.length) return null;

  return (
    <nav
      className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
      aria-label="Workforce sections"
    >
      {children.map((child) => {
        const active = isWorkforceChildActive(child.url, location.pathname, location.search);
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
