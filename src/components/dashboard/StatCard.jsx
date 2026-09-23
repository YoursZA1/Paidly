import { cn } from "@/lib/utils";

/**
 * Dashboard stat tile. Static by default; pass `onClick` to make it a real <button> filter
 * shortcut (keyboard focusable, aria-pressed reflects `selected`).
 */
export default function StatCard({
  title,
  value,
  change,
  onClick = null,
  selected = false,
  ariaLabel = null,
}) {
  const body = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <p className="currency-nums mt-1 min-w-0 break-words text-lg font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {change ? <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{change}</p> : null}
      {onClick && selected ? (
        <p className="mt-0.5 text-[11px] font-medium text-primary">Currently filtered</p>
      ) : null}
    </>
  );

  if (!onClick) {
    return <div className="min-w-0 dashboard-card px-3 py-3 sm:px-4">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel || undefined}
      className={cn(
        "min-w-0 dashboard-card px-3 py-3 text-left transition-colors sm:px-4",
        "hover:border-primary/40 hover:bg-accent/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected && "border-primary bg-primary/5 ring-1 ring-primary/30"
      )}
    >
      {body}
    </button>
  );
}
