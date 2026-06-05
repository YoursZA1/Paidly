import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Send, Clock } from "lucide-react";
import { typeLabel } from "@/document-engine";

function toLocalDatetimeValue(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function defaultScheduledAt() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toLocalDatetimeValue(d);
}

/**
 * Send-to-client modal with "Send Now" and "Schedule Send" tabs.
 *
 * onSend receives:
 *  { recipient_name, recipient_email, subject, message,
 *    include_pdf, include_branding, scheduled_at? }
 */
export default function DocumentSendModal({
  open,
  onOpenChange,
  doc,
  defaultRecipientEmail = "",
  defaultRecipientName = "",
  onSend,
}) {
  const docTypeLabel = typeLabel(doc?.type) || "Document";

  const [tab, setTab] = useState("now");
  const [recipientName, setRecipientName] = useState(defaultRecipientName);
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail);
  const [subject, setSubject] = useState(
    () => (doc?.title ? `${docTypeLabel}: ${doc.title}` : docTypeLabel)
  );
  const [message, setMessage] = useState(
    "Please find the attached document. Do not hesitate to reach out if you have any questions."
  );
  const [attachPdf, setAttachPdf] = useState(true);
  const [includeBranding, setIncludeBranding] = useState(true);
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt);
  const [sending, setSending] = useState(false);

  const canSend = Boolean(recipientEmail.trim());
  const canSchedule =
    canSend && Boolean(scheduledAt) && new Date(scheduledAt) > new Date();

  const buildPayload = (scheduled = false) => ({
    recipient_name: recipientName.trim() || null,
    recipient_email: recipientEmail.trim(),
    subject: subject.trim() || null,
    message: message.trim() || null,
    include_pdf: attachPdf,
    include_branding: includeBranding,
    ...(scheduled && scheduledAt
      ? { scheduled_at: new Date(scheduledAt).toISOString() }
      : {}),
  });

  const handleSendNow = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend?.(buildPayload(false));
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  const handleSchedule = async () => {
    if (!canSchedule) return;
    setSending(true);
    try {
      await onSend?.(buildPayload(true));
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  /* Shared form fields rendered in both tabs */
  const sharedFields = (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="send-name">Recipient Name</Label>
          <Input
            id="send-name"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Client name"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="send-email">
            Recipient Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="send-email"
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="client@example.com"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="send-subject">Subject</Label>
        <Input
          id="send-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="send-message">Message</Label>
        <Textarea
          id="send-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Optional message to include in the email…"
        />
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium leading-none">Attach PDF</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Include a PDF copy of this document
            </p>
          </div>
          <Switch checked={attachPdf} onCheckedChange={setAttachPdf} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium leading-none">
              Include Company Branding
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use your logo and brand colors
            </p>
          </div>
          <Switch
            checked={includeBranding}
            onCheckedChange={setIncludeBranding}
          />
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send to Client</DialogTitle>
          <DialogDescription>
            Send this {docTypeLabel.toLowerCase()} to your client via email.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="now" className="flex-1 gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Send Now
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex-1 gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Schedule Send
            </TabsTrigger>
          </TabsList>

          <TabsContent value="now" className="mt-0 space-y-0">
            <div className="space-y-4 py-1">{sharedFields}</div>
            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendNow} disabled={sending || !canSend}>
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Now
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="schedule" className="mt-0 space-y-0">
            <div className="space-y-4 py-1">
              {sharedFields}

              <div className="space-y-2">
                <Label htmlFor="send-scheduled-at">
                  Send at <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="send-scheduled-at"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={toLocalDatetimeValue(new Date())}
                />
                <p className="text-xs text-muted-foreground">
                  The email will be queued and delivered at the chosen time.
                </p>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSchedule}
                disabled={sending || !canSchedule}
              >
                {sending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Clock className="mr-2 h-4 w-4" />
                )}
                Schedule Send
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
