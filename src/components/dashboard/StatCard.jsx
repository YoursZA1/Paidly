import { cn } from "@/lib/utils";

export default function StatCard({ title, value, change }) {
  return (
    <div className="min-w-0 dashboard-card px-3 py-3 sm:px-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <p className="currency-nums mt-1 min-w-0 break-words text-lg font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {change ? <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{change}</p> : null}
    </div>
  );
}
