import { useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { workforceApi } from "@/services/WorkforceApiService";

function whenLabel(iso) {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString()} ${time}`;
}

/**
 * POS access for one employee (memberships.id). The access code is shown exactly once, right after
 * it is generated; afterwards only "••••••" and when it was last used.
 *
 * @param {{ access: object, onChange: (next: object) => void, compact?: boolean }} props
 *   access = pos_access row from the workforce API (pos_operators / pos_access_status)
 */
export default function PosOperatorAccessControls({ access, onChange, compact = false }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");
  const [shownCode, setShownCode] = useState(null);
  const [copied, setCopied] = useState(false);
  if (!access) return null;

  const id = access.membership_id;
  const disabled = access.pos_access_disabled || access.employee_disabled;
  const hasCode = access.code?.status === "active";
  const status = access.employee_disabled ? "Employee disabled" : access.pos_access_disabled ? "Disabled" : hasCode ? "Active" : "No code yet";

  const run = async (key, fn, title) => {
    if (busy) return null;
    setBusy(key);
    try {
      const data = await fn();
      if (data?.pos_access) onChange?.(data.pos_access);
      if (title) toast({ title });
      return data;
    } catch (err) {
      toast({ title: "POS access not updated", description: err?.message || "Try again", variant: "destructive" });
      return null;
    } finally {
      setBusy("");
    }
  };

  const generate = async () => {
    if (hasCode && !window.confirm(`Generate a new code for ${access.name}? Their current code stops working immediately and any open till session is locked.`)) return;
    const data = await run("generate", () => workforceApi.posCodeGenerate(id));
    if (data?.code) {
      setCopied(false);
      setShownCode(data.code);
    }
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd className="font-medium">{status}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd>POS Operator</dd>
        <dt className="text-muted-foreground">Access code</dt>
        <dd className="font-mono tracking-widest">{hasCode ? "••••••" : "—"}</dd>
        <dt className="text-muted-foreground">Register</dt>
        <dd>{access.code?.register_name || access.register_name || "Any till"}</dd>
        <dt className="text-muted-foreground">Last used</dt>
        <dd>{whenLabel(access.code?.last_used_at)}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        {!disabled ? (
          <Button size="sm" className="rounded-xl" disabled={Boolean(busy)} onClick={() => void generate()}>
            {busy === "generate" ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
            {hasCode ? "Generate new code" : "Generate code"}
          </Button>
        ) : null}
        {hasCode && !disabled ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            disabled={Boolean(busy)}
            onClick={() => {
              if (window.confirm(`Revoke ${access.name}'s code? They are locked out of the till until you generate a new one.`)) {
                void run("revoke", () => workforceApi.posCodeRevoke(id), "Code revoked");
              }
            }}
          >
            {busy === "revoke" ? "Revoking…" : "Revoke code"}
          </Button>
        ) : null}
        {!access.employee_disabled ? (
          access.pos_access_disabled ? (
            <Button size="sm" variant="outline" className="rounded-xl" disabled={Boolean(busy)} onClick={() => void run("enable", () => workforceApi.posAccessEnable(id), "POS access enabled")}>
              {busy === "enable" ? "Enabling…" : "Enable POS access"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="rounded-xl text-muted-foreground"
              disabled={Boolean(busy)}
              onClick={() => {
                if (window.confirm(`Disable POS access for ${access.name}? Their code is revoked and any open till session is locked.`)) {
                  void run("disable", () => workforceApi.posAccessDisable(id), "POS access disabled");
                }
              }}
            >
              {busy === "disable" ? "Disabling…" : "Disable POS access"}
            </Button>
          )
        ) : null}
      </div>

      <Dialog open={Boolean(shownCode)} onOpenChange={(open) => !open && setShownCode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>POS access code for {access.name}</DialogTitle>
            <DialogDescription>Shown once. Give it to {access.name} privately — Paidly can&apos;t show it again. Generate a new one if it&apos;s lost.</DialogDescription>
          </DialogHeader>
          <p className="py-2 text-center font-mono text-4xl font-bold tracking-[0.3em]" aria-live="polite">
            {shownCode}
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shownCode || "");
                  setCopied(true);
                } catch {
                  /* the code is on screen */
                }
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy code"}
            </Button>
            <Button type="button" className="w-full" onClick={() => setShownCode(null)}>
              I&apos;ve given it to them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
