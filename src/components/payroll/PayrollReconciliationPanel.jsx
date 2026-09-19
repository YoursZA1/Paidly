import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/components/CurrencySelector";
import { payrollApi } from "@/services/PayrollApiService";
import { createPageUrl } from "@/utils";

const STATUS_COPY = {
  not_finalised: { label: "Not finalised", tone: "outline", hint: "Finalise the pay run to lock the expected salary payment." },
  awaiting_payment: { label: "Awaiting bank payment", tone: "outline", hint: "Record the actual salary payment from your bank." },
  reconciled: { label: "Reconciled", tone: "success", hint: "The bank payment matches approved payroll." },
  variance: { label: "Variance", tone: "destructive", hint: "The bank payment differs from approved payroll." },
};

function StatusBadge({ status }) {
  const copy = STATUS_COPY[status] || STATUS_COPY.awaiting_payment;
  const className =
    copy.tone === "success"
      ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : copy.tone === "destructive"
        ? "border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-400"
        : "";
  return (
    <Badge variant="outline" className={className}>
      {copy.label}
    </Badge>
  );
}

function FlowStep({ label, value, emphasize = false, last = false }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`tabular-nums ${emphasize ? "text-base font-semibold" : "text-sm font-medium"}`}>{value}</span>
      </div>
      {last ? null : <ArrowDown className="mx-auto h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
    </>
  );
}

/**
 * Approved payroll → total net pay → expected bank payment → actual → status.
 * Expected is the locked pay run total; actual is entered here or matched from
 * Cash Flow bank-statement expenses (category "salary").
 */
export default function PayrollReconciliationPanel({ payRunId, currency = "ZAR", editable = true, onChange }) {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [reference, setReference] = useState("");
  const [selected, setSelected] = useState([]);

  const money = (n) => (n == null ? "—" : formatCurrency(Number(n || 0), currency));

  const hydrate = useCallback((next) => {
    setData(next);
    setAmount(next?.actual != null ? String(next.actual) : "");
    setPaymentDate(next?.bank_payment_date || next?.pay_date || "");
    setReference(next?.bank_payment_reference || "");
    setSelected((next?.linked_expenses || []).map((e) => e.id));
  }, []);

  useEffect(() => {
    if (!payRunId) return undefined;
    let cancelled = false;
    setLoading(true);
    payrollApi
      .reconciliation(payRunId)
      .then((next) => {
        if (!cancelled) hydrate(next);
      })
      .catch((err) => {
        if (!cancelled) toast({ variant: "destructive", title: "Could not load reconciliation", description: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payRunId, hydrate, toast]);

  const transactions = [...(data?.linked_expenses || []), ...(data?.candidate_expenses || [])];
  const selectedTotal = transactions
    .filter((t) => selected.includes(t.id))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const total = transactions.filter((t) => next.includes(t.id)).reduce((sum, t) => sum + Number(t.amount || 0), 0);
      if (next.length) setAmount(String(Math.round(total * 100) / 100));
      return next;
    });
  };

  const save = async (extra = {}) => {
    setSaving(true);
    try {
      const next = await payrollApi.recordBankPayment(payRunId, {
        amount: amount === "" ? null : Number(amount),
        payment_date: paymentDate || null,
        reference: reference || null,
        expense_ids: selected,
        ...extra,
      });
      hydrate(next);
      onChange?.(next);
      const copy = STATUS_COPY[next.status];
      toast({ title: copy ? copy.label : "Saved", description: copy?.hint });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not record payment", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!payRunId) return null;

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Bank reconciliation</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? STATUS_COPY[data.status]?.hint : "Compare approved payroll with the salary payment that left your bank."}
          </p>
        </div>
        {data ? <StatusBadge status={data.status} /> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading reconciliation…</p>
        ) : data ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <FlowStep label={`Approved payroll · ${data.period_label || ""}`} value={`${data.employee_count ?? 0} employees`} />
                <FlowStep label="Total net pay" value={money(data.items_net_total)} />
                <FlowStep label="Expected bank salary payment" value={money(data.expected)} emphasize />
                <FlowStep label="Actual bank payment" value={money(data.actual)} emphasize />
                <FlowStep
                  label="Difference"
                  value={
                    data.difference == null ? "—" : `${data.difference > 0 ? "+" : ""}${money(data.difference)}`
                  }
                  last
                />
                {!data.totals_match ? (
                  <p className="text-xs text-red-600">
                    Employee net pay lines do not add up to the pay run total. Review the pay run before paying.
                  </p>
                ) : null}
              </div>

              {editable && data.status !== "not_finalised" ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`recon-amount-${payRunId}`}>Actual amount paid</Label>
                      <Input
                        id={`recon-amount-${payRunId}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`recon-date-${payRunId}`}>Payment date</Label>
                      <Input
                        id={`recon-date-${payRunId}`}
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`recon-ref-${payRunId}`}>Bank reference</Label>
                      <Input
                        id={`recon-ref-${payRunId}`}
                        value={reference}
                        maxLength={120}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="e.g. SALARIES SEP"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Match bank transactions</p>
                    {transactions.length ? (
                      <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                        {transactions.map((t) => (
                          <li key={t.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              id={`recon-tx-${t.id}`}
                              checked={selected.includes(t.id)}
                              onCheckedChange={() => toggle(t.id)}
                            />
                            <label htmlFor={`recon-tx-${t.id}`} className="flex min-w-0 flex-1 justify-between gap-2">
                              <span className="truncate">
                                {t.date} · {t.description || "Salary"}
                              </span>
                              <span className="shrink-0 tabular-nums">{money(t.amount)}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No unmatched salary transactions in this pay window. Import your bank statement in{" "}
                        <Link className="underline" to={createPageUrl("CashFlow")}>
                          Cash Flow
                        </Link>{" "}
                        (category Salary), or enter the amount manually.
                      </p>
                    )}
                    {selected.length ? (
                      <p className="text-xs text-muted-foreground">
                        {selected.length} selected · {money(selectedTotal)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="rounded-xl" disabled={saving} onClick={() => save()}>
                      {saving ? "Saving…" : "Save reconciliation"}
                    </Button>
                    {data.run_status !== "paid" ? (
                      <Button size="sm" variant="outline" className="rounded-xl" disabled={saving} onClick={() => save({ mark_paid: true })}>
                        Save & mark paid
                      </Button>
                    ) : null}
                    {data.actual != null ? (
                      <Button size="sm" variant="ghost" className="rounded-xl" disabled={saving} onClick={() => save({ clear: true })}>
                        Clear
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No reconciliation data.</p>
        )}
      </CardContent>
    </Card>
  );
}
