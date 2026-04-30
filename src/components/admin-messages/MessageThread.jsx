import { useEffect, useRef } from 'react';
import { format, isToday } from 'date-fns';
import { Mail, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function MessageThread({
  userLabel,
  userEmail,
  messages,
  currentUserId,
  replySubject,
  onReplySubjectChange,
  replyBody,
  onReplyBodyChange,
  replyChannel,
  onReplyChannelChange,
  channelOptions,
  onSendReply,
  canSendReply,
  sending,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}) {
  const topLoaderRef = useRef(null);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const node = topLoaderRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '220px 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  return (
    <section className="min-h-0 flex flex-col">
      <div className="h-16 border-b border-border/70 px-5 flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-semibold truncate">{userLabel}</p>
          <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 bg-muted/20">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-4 space-y-3">
          <div ref={topLoaderRef} className="h-7 text-center text-xs text-muted-foreground">
            {isFetchingNextPage ? 'Loading older messages…' : hasNextPage ? 'Scroll up to load older' : 'Start of thread'}
          </div>
          {messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            const channel = String(m.channel || 'both');
            return (
              <article key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[82%] rounded-2xl border px-4 py-3',
                    mine ? 'bg-primary/10 border-primary/25' : 'bg-background border-border'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{mine ? 'Paidly Team' : userLabel}</p>
                    <span className="text-[11px] text-muted-foreground">
                      {m.created_at ? format(new Date(m.created_at), isToday(new Date(m.created_at)) ? 'HH:mm' : 'MMM d, HH:mm') : '—'}
                    </span>
                  </div>
                  <p className="text-sm font-medium mt-1">{m.subject || 'Message'}</p>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{m.content}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="h-5 text-[10px] gap-1">
                      {(channel === 'both' || channel === 'email') ? <Mail className="h-3 w-3" /> : null}
                      {(channel === 'both' || channel === 'in_app') ? <Radio className="h-3 w-3" /> : null}
                      {channel}
                    </Badge>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-border/70 bg-background px-4 py-3 space-y-2">
        <div className="space-y-1">
          <Label htmlFor="thread-reply-subject">Subject</Label>
          <Input id="thread-reply-subject" value={replySubject} onChange={(e) => onReplySubjectChange(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="thread-reply-body">Message</Label>
          <Textarea id="thread-reply-body" value={replyBody} onChange={(e) => onReplyBodyChange(e.target.value)} rows={4} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-border p-1">
            {channelOptions.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={replyChannel === option.id ? 'default' : 'ghost'}
                className="h-8 px-3"
                onClick={() => onReplyChannelChange(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <Button onClick={onSendReply} disabled={!canSendReply}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </section>
  );
}
