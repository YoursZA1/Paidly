import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart2, Download } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { workforceApi } from "@/services/WorkforceApiService";
import { payrollApi } from "@/services/PayrollApiService";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";
import PayrollReconciliationPanel from "@/components/payroll/PayrollReconciliationPanel.jsx";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { formatCurrency } from "@/components/CurrencySelector";
import { useAppStore } from "@/stores/useAppStore";
import { triggerDownload } from "@/utils/downloadFile";

const REPORT_TABS = [
  { id: "net_pay", label: "Net Pay Register" },
  { id: "uif", label: "UIF Report" },
  { id: "paye", label: "PAYE Report" },
  { id: "summary", label: "Payroll Summary" },
  { id: "employee_history", label: "Employee History" },
];

const SCOPES = [
  { id: "period", label: "Pay period" },
  { id: "month", label: "Month" },
  { id: "range", label: "Date range" },
];

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function statusLabel(status) {
  if (!status) return "—";
  return String(status).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function WorkforceReports() {
  const { toast } = useToast();
  const { hasPermission } = useCompanyContext();
  const currency = useAppStore((s) => s.userProfile)?.currency || "ZAR";
  const canManagePayroll = Boolean(hasPermission?.(PERMISSIONS.MANAGE_PAYROLL));
  const money = useCallback((value) => formatCurrency(Number(value || 0), currency), [currency]);

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportTab, setReportTab] = useState("net_pay");
  const [scope, setScope] = useState("period");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [month, setMonth] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [reportPayload, setReportPayload] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    workforceApi
      .summary()
      .then(setSummary)
      .catch((err) =>
        toast({ variant: "destructive", title: "Could not load workforce reports", description: err.message })
      )
      .finally(() => setLoading(false));
  }, [toast]);

  const isHistory = reportTab === "employee_history";

  const queryParams = useMemo(() => {
    const params = {
      type: reportTab,
      department: isHistory ? undefined : department || undefined,
      membership_id: employeeId || undefined,
    };
    if (isHistory) {
      if (scope === "range") {
        params.period_start = rangeFrom || undefined;
        params.period_end = rangeTo || undefined;
      }
      return params;
    }
    if (scope === "month" && month) params.month = month;
    else if (scope === "range" && (rangeFrom || rangeTo)) {
      params.period_start = rangeFrom || undefined;
      params.period_end = rangeTo || undefined;
    } else if (selectedRunId) params.pay_run_id = selectedRunId;
    return params;
  }, [reportTab, department, employeeId, isHistory, scope, month, rangeFrom, rangeTo, selectedRunId]);

  const loadReport = useCallback(async () => {
    if (!canManagePayroll) return;
    if (isHistory && !employeeId) {
      setReportPayload((prev) => (prev ? { ...prev, report: null } : prev));
      return;
    }
    setReportLoading(true);
    try {
      const data = await payrollApi.reports(queryParams);
      setReportPayload(data);
      if (!selectedRunId && scope === "period" && data?.periods?.length && !isHistory) {
        setSelectedRunId(data.periods[0].id);
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Could not load payroll report", description: err.message });
    } finally {
      setReportLoading(false);
    }
  }, [canManagePayroll, isHistory, employeeId, queryParams, selectedRunId, scope, toast]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const periods = reportPayload?.periods || [];
  const departments = reportPayload?.departments || [];
  const employees = reportPayload?.employees || [];
  const periodLabel = reportPayload?.period?.label || "Selected period";
  const report = reportPayload?.report || null;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const data = await payrollApi.reports({ ...queryParams, format: "csv" });
      if (!data?.export?.csv) throw new Error("Nothing to export for this selection.");
      const url = triggerDownload(new Blob([data.export.csv], { type: data.export.content_type }), data.export.filename);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      toast({ variant: "destructive", title: "Export failed", description: err.message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Workforce reports"
          description="Headcount activity plus historical payroll compliance from finalised pay runs."
          icon={<BarChart2 className="h-4 w-4" />}
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <WorkforceSubnav />
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Active workforce" value={summary?.workforce?.active ?? summary?.workforce?.total ?? 0} />
            <Kpi label="Needs attention" value={summary?.workforce?.needs_attention ?? 0} />
            <Kpi label="Pending leave" value={summary?.leave?.pending ?? 0} />
            <Kpi label="Payslips issued" value={summary?.payroll?.payslips_generated ?? 0} />
          </div>
        )}

        {canManagePayroll ? (
          <Card className="mt-6 rounded-xl">
            <CardHeader className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Payroll reports</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    From finalised pay runs only — historical values are never recalculated from current employee
                    profiles.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={!report || exporting || reportLoading}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {exporting ? "Exporting…" : "Export CSV"}
                </Button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {REPORT_TABS.map((tab) => (
                  <Button
                    key={tab.id}
                    type="button"
                    size="sm"
                    className="shrink-0"
                    variant={reportTab === tab.id ? "default" : "outline"}
                    onClick={() => setReportTab(tab.id)}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="report-scope">{isHistory ? "History" : "Show"}</Label>
                  <select
                    id="report-scope"
                    className={selectClass}
                    value={isHistory && scope !== "range" ? "all" : scope}
                    onChange={(e) => setScope(e.target.value === "all" ? "period" : e.target.value)}
                  >
                    {isHistory ? <option value="all">All periods</option> : null}
                    {SCOPES.filter((s) => !isHistory || s.id === "range").map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {!isHistory && scope === "period" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="payroll-period">Pay period</Label>
                    <select
                      id="payroll-period"
                      className={selectClass}
                      value={selectedRunId}
                      onChange={(e) => setSelectedRunId(e.target.value)}
                    >
                      {!periods.length ? <option value="">No finalised pay runs yet</option> : null}
                      {periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.period_label || `${p.period_start} – ${p.period_end}`}
                          {p.run_type === "adjustment" ? " (adjustment)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {!isHistory && scope === "month" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="payroll-month">Month</Label>
                    <Input id="payroll-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                  </div>
                ) : null}

                {scope === "range" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="payroll-from">From</Label>
                      <Input id="payroll-from" type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="payroll-to">To</Label>
                      <Input id="payroll-to" type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
                    </div>
                  </>
                ) : null}

                {!isHistory ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="payroll-department">Department</Label>
                    <select
                      id="payroll-department"
                      className={selectClass}
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    >
                      <option value="">All departments</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="payroll-employee">Employee</Label>
                  <select
                    id="payroll-employee"
                    className={selectClass}
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                  >
                    <option value="">{isHistory ? "Select an employee" : "All employees"}</option>
                    {employees.map((e) => (
                      <option key={e.membership_id} value={e.membership_id}>
                        {e.employee_name}
                        {e.employee_number ? ` · ${e.employee_number}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">
                {REPORT_TABS.find((t) => t.id === reportTab)?.label}
                {isHistory ? "" : ` — ${periodLabel}`}
              </h3>
              {reportLoading ? (
                <p className="text-sm text-muted-foreground">Loading report…</p>
              ) : isHistory && !employeeId ? (
                <p className="text-sm text-muted-foreground">
                  Choose an employee to see their payroll history across every finalised period.
                </p>
              ) : report ? (
                <ReportBody report={report} payload={reportPayload} money={money} />
              ) : (
                <p className="text-sm text-muted-foreground">No payroll data for this selection.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Payroll, PAYE, UIF and net pay reports are available to payroll managers and business owners.
          </p>
        )}

        {canManagePayroll && reportTab === "net_pay" && reportPayload?.reconciliation?.pay_run_id ? (
          <div className="mt-6">
            <PayrollReconciliationPanel
              key={reportPayload.reconciliation.pay_run_id}
              payRunId={reportPayload.reconciliation.pay_run_id}
              currency={currency}
            />
          </div>
        ) : null}
      </PageTemplate.Body>
    </PageTemplate>
  );
}

function ReportBody({ report, payload, money }) {
  const multiPeriod = (payload?.pay_runs || []).length > 1;
  const periodCol = multiPeriod ? ["Period"] : [];
  const periodCell = (r) => (multiPeriod ? [r.period_label || r.period_start || "—"] : []);
  const rows = report.rows || [];
  const t = report.totals || {};

  if (report.type === "summary") {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Gross payroll" value={money(report.gross_payroll)} />
        <Kpi label="Net payroll" value={money(report.net_payroll)} />
        <Kpi label="PAYE" value={money(report.paye)} />
        <Kpi label="UIF liability (EE + ER)" value={money(report.uif_total)} />
        <Kpi label="UIF (employee)" value={money(report.uif_employee)} />
        <Kpi label="UIF (employer)" value={money(report.uif_employer)} />
        <Kpi label="SDL (employer)" value={money(report.sdl_employer)} />
        <Kpi label="Other deductions" value={money(report.other_deductions)} />
        <Kpi label="Total deductions" value={money(report.deductions)} />
        <Kpi label="Employer contributions" value={money(report.employer_statutory)} />
        <Kpi label="Total employer cost" value={money(report.total_employer_cost)} />
        <Kpi label="Employees" value={report.employee_count ?? 0} />
      </div>
    );
  }

  if (report.type === "net_pay") {
    const integrity = payload?.integrity;
    return (
      <div className="space-y-4">
        <TotalsStrip
          items={[
            { label: "Total net pay", value: money(t.net_pay), primary: true },
            { label: "Gross pay", value: money(t.gross_pay) },
            { label: "Deductions", value: money(t.total_deductions) },
            { label: "Employees", value: rows.length },
          ]}
        />
        {integrity && !integrity.matches ? (
          <p className="text-sm text-red-600">
            The register total does not match the approved pay run total ({money(integrity.run_net_total)}). Review the
            pay run before paying salaries.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            This is the amount that should leave the company bank account for salaries.
          </p>
        )}
        <ReportTable
          headers={["Employee", "Number", ...periodCol, "Gross pay", "Deductions", "Net pay", "Status"]}
          numericFrom={2 + periodCol.length}
          rows={rows.map((r) => [
            r.employee_name,
            r.employee_number || "—",
            ...periodCell(r),
            money(r.gross_pay),
            money(r.total_deductions),
            money(r.net_pay),
            <Badge key="s" variant="outline" className="font-normal">
              {statusLabel(r.status)}
            </Badge>,
          ])}
          footer={["TOTAL NET PAY", "", ...periodCol.map(() => ""), money(t.gross_pay), money(t.total_deductions), money(t.net_pay), ""]}
        />
        <PeriodTotals report={report} money={money} keys={["gross_pay", "total_deductions", "net_pay"]} labels={["Gross", "Deductions", "Net pay"]} />
      </div>
    );
  }

  if (report.type === "uif") {
    return (
      <div className="space-y-4">
        <TotalsStrip
          items={[
            { label: "Total UIF liability", value: money(t.total), primary: true },
            { label: "Employee UIF", value: money(t.employee_contribution) },
            { label: "Employer UIF", value: money(t.employer_contribution) },
            { label: "UIF remuneration", value: money(t.uif_base) },
          ]}
        />
        <ReportTable
          headers={["Employee", "Number", ...periodCol, "UIF remuneration", "Employee UIF", "Employer UIF", "Total"]}
          numericFrom={2 + periodCol.length}
          rows={rows.map((r) => [
            r.employee_name,
            r.employee_number || "—",
            ...periodCell(r),
            money(r.uif_base),
            money(r.employee_contribution),
            money(r.employer_contribution),
            money(r.total),
          ])}
          footer={[
            "TOTAL UIF LIABILITY",
            "",
            ...periodCol.map(() => ""),
            money(t.uif_base),
            money(t.employee_contribution),
            money(t.employer_contribution),
            money(t.total),
          ]}
        />
        <PeriodTotals
          report={report}
          money={money}
          keys={["employee_contribution", "employer_contribution", "total"]}
          labels={["Employee UIF", "Employer UIF", "Total UIF"]}
        />
      </div>
    );
  }

  if (report.type === "paye") {
    return (
      <div className="space-y-4">
        <TotalsStrip
          items={[
            { label: "Total PAYE", value: money(t.paye_deducted), primary: true },
            { label: "Gross remuneration", value: money(t.gross_pay) },
            { label: "Total deductions", value: money(t.total_deductions) },
            { label: "Employees", value: new Set(rows.map((r) => r.membership_id)).size },
          ]}
        />
        <ReportTable
          headers={["Employee", "Number", ...periodCol, "Gross", "PAYE", "UIF (EE)", "Other deductions", "Total deductions"]}
          numericFrom={2 + periodCol.length}
          rows={rows.map((r) => [
            r.employee_name,
            r.employee_number || "—",
            ...periodCell(r),
            money(r.gross_pay),
            money(r.paye_deducted),
            money(r.uif_employee),
            money(r.other_deductions),
            money(r.total_deductions),
          ])}
          footer={[
            "TOTAL PAYE",
            "",
            ...periodCol.map(() => ""),
            money(t.gross_pay),
            money(t.paye_deducted),
            money(t.uif_employee),
            money(t.other_deductions),
            money(t.total_deductions),
          ]}
        />
        <PeriodTotals report={report} money={money} keys={["gross_pay", "paye_deducted"]} labels={["Gross", "PAYE"]} />
      </div>
    );
  }

  if (report.type === "employee_history") {
    return (
      <div className="space-y-4">
        {report.employee ? (
          <p className="text-sm text-muted-foreground">
            {report.employee.employee_name}
            {report.employee.employee_number ? ` · ${report.employee.employee_number}` : ""}
            {report.employee.department ? ` · ${report.employee.department}` : ""}
          </p>
        ) : null}
        <ReportTable
          headers={["Period", "Payslip", "Gross", "PAYE", "UIF", "Other", "Net pay", "Status"]}
          numericFrom={2}
          rows={rows.map((r) => [
            r.period_label || r.period_start,
            r.payslip_number || "—",
            money(r.gross_pay),
            money(r.paye),
            money(r.uif_employee),
            money(r.other_deductions),
            money(r.net_pay),
            statusLabel(r.status),
          ])}
          footer={["TOTAL", "", money(t.gross_pay), money(t.paye), money(t.uif_employee), money(t.other_deductions), money(t.net_pay), ""]}
        />
      </div>
    );
  }
  return null;
}

function TotalsStrip({ items }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-xl border px-4 py-3 ${item.primary ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}
        >
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className={`tabular-nums ${item.primary ? "text-2xl font-semibold" : "text-lg font-medium"}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function PeriodTotals({ report, money, keys, labels }) {
  const periods = report?.by_period || [];
  if (periods.length < 2) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Monthly totals</h4>
      <ReportTable
        headers={["Period", "Employees", ...labels]}
        numericFrom={1}
        rows={periods.map((p) => [p.period_label || p.period_start, p.employee_count, ...keys.map((k) => money(p.totals?.[k]))])}
      />
    </div>
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

function ReportTable({ headers, rows, footer, numericFrom = 1 }) {
  const align = (idx) => (idx >= numericFrom ? "tabular-nums text-right whitespace-nowrap" : "");
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            {headers.map((h, idx) => (
              <th key={h} className={`px-3 py-2 font-medium text-muted-foreground ${align(idx)}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((row, idx) => (
            <tr key={idx} className="border-b border-border/70">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className={`px-3 py-2 ${align(cIdx)}`}>
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
                <td key={cIdx} className={`px-3 py-2 ${align(cIdx)}`}>
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
