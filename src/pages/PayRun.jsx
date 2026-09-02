import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Calculator, Check, Lock, Mail, Wallet } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export default function PayRunPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userPlan = profile?.subscription_plan || profile?.plan || "starter";
  const id = new URLSearchParams(useLocation().search).get("id");
  const currency = useAppStore((s) => s.userProfile)?.currency || "ZAR";
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [breakdown, setBreakdown] = useState(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setRun(await payrollApi.getRun(id));
    } catch (err) {
      toast({ title: "Could not load pay run", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const money = (n) => formatCurrency(Number(n || 0), currency);

  const act = async (key, fn) => {
    setBusy(key);
    try {
      const next = await fn();
      setRun(next);
      toast({ title: "Updated", description: STATUS_LABEL[next.status] || "Pay run saved" });
    } catch (err) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const items = run?.items || [];
  const canCalculate = run && ["draft", "processing", "calculated"].includes(run.status) && !run.finalized_at;
  const canApprove = run && ["calculated", "awaiting_approval"].includes(run.status);
  const canFinalize = run && run.status === "approved" && !run.finalized_at;
  const canPay = run && run.finalized_at && run.status !== "paid";
  const canSend = run && run.finalized_at;

  const totals = useMemo(
    () => ({
      gross: money(run?.gross_total),
      deductions: money(run?.deductions_total),
      net: money(run?.net_total),
    }),
    [run, currency]
  );

  return (
    <FeatureGate feature="payroll" userPlan={userPlan}>
      <PageTemplate>
        <PageTemplate.Header>
          <PageHeader
            title={run?.period_label || "Pay run"}
            description={run ? `${run.employee_count} employees · ${STATUS_LABEL[run.status] || run.status}` : "Loading…"}
            icon={<Wallet className="h-4 w-4" />}
            onRefresh={load}
            isRefreshing={loading}
          >
            <Button asChild variant="outline" className="rounded-xl h-9">
              <Link to={createPageUrl("Payroll")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Payroll
              </Link>
            </Button>
            {canCalculate ? (
              <Button
                className="rounded-xl h-9 bg-primary text-primary-foreground"
                disabled={Boolean(busy)}
                onClick={() => act("calc", () => payrollApi.calculateRun(id))}
              >
                <Calculator className="h-4 w-4 mr-1" />
                {busy === "calc" ? "Calculating…" : "Calculate"}
              </Button>
            ) : null}
            {run?.status === "calculated" ? (
              <Button variant="outline" className="rounded-xl h-9" disabled={Boolean(busy)} onClick={() => act("submit", () => payrollApi.submitRun(id))}>
                Send for approval
              </Button>
            ) : null}
            {canApprove ? (
              <Button className="rounded-xl h-9 bg-primary text-primary-foreground" disabled={Boolean(busy)} onClick={() => act("approve", () => payrollApi.approveRun(id))}>
                <Check className="h-4 w-4 mr-1" /> Approve
              </Button>
            ) : null}
            {canFinalize ? (
              <Button className="rounded-xl h-9 bg-primary text-primary-foreground" disabled={Boolean(busy)} onClick={() => act("final", () => payrollApi.finalizeRun(id))}>
                <Lock className="h-4 w-4 mr-1" /> Finalize payslips
              </Button>
            ) : null}
            {canSend ? (
              <Button variant="outline" className="rounded-xl h-9" disabled={Boolean(busy)} onClick={() => act("send", () => payrollApi.sendPayslips(id).then(() => payrollApi.getRun(id)))}>
                <Mail className="h-4 w-4 mr-1" /> Send payslips
              </Button>
            ) : null}
            {canPay ? (
              <Button className="rounded-xl h-9" disabled={Boolean(busy)} onClick={() => act("paid", () => payrollApi.markPaid(id))}>
                Mark paid
              </Button>
            ) : null}
          </PageHeader>
        </PageTemplate.Header>
        <PageTemplate.Body>
          <div className="grid gap-3 sm:grid-cols-3 mb-6">
            <Card className="rounded-xl"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Gross</p><p className="text-xl font-semibold tabular-nums">{totals.gross}</p></CardContent></Card>
            <Card className="rounded-xl"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Deductions</p><p className="text-xl font-semibold tabular-nums">{totals.deductions}</p></CardContent></Card>
            <Card className="rounded-xl"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Net</p><p className="text-xl font-semibold tabular-nums">{totals.net}</p></CardContent></Card>
          </div>
          <Card className="rounded-xl overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Employees</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">No.</th>
                    <th className="px-4 py-2 font-medium">Base</th>
                    <th className="px-4 py-2 font-medium">Allowances</th>
                    <th className="px-4 py-2 font-medium">Overtime</th>
                    <th className="px-4 py-2 font-medium">Bonus</th>
                    <th className="px-4 py-2 font-medium">Gross</th>
                    <th className="px-4 py-2 font-medium">Deductions</th>
                    <th className="px-4 py-2 font-medium">Net</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border/70">
                      <td className="px-4 py-2.5 font-medium">{item.employee_name}</td>
                      <td className="px-4 py-2.5">{item.employee_number}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(item.base_pay)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(sumEarnings(item, ["allowance", "travel", "housing", "other"]))}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(item.overtime_amount)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(sumEarnings(item, ["bonus", "commission"]))}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(item.gross_pay)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(item.total_deductions)}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold">{money(item.net_pay)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setBreakdown(item)}>
                          View calculation
                        </Button>
                        {item.payslip_id ? (
                          <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => navigate(createPageUrl(`ViewPayslip?id=${item.payslip_id}`))}>
                            Payslip
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {!items.length && !loading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                        No eligible employees. Add payroll profiles from team members.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </PageTemplate.Body>
      </PageTemplate>

      <Dialog open={Boolean(breakdown)} onOpenChange={() => setBreakdown(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{breakdown?.employee_name}</DialogTitle>
          </DialogHeader>
          {breakdown ? (
            <div className="space-y-2 text-sm">
              {(breakdown.earnings || []).map((line) => (
                <Row key={line.code} label={`+ ${line.name}`} value={money(line.amount)} />
              ))}
              <Row label="Gross pay" value={money(breakdown.gross_pay)} strong />
              {(breakdown.statutory_deductions || []).filter((l) => l.amount > 0).map((line) => (
                <Row key={line.code} label={`− ${line.name}`} value={money(line.amount)} />
              ))}
              {(breakdown.other_deductions || []).map((line) => (
                <Row key={line.code} label={`− ${line.name}`} value={money(line.amount)} />
              ))}
              <Row label="Total deductions" value={money(breakdown.total_deductions)} />
              <Row label="Net pay" value={money(breakdown.net_pay)} strong />
              {(breakdown.warnings || []).map((w) => (
                <p key={w} className="text-xs text-amber-700">{w}</p>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </FeatureGate>
  );
}

function sumEarnings(item, types) {
  const set = new Set(types);
  return (item.earnings || []).reduce((sum, line) => {
    const type = String(line.type || "").toLowerCase();
    if (set.has(type)) return sum + Number(line.amount || 0);
    return sum;
  }, 0);
}

function Row({ label, value, strong }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold border-t border-border pt-2 mt-2" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
