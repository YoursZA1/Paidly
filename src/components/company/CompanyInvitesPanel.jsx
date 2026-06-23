import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Mail, RefreshCw, XCircle, Loader2 } from "lucide-react";
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

  const handleResend = async (row) => {
    setBusyId(row.id);
    try {
      const result = await resendCompanyInvite(row.id);
      setResendNotice({
        email: row.email,
        inviteLink: result.invite_link || "",
        emailSent: result.email_sent === true,
        emailError: result.email_error || null,
      });
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

  return (
    <>
      <CompanyTeamInviteResultDialog
        notice={resendNotice}
        onOpenChange={(open) => {
          if (!open) setResendNotice(null);
        }}
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
                    <p className="font-medium truncate">{row.email}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {row.role} · {formatExpiry(row.expires_at)}
                      {row.source === "platform_admin" ? " · Platform issued" : ""}
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
                        </Button>
                      </>
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
