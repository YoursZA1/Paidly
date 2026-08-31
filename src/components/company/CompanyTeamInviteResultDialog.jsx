import { Copy, Mail, CheckCircle } from "lucide-react";
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
import { isPosInviteUrl } from "@shared/posStaffInvite.js";

/**
 * @param {{
 *   notice: {
 *     email: string,
 *     inviteLink: string,
 *     emailSent: boolean,
 *     emailError?: string | null,
 *   } | null,
 *   onOpenChange: (open: boolean) => void,
 * }} props
 */
export default function CompanyTeamInviteResultDialog({ notice, onOpenChange }) {
  const open = notice != null;
  const posOnly = notice?.posOnly === true || isPosInviteUrl(notice?.inviteLink);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            {posOnly ? "POS invite created" : "Invitation ready"}
          </DialogTitle>
          <DialogDescription className="text-left">
            {posOnly
              ? "Share this secure link with the staff member. This link gives access to the POS only."
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
                    Email sent to <span className="font-medium">{notice.email}</span>. You can still copy the link as a
                    backup.
                  </span>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>
                  Email could not be sent
                  {notice.emailError ? `: ${notice.emailError}` : ""}. Copy the invite link below and send it to{" "}
                  {notice.email} manually.
                </AlertDescription>
              </Alert>
            )}
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Invite link</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <p className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 p-2 font-mono text-xs leading-relaxed">
                  {notice.inviteLink || "—"}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 gap-2"
                  disabled={!notice.inviteLink}
                  onClick={async () => {
                    if (!notice.inviteLink) return;
                    await navigator.clipboard.writeText(notice.inviteLink);
                    toast.success("Invite link copied");
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy link
                </Button>
              </div>
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
