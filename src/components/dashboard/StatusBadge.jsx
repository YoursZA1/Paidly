import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusStyles = {
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  paused: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  suspended: 'bg-red-500/10 text-red-500 border-red-500/20',
  cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  expired: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  pending: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  approved: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  declined: 'bg-red-500/10 text-red-500 border-red-500/20',
  none: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function StatusBadge({ status }) {
  return (
    <Badge variant="outline" className={cn('capitalize text-xs font-medium border', statusStyles[status] || statusStyles.none)}>
      {status}
    </Badge>
  );
}
