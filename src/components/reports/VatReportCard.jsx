import { Download, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/utils/currencyCalculations";

function Metric({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

const RANGES = [
  { id: "month", label: "This month" },
  { id: "quarter", label: "This quarter" },
  { id: "year", label: "This year" },
];

export default function VatReportCard({
  report,
  currency = "ZAR",
  range = "month",
  onRangeChange,
  onDownload,
}) {
  const due = report?.vatDue ?? 0;
  return (
    <Card className="rounded-xl border border-border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              VAT report
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Payments basis. Output VAT is the VAT in money received on invoices and the till. Input VAT is the VAT saved on expenses. VAT due is output minus input.
            </p>
          </div>
          <Button variant="outline" size="sm" className="rounded-lg gap-2" onClick={onDownload}>
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {RANGES.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={range === item.id ? "default" : "outline"}
              className="rounded-lg"
              onClick={() => onRangeChange?.(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/40 p-4 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">VAT due</p>
            <p className={`text-2xl font-semibold tabular-nums ${due < 0 ? "text-emerald-700" : "text-foreground"}`}>
              {formatCurrency(due, currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {due < 0 ? "Refundable for this period." : "Payable for this period."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Metric label="Output VAT" value={formatCurrency(report?.outputVat || 0, currency)} />
            <Metric label="Input VAT" value={formatCurrency(report?.inputVat || 0, currency)} />
            <Metric label="Standard-rated sales" value={formatCurrency(report?.standardRated || 0, currency)} />
            <Metric label="Zero-rated sales" value={formatCurrency(report?.zeroRated || 0, currency)} />
          </div>
        </div>
        {report?.lines?.length ? (
          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium text-right">Taxable</th>
                  <th className="px-3 py-2 font-medium text-right">VAT</th>
                </tr>
              </thead>
              <tbody>
                {report.lines.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">{row.date || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.kind === "input" ? "Input" : "Output"} · {row.source}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate" title={`${row.reference} ${row.description}`}>
                      {row.reference} · {row.description}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.taxable, currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.vat, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No VAT in this period.</p>
        )}
      </CardContent>
    </Card>
  );
}
