import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import useCompanyContext from "@/hooks/useCompanyContext";
import { createPageUrl } from "@/utils";
import { getPosPinStatus, setPosPin } from "@/services/PosPinService";
import { membershipIsPosEnabled } from "@shared/posStaffInvite.js";

/**
 * Employee portal POS settings only (PIN). Shift entry stays on /pos — separate from portal.
 */
export default function WorkforcePosPanel() {
  const { toast } = useToast();
  const { ctx } = useCompanyContext();
  const posEnabled = membershipIsPosEnabled(ctx);
  const [status, setStatus] = useState(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!posEnabled) return;
    let cancelled = false;
    getPosPinStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ pos_pin_set: false, pos_pin_locked: false });
      });
    return () => {
      cancelled = true;
    };
  }, [posEnabled]);

  if (!posEnabled) {
    return (
      <Card className="rounded-xl">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          POS is not enabled for your role.
        </CardContent>
      </Card>
    );
  }

  const savePin = async () => {
    if (busy) return;
    setBusy("pin");
    try {
      const data = await setPosPin({
        pin,
        confirm_pin: confirmPin,
        current_pin: status?.pos_pin_set ? currentPin : undefined,
      });
      setStatus(data);
      setPin("");
      setConfirmPin("");
      setCurrentPin("");
      toast({ title: status?.pos_pin_set ? "POS PIN updated" : "POS PIN created" });
    } catch (err) {
      toast({
        title: "Could not save POS PIN",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">POS PIN</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Your POS PIN authenticates you on the till. It is separate from your Employee Portal password.
          </p>
          {status?.pos_pin_locked ? (
            <p className="text-amber-800 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
              POS PIN is temporarily locked after too many failed attempts.
            </p>
          ) : null}
          {status?.pos_pin_set ? (
            <div className="space-y-2">
              <Label>Current PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>{status?.pos_pin_set ? "New PIN" : "Create PIN"}</Label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Confirm PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
            />
          </div>
          <Button size="sm" className="rounded-xl" disabled={Boolean(busy)} onClick={() => void savePin()}>
            {busy === "pin" ? "Saving…" : status?.pos_pin_set ? "Change PIN" : "Create PIN"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">POS Terminal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Open the POS app to enter your PIN, start a shift, and use your assigned till. This stays separate from
            Employee Portal.
          </p>
          <Button size="sm" className="rounded-xl" asChild>
            <Link to={createPageUrl("POS")}>Open POS</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
