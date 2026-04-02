import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * @param {{
 *   title: string,
 *   description?: string,
 *   descriptionClassName?: string,
 *   icon?: React.ReactNode,
 *   children?: React.ReactNode,
 *   onRefresh?: () => void,
 *   isRefreshing?: boolean
 * }} props
 */
export default function PageHeader({
  title,
  description,
  descriptionClassName,
  icon,
  children,
  onRefresh,
  isRefreshing,
}) {
  const showActions = onRefresh || children;

  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className={icon ? 'flex gap-4' : ''}>
        {icon ? (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/40">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className={cn('text-muted-foreground', descriptionClassName ?? 'mt-1 text-xs')}>{description}</p>
          ) : null}
        </div>
      </div>
      {showActions ? (
        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
