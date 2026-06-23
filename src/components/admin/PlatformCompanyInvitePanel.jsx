import { useState } from "react";
import { Building2, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { platformInviteCompanyAdmin } from "@/services/CompanyInvitesService";
import CompanyTeamInviteResultDialog from "@/components/company/CompanyTeamInviteResultDialog";

/**
 * Platform admin panel: invite company admins to new or existing companies.
 */
export default function PlatformCompanyInvitePanel() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState("admin");
  const [pending, setPending] = useState(false);
  const [inviteNotice, setInviteNotice] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Email is required");
      return;
    }
    if (!companyId.trim() && !companyName.trim()) {
      toast.error("Enter a company name (new company) or company ID (existing)");
      return;
    }

    setPending(true);
    try {
      const result = await platformInviteCompanyAdmin({
        email: trimmedEmail,
        fullName: fullName.trim(),
        companyId: companyId.trim() || undefined,
        companyName: companyName.trim() || undefined,
        role,
      });

      if (result.mode === "email_invite") {
        setInviteNotice({
          email: trimmedEmail,
          inviteLink: result.invite_link || result.auth_invite_link || "",
          emailSent: result.email_sent === true,
          emailError: result.email_error || null,
        });
        toast.success("Company invite sent");
      } else {
        toast.success("User added to company");
      }

      setEmail("");
      setFullName("");
      if (!companyId.trim()) setCompanyName("");
    } catch (err) {
      toast.error(err?.message || "Invite failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <CompanyTeamInviteResultDialog
        notice={inviteNotice}
        onOpenChange={(open) => {
          if (!open) setInviteNotice(null);
        }}
      />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Invite company admin
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Platform admins can onboard new companies or add admins to existing organizations.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="platform-invite-email">Email</Label>
              <Input
                id="platform-invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-invite-name">Full name</Label>
              <Input
                id="platform-invite-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Company Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-company-name">New company name</Label>
              <Input
                id="platform-company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Pty Ltd"
                disabled={Boolean(companyId.trim())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-company-id">Existing company ID</Label>
              <Input
                id="platform-company-id"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                placeholder="UUID (optional)"
                disabled={Boolean(companyName.trim())}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending} className="gap-2">
                <UserPlus className="h-4 w-4" />
                {pending ? "Sending…" : "Send company invite"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
