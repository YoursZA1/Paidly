import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare, Trash2 } from "lucide-react";

export default function DocumentCommentsPanel({ comments = [], onAdd, onRemove, busy = false }) {
  const [body, setBody] = useState("");

  const handleAdd = async () => {
    const text = body.trim();
    if (!text) return;
    await onAdd?.(text);
    setBody("");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Add comment</h3>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a note for your team…"
          className="mt-3 min-h-[88px]"
        />
        <Button type="button" className="mt-3" size="sm" disabled={busy || !body.trim()} onClick={handleAdd}>
          Post comment
        </Button>
      </div>

      {!comments.length ? (
        <EmptyState
          icon={<MessageSquare className="h-6 w-6 text-muted-foreground" />}
          title="No comments yet"
          description="Discuss approvals, changes, or next steps with your team."
        />
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const dt = c.created_at ? new Date(c.created_at) : null;
            return (
              <li key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <time className="text-xs text-muted-foreground" dateTime={c.created_at}>
                      {dt && !Number.isNaN(dt.getTime()) ? format(dt, "MMM d, yyyy · HH:mm") : ""}
                    </time>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    onClick={() => onRemove?.(c.id)}
                    aria-label="Delete comment"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
