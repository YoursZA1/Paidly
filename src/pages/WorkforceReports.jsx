import { useEffect, useState } from "react";
import { BarChart2 } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { workforceApi } from "@/services/WorkforceApiService";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";

export default function WorkforceReports() {
  const { toast } = useToast();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workforceApi
      .summary()
      .then(setSummary)
      .catch((err) =>
        toast({
          variant: "destructive",
          title: "Could not load workforce reports",
          description: err.message,
        })
      )
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Workforce reports"
          description="Headcount and leave activity for your scope. Invoice and cash-flow reports stay under Finance."
          icon={<BarChart2 className="h-4 w-4" />}
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <WorkforceSubnav />
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Active workforce" value={summary?.workforce?.active ?? summary?.workforce?.total ?? 0} />
            <Kpi label="Pending leave" value={summary?.leave?.pending ?? 0} />
            <Kpi label="Upcoming leave" value={summary?.leave?.upcoming ?? 0} />
            <Kpi label="Payslips issued" value={summary?.payroll?.payslips_generated ?? 0} />
          </div>
        )}
      </PageTemplate.Body>
    </PageTemplate>
  );
}

function Kpi({ label, value }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
