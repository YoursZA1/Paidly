import { cn } from '@/lib/utils';

export default function StatCard({ title, value, change, icon: Icon }) {
  const positive = (change || '').startsWith('+');

  return (
    <div className="bg-card rounded-xl border border-border px-4 py-3.5 sm:px-5 sm:py-4 max-[359px]:px-3 max-[359px]:py-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground max-[359px]:text-[10px]">{title}</p>
          <p className="mt-1.5 text-[30px] leading-none font-bold tracking-tight sm:mt-2 sm:text-[32px] max-[359px]:text-[24px]">
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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary max-[359px]:h-7 max-[359px]:w-7">
          <Icon className="h-4 w-4 max-[359px]:h-3.5 max-[359px]:w-3.5" />
        </div>
      </div>
    </div>
  );
}
