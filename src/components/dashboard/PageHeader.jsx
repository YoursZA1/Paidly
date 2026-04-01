import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * @param {{ title: string, description?: string, children?: React.ReactNode, onRefresh?: () => void, isRefreshing?: boolean }} props
 */
export default function PageHeader({ title, description, children, onRefresh, isRefreshing }) {
  const showActions = onRefresh || children;

  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
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
