import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarOff, Check, X } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createPageUrl } from "@/utils";
import { leaveApi } from "@/services/PayrollApiService";
import { useToast } from "@/components/ui/use-toast";
import FeatureGate from "@/components/subscription/FeatureGate";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";

const EMPTY_TYPE = {
  id: "",
  name: "",
  code: "",
  days_per_year: 21,
  accrual_method: "monthly",
  paid: true,
  requires_approval: true,
  requires_attachment: false,
  max_balance: "",
  carry_over_days: 0,
  active: true,
};

const selectClass = "w-full h-10 rounded-xl border border-border bg-background px-3 text-sm";

export default function LeaveManagementPage() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const userPlan = profile?.subscription_plan || profile?.plan || "starter";
  const { hasPermission } = useCompanyContext();
  const canManage = hasPermission(PERMISSIONS.MANAGE_LEAVE);
  const [requests, setRequests] = useState([]);
  const [types, setTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [status, setStatus] = useState("pending");
  const [userId, setUserId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [department, setDepartment] = useState("");
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adjust, setAdjust] = useState({ payroll_profile_id: "", leave_type_id: "", days: "", reason: "" });
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);

  const load = async () => {
    try {
      const [r, t, e] = await Promise.all([
        leaveApi.requests({
          status,
          user_id: userId || undefined,
          leave_type_id: leaveTypeId || undefined,
          department: department || undefined,
        }),
        leaveApi.types(),
        leaveApi.employees(),
      ]);
      setRequests(r || []);
      setTypes(t || []);
      setEmployees(e || []);
    } catch (err) {
      toast({ title: "Could not load leave", description: err.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    load();
  }, [status, userId, leaveTypeId, department]);

  const departments = useMemo(() => {
    return [...new Set((employees || []).map((row) => row.department).filter(Boolean))].sort();
  }, [employees]);

  const decide = async (id, approve) => {
    try {
      if (approve) await leaveApi.approve(id);
      else {
        if (!rejectReason.trim()) {
          toast({ title: "Rejection reason required", variant: "destructive" });
          return;
        }
        await leaveApi.reject(id, rejectReason.trim());
        setRejectId(null);
        setRejectReason("");
      }
      toast({ title: approve ? "Leave approved" : "Leave rejected" });
      load();
    } catch (err) {
      toast({ title: "Could not update request", description: err.message, variant: "destructive" });
    }
  };

  const cancelRequest = async (id) => {
    try {
      await leaveApi.cancel(id);
      toast({ title: "Leave cancelled" });
      load();
    } catch (err) {
      toast({ title: "Could not cancel", description: err.message, variant: "destructive" });
    }
  };

  const submitAdjust = async (e) => {
    e.preventDefault();
    try {
      await leaveApi.adjust({
        payroll_profile_id: adjust.payroll_profile_id,
        leave_type_id: adjust.leave_type_id,
        days: Number(adjust.days),
        reason: adjust.reason,
      });
      toast({ title: "Balance adjusted" });
      setAdjust({ payroll_profile_id: "", leave_type_id: "", days: "", reason: "" });
    } catch (err) {
      toast({ title: "Adjustment failed", description: err.message, variant: "destructive" });
    }
  };

  const submitType = async (e) => {
    e.preventDefault();
    try {
      await leaveApi.saveType({
        ...typeForm,
        id: typeForm.id || undefined,
        max_balance: typeForm.max_balance === "" ? null : Number(typeForm.max_balance),
      });
      toast({ title: typeForm.id ? "Leave type updated" : "Leave type created" });
      setTypeForm(EMPTY_TYPE);
      load();
    } catch (err) {
      toast({ title: "Could not save leave type", description: err.message, variant: "destructive" });
    }
  };

  return (
    <FeatureGate feature="leave_management" userPlan={userPlan}>
      <PageTemplate>
        <PageTemplate.Header>
          <PageHeader
            title="Leave management"
            description="Approve requests, configure types, and audit balances."
            icon={<CalendarOff className="h-4 w-4" />}
            onRefresh={load}
          >
            <Button asChild variant="outline" className="rounded-xl h-9">
              <Link to={createPageUrl("LeaveCalendar")}>Calendar</Link>
            </Button>
          </PageHeader>
        </PageTemplate.Header>
        <PageTemplate.Body>
          <Tabs defaultValue="requests">
            <TabsList className="mb-4">
              <TabsTrigger value="requests">Requests</TabsTrigger>
              <TabsTrigger value="types">Leave types</TabsTrigger>
              {canManage ? <TabsTrigger value="adjust">Adjustments</TabsTrigger> : null}
            </TabsList>
            <TabsContent value="requests">
              <div className="flex flex-wrap gap-2 mb-3">
                {["pending", "approved", "rejected", "cancelled"].map((s) => (
                  <Button key={s} size="sm" variant={status === s ? "default" : "outline"} className="rounded-xl capitalize" onClick={() => setStatus(s)}>
                    {s}
                  </Button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-3 mb-4">
                <select className={selectClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">All employees</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.user_id}>{emp.full_name} ({emp.employee_number})</option>
                  ))}
                </select>
                <select className={selectClass} value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="">All departments</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <select className={selectClass} value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
                  <option value="">All leave types</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <Card className="rounded-xl overflow-hidden">
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Employee</th>
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 font-medium">Dates</th>
                        <th className="px-4 py-2 font-medium">Days</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((row) => (
                        <tr key={row.id} className="border-b border-border/70 align-top">
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{row.payroll_profiles?.full_name}</p>
                            <p className="text-xs text-muted-foreground">{row.payroll_profiles?.employee_number}</p>
                          </td>
                          <td className="px-4 py-2.5">{row.leave_types?.name}</td>
                          <td className="px-4 py-2.5">{row.start_date} → {row.end_date}</td>
                          <td className="px-4 py-2.5 tabular-nums">{row.working_days}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline">{row.status}</Badge>
                            {row.reason ? <p className="text-xs text-muted-foreground mt-1 max-w-xs">{row.reason}</p> : null}
                            {row.rejection_reason ? <p className="text-xs text-destructive mt-1 max-w-xs">{row.rejection_reason}</p> : null}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {row.status === "pending" ? (
                              <div className="flex flex-col items-end gap-2">
                                <div className="flex gap-1">
                                  <Button size="sm" className="rounded-xl bg-primary text-primary-foreground" onClick={() => decide(row.id, true)}>
                                    <Check className="h-4 w-4 mr-1" /> Approve
                                  </Button>
                                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setRejectId(row.id)}>
                                    <X className="h-4 w-4 mr-1" /> Reject
                                  </Button>
                                </div>
                                {rejectId === row.id ? (
                                  <div className="flex gap-2 w-full max-w-sm">
                                    <Input
                                      placeholder="Rejection reason"
                                      value={rejectReason}
                                      onChange={(e) => setRejectReason(e.target.value)}
                                      className="h-9 rounded-xl"
                                    />
                                    <Button size="sm" variant="destructive" className="rounded-xl" onClick={() => decide(row.id, false)}>
                                      Confirm
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {canManage && (row.status === "pending" || row.status === "approved") ? (
                              <Button size="sm" variant="ghost" className="rounded-xl mt-1" onClick={() => cancelRequest(row.id)}>
                                Cancel
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                      {!requests.length ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No {status} requests.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="types">
              {canManage ? (
                <Card className="rounded-xl mb-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{typeForm.id ? "Edit leave type" : "Add leave type"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitType}>
                      <div>
                        <Label>Name</Label>
                        <Input value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} className="rounded-xl" required />
                      </div>
                      <div>
                        <Label>Code</Label>
                        <Input value={typeForm.code} onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })} className="rounded-xl" required />
                      </div>
                      <div>
                        <Label>Days per year</Label>
                        <Input type="number" step="0.5" value={typeForm.days_per_year} onChange={(e) => setTypeForm({ ...typeForm, days_per_year: e.target.value })} className="rounded-xl" />
                      </div>
                      <div>
                        <Label>Accrual</Label>
                        <select className={selectClass} value={typeForm.accrual_method} onChange={(e) => setTypeForm({ ...typeForm, accrual_method: e.target.value })}>
                          <option value="annual">Annual allocation</option>
                          <option value="monthly">Monthly accrual</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                      <div>
                        <Label>Maximum balance</Label>
                        <Input type="number" step="0.5" value={typeForm.max_balance} onChange={(e) => setTypeForm({ ...typeForm, max_balance: e.target.value })} className="rounded-xl" placeholder="No cap" />
                      </div>
                      <div>
                        <Label>Carry-over days</Label>
                        <Input type="number" step="0.5" value={typeForm.carry_over_days} onChange={(e) => setTypeForm({ ...typeForm, carry_over_days: e.target.value })} className="rounded-xl" />
                      </div>
                      <div className="flex flex-wrap gap-4 items-center text-sm">
                        <label className="flex items-center gap-2"><input type="checkbox" checked={typeForm.paid} onChange={(e) => setTypeForm({ ...typeForm, paid: e.target.checked })} /> Paid</label>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={typeForm.requires_approval} onChange={(e) => setTypeForm({ ...typeForm, requires_approval: e.target.checked })} /> Requires approval</label>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={typeForm.requires_attachment} onChange={(e) => setTypeForm({ ...typeForm, requires_attachment: e.target.checked })} /> Requires attachment</label>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={typeForm.active} onChange={(e) => setTypeForm({ ...typeForm, active: e.target.checked })} /> Active</label>
                      </div>
                      <div className="sm:col-span-2 flex gap-2">
                        <Button type="submit" className="rounded-xl bg-primary text-primary-foreground">
                          {typeForm.id ? "Update type" : "Create type"}
                        </Button>
                        {typeForm.id ? (
                          <Button type="button" variant="outline" className="rounded-xl" onClick={() => setTypeForm(EMPTY_TYPE)}>
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </form>
                  </CardContent>
                </Card>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {types.map((t) => (
                  <Card key={t.id} className="rounded-xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between gap-2">
                        {t.name}
                        {canManage ? (
                          <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setTypeForm({
                            ...EMPTY_TYPE,
                            ...t,
                            max_balance: t.max_balance ?? "",
                          })}>
                            Edit
                          </Button>
                        ) : null}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      <p>{t.days_per_year} days/year · {t.accrual_method} accrual</p>
                      <p>Paid: {t.paid ? "Yes" : "No"} · Approval: {t.requires_approval ? "Required" : "Not required"}</p>
                      <Badge variant="outline">{t.active ? "Active" : "Inactive"}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            {canManage ? (
              <TabsContent value="adjust">
                <Card className="rounded-xl max-w-lg">
                  <CardHeader><CardTitle className="text-base">Manual HR adjustment</CardTitle></CardHeader>
                  <CardContent>
                    <form className="space-y-3" onSubmit={submitAdjust}>
                      <div>
                        <Label>Employee</Label>
                        <select
                          className={selectClass}
                          value={adjust.payroll_profile_id}
                          onChange={(e) => setAdjust({ ...adjust, payroll_profile_id: e.target.value })}
                          required
                        >
                          <option value="">Select employee</option>
                          {employees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.full_name} ({emp.employee_number})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label>Leave type</Label>
                        <select
                          className={selectClass}
                          value={adjust.leave_type_id}
                          onChange={(e) => setAdjust({ ...adjust, leave_type_id: e.target.value })}
                          required
                        >
                          <option value="">Select type</option>
                          {types.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label>Days (+ or −)</Label>
                        <Input type="number" step="0.5" value={adjust.days} onChange={(e) => setAdjust({ ...adjust, days: e.target.value })} className="rounded-xl" required />
                      </div>
                      <div>
                        <Label>Reason</Label>
                        <Input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} className="rounded-xl" required />
                      </div>
                      <Button type="submit" className="rounded-xl bg-primary text-primary-foreground">Save adjustment</Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>
        </PageTemplate.Body>
      </PageTemplate>
    </FeatureGate>
  );
}
