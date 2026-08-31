import { Copy, Mail, CheckCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isPosInviteUrl } from "@shared/posStaffInvite.js";
import { buildPosTillInviteMessage, formatPosTillInviteCode } from "@shared/posTillInviteCode.js";

function formatExpiry(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

async function copyText(value, success) {
  if (!value) return;
  await navigator.clipboard.writeText(value);
  toast.success(success);
}

/**
 * @param {{
 *   notice: {
 *     email: string,
 *     inviteLink: string,
 *     emailSent: boolean,
 *     emailError?: string | null,
 *     posOnly?: boolean,
 *     inviteCode?: string | null,
 *     invitedName?: string | null,
 *     registerName?: string | null,
 *     expiresAt?: string | null,
 *     companyName?: string | null,
 *   } | null,
 *   onOpenChange: (open: boolean) => void,
 * }} props
 */
export default function CompanyTeamInviteResultDialog({ notice, onOpenChange }) {
  const open = notice != null;
  const posOnly = notice?.posOnly === true || isPosInviteUrl(notice?.inviteLink);
  const code = formatPosTillInviteCode(notice?.inviteCode) || notice?.inviteCode || "";
  const shareText = posOnly
    ? buildPosTillInviteMessage({
        companyName: notice?.companyName,
        tillName: notice?.registerName,
        inviteCode: code,
        inviteLink: notice?.inviteLink,
      })
    : notice?.inviteLink || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            {posOnly ? "Till invite created" : "Invitation ready"}
          </DialogTitle>
          <DialogDescription className="text-left">
            {posOnly
              ? "This code gives POS-only access to the assigned till."
              : `Share the secure link below with ${notice?.email || "your teammate"} so they can set a password and join your company workspace.`}
          </DialogDescription>
        </DialogHeader>
        {notice ? (
          <div className="space-y-4">
            {notice.emailSent ? (
              <Alert className="border-emerald-500/35 bg-emerald-500/[0.08] text-foreground">
                <AlertDescription className="flex items-start gap-2">
                  <Mail className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                  <span>
                    Email sent to <span className="font-medium">{notice.email}</span>. You can still copy the code or
                    link as a backup.
                  </span>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>
                  Email could not be sent
                  {notice.emailError ? `: ${notice.emailError}` : ""}. Copy the invite below and send it to{" "}
                  {notice.email} manually.
                </AlertDescription>
              </Alert>
            )}

            {posOnly ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Staff</dt>
                  <dd className="font-medium">{notice.invitedName || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="truncate font-medium">{notice.email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Till</dt>
                  <dd className="font-medium">{notice.registerName || "Assigned till"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Access</dt>
                  <dd className="font-medium">POS only</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd className="tabular-nums">{formatExpiry(notice.expiresAt)}</dd>
                </div>
              </dl>
            ) : null}

            {posOnly && code ? (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Invite code</p>
                <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.18em]">
                  {code}
                </p>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs text-muted-foreground">Invite link</p>
              <p className="min-w-0 break-all rounded-md border border-border bg-muted/40 p-2 font-mono text-xs leading-relaxed">
                {notice.inviteLink || "—"}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {posOnly && code ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11"
                  onClick={() => void copyText(code, "Invite code copied")}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy code
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                className="h-11"
                disabled={!notice.inviteLink}
                onClick={() => void copyText(notice.inviteLink, "Invite link copied")}
              >
                <Copy className="h-4 w-4" aria-hidden />
                Copy invite link
              </Button>
              <Button
                type="button"
                className="h-11"
                asChild
              >
                <a
                  href={`mailto:${encodeURIComponent(notice.email || "")}?subject=${encodeURIComponent(
                    "You're invited to Paidly POS"
                  )}&body=${encodeURIComponent(shareText)}`}
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  Send invite
                </a>
              </Button>
              {posOnly ? (
                <Button type="button" variant="outline" className="h-11" asChild>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    WhatsApp
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
