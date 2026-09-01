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
import { isPosInviteUrl, posAccessPath, posTillPath } from "@shared/posStaffInvite.js";
import { buildPosTillInviteMessage, formatPosTillInviteCode } from "@shared/posTillInviteCode.js";
import { JOB_FUNCTION_LABELS } from "@/lib/companyJobFunctions";
import { COMPANY_ROLE_LABELS } from "@/lib/companyPermissions";

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

function roleLabel(role) {
  const key = String(role || "").toLowerCase();
  return COMPANY_ROLE_LABELS[key] || role || "Employee";
}

function functionLabel(jobFunction, posOnly) {
  if (posOnly) return "POS only";
  const key = String(jobFunction || "").toLowerCase();
  return JOB_FUNCTION_LABELS[key] || jobFunction || "—";
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
 *     role?: string | null,
 *     jobFunction?: string | null,
 *     inviteId?: string | null,
 *     reused?: boolean,
 *     retrying?: boolean,
 *   } | null,
 *   onOpenChange: (open: boolean) => void,
 *   onRetryEmail?: () => void | Promise<void>,
 * }} props
 */
export default function CompanyTeamInviteResultDialog({ notice, onOpenChange, onRetryEmail }) {
  const open = notice != null;
  const posOnly = notice?.posOnly === true || isPosInviteUrl(notice?.inviteLink);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.paidly.co.za";
  const posAccessUrl = notice?.registerId
    ? posTillPath(notice.registerId, origin)
    : posAccessPath(origin);
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
            Invitation created
          </DialogTitle>
          <DialogDescription className="text-left">
            {notice?.reused
              ? "A pending invitation already exists for this email. Use the same link below."
              : posOnly
                ? "This employee can use the POS but cannot access the rest of Paidly."
                : `Share the secure link with ${notice?.email || "your teammate"} so they can join your business.`}
          </DialogDescription>
        </DialogHeader>
        {notice ? (
          <div className="space-y-4">
            {notice.emailSent ? (
              <Alert className="border-emerald-500/35 bg-emerald-500/[0.08] text-foreground">
                <AlertDescription className="flex items-start gap-2">
                  <Mail className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                  <span>
                    Invitation sent successfully to <span className="font-medium">{notice.email}</span>.
                    The invite link is still available to copy.
                  </span>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>
                  Invitation created, but email could not be sent
                  {notice.emailError ? `: ${notice.emailError}` : ""}. Copy the invite link and send it
                  manually.
                </AlertDescription>
              </Alert>
            )}

            <dl className="space-y-2 text-sm">
              {notice.invitedName ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="font-medium">{notice.invitedName}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate font-medium">{notice.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium">{roleLabel(notice.role)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Function</dt>
                <dd className="font-medium">{functionLabel(notice.jobFunction, posOnly)}</dd>
              </div>
              {posOnly || notice.registerName ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Till</dt>
                  <dd className="font-medium">{notice.registerName || "Assigned till"}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">Pending</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Expires</dt>
                <dd className="tabular-nums">{formatExpiry(notice.expiresAt)}</dd>
              </div>
            </dl>

            {posOnly && code ? (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Backup device code
                </p>
                <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.18em]">
                  {code}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Staff should open the invitation link. Use this code only to activate a device at{" "}
                  <span className="font-mono">/pos/join</span>.
                </p>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs text-muted-foreground">Invite link</p>
              <p className="min-w-0 break-all rounded-md border border-border bg-muted/40 p-2 font-mono text-xs leading-relaxed">
                {notice.inviteLink || "—"}
              </p>
            </div>

            {posOnly ? (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  {notice.registerId ? "Till URL (after they activate)" : "POS access (after they activate)"}
                </p>
                <p className="min-w-0 break-all rounded-md border border-border bg-muted/40 p-2 font-mono text-xs leading-relaxed">
                  {posAccessUrl}
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              {posOnly ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11"
                  onClick={() => void copyText(posAccessUrl, "POS access link copied")}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy POS access
                </Button>
              ) : null}
              {onRetryEmail ? (
                <Button
                  type="button"
                  className="h-11"
                  disabled={notice.retrying === true}
                  onClick={() => void onRetryEmail()}
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  {notice.emailSent ? "Send again" : "Retry email"}
                </Button>
              ) : (
                <Button type="button" className="h-11" asChild>
                  <a
                    href={`mailto:${encodeURIComponent(notice.email || "")}?subject=${encodeURIComponent(
                      posOnly ? "You're invited to Paidly POS" : "You're invited to Paidly"
                    )}&body=${encodeURIComponent(shareText)}`}
                  >
                    <Mail className="h-4 w-4" aria-hidden />
                    Send invite
                  </a>
                </Button>
              )}
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
              {posOnly && code ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => void copyText(code, "Invite code copied")}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy backup code
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
