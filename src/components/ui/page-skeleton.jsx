import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Generic full-page skeleton for list/table pages while data loads.
 *
 * @param {number} [rows=6]       - Number of skeleton rows to render
 * @param {boolean} [hasHeader]   - Show a header skeleton row (title + button area)
 * @param {string}  [className]   - Extra wrapper classes
 */
export function PageSkeleton({ rows = 6, hasHeader = true, className }) {
  return (
    <div className={cn("space-y-4 p-4 sm:p-6", className)}>
      {hasHeader && (
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-7 w-40 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

/**
 * Card-grid skeleton for card-layout pages.
 *
 * @param {number} [cards=6]
 * @param {string} [className]
 */
export function CardGridSkeleton({ cards = 6, className }) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-6", className)}>
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-2xl" />
      ))}
    </div>
  );
}
