import { useEffect, useState } from "react";
import { Download, Loader2, PackageCheck, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DoneState from "@/components/shared/DoneState";
import { formatCurrency } from "@/components/CurrencySelector";
import { sendPurchaseOrderToSupplier } from "@/services/PurchaseOrderService";
import { purchaseOrderFinancials } from "@shared/procurement/purchaseOrderMath.js";
import { formatPoDate } from "./purchaseOrderDocumentModel";
import { defaultPurchaseOrderEmailMessage, purchaseOrderEmailSubject } from "./purchaseOrderEmail";

/**
 * Emails the PO PDF to the supplier with a short covering note (full order in the body only if the PDF
 * cannot be generated), then a Done state: sent, attached or not, and the next open loop.
 */
export default function SendPurchaseOrderDialog({
  open,
  onOpenChange,
  purchaseOrder,
  items,
  supplier,
  business,
  productsById,
  onDownload,
  getPdfElement,
  onReceive,
  onSent,
}) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  // One key per opened dialog: a retried Send never emails the supplier twice.
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    if (!open) return;
    setTo(supplier?.email || "");
    setMessage(defaultPurchaseOrderEmailMessage({ purchaseOrder, supplier, business }));
    setError("");
    setResult(null);
    setIdempotencyKey(`po-send:${purchaseOrder?.id || ""}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    // Reset only when the dialog opens for a PO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchaseOrder?.id]);

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await sendPurchaseOrderToSupplier({
        purchaseOrder,
        items,
        supplier,
        business,
        productsById,
        to,
        message,
        pdfElement: getPdfElement?.() || null,
        idempotencyKey,
      });
      setResult({ ...res, to: to.trim() });
      if (!res.demo) onSent?.(res.purchaseOrder);
    } catch (err) {
      setError(err?.message || "The email could not be sent. Check the address and try again.");
    } finally {
      setSending(false);
    }
  };

  const currency = purchaseOrder?.currency || "ZAR";
  const expected = formatPoDate(purchaseOrder?.expected_date);
  const f = purchaseOrderFinancials(purchaseOrder || {});
  // Next open loop: delivery while goods are outstanding, otherwise paying the supplier.
  const nextLoop =
    f.awaitingDelivery > 0
      ? {
          status: { label: "Delivery", value: expected ? `Expected ${expected}` : "Awaiting supplier confirmation", tone: "pending" },
          pending: "Receive the goods when they arrive, then record the supplier payment.",
        }
      : {
          status: {
            label: "Supplier balance",
            value: f.owed > 0 ? `${formatCurrency(f.owed, currency)} owed` : "Paid in full",
            tone: f.owed > 0 ? "pending" : "success",
          },
          pending: f.owed > 0 ? "Goods are in. Record the supplier payment when you pay." : null,
        };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[520px]">
        {result ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>Purchase order sent</DialogTitle>
              <DialogDescription>{purchaseOrder?.po_number}</DialogDescription>
            </DialogHeader>
            <DoneState
              variant="dialog"
              tone={result.demo || !result.attached ? "pending" : "success"}
              title={result.demo ? "Demo mode — not sent" : "Sent to supplier"}
              reference={{
                number: purchaseOrder?.po_number,
                counterparty: supplier?.name,
                amount: formatCurrency(purchaseOrder?.total_amount, currency),
              }}
              message={
                result.demo
                  ? "Demo workspaces never email real suppliers."
                  : result.attached
                    ? `Sent to ${result.to} with ${purchaseOrder?.po_number}.pdf attached.`
                    : `Sent to ${result.to}. The PDF could not be generated, so the full order was included in the email instead — download the PDF and forward it if your supplier needs the document.`
              }
              status={nextLoop.status}
              pending={nextLoop.pending}
              actions={[
                ...(onReceive ? [{ label: "Receive goods", icon: PackageCheck, onClick: onReceive }] : []),
                { label: "Download PDF", icon: Download, variant: "outline", onClick: onDownload },
                { label: "Done", variant: "ghost", onClick: () => onOpenChange(false) },
              ]}
            />
          </>
        ) : (
          <form onSubmit={handleSend}>
            <DialogHeader>
              <DialogTitle>Send {purchaseOrder?.po_number} to supplier</DialogTitle>
              <DialogDescription>
                Subject: {purchaseOrderEmailSubject(purchaseOrder, business)} · {purchaseOrder?.po_number}.pdf attached. The email adds the
                order total, expected delivery and a request to confirm.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="po-send-to">Supplier email</Label>
                <Input id="po-send-to" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="orders@supplier.co.za" />
                {!supplier?.email && (
                  <p className="text-xs text-muted-foreground">Tip: save an email on the supplier to prefill this next time.</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="po-send-message">Message</Label>
                <Textarea id="po-send-message" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending || !to.trim()} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Attaching PDF & sending…" : "Send purchase order"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
