import { cn } from '@/lib/utils';

export default function StatCard({ title, value, change, icon: Icon }) {
  const positive = (change || '').startsWith('+');

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md max-[359px]:px-3 max-[359px]:py-3 sm:px-5 sm:py-4">
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[11px] text-muted-foreground max-[359px]:text-[10px]">{title}</p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary max-[359px]:h-7 max-[359px]:w-7">
          <Icon className="h-4 w-4 max-[359px]:h-3.5 max-[359px]:w-3.5" />
        </div>
      </div>
      <p className="currency-nums tabular-nums min-w-0 break-words text-sm font-semibold leading-snug tracking-tight text-foreground sm:text-base">
        {value}
      </p>
      {change && (
        <p
          className={cn(
            'mt-1 text-xs leading-tight max-[359px]:text-[11px]',
            positive ? 'text-emerald-500' : 'text-red-400'
          )}
        >
          {change} vs last month
        </p>
      )}
    </div>
  );
}
