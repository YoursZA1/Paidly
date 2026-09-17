import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { workforceApi } from "@/services/WorkforceApiService";
import { listPosRegisters } from "@/services/PosIntegrationService";
import { PORTAL_STATUS, portalStatusLabel } from "@shared/workforce/portalAccess.js";
import { posAccessPath, posTillPath } from "@shared/posStaffInvite.js";
import { useToast } from "@/components/ui/use-toast";

/**
 * Admin Overview — Employee Portal and POS Access as separate experiences
 * on one memberships.id identity.
 */
export default function EmployeePortalAccessPanel({ employee, canManage, onUpdated }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");
  const posEnabled = Boolean(employee?.pos_access);
  const tillId = employee?.pos_register_id || "";
  const [tillName, setTillName] = useState(employee?.pos_register_name || "");

  useEffect(() => {
    if (!posEnabled || !tillId || employee?.pos_register_name) {
      setTillName(employee?.pos_register_name || "");
      return undefined;
    }
    let cancelled = false;
    listPosRegisters()
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows?.registers) ? rows.registers : Array.isArray(rows) ? rows : [];
        const match = list.find((row) => row.id === tillId);
        setTillName(match?.name || "");
      })
      .catch(() => {
        if (!cancelled) setTillName("");
      });
    return () => {
      cancelled = true;
    };
  }, [posEnabled, tillId, employee?.pos_register_name]);

  if (!employee?.id || !canManage) return null;

  const status = String(employee.portal_status || PORTAL_STATUS.NOT_ACTIVATED).toLowerCase();
  const statusLabel = employee.portal_status_label || portalStatusLabel(status);
  const pinSet = Boolean(employee.pos_pin_set);

  const run = async (key, fn, successTitle) => {
    if (busy) return null;
    setBusy(key);
    try {
      const data = await fn();
      toast({ title: successTitle });
      onUpdated?.(data?.employee || data);
      return data;
    } catch (err) {
      toast({
        title: "Could not update access",
        description: err?.message || "Try again",
        variant: "destructive",
      });
      return null;
    } finally {
      setBusy("");
    }
  };

  const copyText = async (text, title) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title });
    } catch {
      toast({ title: "Copy this link", description: text });
    }
  };

  const copyPortalLink = async () => {
    const data = await run("link", () => workforceApi.portalLink(employee.id), "Link ready");
    const link = data?.invite_link;
    if (!link) return;
    await copyText(
      link,
      status === PORTAL_STATUS.ACTIVATED ? "Portal link copied" : "Activation link copied"
    );
  };

  const copyPosLink = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = tillId ? posTillPath(tillId, origin) : posAccessPath(origin);
    await copyText(link, "POS link copied");
  };

  const portalActions = (() => {
    if (status === PORTAL_STATUS.ACTIVATED) {
      return (
        <Button size="sm" variant="outline" className="rounded-xl" disabled={Boolean(busy)} onClick={() => void copyPortalLink()}>
          {busy === "link" ? "Copying…" : "Copy Portal Link"}
        </Button>
      );
    }
    if (status === PORTAL_STATUS.INVITATION_SENT) {
      return (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="rounded-xl" disabled={Boolean(busy)} onClick={() => void copyPortalLink()}>
            {busy === "link" ? "Copying…" : "Copy Activation Link"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            disabled={Boolean(busy)}
            onClick={() => void run("resend", () => workforceApi.portalResend(employee.id), "Invite resent")}
          >
            {busy === "resend" ? "Sending…" : "Resend Invite"}
          </Button>
        </div>
      );
    }
    if (status === PORTAL_STATUS.EXPIRED) {
      return (
        <Button
          size="sm"
          className="rounded-xl"
          disabled={Boolean(busy)}
          onClick={() => void run("invite", () => workforceApi.portalResend(employee.id), "New invite sent")}
        >
          {busy === "invite" ? "Sending…" : "Send New Invite"}
        </Button>
      );
    }
    if (status === PORTAL_STATUS.REVOKED) {
      return (
        <Button
          size="sm"
          className="rounded-xl"
          disabled={Boolean(busy)}
          onClick={() => void run("invite", () => workforceApi.portalInvite(employee.id), "Portal invite sent")}
        >
          {busy === "invite" ? "Sending…" : "Restore / Send Invite"}
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        className="rounded-xl"
        disabled={Boolean(busy)}
        onClick={() => void run("invite", () => workforceApi.portalInvite(employee.id), "Portal invite sent")}
      >
        {busy === "invite" ? "Sending…" : "Send Portal Invite"}
      </Button>
    );
  })();

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Employee Portal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium text-foreground">{statusLabel}</span>
          </div>
          <p className="text-muted-foreground">
            Profile, payslips, leave, and documents. Separate from POS.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {portalActions}
            {(status === PORTAL_STATUS.ACTIVATED || status === PORTAL_STATUS.INVITATION_SENT) && (
              <Button
                size="sm"
                variant="ghost"
                className="rounded-xl text-muted-foreground"
                disabled={Boolean(busy)}
                onClick={() => void run("revoke", () => workforceApi.portalRevoke(employee.id), "Portal access revoked")}
              >
                {busy === "revoke" ? "Revoking…" : "Revoke"}
              </Button>
            )}
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
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium text-foreground">Enabled</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Assigned Till</span>
                <span className="font-medium text-foreground">{tillName || (tillId ? "Assigned till" : "Not assigned")}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">PIN</span>
                <span className="font-medium text-foreground">
                  {pinSet ? (employee.pos_pin_locked ? "Locked" : "Set") : "Not Set"}
                </span>
              </div>
              <p className="text-muted-foreground">
                Opens Paidly POS (/pos). Does not open Employee Portal.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void copyPosLink()}>
                  Copy POS Link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  disabled={Boolean(busy) || !pinSet}
                  onClick={() => void run("pin", () => workforceApi.resetPosPin(employee.id), "POS PIN reset")}
                >
                  {busy === "pin" ? "Resetting…" : "Reset POS PIN"}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Not enabled for this employee.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
