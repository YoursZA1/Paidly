import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getPackageDisplayName, normalizePaidPackageKey } from '@/lib/subscriptionPlan';

const planStyles = {
  individual: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  sme: 'bg-primary/10 text-primary border-primary/20',
  corporate: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  free: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  trial: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  none: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

function badgeKeyAndLabel(plan) {
  const raw = String(plan ?? 'none').trim().toLowerCase();
  if (raw === 'free') return { key: 'free', label: 'Free' };
  if (raw === 'trial') return { key: 'trial', label: 'Trial' };
  if (raw === 'none' || raw === '') return { key: 'none', label: 'None' };
  const pkg = normalizePaidPackageKey(raw);
  return { key: pkg, label: getPackageDisplayName(pkg) };
}

export default function PlanBadge({ plan }) {
  const { key, label } = badgeKeyAndLabel(plan);
  return (
    <Badge variant="outline" className={cn('text-xs font-medium border', planStyles[key] || planStyles.none)}>
      {label}
    </Badge>
  );
}
