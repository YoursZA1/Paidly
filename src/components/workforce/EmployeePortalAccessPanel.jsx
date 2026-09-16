import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { workforceApi } from "@/services/WorkforceApiService";
import { PORTAL_STATUS, portalStatusLabel } from "@shared/workforce/portalAccess.js";
import { useToast } from "@/components/ui/use-toast";

function statusDotClass(status) {
  if (status === PORTAL_STATUS.ACTIVATED) return "bg-emerald-500";
  if (status === PORTAL_STATUS.INVITATION_SENT) return "bg-amber-500";
  if (status === PORTAL_STATUS.REVOKED) return "bg-rose-500";
  return "bg-slate-400";
}

/**
 * Admin Portal Access + POS Access controls on the employee profile.
 */
export default function EmployeePortalAccessPanel({ employee, canManage, onUpdated }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");
  if (!employee?.id || !canManage) return null;

  const status = employee.portal_status || PORTAL_STATUS.NOT_INVITED;
  const statusLabel = employee.portal_status_label || portalStatusLabel(status);
  const posEnabled = Boolean(employee.pos_access);

  const run = async (key, fn, successTitle) => {
    if (busy) return;
    setBusy(key);
    try {
      const data = await fn();
      toast({ title: successTitle });
      onUpdated?.(data?.employee || data);
      return data;
    } catch (err) {
      toast({
        title: "Could not update portal access",
        description: err?.message || "Try again",
        variant: "destructive",
      });
      return null;
    } finally {
      setBusy("");
    }
  };

  const copyLink = async () => {
    const data = await run("link", () => workforceApi.portalLink(employee.id), "Portal link ready");
    const link = data?.invite_link;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Portal link copied" });
    } catch {
      toast({ title: "Copy this link", description: link });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 mt-4">
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Portal Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotClass(status)}`} />
            <span>{statusLabel}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {status === PORTAL_STATUS.NOT_INVITED || status === PORTAL_STATUS.REVOKED ? (
              <Button
                size="sm"
                className="rounded-xl"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run("invite", () => workforceApi.portalInvite(employee.id), "Portal invite sent")
                }
              >
                {busy === "invite" ? "Sending…" : "Send Invite"}
              </Button>
            ) : null}
            {status === PORTAL_STATUS.INVITATION_SENT ? (
              <>
                <Button
                  size="sm"
                  className="rounded-xl"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run("resend", () => workforceApi.portalResend(employee.id), "Invite resent")
                  }
                >
                  {busy === "resend" ? "Sending…" : "Resend Invite"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  disabled={Boolean(busy)}
                  onClick={() => void copyLink()}
                >
                  {busy === "link" ? "Copying…" : "Copy Link"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run("revoke", () => workforceApi.portalRevoke(employee.id), "Portal access revoked")
                  }
                >
                  {busy === "revoke" ? "Revoking…" : "Revoke"}
                </Button>
              </>
            ) : null}
            {status === PORTAL_STATUS.ACTIVATED ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  disabled={Boolean(busy)}
                  onClick={() => void copyLink()}
                >
                  {busy === "link" ? "Copying…" : "Copy Portal Link"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run("revoke", () => workforceApi.portalRevoke(employee.id), "Portal access revoked")
                  }
                >
                  {busy === "revoke" ? "Revoking…" : "Revoke Access"}
                </Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">POS Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {posEnabled ? (
            <>
              <p className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>Enabled{employee.pos_pin_set ? " · PIN set" : " · PIN not set"}</span>
              </p>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={Boolean(busy) || !employee.pos_pin_set}
                onClick={() =>
                  void run("pin", () => workforceApi.resetPosPin(employee.id), "POS PIN reset")
                }
              >
                {busy === "pin" ? "Resetting…" : "Reset POS PIN"}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">Not enabled</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
