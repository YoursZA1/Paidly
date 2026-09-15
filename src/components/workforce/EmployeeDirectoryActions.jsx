import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EmployeeSelect from "@/components/workforce/EmployeeSelect";
import { employeeProfilePath, workforceApi } from "@/services/WorkforceApiService";
import { useToast } from "@/components/ui/use-toast";
import { parseUuid } from "@shared/ids/uuid.js";
import {
  eligibleManagersFromRoster,
  isWorkforceEmployeeActive,
} from "@shared/workforce/employeeLifecycle.js";

export default function EmployeeDirectoryActions({
  employee,
  roster = [],
  departments = [],
  canManage = false,
  onUpdated,
}) {
  const { toast } = useToast();
  const [dialog, setDialog] = useState(null);
  const [managerId, setManagerId] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const active = isWorkforceEmployeeActive(employee);
  const managers = useMemo(
    () => eligibleManagersFromRoster(roster, { excludeId: employee?.id }),
    [roster, employee?.id]
  );

  if (!canManage || !employee?.id) {
    return (
      <Button asChild variant="ghost" size="sm" className="rounded-xl">
        <Link to={employeeProfilePath(employee?.id)}>View</Link>
      </Button>
    );
  }

  const openManager = () => {
    setManagerId(parseUuid(employee.manager_membership_id) || "");
    setDialog("manager");
  };
  const openDepartment = () => {
    setDepartment(employee.department || "");
    setDialog("department");
  };

  const saveManager = async () => {
    setSaving(true);
    try {
      const updated = await workforceApi.update(employee.id, {
        manager_membership_id: parseUuid(managerId) || null,
      });
      toast({ title: managerId ? "Manager assigned" : "Manager removed" });
      setDialog(null);
      onUpdated?.(updated);
    } catch (err) {
      toast({ variant: "destructive", title: "Could not update manager", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const saveDepartment = async () => {
    setSaving(true);
    try {
      const updated = await workforceApi.update(employee.id, {
        department: department.trim() || null,
      });
      toast({ title: "Department updated" });
      setDialog(null);
      onUpdated?.(updated);
    } catch (err) {
      toast({ variant: "destructive", title: "Could not update department", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const runLifecycle = async () => {
    setSaving(true);
    try {
      const updated = active
        ? await workforceApi.deactivate(employee.id)
        : await workforceApi.activate(employee.id);
      toast({
        title: active ? "Employee deactivated" : "Employee activated",
        description: active
          ? "Historical payslips, leave, and documents were kept."
          : "The employee can use active workforce features again.",
      });
      if (active && updated?.reports_needing_reassignment) {
        toast({
          title: "Manager inactive — reassignment required",
          description: `${updated.reports_needing_reassignment} team member(s) still report to this person.`,
        });
      }
      setDialog(null);
      onUpdated?.(updated);
    } catch (err) {
      toast({ variant: "destructive", title: "Could not update status", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" aria-label="Employee actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link to={employeeProfilePath(employee.id)}>View</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={`${employeeProfilePath(employee.id)}?tab=employment`}>Edit</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openManager}>Assign manager</DropdownMenuItem>
          <DropdownMenuItem onSelect={openDepartment}>Change department</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className={active ? "text-destructive" : ""}
            onSelect={() => setDialog(active ? "deactivate" : "activate")}
          >
            {active ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "manager"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign manager</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Manager</Label>
            <EmployeeSelect
              employees={managers}
              value={managerId}
              onChange={setManagerId}
              emptyLabel="No manager"
            />
            <p className="text-xs text-muted-foreground">Only active managers can be assigned.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button className="rounded-xl" disabled={saving} onClick={saveManager}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "department"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change department</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Department / team</Label>
            <Input
              list={`dept-${employee.id}`}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Department"
            />
            <datalist id={`dept-${employee.id}`}>
              {departments.map((dept) => (
                <option key={dept} value={dept} />
              ))}
            </datalist>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button className="rounded-xl" disabled={saving} onClick={saveDepartment}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog === "deactivate" || dialog === "activate"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{active ? "Deactivate this employee?" : "Activate this employee?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {active
                ? "They will lose active workforce access. Payslips, payroll, leave, documents, and audit history stay intact. Their team is not deleted — reassign those people to an active manager."
                : "They will regain active workforce access. Historical records are unchanged."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={runLifecycle}>
              {saving ? "Saving…" : active ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
