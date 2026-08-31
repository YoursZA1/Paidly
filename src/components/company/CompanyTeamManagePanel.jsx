import { useEffect, useState } from "react";
import { PERMISSIONS } from "@/lib/companyPermissions";
import {
  JOB_FUNCTION_OPTIONS,
  JOB_FUNCTION_LABELS,
  jobFunctionRequiredForRole,
} from "@/lib/companyJobFunctions";
import useCompanyContext from "@/hooks/useCompanyContext";
import { listCompanyMembers } from "@/services/CompanyContextService";
import {
  inviteCompanyMember,
  updateCompanyMember,
  updateCompanyMemberDirect,
  INVITE_ROLES,
} from "@/services/CompanyTeamService";
import { listPosRegisters } from "@/services/PosIntegrationService";
import { resendCompanyInvite } from "@/services/CompanyInvitesService";
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
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Users, UserPlus } from "lucide-react";
import CompanyTeamInviteResultDialog from "@/components/company/CompanyTeamInviteResultDialog";
import { POS_INVITE_SOURCE, POS_JOB_FUNCTION } from "@shared/posStaffInvite.js";

/**
 * Company org team management — invite employees/managers with job function (Sales, HR, …).
 */
export default function CompanyTeamManagePanel() {
  const { ctx, hasPermission } = useCompanyContext();
  const { authUserId } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [inviteJobFunction, setInviteJobFunction] = useState("sales");
  const [inviteRegisterId, setInviteRegisterId] = useState("");
  const [registers, setRegisters] = useState([]);
  const [inviting, setInviting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [inviteNotice, setInviteNotice] = useState(null);

  const canManage = hasPermission(PERMISSIONS.MANAGE_EMPLOYEES);
  const showJobFunctionOnInvite = jobFunctionRequiredForRole(inviteRole);
  const posOnlyInvite = inviteRole === "employee" && inviteJobFunction === POS_JOB_FUNCTION;

  const reload = async () => {
    if (!ctx) return;
    setLoading(true);
    try {
      const rows = await listCompanyMembers(ctx);
      setMembers(rows);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not load team",
        description: e?.message || String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.companyId, ctx?.companyRole]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void listPosRegisters()
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.registers) ? data.registers : [];
        const active = rows.filter((row) => row.status !== "disabled");
        setRegisters(active);
        setInviteRegisterId((prev) => prev || active[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setRegisters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  if (!canManage) return null;

  const handleInvite = async (e) => {
    e.preventDefault();
    if (posOnlyInvite && !inviteRegisterId) {
      toast({
        variant: "destructive",
        title: "Till is required",
        description: "Assign this POS employee to a till before sending the invite.",
      });
      return;
    }
    setInviting(true);
    try {
      const result = await inviteCompanyMember({
        email,
        fullName,
        role: inviteRole,
        jobFunction: showJobFunctionOnInvite ? inviteJobFunction : "general",
        source: posOnlyInvite ? POS_INVITE_SOURCE : undefined,
        registerId: posOnlyInvite ? inviteRegisterId : undefined,
      });
      if (result.mode === "email_invite") {
        const selectedTill = registers.find((row) => row.id === inviteRegisterId);
        setInviteNotice({
          inviteId: result.id || null,
          email: String(result.email || email).trim(),
          invitedName: fullName.trim() || result.invited_name || null,
          inviteLink: result.invite_link || "",
          inviteCode: result.invite_code || null,
          emailSent: result.email_sent === true,
          emailError: result.email_error || null,
          posOnly: posOnlyInvite || result.source === POS_INVITE_SOURCE,
          role: result.role || inviteRole,
          jobFunction: result.job_function || inviteJobFunction,
          registerName: result.register_name || selectedTill?.name || null,
          expiresAt: result.expires_at || null,
          reused: result.reused === true || result.pending_exists === true,
        });
      } else {
        toast({
          title: "Member added",
          description: `${email} already had a Paidly account and was added to your business.`,
        });
      }
      setEmail("");
      setFullName("");
      await reload();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Invite failed",
        description: err?.message || String(err),
      });
    } finally {
      setInviting(false);
    }
  };

  const handleRetryInviteEmail = async () => {
    const inviteId = inviteNotice?.inviteId;
    if (!inviteId) return;
    setInviteNotice((prev) => (prev ? { ...prev, retrying: true } : prev));
    try {
      const result = await resendCompanyInvite(inviteId);
      setInviteNotice((prev) =>
        prev
          ? {
              ...prev,
              retrying: false,
              inviteLink: result.invite_link || prev.inviteLink,
              inviteCode: result.invite_code || prev.inviteCode,
              emailSent: result.email_sent === true,
              emailError: result.email_error || null,
              expiresAt: result.expires_at || prev.expiresAt,
            }
          : prev
      );
    } catch (err) {
      setInviteNotice((prev) =>
        prev
          ? {
              ...prev,
              retrying: false,
              emailSent: false,
              emailError: err?.message || String(err),
            }
          : prev
      );
    }
  };

  const handleMemberUpdate = async (userId, updates) => {
    if (!ctx || userId === authUserId) return;
    setUpdatingId(userId);
    try {
      try {
        await updateCompanyMember(userId, updates);
      } catch {
        await updateCompanyMemberDirect(userId, updates, ctx.companyId);
      }
      toast({ title: "Member updated" });
      await reload();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not update member",
        description: err?.message || String(err),
      });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <>
    <CompanyTeamInviteResultDialog
      notice={inviteNotice}
      onOpenChange={(open) => {
        if (!open) setInviteNotice(null);
      }}
      onRetryEmail={inviteNotice?.inviteId ? handleRetryInviteEmail : undefined}
    />
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          Invite team member
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleInvite} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="company-invite-email">Email</Label>
            <Input
              id="company-invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="employee@company.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-invite-name">Full name</Label>
            <Input
              id="company-invite-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label>Access role</Label>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {showJobFunctionOnInvite ? (
            <div className="space-y-2">
              <Label>Function</Label>
              <Select value={inviteJobFunction} onValueChange={setInviteJobFunction}>
                <SelectTrigger>
                  <SelectValue placeholder="e.g. Sales, HR" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_FUNCTION_OPTIONS.filter((o) => o.value !== "general").map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Will appear as{" "}
                <span className="font-medium text-foreground">
                  {JOB_FUNCTION_LABELS[inviteJobFunction] || inviteJobFunction}{" "}
                  {inviteRole === "manager" ? "Manager" : "Employee"}
                </span>
                .
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Function</Label>
              <p className="text-sm text-muted-foreground pt-2">Not required for company admins.</p>
            </div>
          )}
          {posOnlyInvite ? (
            <div className="space-y-2 sm:col-span-2 lg:col-span-5 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm font-medium">POS-only access</p>
              <p className="text-xs text-muted-foreground">
                This employee can use the POS but cannot access the rest of Paidly.
              </p>
              <div className="space-y-2 max-w-sm">
                <Label>Till</Label>
                <Select value={inviteRegisterId} onValueChange={setInviteRegisterId}>
                  <SelectTrigger>
                    <SelectValue placeholder={registers.length ? "Select till" : "No tills yet"} />
                  </SelectTrigger>
                  <SelectContent>
                    {registers.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name || "Till"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <div className="flex items-end sm:col-span-2 lg:col-span-5">
            <Button type="submit" disabled={inviting} className="gap-2">
              <UserPlus className="h-4 w-4" />
              {inviting ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-muted-foreground" />
            Team directory
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading team…</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{m.label}</p>
                    {m.email ? (
                      <p className="text-sm text-muted-foreground">{m.email}</p>
                    ) : null}
                    {m.role_label ? (
                      <p className="text-xs text-muted-foreground mt-0.5">{m.role_label}</p>
                    ) : null}
                  </div>
                  {m.user_id === authUserId ? (
                    <span className="text-xs text-muted-foreground">You</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={m.company_role}
                        onValueChange={(v) => handleMemberUpdate(m.user_id, { role: v })}
                        disabled={updatingId === m.user_id}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVITE_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {jobFunctionRequiredForRole(m.company_role) ? (
                        <Select
                          value={m.job_function || "general"}
                          onValueChange={(v) => handleMemberUpdate(m.user_id, { jobFunction: v })}
                          disabled={updatingId === m.user_id}
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {JOB_FUNCTION_OPTIONS.filter((o) => o.value !== "general").map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
    </>
  );
}
