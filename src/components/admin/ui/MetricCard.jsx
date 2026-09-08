import { formatAdminChange, formatAdminZar } from "./adminFormat";
import { cn } from "@/lib/utils";

function MiniSpark({ values = [] }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-8 items-end gap-0.5" aria-hidden>
      {values.map((v, i) => (
        <span
          key={`${i}-${v}`}
          className={cn(
            "w-1.5 rounded-sm",
            i === values.length - 1 ? "bg-primary" : "bg-muted-foreground/20"
          )}
          style={{ height: `${Math.max(12, Math.round((Number(v) / max) * 32))}%` }}
        />
      ))}
    </div>
  );
}

export default function MetricCard({
  title,
  value,
  change,
  compareLabel,
  sparkline,
  isMoney = false,
  unavailable = false,
  unavailableReason,
}) {
  const display = unavailable
    ? "—"
    : isMoney
      ? formatAdminZar(value)
      : value == null
        ? "—"
        : Number(value).toLocaleString("en-ZA");
  const changeLabel = formatAdminChange(change);
  const up = Number(change) > 0;
  const down = Number(change) < 0;

  return (
    <article className="rounded-2xl border border-border/80 bg-card p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
        <MiniSpark values={sparkline} />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{display}</p>
      {unavailable ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{unavailableReason || "Source not available"}</p>
      ) : changeLabel ? (
        <p className={cn("mt-1 text-[12px]", up && "text-emerald-600", down && "text-red-600", !up && !down && "text-muted-foreground")}>
          {changeLabel} {compareLabel || ""}
        </p>
      ) : (
        <p className="mt-1 text-[12px] text-muted-foreground">{compareLabel || "Current period"}</p>
      )}
    </article>
  );
}
