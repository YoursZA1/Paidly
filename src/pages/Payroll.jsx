import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Wallet, Plus, Users, ArrowRight } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "@/components/CurrencySelector";
import { useAppStore } from "@/stores/useAppStore";
import { payrollApi } from "@/services/PayrollApiService";
import { useToast } from "@/components/ui/use-toast";
import FeatureGate from "@/components/subscription/FeatureGate";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_LABEL = {
  draft: "Draft",
  processing: "Processing",
  calculated: "Calculated",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  paid: "Paid",
  cancelled: "Cancelled",
};

function statusClass(status) {
  if (status === "paid") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/20";
  if (status === "approved") return "bg-primary/15 text-primary border-primary/20";
  if (status === "cancelled") return "bg-muted text-muted-foreground";
  if (status === "awaiting_approval") return "bg-amber-500/15 text-amber-800 border-amber-500/20";
  return "bg-secondary text-secondary-foreground";
}

export default function PayrollPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userPlan = profile?.subscription_plan || profile?.plan || "starter";
  const currency = useAppStore((s) => s.userProfile)?.currency || "ZAR";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await payrollApi.overview());
    } catch (err) {
      toast({ title: "Could not load payroll", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createThisMonth = async () => {
    setCreating(true);
    try {
      const run = await payrollApi.createRun({});
      toast({ title: "Pay run created", description: run.period_label });
      navigate(createPageUrl(`PayRun?id=${run.id}`));
    } catch (err) {
      toast({ title: "Could not create pay run", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const run = data?.current_run;
  const money = (n) => formatCurrency(Number(n || 0), currency);

  return (
    <FeatureGate feature="payroll" userPlan={userPlan}>
      <PageTemplate>
        <PageTemplate.Header>
          <PageHeader
            title="Payroll"
            description="Run payroll, review calculations, and issue payslips."
            icon={<Wallet className="h-4 w-4" />}
            onRefresh={load}
            isRefreshing={loading}
          >
            <Button asChild variant="outline" className="rounded-xl h-9">
              <Link to={createPageUrl("Payslips")}>Payslip documents</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl h-9">
              <Link to={createPageUrl("Leave")}>Leave</Link>
            </Button>
            <Button
              className="rounded-xl h-9 bg-primary text-primary-foreground"
              onClick={createThisMonth}
              disabled={creating}
            >
              <Plus className="h-4 w-4 mr-1" />
              {creating ? "Creating…" : "Create pay run"}
            </Button>
          </PageHeader>
        </PageTemplate.Header>
        <PageTemplate.Body>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
            <SummaryCard label="Employees" value={data?.employees ?? "—"} icon={Users} />
            <SummaryCard label="Gross payroll" value={money(data?.gross_payroll)} />
            <SummaryCard label="Deductions" value={money(data?.total_deductions)} />
            <SummaryCard label="Net payroll" value={money(data?.total_net)} />
            <SummaryCard label="Pending payroll" value={data?.pending_payroll ?? "—"} />
            <SummaryCard label="Completed payroll" value={data?.completed_payroll ?? "—"} />
          </div>

          <Card className="rounded-xl mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Current pay run</CardTitle>
            </CardHeader>
            <CardContent>
              {run ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold">{run.period_label}</p>
                    <p className="text-sm text-muted-foreground">
                      {run.employee_count} employees · {money(run.net_total)} net
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusClass(run.status)}>
                      {STATUS_LABEL[run.status] || run.status}
                    </Badge>
                    <Button asChild className="rounded-xl h-9 bg-primary text-primary-foreground">
                      <Link to={createPageUrl(`PayRun?id=${run.id}`)}>
                        Open <ArrowRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No pay run for {data?.current_period?.label || "this month"} yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Recent pay runs</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Period</th>
                    <th className="px-4 py-2 font-medium">Employees</th>
                    <th className="px-4 py-2 font-medium">Gross</th>
                    <th className="px-4 py-2 font-medium">Deductions</th>
                    <th className="px-4 py-2 font-medium">Net</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.runs || []).map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/70 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(createPageUrl(`PayRun?id=${row.id}`))}
                    >
                      <td className="px-4 py-2.5 font-medium">{row.period_label}</td>
                      <td className="px-4 py-2.5">{row.employee_count}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(row.gross_total)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(row.deductions_total)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(row.net_total)}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={statusClass(row.status)}>
                          {STATUS_LABEL[row.status] || row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!data?.runs?.length && !loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No pay runs yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </PageTemplate.Body>
      </PageTemplate>
    </FeatureGate>
  );
}

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
        </div>
        <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
