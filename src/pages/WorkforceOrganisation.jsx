import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Network } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";
import { workforceApi, employeeProfilePath } from "@/services/WorkforceApiService";
import { useToast } from "@/components/ui/use-toast";

function OrgNode({ node, depth = 0 }) {
  const inactive = !node.active;
  return (
    <li className={depth === 0 ? "" : "mt-3 border-l border-border pl-4"}>
      <div className={`rounded-xl border border-border bg-card px-3 py-2 ${inactive ? "opacity-60" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={employeeProfilePath(node.id)} className="text-sm font-medium text-foreground hover:underline">
            {node.full_name}
          </Link>
          {node.employee_number ? (
            <span className="text-xs text-muted-foreground">{node.employee_number}</span>
          ) : null}
          {inactive ? <Badge variant="secondary">Inactive</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[node.job_title, node.department].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
      {node.children?.length ? (
        <ul className="mt-2 space-y-0">
          {node.children.map((child) => (
            <OrgNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function WorkforceOrganisation() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workforceApi
      .organogram()
      .then(setData)
      .catch((err) =>
        toast({
          variant: "destructive",
          title: "Could not load organisation",
          description: err.message,
        })
      )
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Organisation"
          description="Reporting lines from existing manager and department assignments — not a separate hierarchy database."
          icon={<Network className="h-4 w-4" />}
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <WorkforceSubnav />
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="People" value={data?.stats?.total ?? 0} />
              <Stat label="Active" value={data?.stats?.active ?? 0} />
              <Stat label="With manager" value={data?.stats?.with_manager ?? 0} />
              <Stat label="Top-level" value={data?.stats?.roots ?? 0} />
            </div>

            <Card className="rounded-xl">
              <CardContent className="p-4 sm:p-6">
                <h2 className="text-sm font-semibold text-foreground">Reporting structure</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Business owner / managers appear at the top when they have no manager assigned. Reports nest under their manager.
                </p>
                {(data?.roots || []).length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No active reporting lines yet. Assign managers on employee profiles.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-4">
                    {(data.roots || []).map((node) => (
                      <OrgNode key={node.id} node={node} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {(data?.unassigned || []).length ? (
              <Card className="rounded-xl">
                <CardContent className="p-4 sm:p-6">
                  <h2 className="text-sm font-semibold text-foreground">Inactive / unlinked</h2>
                  <ul className="mt-3 space-y-2">
                    {data.unassigned.map((node) => (
                      <OrgNode key={node.id} node={node} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </PageTemplate.Body>
    </PageTemplate>
  );
}

function Stat({ label, value }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
