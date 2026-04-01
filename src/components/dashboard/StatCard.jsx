import { cn } from '@/lib/utils';

export default function StatCard({ title, value, change, icon: Icon }) {
  const positive = (change || '').startsWith('+');

  return (
    <div className="bg-card rounded-xl border border-border px-5 py-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground">{title}</p>
          <p className="text-[32px] leading-none font-bold mt-2 tracking-tight">{value}</p>
          {change && <p className={cn('text-xs mt-1', positive ? 'text-emerald-500' : 'text-red-400')}>{change} vs last month</p>}
        </div>
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
