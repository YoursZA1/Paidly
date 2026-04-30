import { useEffect, useMemo, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function ComposeModal({
  open,
  onOpenChange,
  mode,
  users,
  segments,
  sending,
  onSubmit,
  defaultRecipientId = '',
}) {
  const [subject, setSubject] = useState(mode === 'broadcast' ? 'Paidly platform update' : 'Message from Paidly');
  const [content, setContent] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [editorMode, setEditorMode] = useState('rich');
  const [channel, setChannel] = useState('both');
  const [recipientId, setRecipientId] = useState(defaultRecipientId);
  const [segmentId, setSegmentId] = useState('all-users');

  useEffect(() => {
    if (!open) return;
    setSubject(mode === 'broadcast' ? 'Paidly platform update' : 'Message from Paidly');
    setContent('');
    setContentHtml('');
    setEditorMode('rich');
    setRecipientId(defaultRecipientId || '');
    setSegmentId('all-users');
  }, [open, mode, defaultRecipientId]);

  const title = mode === 'broadcast' ? 'Broadcast Campaign' : 'Compose Message';
  const audienceIds = useMemo(() => {
    if (mode !== 'broadcast') return [];
    const seg = segments.find((s) => s.id === segmentId);
    if (!seg || !seg.ids) return users.map((u) => u.id).filter(Boolean);
    return Array.from(seg.ids);
  }, [mode, segments, segmentId, users]);

  const submitDisabled =
    sending ||
    !String(subject).trim() ||
    !(editorMode === 'rich' ? String(toPlainText(contentHtml)).trim() : String(content).trim()) ||
    (mode === 'direct' ? !String(recipientId).trim() : audienceIds.length === 0);

  const handleSubmit = () => {
    const plain = editorMode === 'rich' ? toPlainText(contentHtml) : String(content || '');
    onSubmit({
      mode,
      subject: String(subject || '').trim(),
      content: editorMode === 'rich' ? String(contentHtml || '').trim() : String(content || '').trim(),
      contentPlain: String(plain || '').trim(),
      format: editorMode === 'rich' ? 'html' : 'plain',
      channel,
      recipientId,
      recipientIds: audienceIds,
      segmentId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto">
          {mode === 'direct' ? (
            <div className="space-y-1">
              <Label>Recipient</Label>
              <ScrollArea className="h-36 border border-border rounded-md">
                <div className="p-1 space-y-1">
                  {users.slice(0, 200).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className={cn(
                        'w-full text-left rounded-md px-2 py-2 text-sm',
                        recipientId === u.id ? 'bg-primary/15' : 'hover:bg-muted/60'
                      )}
                      onClick={() => setRecipientId(u.id)}
                    >
                      <p className="font-medium truncate">{String(u.full_name || u.email || u.id)}</p>
                      <p className="text-xs text-muted-foreground truncate">{String(u.email || '')}</p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Audience Segment</Label>
              <div className="flex flex-wrap gap-2">
                {segments.map((s) => (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={segmentId === s.id ? 'default' : 'outline'}
                    onClick={() => setSegmentId(s.id)}
                  >
                    {s.label} ({s.count})
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="compose-subject">Subject</Label>
            <Input id="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="compose-body">Message</Label>
            <div className="flex items-center gap-2 pb-1">
              <Button
                type="button"
                size="sm"
                variant={editorMode === 'rich' ? 'default' : 'outline'}
                onClick={() => setEditorMode('rich')}
              >
                Rich Text
              </Button>
              <Button
                type="button"
                size="sm"
                variant={editorMode === 'plain' ? 'default' : 'outline'}
                onClick={() => setEditorMode('plain')}
              >
                Plain Text
              </Button>
            </div>
            {editorMode === 'rich' ? (
              <div className="rounded-md border border-border bg-background overflow-hidden">
                <ReactQuill
                  value={contentHtml}
                  onChange={setContentHtml}
                  theme="snow"
                  modules={{
                    toolbar: [
                      ['bold', 'italic', 'underline'],
                      [{ list: 'ordered' }, { list: 'bullet' }],
                      ['link'],
                      ['clean'],
                    ],
                  }}
                  placeholder="Write your campaign message…"
                />
              </div>
            ) : (
              <Textarea id="compose-body" value={content} onChange={(e) => setContent(e.target.value)} rows={8} maxLength={50000} />
            )}
          </div>
          <div className="space-y-1">
            <Label>Channel</Label>
            <div className="inline-flex rounded-lg border border-border p-1">
              {[
                { id: 'in_app', label: 'In-App' },
                { id: 'email', label: 'Email' },
                { id: 'both', label: 'Both' },
              ].map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={channel === c.id ? 'default' : 'ghost'}
                  onClick={() => setChannel(c.id)}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {sending ? 'Sending…' : mode === 'broadcast' ? 'Send / Schedule' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toPlainText(html) {
  const raw = String(html || '').trim();
  if (!raw) return '';
  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    const doc = new window.DOMParser().parseFromString(raw, 'text/html');
    return String(doc.body?.textContent || '').replace(/\s+\n/g, '\n').trim();
  }
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
