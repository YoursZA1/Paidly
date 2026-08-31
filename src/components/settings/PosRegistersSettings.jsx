import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import useOrgBrands from "@/hooks/useOrgBrands";
import { formatCurrency } from "@/utils/currencyCalculations";
import { useAuth } from "@/contexts/AuthContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  listPosRegisters,
  createPosRegister,
  updatePosRegister,
  disablePosRegister,
  listPosSessions,
} from "@/services/PosIntegrationService";

const EMPTY = {
  id: null,
  name: "",
  status: "active",
  company_id: "",
  assigned_staff_id: "",
  opening_balance: "0",
};

export default function PosRegistersSettings() {
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const { hasPermission } = useCompanyContext();
  const canViewShiftHistory = hasPermission(PERMISSIONS.POS_VIEW_REPORTS);
  const { brands } = useOrgBrands();
  const currency = profile?.currency || user?.currency || "ZAR";
  const [registers, setRegisters] = useState([]);
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPosRegisters();
      setRegisters(data.registers);
      setMembers(data.members);
      if (canViewShiftHistory) {
        try {
          const sessions = await listPosSessions({ status: "closed", limit: 40 });
          setHistory(sessions);
        } catch {
          setHistory([]);
        }
      } else {
        setHistory([]);
      }
    } catch (err) {
      toast({
        title: "Could not load registers",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, canViewShiftHistory]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setDraft({ ...EMPTY, company_id: brands[0]?.id || "" });
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setDraft({
      id: row.id,
      name: row.name || "",
      status: row.status || "active",
      company_id: row.company_id || "",
      assigned_staff_id: row.assigned_staff_id || "",
      opening_balance: String(row.opening_balance ?? 0),
    });
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: draft.name,
        status: draft.status,
        company_id: draft.company_id || null,
        assigned_staff_id: draft.assigned_staff_id || null,
        opening_balance: Number(draft.opening_balance),
      };
      if (draft.id) await updatePosRegister(draft.id, payload);
      else await createPosRegister(payload);
      setDialogOpen(false);
      await load();
      toast({ title: draft.id ? "Register updated" : "Register created" });
    } catch (err) {
      toast({
        title: "Could not save register",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const disable = async (row) => {
    try {
      await disablePosRegister(row.id);
      await load();
      toast({ title: "Register disabled" });
    } catch (err) {
      toast({
        title: "Could not disable register",
        description: err?.message || "Keep at least one active till.",
        variant: "destructive",
      });
    }
  };

  const enable = async (row) => {
    try {
      await updatePosRegister(row.id, { status: "active" });
      await load();
    } catch (err) {
      toast({
        title: "Could not enable register",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A register is one till on a brand. Paidly does not have store locations — assign the trading
          identity here. Opening balance is the cash float, not a sale. Till actions use company roles
          (employee / manager / admin), not a second login.
        </p>
        <Button type="button" size="sm" className="shrink-0" onClick={openCreate}>
          <Plus className="size-4" />
          Add register
        </Button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading registers…
        </p>
      ) : registers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No registers yet.</p>
      ) : (
        <ul className="space-y-2">
          {registers.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Store className="size-4 shrink-0 text-muted-foreground" />
                  <p className="truncate font-medium">{row.name}</p>
                  <Badge variant={row.status === "active" ? "secondary" : "outline"}>
                    {row.status === "active" ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {row.company_name || "Organization default brand"}
                  {" · "}
                  {row.assigned_staff_name || "Unassigned"}
                  {" · Float "}
                  {formatCurrency(Number(row.opening_balance) || 0, currency)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)}>
                  Edit
                </Button>
                {row.status === "active" ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void disable(row)}>
                    Disable
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void enable(row)}>
                    Enable
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 ? (
        <div className="space-y-2 pt-4">
          <p className="text-sm font-medium">Closed shifts</p>
          <p className="text-xs text-muted-foreground">
            Historical sessions are read-only. Staff cannot edit opening cash, counted cash, or variance after
            close.
          </p>
          <ul className="space-y-2">
            {history.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-border px-3 py-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{row.register_name || "Till"}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.closed_at ? new Date(row.closed_at).toLocaleString() : "Closed"}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open {formatCurrency(Number(row.opening_balance) || 0, currency)}
                  {" · "}
                  Cash sales {formatCurrency(Number(row.cash_sales) || 0, currency)}
                  {" · "}
                  Refunds {formatCurrency(Number(row.cash_refunds) || 0, currency)}
                  {" · "}
                  Expected {formatCurrency(Number(row.expected_cash) || 0, currency)}
                  {" · "}
                  Counted {formatCurrency(Number(row.closing_cash) || 0, currency)}
                  {" · "}
                  Variance {formatCurrency(Number(row.variance) || 0, currency)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit register" : "New register"}</DialogTitle>
            <DialogDescription>
              Name, brand, assigned staff, and opening float. Not a second catalog or location system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pos-register-name">Name</Label>
              <Input
                id="pos-register-name"
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Main till"
              />
            </div>
            <div className="space-y-1">
              <Label>Brand</Label>
              <Select
                value={draft.company_id || "__none__"}
                onValueChange={(value) =>
                  setDraft((prev) => ({ ...prev, company_id: value === "__none__" ? "" : value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Shared catalog (no brand)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Shared catalog (no brand)</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This till only sells org-shared products plus private products of this brand. Another brand’s private catalog stays off this register.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Assigned staff</Label>
              <Select
                value={draft.assigned_staff_id || "__none__"}
                onValueChange={(value) =>
                  setDraft((prev) => ({ ...prev, assigned_staff_id: value === "__none__" ? "" : value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pos-register-float">Opening balance</Label>
              <Input
                id="pos-register-float"
                inputMode="decimal"
                value={draft.opening_balance}
                onChange={(e) => setDraft((prev) => ({ ...prev, opening_balance: e.target.value }))}
              />
            </div>
            {draft.id ? (
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(value) => setDraft((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || !draft.name.trim()} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
