import { cn } from '@/lib/utils';

export default function StatCard({ title, value, change, icon: Icon }) {
  const positive = (change || '').startsWith('+');

  return (
    <div className="group min-w-0 rounded-xl border border-border bg-card px-3 py-3 shadow-sm interactive-card sm:px-4">
      <div className="mb-1.5 flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-all duration-200 group-hover:bg-primary/15">
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="currency-nums tabular-nums min-w-0 break-words text-sm font-semibold leading-snug tracking-tight text-foreground">
        {value}
      </p>
      {change && (
        <p
          className={cn(
            'mt-0.5 text-[11px] leading-tight',
            positive ? 'text-emerald-500' : 'text-red-400'
          )}
        >
          {change} vs last month
        </p>
      )}
    </div>
  );
}
