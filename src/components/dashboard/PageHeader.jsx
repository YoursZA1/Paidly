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
    <div className="responsive-page-header mb-4">
      <div className={icon ? 'flex gap-3' : ''}>
        {icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight font-display">{title}</h1>
          {description ? (
            <p className={cn('text-muted-foreground', descriptionClassName ?? 'mt-0.5 text-xs')}>{description}</p>
          ) : null}
        </div>
      </div>
      {showActions ? (
        <div className="responsive-page-header-actions">
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 min-h-8 min-w-8"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            </Button>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
