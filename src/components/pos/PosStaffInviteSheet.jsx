import { useEffect, useState } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { inviteCompanyMember } from "@/services/CompanyTeamService";
import { listPosRegisters } from "@/services/PosIntegrationService";
import CompanyTeamInviteResultDialog from "@/components/company/CompanyTeamInviteResultDialog";
import { POS_INVITE_SOURCE, POS_JOB_FUNCTION } from "@shared/posStaffInvite.js";
import { COMPANY_ROLES } from "@/lib/companyPermissions";

/**
 * Till-facing invite: employee + job_function pos, unique hashed till code, /pos/invite/:code.
 */
export default function PosStaffInviteSheet({ open, onOpenChange, defaultRegisterId, onCreated }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [registerId, setRegisterId] = useState(defaultRegisterId || "");
  const [registers, setRegisters] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [inviteNotice, setInviteNotice] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listPosRegisters()
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.registers) ? data.registers : [];
        const active = rows.filter((row) => row.status !== "disabled");
        setRegisters(active);
        setRegisterId((prev) => prev || defaultRegisterId || active[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setRegisters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, defaultRegisterId]);

  useEffect(() => {
    if (defaultRegisterId) setRegisterId(defaultRegisterId);
  }, [defaultRegisterId]);

  const resetForm = () => {
    setEmail("");
    setFullName("");
  };

  const selectedTill = registers.find((row) => row.id === registerId);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!registerId) {
      toast({
        variant: "destructive",
        title: "Till is required",
        description: "Assign this cashier to a till before creating the invite.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await inviteCompanyMember({
        email,
        fullName,
        role: COMPANY_ROLES.EMPLOYEE,
        jobFunction: POS_JOB_FUNCTION,
        source: POS_INVITE_SOURCE,
        registerId,
      });
      if (result.mode === "email_invite") {
        setInviteNotice({
          email: String(result.email || email).trim(),
          invitedName: fullName.trim() || null,
          inviteLink: result.invite_link || "",
          inviteCode: result.invite_code || null,
          registerName: result.register_name || selectedTill?.name || null,
          expiresAt: result.expires_at || null,
          emailSent: result.email_sent === true,
          emailError: result.email_error || null,
          posOnly: true,
        });
      } else {
        toast({
          title: "POS staff added",
          description: `${email} can sign in and use ${selectedTill?.name || "the assigned till"} only.`,
        });
      }
      resetForm();
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not invite staff",
        description: err?.message || String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-display text-xl">Invite POS staff</SheetTitle>
            <SheetDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">POS only</p>
                <p>
                  This person can use the assigned till only. They cannot access invoices, clients, reports, settings,
                  or the rest of Paidly.
                </p>
              </div>
            </SheetDescription>
          </SheetHeader>
          <form className="mt-6 flex flex-1 flex-col gap-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="pos-staff-email">Email</Label>
              <Input
                id="pos-staff-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cashier@example.com"
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-staff-name">Name</Label>
              <Input
                id="pos-staff-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John"
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-staff-register">Till</Label>
              <select
                id="pos-staff-register"
                required
                value={registerId}
                onChange={(e) => setRegisterId(e.target.value)}
                className="h-12 w-full rounded-input border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  Select a till
                </option>
                {registers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.company_name ? ` — ${row.company_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">Access: POS only</p>
            <Button
              type="submit"
              className="mt-auto h-12 touch-manipulation"
              disabled={submitting || !registerId}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Create till invite
            </Button>
          </form>
        </SheetContent>
      </Sheet>
      <CompanyTeamInviteResultDialog
        notice={inviteNotice}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setInviteNotice(null);
        }}
      />
    </>
  );
}
