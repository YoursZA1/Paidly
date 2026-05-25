import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Numbered pagination bar for tables and lists.
 *
 * Props:
 *   page         — 0-based current page
 *   totalPages   — total number of pages
 *   onPageChange — (newPage: number) => void
 *   totalItems   — optional total item count for the "X items · page N of M" label
 *   itemLabel    — optional noun for the label, e.g. "users" (default "items")
 *   className    — extra classes on the wrapper
 */
export default function TablePagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  itemLabel = 'items',
  className = '',
}) {
  if (totalPages <= 1) return null;

  const safe = Math.max(0, Math.min(page, totalPages - 1));

  // Build the visible page number list with ellipsis.
  function pageNumbers() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const pages = [];
    const addPage = (n) => { if (!pages.includes(n)) pages.push(n); };
    addPage(0);
    if (safe > 2) pages.push('…left');
    for (let i = Math.max(1, safe - 1); i <= Math.min(totalPages - 2, safe + 1); i++) addPage(i);
    if (safe < totalPages - 3) pages.push('…right');
    addPage(totalPages - 1);
    return pages;
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6 ${className}`}>
      {/* Label */}
      <p className="text-xs text-muted-foreground">
        {totalItems != null ? `${totalItems} ${itemLabel} · ` : ''}
        Page {safe + 1} of {totalPages}
      </p>

      {/* Controls */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2.5"
          disabled={safe === 0}
          onClick={() => onPageChange(safe - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>

        {pageNumbers().map((n, i) =>
          typeof n === 'string' ? (
            <span key={n + i} className="flex h-8 w-8 items-center justify-center text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPageChange(n)}
              className={`h-8 min-w-[2rem] rounded-md px-2.5 text-sm font-medium transition-colors ${
                n === safe
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {n + 1}
            </button>
          )
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2.5"
          disabled={safe >= totalPages - 1}
          onClick={() => onPageChange(safe + 1)}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
