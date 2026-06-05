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
import { Loader2, PenLine, Plus, Trash2 } from "lucide-react";
import { typeLabel } from "@/document-engine";

function newSigner() {
  return { id: crypto.randomUUID(), name: "", email: "" };
}

/**
 * Send-for-signature modal — collects one or more signers in order.
 * Calls onRequestSignature({ signers: [{ signer_name, signer_email, signing_order }] })
 */
export default function DocumentSignatureModal({
  open,
  onOpenChange,
  doc,
  onRequestSignature,
}) {
  const docTypeLabel = typeLabel(doc?.type) || "document";

  const [signers, setSigners] = useState(() => [newSigner()]);
  const [submitting, setSubmitting] = useState(false);

  const addSigner = () => setSigners((prev) => [...prev, newSigner()]);

  const removeSigner = (id) =>
    setSigners((prev) => prev.filter((s) => s.id !== id));

  const updateSigner = (id, field, value) =>
    setSigners((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );

  const handleSubmit = async () => {
    const valid = signers.filter((s) => s.email.trim());
    if (!valid.length) return;
    setSubmitting(true);
    try {
      await onRequestSignature?.({
        signers: valid.map((s, i) => ({
          signer_name: s.name.trim() || null,
          signer_email: s.email.trim(),
          signing_order: i + 1,
        })),
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = signers.some((s) => s.email.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send for Signature</DialogTitle>
          <DialogDescription>
            Request e-signatures on this {docTypeLabel.toLowerCase()}. Signers
            will receive a link by email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-3">
            {signers.map((signer, index) => (
              <div
                key={signer.id}
                className="rounded-lg border border-border p-3"
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Signer {index + 1}
                  </span>
                  {signers.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeSigner(signer.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Name (optional)"
                    value={signer.name}
                    onChange={(e) =>
                      updateSigner(signer.id, "name", e.target.value)
                    }
                    autoComplete="off"
                  />
                  <Input
                    type="email"
                    placeholder="Email *"
                    value={signer.email}
                    onChange={(e) =>
                      updateSigner(signer.id, "email", e.target.value)
                    }
                    autoComplete="off"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={addSigner}
          >
            <Plus className="h-4 w-4" />
            Add Another Signer
          </Button>

          <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            Signers will be notified in the order listed. Each signer must
            complete their signature before the next receives their request.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !canSubmit}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PenLine className="mr-2 h-4 w-4" />
            )}
            Send for Signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
