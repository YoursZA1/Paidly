import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const planStyles = {
  individual: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  sme: 'bg-primary/10 text-primary border-primary/20',
  corporate: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  none: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function PlanBadge({ plan }) {
  return (
    <Badge variant="outline" className={cn('capitalize text-xs font-medium border', planStyles[plan] || planStyles.none)}>
      {plan}
    </Badge>
  );
}
