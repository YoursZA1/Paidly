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
  const [inviting, setInviting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const canManage = hasPermission(PERMISSIONS.MANAGE_EMPLOYEES);
  const showJobFunctionOnInvite = jobFunctionRequiredForRole(inviteRole);

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

  if (!canManage) return null;

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    try {
      const result = await inviteCompanyMember({
        email,
        fullName,
        role: inviteRole,
        jobFunction: showJobFunctionOnInvite ? inviteJobFunction : "general",
      });
      toast({
        title: result.mode === "email_invite" ? "Invitation sent" : "Member added",
        description:
          result.mode === "email_invite"
            ? `${email} will join your company when they accept the invite.`
            : `${email} was added to your company.`,
      });
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
  );
}
