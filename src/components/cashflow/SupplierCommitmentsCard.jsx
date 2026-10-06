import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/CurrencySelector";
import { createPageUrl } from "@/utils";
import { summarizePurchaseOrders } from "@shared/procurement/purchaseOrderMath.js";
import { formatPoDate } from "@/components/purchaseOrders/purchaseOrderDocumentModel";

/**
 * Approved purchase orders in their financial states — Committed (not yet received) and Payable
 * (received, unpaid) — with what falls due next. Neither is an expense: the 30-day outgoing projection
 * plans them on their due dates, actuals count only recorded payments.
 */
export default function SupplierCommitmentsCard({ purchaseOrders = [], schedule = [], currentBalance = 0, currency = "ZAR" }) {
  const s = summarizePurchaseOrders(purchaseOrders);
  if (s.owed <= 0) return null;

  const money = (v) => formatCurrency(v, currency);
  const afterSuppliers = currentBalance - s.owed;
  const next = schedule.filter((row) => row.date).slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Supplier commitments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Outstanding to suppliers</p>
          <p className="text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">{money(s.owed)}</p>
        </div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Committed · not yet received</dt>
            <dd className="tabular-nums">{money(s.committedOpen)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Payable · received, unpaid</dt>
            <dd className="tabular-nums">{money(s.payableNow)}</dd>
          </div>
          {s.overdue > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-red-700 dark:text-red-400">Overdue</dt>
              <dd className="tabular-nums text-red-700 dark:text-red-400">{money(s.overdue)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-border pt-1.5">
            <dt className="text-muted-foreground">Balance after paying suppliers</dt>
            <dd className={`tabular-nums font-medium ${afterSuppliers < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{money(afterSuppliers)}</dd>
          </div>
        </dl>
        {next.length > 0 && (
          <ul className="space-y-1 text-xs">
            {next.map((row) => (
              <li key={row.id} className="flex justify-between gap-3">
                <span className={row.overdue ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}>
                  {row.overdue ? `Overdue since ${formatPoDate(row.dueDate, "dd MMM")}` : formatPoDate(row.date, "dd MMM")} · {row.poNumber}
                </span>
                <span className="tabular-nums">{money(row.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Planned in the 30-day outgoing projection on each due date. Counted as cash out only when you record the payment.
        </p>
        <Link
          to={createPageUrl("PurchaseOrders")}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open purchase orders <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
