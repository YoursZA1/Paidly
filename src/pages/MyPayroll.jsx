import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CalendarOff, Download, Eye, Plus, Wallet } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "@/components/CurrencySelector";
import { useAppStore } from "@/stores/useAppStore";
import { leaveApi, payrollApi } from "@/services/PayrollApiService";
import { useToast } from "@/components/ui/use-toast";
import FeatureGate from "@/components/subscription/FeatureGate";
import { useAuth } from "@/contexts/AuthContext";

export default function MyPayrollPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userPlan = profile?.subscription_plan || profile?.plan || "starter";
  const tabParam = new URLSearchParams(useLocation().search).get("tab") || "overview";
  const currency = useAppStore((s) => s.userProfile)?.currency || "ZAR";
  const [payroll, setPayroll] = useState(null);
  const [leave, setLeave] = useState(null);
  const [tab, setTab] = useState(tabParam);

  const load = async () => {
    try {
      const [p, l] = await Promise.allSettled([payrollApi.me(), leaveApi.me()]);
      if (p.status === "fulfilled") setPayroll(p.value);
      else toast({ title: "Could not load payslips", description: p.reason?.message, variant: "destructive" });
      if (l.status === "fulfilled") setLeave(l.value);
    } catch (err) {
      toast({ title: "Could not load payroll", description: err.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const latest = payroll?.payslips?.[0];
  const money = (n) => formatCurrency(Number(n || 0), currency);

  return (
    <FeatureGate feature="payroll" userPlan={userPlan}>
      <PageTemplate>
        <PageTemplate.Header>
          <PageHeader
            title="My Payroll"
            description="Your salary summary, payslips, and leave."
            icon={<Wallet className="h-4 w-4" />}
            onRefresh={load}
          >
            <Button asChild className="rounded-xl h-9 bg-primary text-primary-foreground">
              <Link to={createPageUrl("CreateLeaveRequest")}>
                <Plus className="h-4 w-4 mr-1" /> Apply for leave
              </Link>
            </Button>
          </PageHeader>
        </PageTemplate.Header>
        <PageTemplate.Body>
          <Tabs value={tab} onValueChange={(v) => { setTab(v); navigate(createPageUrl(`MyPayroll?tab=${v}`), { replace: true }); }}>
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="payslips">Payslips</TabsTrigger>
              <TabsTrigger value="leave">Leave</TabsTrigger>
              <TabsTrigger value="requests">Leave requests</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <div className="grid gap-3 sm:grid-cols-2 mb-6">
                <Card className="rounded-xl">
                  <CardHeader><CardTitle className="text-base">Latest payslip</CardTitle></CardHeader>
                  <CardContent>
                    {latest ? (
                      <>
                        <p className="text-2xl font-semibold tabular-nums">{money(latest.net_pay)}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {latest.pay_period_start} → {latest.pay_period_end} · {latest.status}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No payslips yet.</p>
                    )}
                  </CardContent>
                </Card>
                <Card className="rounded-xl">
                  <CardHeader><CardTitle className="text-base">Leave available</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(leave?.balances || []).slice(0, 4).map((b) => (
                      <div key={b.leave_type.id} className="flex justify-between text-sm">
                        <span>{b.leave_type.name}</span>
                        <span className="tabular-nums font-medium">{b.available} days</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="payslips">
              <Card className="rounded-xl overflow-hidden">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Period</th>
                        <th className="px-4 py-2 font-medium">Net</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {(payroll?.payslips || []).map((slip) => (
                        <tr key={slip.id} className="border-b border-border/70">
                          <td className="px-4 py-2.5">{slip.pay_period_start} → {slip.pay_period_end}</td>
                          <td className="px-4 py-2.5 tabular-nums">{money(slip.net_pay)}</td>
                          <td className="px-4 py-2.5"><Badge variant="outline">{slip.status}</Badge></td>
                          <td className="px-4 py-2.5 text-right space-x-1">
                            <Button size="sm" variant="ghost" className="rounded-xl" asChild>
                              <Link to={createPageUrl(`ViewPayslip?id=${slip.id}`)}><Eye className="h-4 w-4" /></Link>
                            </Button>
                            <Button size="sm" variant="ghost" className="rounded-xl" asChild>
                              <Link to={createPageUrl(`PayslipPDF?id=${slip.id}&download=true`)}><Download className="h-4 w-4" /></Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="leave">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(leave?.balances || []).map((b) => (
                  <Card key={b.leave_type.id} className="rounded-xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <CalendarOff className="h-4 w-4" /> {b.leave_type.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      <Row label="Entitled" value={b.entitled} />
                      <Row label="Accrued" value={b.accrued} />
                      <Row label="Used" value={b.used} />
                      <Row label="Pending" value={b.pending} />
                      <Row label="Available" value={b.available} strong />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="requests">
              <Card className="rounded-xl overflow-hidden">
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 font-medium">Dates</th>
                        <th className="px-4 py-2 font-medium">Days</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(leave?.requests || []).map((r) => (
                        <tr key={r.id} className="border-b border-border/70">
                          <td className="px-4 py-2.5">{r.leave_types?.name}</td>
                          <td className="px-4 py-2.5">{r.start_date} → {r.end_date}</td>
                          <td className="px-4 py-2.5 tabular-nums">{r.working_days}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline">{r.status}</Badge>
                            {r.status === "rejected" && r.rejection_reason ? (
                              <p className="text-xs text-muted-foreground mt-1">{r.rejection_reason}</p>
                            ) : null}
                            {r.status === "pending" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-xl mt-1"
                                onClick={async () => {
                                  try {
                                    await leaveApi.cancel(r.id);
                                    toast({ title: "Request cancelled" });
                                    load();
                                  } catch (err) {
                                    toast({ title: "Could not cancel", description: err.message, variant: "destructive" });
                                  }
                                }}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </PageTemplate.Body>
      </PageTemplate>
    </FeatureGate>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold pt-1 border-t border-border" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
