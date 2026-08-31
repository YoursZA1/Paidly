import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { listCompanyMembers } from "@/services/CompanyContextService";
import { listCompanyInvites, revokeCompanyInvite } from "@/services/CompanyInvitesService";
import { listPosRegisters } from "@/services/PosIntegrationService";
import { isPosOnlyStaff } from "@shared/posStaffInvite.js";
import { formatDistanceToNow } from "date-fns";

function inviteStatus(row) {
  if (row.status === "revoked" || row.revoked_at) return "revoked";
  if (row.status === "accepted") return "accepted";
  if (row.expires_at && new Date(row.expires_at) < new Date()) return "expired";
  return row.status || "pending";
}

/**
 * Admin till staff: active cashiers + pending till invites, grouped by register.
 */
export default function PosTillStaffSheet({
  open,
  onOpenChange,
  onInvite,
  companyCtx,
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [registers, setRegisters] = useState([]);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const reload = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [regData, memberRows, inviteRows] = await Promise.all([
        listPosRegisters(),
        companyCtx ? listCompanyMembers(companyCtx).catch(() => []) : Promise.resolve([]),
        listCompanyInvites({ status: "all" }).catch(() => []),
      ]);
      setRegisters(Array.isArray(regData?.registers) ? regData.registers : []);
      setMembers(Array.isArray(memberRows) ? memberRows : []);
      setInvites(Array.isArray(inviteRows) ? inviteRows.filter((row) => row.source === "pos") : []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not load till staff",
        description: err?.message || String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [open, companyCtx, toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const cashiers = useMemo(
    () =>
      members.filter((row) =>
        isPosOnlyStaff({
          companyRole: row.company_role || row.role,
          jobFunction: row.job_function,
          isOrgOwner: false,
        })
      ),
    [members]
  );

  const handleRevoke = async (id) => {
    setBusyId(id);
    try {
      await revokeCompanyInvite(id);
      toast({ title: "Invite revoked" });
      await reload();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not revoke",
        description: err?.message || String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Till staff</SheetTitle>
          <SheetDescription>POS-only cashiers and pending till invites.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex justify-end">
          <Button type="button" className="h-11" onClick={() => onInvite?.()}>
            <UserPlus className="size-4" />
            Invite staff
          </Button>
        </div>
        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pb-6">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : registers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tills yet.</p>
          ) : (
            registers.map((till) => {
              const active = cashiers.filter(
                (row) =>
                  row.pos_register_id === till.id || till.assigned_staff_id === row.user_id
              );
              const pending = invites.filter(
                (row) => row.register_id === till.id && inviteStatus(row) === "pending"
              );
              return (
                <section key={till.id} className="rounded-2xl border border-border p-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide">{till.name}</h3>
                  <ul className="mt-2 space-y-2">
                    {active.length === 0 && pending.length === 0 ? (
                      <li className="text-sm text-muted-foreground">No staff on this till yet.</li>
                    ) : null}
                    {active.map((row) => (
                      <li key={row.user_id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{row.label || row.email}</span>
                        <Badge variant="secondary">Active</Badge>
                      </li>
                    ))}
                    {pending.map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate">{row.invited_name || row.email}</span>
                          <span className="block text-xs text-muted-foreground">
                            Pending
                            {row.expires_at
                              ? ` · expires ${formatDistanceToNow(new Date(row.expires_at), { addSuffix: true })}`
                              : ""}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          disabled={busyId === row.id}
                          onClick={() => void handleRevoke(row.id)}
                          aria-label={`Revoke invite for ${row.email}`}
                        >
                          {busyId === row.id ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
