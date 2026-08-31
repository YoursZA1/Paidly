import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Copy, Mail, RefreshCw, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  listCompanyInvites,
  revokeCompanyInvite,
  resendCompanyInvite,
} from "@/services/CompanyInvitesService";
import CompanyTeamInviteResultDialog from "@/components/company/CompanyTeamInviteResultDialog";
import { JOB_FUNCTION_LABELS } from "@/lib/companyJobFunctions";
import { COMPANY_ROLE_LABELS } from "@/lib/companyPermissions";
import { POS_INVITE_SOURCE, POS_JOB_FUNCTION } from "@shared/posStaffInvite.js";

const STATUS_VARIANT = {
  pending: "default",
  accepted: "secondary",
  expired: "outline",
  revoked: "destructive",
};

function formatExpiry(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (d < new Date()) return "Expired";
  return `Expires ${formatDistanceToNow(d, { addSuffix: true })}`;
}

function formatCreated(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Created ${formatDistanceToNow(d, { addSuffix: true })}`;
}

function invitePosOnly(row) {
  return (
    row?.source === POS_INVITE_SOURCE ||
    String(row?.job_function || "").toLowerCase() === POS_JOB_FUNCTION
  );
}

function inviteRoleLabel(row) {
  const key = String(row?.role || "").toLowerCase();
  return COMPANY_ROLE_LABELS[key] || row?.role || "Employee";
}

function inviteFunctionLabel(row) {
  if (invitePosOnly(row)) return "POS only";
  const key = String(row?.job_function || "").toLowerCase();
  return JOB_FUNCTION_LABELS[key] || row?.job_function || "—";
}

async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

/**
 * Pending / historical company invites for company admins.
 */
export default function CompanyInvitesPanel() {
  const { toast } = useToast();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [busyId, setBusyId] = useState(null);
  const [resendNotice, setResendNotice] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listCompanyInvites({
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setInvites(rows);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not load invites",
        description: e?.message || String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRevoke = async (id) => {
    setBusyId(id);
    try {
      await revokeCompanyInvite(id);
      toast({ title: "Invite revoked" });
      await reload();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not revoke",
        description: e?.message || String(e),
      });
    } finally {
      setBusyId(null);
    }
  };

  const openInviteNotice = (row, result = {}) => ({
    inviteId: row.id,
    email: row.email,
    invitedName: result.invited_name || row.invited_name || null,
    inviteLink: result.invite_link || row.invite_link || "",
    inviteCode: result.invite_code || null,
    registerName: result.register_name || row.register_name || null,
    expiresAt: result.expires_at || row.expires_at || null,
    emailSent: result.email_sent === true,
    emailError: result.email_error || null,
    posOnly: invitePosOnly(row),
    role: result.role || row.role,
    jobFunction: result.job_function || row.job_function,
    reused: result.reused === true,
  });

  const handleCopy = async (row) => {
    if (!row.invite_link) {
      toast({
        variant: "destructive",
        title: "Link unavailable",
        description: "Resend this invitation to generate a new link.",
      });
      return;
    }
    try {
      await copyText(row.invite_link);
      toast({ title: "Invite link copied" });
    } catch {
      toast({ variant: "destructive", title: "Could not copy link" });
    }
  };

  const handleResend = async (row) => {
    setBusyId(row.id);
    try {
      const result = await resendCompanyInvite(row.id);
      setResendNotice(openInviteNotice(row, result));
      await reload();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not resend",
        description: e?.message || String(e),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRetryFromDialog = async () => {
    const inviteId = resendNotice?.inviteId;
    if (!inviteId) return;
    setResendNotice((prev) => (prev ? { ...prev, retrying: true } : prev));
    try {
      const result = await resendCompanyInvite(inviteId);
      setResendNotice((prev) =>
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
      await reload();
    } catch (err) {
      setResendNotice((prev) =>
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

  return (
    <>
      <CompanyTeamInviteResultDialog
        notice={resendNotice}
        onOpenChange={(open) => {
          if (!open) setResendNotice(null);
        }}
        onRetryEmail={resendNotice?.inviteId ? handleRetryFromDialog : undefined}
      />
      <Card className="mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Invitation management
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading invites…
            </div>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No invites in this filter.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {invites.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{row.invited_name || row.email}</p>
                    <p className="text-sm text-muted-foreground truncate">{row.email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inviteRoleLabel(row)} · {inviteFunctionLabel(row)}
                      {row.register_name ? ` · ${row.register_name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCreated(row.created_at)}
                      {row.created_at ? " · " : ""}
                      {formatExpiry(row.expires_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[row.status] || "outline"} className="capitalize">
                      {row.status}
                    </Badge>
                    {row.status === "pending" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id || !row.invite_link}
                          onClick={() => void handleCopy(row)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy link
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id}
                          onClick={() => handleResend(row)}
                        >
                          Resend
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyId === row.id}
                          onClick={() => handleRevoke(row.id)}
                        >
                          <XCircle className="h-4 w-4" />
                          Revoke
                        </Button>
                      </>
                    ) : null}
                    {row.status === "expired" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.id}
                        onClick={() => handleResend(row)}
                      >
                        Resend
                      </Button>
                    ) : null}
                    {row.status === "accepted" && row.accepted_at ? (
                      <span className="text-xs text-muted-foreground">
                        Accepted {formatDistanceToNow(new Date(row.accepted_at), { addSuffix: true })}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
