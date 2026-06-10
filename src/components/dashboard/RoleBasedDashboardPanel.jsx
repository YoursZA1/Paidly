import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import useCompanyContext from "@/hooks/useCompanyContext";
import { getCompanyWorkspaceSections } from "@/lib/companyDashboardNav";

function QuickLink({ to, title, description, icon: Icon }) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-lg border border-border/60 bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted/40"
    >
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-none">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1].map((section) => (
        <div key={section} className="space-y-3">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <div key={card} className="h-24 animate-pulse rounded-lg border border-border/60 bg-muted/30" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Role-aware company workspace — sections and quick links from permission catalog.
 */
export default function RoleBasedDashboardPanel() {
  const { loading, hasPermission } = useCompanyContext();

  if (loading) return <WorkspaceSkeleton />;

  const sections = getCompanyWorkspaceSections(hasPermission);

  if (!sections.length) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-6 py-10 text-center">
        <p className="font-medium text-foreground">No workspace tools available</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your company role does not include any workspace actions yet. Contact your company admin if you need access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sections.map(({ section, items }) => (
        <section key={section}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
            {section}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <QuickLink
                key={item.id}
                to={item.url}
                title={item.title}
                description={item.description}
                icon={item.icon}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
