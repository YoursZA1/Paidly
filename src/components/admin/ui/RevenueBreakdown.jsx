import { useMemo, useState } from "react";
import { formatAdminChange, formatAdminZar } from "./adminFormat";
import { cn } from "@/lib/utils";

const PERIODS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

export default function RevenueBreakdown({
  revenue,
  period,
  onPeriodChange,
  compareLabel,
}) {
  const sources = revenue?.sources || {};
  const [hidden, setHidden] = useState({});
  const visibleKeys = useMemo(
    () => Object.keys(sources).filter((key) => !hidden[key] && sources[key]?.unavailable !== true),
    [hidden, sources]
  );
  const total = visibleKeys.reduce((sum, key) => sum + Number(sources[key]?.amount || 0), 0);

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Revenue overview</h2>
          <p className="text-xs text-muted-foreground">Paidly’s own revenue this period. Customer books are excluded.</p>
        </div>
        <div className="flex rounded-full border border-border bg-muted/40 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPeriodChange?.(p.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                period === p.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 h-3 overflow-hidden rounded-full bg-muted">
        {visibleKeys.length === 0 ? <div className="h-full w-full bg-muted" /> : null}
        {visibleKeys.map((key, i) => {
          const amount = Number(sources[key]?.amount || 0);
          const width = total > 0 ? (amount / total) * 100 : 0;
          const colors = ["bg-foreground", "bg-primary", "bg-emerald-500", "bg-sky-500", "bg-amber-400"];
          return <span key={key} className={cn("inline-block h-full", colors[i % colors.length])} style={{ width: `${width}%` }} />;
        })}
      </div>

      <ul className="mt-4 space-y-2">
        {Object.entries(sources).map(([key, source]) => {
          const checked = !hidden[key];
          return (
            <li key={key} className="flex items-center justify-between gap-3 text-sm">
              <label className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setHidden((prev) => ({ ...prev, [key]: !prev[key] }))}
                />
                <span className="truncate">{source.label}</span>
              </label>
              <span className="tabular-nums text-muted-foreground">
                {source.unavailable ? "Not available" : formatAdminZar(source.amount)}
                {!source.unavailable && formatAdminChange(source.change) ? (
                  <span className="ml-2 text-[11px]">{formatAdminChange(source.change)} {compareLabel}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {sources.fees?.unavailableReason ? (
        <p className="mt-3 text-[11px] text-muted-foreground">{sources.fees.unavailableReason}</p>
      ) : null}
    </section>
  );
}
