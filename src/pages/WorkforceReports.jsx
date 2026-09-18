import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart2, Download } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { workforceApi } from "@/services/WorkforceApiService";
import { payrollApi } from "@/services/PayrollApiService";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { formatCurrency } from "@/components/CurrencySelector";
import { useAppStore } from "@/stores/useAppStore";

const REPORT_TABS = [
  { id: "uif", label: "UIF Report" },
  { id: "paye", label: "PAYE Report" },
  { id: "summary", label: "Payroll Summary" },
  { id: "net_pay", label: "Net Pay Register" },
];

function money(value, currency) {
  return formatCurrency(Number(value || 0), currency);
}

function downloadCsv(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WorkforceReports() {
  const { toast } = useToast();
  const { hasPermission } = useCompanyContext();
  const currency = useAppStore((s) => s.userProfile)?.currency || "ZAR";
  const canManagePayroll = Boolean(hasPermission?.(PERMISSIONS.MANAGE_PAYROLL));

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportTab, setReportTab] = useState("net_pay");
  const [periods, setPeriods] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [reportPayload, setReportPayload] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

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

  const loadReport = useCallback(async () => {
    if (!canManagePayroll) return;
    setReportLoading(true);
    try {
      const data = await payrollApi.reports({
        type: reportTab,
        pay_run_id: selectedRunId || undefined,
      });
      setReportPayload(data);
      if (!selectedRunId && data?.periods?.length) {
        setPeriods(data.periods);
        setSelectedRunId(data.periods[0].id);
      } else if (data?.periods?.length) {
        setPeriods(data.periods);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not load payroll report",
        description: err.message,
      });
    } finally {
      setReportLoading(false);
    }
  }, [canManagePayroll, reportTab, selectedRunId, toast]);

  useEffect(() => {
    if (!canManagePayroll) return;
    loadReport();
  }, [canManagePayroll, loadReport]);

  const periodLabel = reportPayload?.period?.label || "Selected period";

  const exportCsv = () => {
    const report = reportPayload?.report;
    if (!report) return;
    const stamp = String(periodLabel).replace(/[^\w\-]+/g, "_");
    if (report.type === "uif") {
      downloadCsv(
        `uif-report-${stamp}.csv`,
        ["Employee", "Employee number", "Employee UIF", "Employer UIF", "Total"],
        [
          ...(report.rows || []).map((r) => [
            r.employee_name,
            r.employee_number,
            r.employee_contribution,
            r.employer_contribution,
            r.total,
          ]),
          ["TOTAL", "", report.totals?.employee_contribution, report.totals?.employer_contribution, report.totals?.total],
        ]
      );
      return;
    }
    if (report.type === "paye") {
      downloadCsv(
        `paye-report-${stamp}.csv`,
        ["Employee", "Employee number", "PAYE deducted"],
        [
          ...(report.rows || []).map((r) => [r.employee_name, r.employee_number, r.paye_deducted]),
          ["TOTAL", "", report.totals?.paye_deducted],
        ]
      );
      return;
    }
    if (report.type === "net_pay") {
      downloadCsv(
        `net-pay-register-${stamp}.csv`,
        ["Employee", "Employee number", "Net pay"],
        [
          ...(report.rows || []).map((r) => [r.employee_name, r.employee_number, r.net_pay]),
          ["TOTAL", "", report.totals?.net_pay],
        ]
      );
      return;
    }
    if (report.type === "summary") {
      downloadCsv(
        `payroll-summary-${stamp}.csv`,
        ["Metric", "Amount"],
        [
          ["Gross payroll", report.gross_payroll],
          ["Deductions", report.deductions],
          ["PAYE", report.paye],
          ["UIF (employee)", report.uif_employee],
          ["UIF (employer)", report.uif_employer],
          ["Other deductions", report.other_deductions],
          ["Total employer cost", report.total_employer_cost],
          ["Net payroll", report.net_payroll],
        ]
      );
    }
  };

  const reportBody = useMemo(() => {
    const report = reportPayload?.report;
    if (!report) return null;

    if (report.type === "summary") {
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label="Gross payroll" value={money(report.gross_payroll, currency)} />
          <Kpi label="Deductions" value={money(report.deductions, currency)} />
          <Kpi label="PAYE" value={money(report.paye, currency)} />
          <Kpi label="UIF (employee)" value={money(report.uif_employee, currency)} />
          <Kpi label="UIF (employer)" value={money(report.uif_employer, currency)} />
          <Kpi label="Other deductions" value={money(report.other_deductions, currency)} />
          <Kpi label="Total employer cost" value={money(report.total_employer_cost, currency)} />
          <Kpi label="Net payroll" value={money(report.net_payroll, currency)} />
          <Kpi label="Employees" value={report.employee_count ?? 0} />
        </div>
      );
    }

    if (report.type === "net_pay") {
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Bank salary payment should equal this total for the period.
          </p>
          <ReportTable
            headers={["Employee", "Net pay"]}
            rows={(report.rows || []).map((r) => [r.employee_name, money(r.net_pay, currency)])}
            footer={["TOTAL", money(report.totals?.net_pay, currency)]}
          />
        </div>
      );
    }

    if (report.type === "uif") {
      return (
        <ReportTable
          headers={["Employee", "Employee UIF", "Employer UIF", "Total"]}
          rows={(report.rows || []).map((r) => [
            r.employee_name,
            money(r.employee_contribution, currency),
            money(r.employer_contribution, currency),
            money(r.total, currency),
          ])}
          footer={[
            "TOTAL",
            money(report.totals?.employee_contribution, currency),
            money(report.totals?.employer_contribution, currency),
            money(report.totals?.total, currency),
          ]}
        />
      );
    }

    if (report.type === "paye") {
      return (
        <ReportTable
          headers={["Employee", "PAYE deducted"]}
          rows={(report.rows || []).map((r) => [r.employee_name, money(r.paye_deducted, currency)])}
          footer={["TOTAL", money(report.totals?.paye_deducted, currency)]}
        />
      );
    }

    return null;
  }, [reportPayload, currency]);

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Workforce reports"
          description="Headcount activity plus historical payroll compliance from finalized pay runs."
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
            <Kpi label="Needs attention" value={summary?.workforce?.needs_attention ?? 0} />
            <Kpi label="Incomplete payroll" value={summary?.workforce?.incomplete_payroll ?? 0} />
            <Kpi label="Pending leave" value={summary?.leave?.pending ?? 0} />
            <Kpi label="On leave today" value={summary?.leave?.on_leave_today ?? 0} />
            <Kpi label="Upcoming leave" value={summary?.leave?.upcoming ?? 0} />
            <Kpi label="Payslips issued" value={summary?.payroll?.payslips_generated ?? 0} />
            <Kpi label="Pay runs awaiting review" value={summary?.payroll?.awaiting_review ?? 0} />
          </div>
        )}

        {canManagePayroll ? (
          <Card className="mt-6 rounded-xl">
            <CardHeader className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Payroll reports</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Historical UIF, PAYE, summary, and net pay from finalized pay runs — not recalculated live.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!reportPayload?.report}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-1.5 sm:min-w-[240px]">
                  <Label htmlFor="payroll-period">Pay period</Label>
                  <select
                    id="payroll-period"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedRunId}
                    onChange={(e) => setSelectedRunId(e.target.value)}
                  >
                    {!periods.length ? <option value="">No finalized pay runs yet</option> : null}
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.period_label || `${p.period_start} – ${p.period_end}`}
                        {p.run_type === "adjustment" ? " (adjustment)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {REPORT_TABS.map((tab) => (
                    <Button
                      key={tab.id}
                      type="button"
                      size="sm"
                      variant={reportTab === tab.id ? "default" : "outline"}
                      onClick={() => setReportTab(tab.id)}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="mb-4 text-sm font-semibold text-foreground">
                {REPORT_TABS.find((t) => t.id === reportTab)?.label} — {periodLabel}
              </h3>
              {reportLoading ? (
                <p className="text-sm text-muted-foreground">Loading report…</p>
              ) : (
                reportBody || <p className="text-sm text-muted-foreground">No payroll data for this period.</p>
              )}
            </CardContent>
          </Card>
        ) : null}
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

function ReportTable({ headers, rows, footer }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((row, idx) => (
            <tr key={idx} className="border-b border-border/70">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className={`px-3 py-2 ${cIdx > 0 ? "tabular-nums text-right" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? (
          <tfoot>
            <tr className="bg-muted/30 font-semibold">
              {footer.map((cell, cIdx) => (
                <td key={cIdx} className={`px-3 py-2 ${cIdx > 0 ? "tabular-nums text-right" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
