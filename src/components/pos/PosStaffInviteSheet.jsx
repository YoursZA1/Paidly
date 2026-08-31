import { useState } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { inviteCompanyMember } from "@/services/CompanyTeamService";
import CompanyTeamInviteResultDialog from "@/components/company/CompanyTeamInviteResultDialog";
import { POS_INVITE_SOURCE, POS_JOB_FUNCTION } from "@shared/posStaffInvite.js";
import { COMPANY_ROLES } from "@/lib/companyPermissions";

/**
 * Till-facing invite: employee + job_function pos, shareable /invite?next=POS link.
 * Callers must already have MANAGE_EMPLOYEES (cashiers cannot invite).
 */
export default function PosStaffInviteSheet({ open, onOpenChange }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviteNotice, setInviteNotice] = useState(null);

  const resetForm = () => {
    setEmail("");
    setFullName("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await inviteCompanyMember({
        email,
        fullName,
        role: COMPANY_ROLES.EMPLOYEE,
        jobFunction: POS_JOB_FUNCTION,
        source: POS_INVITE_SOURCE,
      });
      if (result.mode === "email_invite") {
        setInviteNotice({
          email: String(result.email || email).trim(),
          inviteLink: result.invite_link || "",
          emailSent: result.email_sent === true,
          emailError: result.email_error || null,
        });
      } else {
        toast({
          title: "POS staff added",
          description: `${email} can sign in and use the till only.`,
        });
      }
      resetForm();
      onOpenChange(false);
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
            <SheetDescription>
              They join as POS staff — till only, not invoices or the rest of Paidly. Share the
              special link on this screen after you invite.
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
              <Label htmlFor="pos-staff-name">Name (optional)</Label>
              <Input
                id="pos-staff-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Till name"
                className="h-12"
              />
            </div>
            <Button type="submit" className="mt-auto h-12 touch-manipulation" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Create invite link
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
