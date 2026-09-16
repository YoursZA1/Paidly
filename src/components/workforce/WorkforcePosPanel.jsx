import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import useCompanyContext from "@/hooks/useCompanyContext";
import { createPageUrl } from "@/utils";
import { openPosSession, listPosRegisters } from "@/services/PosIntegrationService";
import { getPosPinStatus, setPosPin } from "@/services/PosPinService";
import { membershipIsPosEnabled } from "@shared/posStaffInvite.js";

/**
 * Employee portal POS section: PIN settings + start shift (reuses existing POS APIs).
 */
export default function WorkforcePosPanel() {
  const { toast } = useToast();
  const { ctx } = useCompanyContext();
  const posEnabled = membershipIsPosEnabled(ctx);
  const [status, setStatus] = useState(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [shiftPin, setShiftPin] = useState("");
  const [registers, setRegisters] = useState([]);
  const [registerId, setRegisterId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
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
    listPosRegisters()
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows?.registers) ? rows.registers : Array.isArray(rows) ? rows : [];
        setRegisters(list);
        const assigned = ctx?.posRegisterId || list[0]?.id || "";
        setRegisterId(assigned);
        const match = list.find((row) => row.id === assigned);
        if (match?.opening_balance != null) setOpeningBalance(String(match.opening_balance));
      })
      .catch(() => {
        if (!cancelled) setRegisters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [posEnabled, ctx?.posRegisterId]);

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

  const startShift = async () => {
    if (busy) return;
    setBusy("shift");
    try {
      await openPosSession({
        register_id: registerId,
        opening_balance: Number(openingBalance) || 0,
        pos_pin: shiftPin,
      });
      setShiftPin("");
      toast({ title: "Shift started" });
    } catch (err) {
      toast({
        title: "Could not start shift",
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
            Your POS PIN is separate from your Paidly password. Use it to start a shift.
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
          <CardTitle className="text-base">Start Shift</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            <Label>Register</Label>
            <select
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={registerId}
              onChange={(e) => setRegisterId(e.target.value)}
              disabled={Boolean(ctx?.posRegisterId)}
            >
              {registers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name || row.id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Opening balance</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>POS PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={shiftPin}
              onChange={(e) => setShiftPin(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="rounded-xl"
              disabled={Boolean(busy) || !registerId}
              onClick={() => void startShift()}
            >
              {busy === "shift" ? "Starting…" : "Start Shift"}
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" asChild>
              <Link to={createPageUrl("POS")}>Open till</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
