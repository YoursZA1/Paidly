import PageContainer from "@/components/admin/shell/PageContainer";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/lib/permissions";
import { ADMIN_NAV_GROUPS } from "@/lib/adminNavConfig";

export default function AdminRolesPage() {
  const roles = [ROLES.ADMIN, ROLES.MANAGEMENT, ROLES.SALES, ROLES.SUPPORT];

  return (
    <PageContainer
      title="Roles & permissions"
      description="Platform staff roles enforced by RequireAuth and /api/admin. This is the live 5-role model, not the unused 7-tier list."
    >
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Area</th>
              {roles.map((role) => (
                <th key={role} className="px-4 py-3 font-medium capitalize">{ROLE_LABELS[role]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ADMIN_NAV_GROUPS.flatMap((group) =>
              group.items.map((item) => (
                <tr key={`${group.id}-${item.path}-${item.label}`} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{group.label}</p>
                  </td>
                  {roles.map((role) => (
                    <td key={role} className="px-4 py-2.5">
                      {item.roles.includes(role) ? "Yes" : "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
        {roles.map((role) => (
          <li key={role}>
            <span className="font-medium text-foreground">{ROLE_LABELS[role]}:</span> {ROLE_DESCRIPTIONS[role]}
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
