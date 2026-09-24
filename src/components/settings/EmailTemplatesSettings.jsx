import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import FeatureGate from "@/components/subscription/FeatureGate";
import { fetchEmailTemplates, saveEmailTemplates } from "@/services/EmailTemplatesService";
import {
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_DOC_TYPES,
  EMAIL_TEMPLATE_LIMITS,
  EMAIL_TEMPLATE_PLACEHOLDERS,
} from "@shared/emailTemplates.js";

const LABEL = { invoice: "Invoice email", quote: "Quote email" };

function Editor() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() =>
    Object.fromEntries(EMAIL_TEMPLATE_DOC_TYPES.map((t) => [t, { subject: "", message: "" }]))
  );

  useEffect(() => {
    let cancelled = false;
    fetchEmailTemplates()
      .then(({ templates }) => {
        if (cancelled) return;
        setForm(
          Object.fromEntries(
            EMAIL_TEMPLATE_DOC_TYPES.map((t) => [
              t,
              { subject: templates?.[t]?.subject || "", message: templates?.[t]?.message || "" },
            ])
          )
        );
      })
      .catch((err) => toast({ title: "Could not load email templates", description: err.message, variant: "destructive" }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const update = (type, field, value) => setForm((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }));

  const save = async () => {
    setSaving(true);
    try {
      await saveEmailTemplates(form);
      toast({ title: "Email templates saved" });
    } catch (err) {
      toast({ title: "Could not save email templates", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Used to prefill the email when you send an invoice or quote. Leave a field empty to use Paidly&apos;s default.
        Placeholders:{" "}
        {EMAIL_TEMPLATE_PLACEHOLDERS.map((p, i) => (
          <span key={p.key}>
            <code className="rounded bg-muted px-1 text-xs">{`{${p.key}}`}</code> {p.label.toLowerCase()}
            {i < EMAIL_TEMPLATE_PLACEHOLDERS.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
      {EMAIL_TEMPLATE_DOC_TYPES.map((type) => (
        <div key={type} className="space-y-3 rounded-xl border border-border p-4">
          <h4 className="font-semibold">{LABEL[type]}</h4>
          <div className="space-y-2">
            <Label htmlFor={`${type}-subject`}>Subject</Label>
            <Input
              id={`${type}-subject`}
              value={form[type].subject}
              maxLength={EMAIL_TEMPLATE_LIMITS.subject}
              placeholder={DEFAULT_EMAIL_TEMPLATES[type].subject}
              disabled={loading}
              onChange={(e) => update(type, "subject", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${type}-message`}>Message</Label>
            <Textarea
              id={`${type}-message`}
              rows={6}
              value={form[type].message}
              maxLength={EMAIL_TEMPLATE_LIMITS.message}
              placeholder={DEFAULT_EMAIL_TEMPLATES[type].message}
              disabled={loading}
              onChange={(e) => update(type, "message", e.target.value)}
            />
          </div>
        </div>
      ))}
      <Button onClick={save} disabled={loading || saving} className="rounded-xl">
        {saving ? "Saving…" : "Save templates"}
      </Button>
    </div>
  );
}

/** Business+ (plan feature email_templates); Starter sees the locked / upgrade state. */
export default function EmailTemplatesSettings() {
  return (
    <FeatureGate feature="email_templates">
      <Editor />
    </FeatureGate>
  );
}
