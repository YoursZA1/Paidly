import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ManualShareModal from "@/components/shared/ManualShareModal";
import { Invoice, Quote } from "@/api/entities";
import { createPageUrl } from "@/utils";

/**
 * Ensures a public share token, builds the client-facing URL, then reuses ManualShareModal for copy + email.
 * After an email is sent, a draft is marked sent (same rule as the invoice/quote lists) and the modal
 * shows the "sent" Done State.
 */
export default function SendEmailDialog({ open, onOpenChange, docType, record, client = null, onRecordUpdate, doneActions = null }) {
  const [shareUrl, setShareUrl] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const onRecordUpdateRef = useRef(onRecordUpdate);
  onRecordUpdateRef.current = onRecordUpdate;

  useEffect(() => {
    if (!open) {
      setShareUrl("");
      setError("");
      return;
    }
    if (!record?.id) {
      setError("Missing document.");
      return;
    }

    let cancelled = false;
    (async () => {
      setPreparing(true);
      setError("");
      try {
        let token = record.public_share_token;
        if (!token) {
          token = crypto.randomUUID();
          if (docType === "invoice") {
            await Invoice.update(record.id, { public_share_token: token });
          } else {
            await Quote.update(record.id, { public_share_token: token });
          }
          onRecordUpdateRef.current?.({ public_share_token: token });
        }
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const url =
          docType === "invoice"
            ? `${origin}/view/${token}`
            : `${origin}${createPageUrl(`PublicQuote?token=${token}`)}`;
        if (!cancelled) setShareUrl(url);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Could not prepare share link.");
        }
      } finally {
        if (!cancelled) setPreparing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, docType, record?.id, record?.public_share_token]);

  const itemType = docType === "quote" ? "quote" : "invoice";

  const markSent = async (sentToEmail) => {
    if (!record?.id) return;
    const updates = {};
    if (docType === "invoice") updates.sent_to_email = sentToEmail;
    if (String(record.status || "").toLowerCase() === "draft") {
      updates.status = "sent";
      // sent_date exists on quotes only (20260418180000_quotes_sent_date.sql).
      if (docType === "quote") updates.sent_date = new Date().toISOString();
    }
    if (!Object.keys(updates).length) return;
    if (docType === "invoice") await Invoice.update(record.id, updates);
    else await Quote.update(record.id, updates);
    onRecordUpdateRef.current?.(updates);
  };

  if (!open) return null;

  if (error) {
    return (
      <Dialog open onOpenChange={() => onOpenChange(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Email</DialogTitle>
            <DialogDescription className="text-destructive">{error}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  if (preparing || !shareUrl) {
    return (
      <Dialog open onOpenChange={() => onOpenChange(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Preparing link…</DialogTitle>
            <DialogDescription>One moment while we generate a secure link for your client.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ManualShareModal
      isOpen
      onClose={() => onOpenChange(false)}
      shareUrl={shareUrl}
      itemType={itemType}
      invoice={docType === "invoice" ? record : undefined}
      document={record}
      client={client}
      onMarkAsSent={markSent}
      doneActions={doneActions}
    />
  );
}
