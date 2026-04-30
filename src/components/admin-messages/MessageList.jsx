import { useEffect, useMemo, useRef } from 'react';
import { format, isToday } from 'date-fns';
import { Mail, Radio, Star } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function initials(label) {
  const base = String(label || '').trim();
  if (!base) return 'U';
  const parts = base.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || 'U';
}

export default function MessageList({
  items,
  searchTerm,
  onSearchTermChange,
  selectedKey,
  onSelectItem,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}) {
  const loadMoreRef = useRef(null);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '180px 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  const rendered = useMemo(() => items || [], [items]);

  return (
    <section className="border-r border-border/70 min-h-0 flex flex-col">
      <div className="h-16 border-b border-border/70 px-4 flex items-center">
        <Input
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          placeholder="Search messages"
          className="h-10"
          aria-label="Search messages"
        />
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div>
          {rendered.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const selected = selectedKey === key;
            const unread = Boolean(item.unread);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectItem(item)}
                className={cn(
                  'w-full h-[78px] px-4 border-b border-border/50 flex items-center gap-3 text-left transition-colors',
                  selected ? 'bg-muted/70' : 'hover:bg-muted/40'
                )}
              >
                <div className="h-9 w-9 rounded-full bg-primary/15 text-primary text-xs font-semibold grid place-items-center shrink-0">
                  {initials(item.title)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>{item.title}</p>
                    {unread ? <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" /> : null}
                  </div>
                  <p className={cn('truncate text-sm', unread ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    {item.subject || 'No subject'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{item.preview}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-xs text-muted-foreground">
                    {item.at ? format(new Date(item.at), isToday(new Date(item.at)) ? 'HH:mm' : 'MMM d') : '—'}
                  </span>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {item.channelEmail ? <Mail className="h-3.5 w-3.5" /> : null}
                    {item.channelInApp ? <Radio className="h-3.5 w-3.5" /> : null}
                    {item.priority ? <Star className="h-3.5 w-3.5 text-amber-500" /> : null}
                  </div>
                </div>
              </button>
            );
          })}
          {isLoading ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : null}
          <div ref={loadMoreRef} className="h-10 grid place-items-center text-xs text-muted-foreground">
            {isFetchingNextPage ? 'Loading more…' : hasNextPage ? 'Scroll to load more' : 'Up to date'}
          </div>
        </div>
      </ScrollArea>
    </section>
  );
}
