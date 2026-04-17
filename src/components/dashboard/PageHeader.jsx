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
    <div className="responsive-page-header mb-6">
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
        <div className="responsive-page-header-actions">
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 min-h-9 min-w-9 md:h-10 md:w-10 md:min-h-10 md:min-w-10"
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
