import { Ban, CalendarClock, ClipboardCheck, HandCoins, Truck, Wallet } from "lucide-react";
import { formatCurrency } from "@/components/CurrencySelector";

function Stat({ icon: Icon, label, value, hint, tone = "default", step }) {
  const toneClass =
    tone === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "danger"
        ? "text-red-600 dark:text-red-400"
        : tone === "success"
          ? "text-emerald-600 dark:text-emerald-400"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        {step ? <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold">{step}</span> : null}
      </div>
      <div className={`mt-2 text-lg sm:text-xl font-semibold tabular-nums truncate ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground leading-snug">{hint}</div> : null}
    </div>
  );
}

/**
 * Procurement ↔ finance at a glance, in the three financial states of an approved order:
 *   1 Committed (approved, not yet received) → 2 Payable (received, unpaid) → 3 Paid (expenses).
 * Only Paid has left the business and appears in Cash Flow actuals.
 */
export default function PurchaseOrderSummary({ summary, currency = "ZAR" }) {
  const money = (v) => formatCurrency(v, currency);
  const s = summary;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
      <Stat
        step="1"
        icon={Truck}
        label="Committed"
        value={money(s.committedOpen)}
        hint={s.committed > 0 ? `Approved, not yet received · of ${money(s.committed)} approved` : "Approved, not yet received"}
      />
      <Stat
        step="2"
        icon={HandCoins}
        label="Payable"
        value={money(s.payableNow)}
        hint="Received, unpaid — owed to suppliers"
        tone={s.payableNow > 0 ? "warning" : "muted"}
      />
      <Stat step="3" icon={Wallet} label="Paid" value={money(s.paid)} hint="Recorded as expenses" tone="success" />
      <Stat
        icon={CalendarClock}
        label="Due in 30 days"
        value={money(s.dueNext30)}
        hint={s.overdueCount > 0 ? `${money(s.overdue)} overdue on ${s.overdueCount} order${s.overdueCount === 1 ? "" : "s"}` : "Nothing overdue"}
        tone={s.overdueCount > 0 ? "danger" : s.dueNext30 > 0 ? "warning" : "muted"}
      />
      <Stat
        icon={ClipboardCheck}
        label="Awaiting approval"
        value={money(s.pendingApprovalValue)}
        hint={
          [
            s.pendingApprovalCount ? `${s.pendingApprovalCount} pending` : "None pending",
            s.draftCount ? `${s.draftCount} draft${s.draftCount === 1 ? "" : "s"} (${money(s.draftValue)})` : "",
          ]
            .filter(Boolean)
            .join(" · ")
        }
        tone={s.pendingApprovalCount > 0 ? "default" : "muted"}
      />
      <Stat
        icon={Ban}
        label="Cancelled"
        value={money(s.cancelled)}
        hint={s.cancelledCount > 0 ? `${s.cancelledCount} order${s.cancelledCount === 1 ? "" : "s"} · released` : "No cancelled orders"}
        tone="muted"
      />
    </div>
  );
}
