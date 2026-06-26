import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { listCompanyMembers } from "@/services/CompanyContextService";
import CompanyTeamManagePanel from "@/components/company/CompanyTeamManagePanel";
import CompanyInvitesPanel from "@/components/company/CompanyInvitesPanel";

/**
 * Company team management — invite/manage panels (admins) plus the company directory.
 * Extracted from the former TeamMembers page so it can be hosted inside Settings (?tab=team).
 */
export default function CompanyTeamMembersPanel() {
  const { ctx, hasPermission } = useCompanyContext();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const rows = await listCompanyMembers(ctx);
        if (!cancelled) setMembers(rows);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  return (
    <div className="space-y-6">
      {hasPermission(PERMISSIONS.MANAGE_EMPLOYEES) ? (
        <>
          <CompanyTeamManagePanel />
          <CompanyInvitesPanel />
        </>
      ) : null}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" />
            Company directory
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading team…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members found.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {members.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <p className="font-medium">{m.label}</p>
                    {m.email ? <p className="text-sm text-muted-foreground">{m.email}</p> : null}
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {m.role_label || m.company_role}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
