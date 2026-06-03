import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { Paperclip, Trash2, ExternalLink } from "lucide-react";

export default function DocumentAttachmentsPanel({ attachments = [], onAdd, onRemove, busy = false }) {
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");

  const handleAdd = async () => {
    if (!fileName.trim() || !fileUrl.trim()) return;
    await onAdd?.({ file_name: fileName.trim(), file_url: fileUrl.trim() });
    setFileName("");
    setFileUrl("");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Add attachment</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Link a file by URL (cloud storage, shared drive, or signed link). Direct upload comes in a later phase.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="att-name">File name</Label>
            <Input
              id="att-name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Contract-v1.pdf"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="att-url">File URL</Label>
            <Input
              id="att-url"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
        <Button type="button" className="mt-3" size="sm" disabled={busy} onClick={handleAdd}>
          Add attachment
        </Button>
      </div>

      {!attachments.length ? (
        <EmptyState
          icon={<Paperclip className="h-6 w-6 text-muted-foreground" />}
          title="No attachments"
          description="Add supporting files, signed PDFs, or reference documents."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {attachments.map((att) => (
            <li key={att.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{att.file_name}</p>
                <a
                  href={att.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => onRemove?.(att.id)}
                aria-label="Remove attachment"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
