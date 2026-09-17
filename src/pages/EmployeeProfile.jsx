import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { employeeProfilePath, workforceApi } from "@/services/WorkforceApiService";
import { payrollApi } from "@/services/PayrollApiService";
import { parseUuid } from "@shared/ids/uuid.js";
import useCompanyContext from "@/hooks/useCompanyContext";
import { canViewEmployeeProfile, PERMISSIONS } from "@/lib/companyPermissions";
import EmployeeSelect from "@/components/workforce/EmployeeSelect";
import EmployeeLifecycleBadges from "@/components/workforce/EmployeeLifecycleBadges.jsx";
import EmployeeDirectoryActions from "@/components/workforce/EmployeeDirectoryActions.jsx";
import PayslipStatusBadge from "@/components/payslips/PayslipStatusBadge";
import { createPageUrl } from "@/utils";
import { attentionReasonLabel } from "@shared/workforce/employeeLifecycle.js";
import { PAY_TYPES, PAY_FREQUENCIES } from "@shared/payroll/constants.js";
import EmployeePortalAccessPanel from "@/components/workforce/EmployeePortalAccessPanel.jsx";

const SECTION_TABS = new Set(["leave", "payslips", "documents", "attendance", "activity"]);

function employeeIdFromRoute(params, search) {
  return parseUuid(params?.id) || parseUuid(new URLSearchParams(search).get("id"));
}

export default function EmployeeProfile() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { ctx, hasPermission, loading: companyLoading } = useCompanyContext();
  const params = useParams();
  const location = useLocation();
  const id = employeeIdFromRoute(params, location.search);
  const [bundle, setBundle] = useState({ employee: null });
  const [managers, setManagers] = useState([]);
  const [managerId, setManagerId] = useState("");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingManager, setSavingManager] = useState(false);
  const [savingEmployment, setSavingEmployment] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingPayroll, setSavingPayroll] = useState(false);
  const [preview, setPreview] = useState(null);
  const [payType, setPayType] = useState("monthly_salary");
  const [payFrequency, setPayFrequency] = useState("monthly");
  const [baseSalary, setBaseSalary] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [restricted, setRestricted] = useState(false);
  const [sectionLoading, setSectionLoading] = useState("");
  const requestedTab = new URLSearchParams(location.search).get("tab") || "overview";
  const tab = requestedTab === "payroll" && !hasPermission(PERMISSIONS.MANAGE_PAYROLL) ? "overview" : requestedTab;

  const employee = bundle?.employee || null;
  const canOpenProfile =
    canViewEmployeeProfile(ctx, id, { managerMembershipId: employee?.manager_membership_id }) ||
    hasPermission(PERMISSIONS.VIEW_TEAM_MEMBERS);
  const canReassign = hasPermission(PERMISSIONS.MANAGE_EMPLOYEES);
  const canSeePay = Boolean(employee && !employee.compensation_redacted);
  const canOpenPayrollTab = hasPermission(PERMISSIONS.MANAGE_PAYROLL);

  const syncEmployee = (next) => {
    if (!next) return;
    setBundle((prev) => ({ ...prev, employee: next }));
    setManagerId(parseUuid(next.manager_membership_id) || "");
    setDepartment(next.department || "");
    setJobTitle(next.job_title || "");
    setStartDate(next.employment_start_date || "");
    setFullName(next.full_name || next.label || "");
    setPhone(next.phone || "");
    setPayType(next.pay_type || "monthly_salary");
    setPayFrequency(next.pay_frequency || "monthly");
    setBaseSalary(next.base_salary ?? "");
    setHourlyRate(next.hourly_rate ?? "");
    setDailyRate(next.daily_rate ?? "");
  };

  useEffect(() => {
    if (!id || companyLoading) return;
    if (!canOpenProfile) {
      setBundle({ employee: null });
      setRestricted(true);
      return;
    }
    setRestricted(false);
    workforceApi
      .get(id)
      .then(syncEmployee)
      .catch((err) => {
        if (err?.status === 403) {
          setBundle({ employee: null });
          setRestricted(true);
          return;
        }
        toast({ variant: "destructive", title: "Could not load profile", description: err.message });
      });
    if (canReassign) {
      workforceApi
        .managers({ excludeId: id })
        .then((rows) => setManagers(Array.isArray(rows) ? rows : []))
        .catch(() => setManagers([]));
    }
  }, [id, toast, canReassign, companyLoading, canOpenProfile]);

  useEffect(() => {
    if (!id || !canOpenProfile || companyLoading) return;
    if (!SECTION_TABS.has(tab)) return;
    if (tab === "leave" && bundle.leave_requests) return;
    if (tab === "payslips" && bundle.payslips) return;
    if (tab === "documents" && bundle.documents) return;
    if (tab === "attendance" && bundle.attendance) return;
    if (tab === "activity" && bundle.audit) return;
    setSectionLoading(tab);
    workforceApi
      .sections(id, tab)
      .then((data) => {
        setBundle((prev) => ({ ...prev, ...data, employee: data.employee || prev.employee }));
        if (data.employee) syncEmployee(data.employee);
      })
      .catch((err) => toast({ variant: "destructive", title: "Could not load section", description: err.message }))
      .finally(() => setSectionLoading(""));
  }, [id, tab, canOpenProfile, companyLoading, bundle.leave_requests, bundle.payslips, bundle.documents, bundle.attendance, bundle.audit, toast]);

  const setTab = (next) => {
    navigate(`${employeeProfilePath(id)}?tab=${encodeURIComponent(next)}`, { replace: true });
  };

  const saveManager = async () => {
    if (!id) return;
    setSavingManager(true);
    try {
      const updated = await workforceApi.update(id, {
        manager_membership_id: parseUuid(managerId) || null,
      });
      syncEmployee(updated);
      toast({ title: "Manager updated" });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not update manager", description: err.message });
    } finally {
      setSavingManager(false);
    }
  };

  const saveEmployment = async () => {
    if (!id) return;
    setSavingEmployment(true);
    try {
      const updated = await workforceApi.update(id, {
        department: department.trim() || null,
        job_title: jobTitle.trim() || null,
        employment_start_date: startDate || null,
      });
      syncEmployee(updated);
      toast({ title: "Employment updated" });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not save employment", description: err.message });
    } finally {
      setSavingEmployment(false);
    }
  };

  const savePersonal = async () => {
    if (!id) return;
    setSavingPersonal(true);
    try {
      const updated = await workforceApi.update(id, {
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      });
      syncEmployee(updated);
      toast({ title: "Personal details updated" });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not save personal details", description: err.message });
    } finally {
      setSavingPersonal(false);
    }
  };

  const savePayroll = async () => {
    if (!id) return;
    setSavingPayroll(true);
    try {
      const payload = {
        id: employee?.payroll_profile_id || undefined,
        membership_id: id,
        user_id: employee?.user_id || undefined,
        pay_type: payType,
        pay_frequency: payFrequency,
      };
      if (payType === "hourly") payload.hourly_rate = Number(hourlyRate) || 0;
      else if (payType === "daily") payload.daily_rate = Number(dailyRate) || 0;
      else payload.base_salary = Number(baseSalary) || 0;
      await payrollApi.saveProfile(payload);
      const refreshed = await workforceApi.get(id);
      syncEmployee(refreshed);
      toast({ title: "Payroll profile saved" });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not save payroll", description: err.message });
    } finally {
      setSavingPayroll(false);
    }
  };

  const runPreview = async () => {
    try {
      const result = await payrollApi.preview({
        membership_id: id,
        profile: {
          pay_type: payType,
          pay_frequency: payFrequency,
          base_salary: Number(baseSalary) || 0,
          hourly_rate: Number(hourlyRate) || 0,
          daily_rate: Number(dailyRate) || 0,
        },
      });
      setPreview(result);
    } catch (err) {
      toast({ variant: "destructive", title: "Could not preview payroll", description: err.message });
    }
  };

  const eligibility = employee?.leave_eligibility;
  const attention = employee?.attention_reasons || [];

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title={employee?.label || "Employee profile"}
          description="The same employee record used by leave, payroll, and payslips. Invites and roles stay in Settings → Team."
          icon={<User className="h-4 w-4" />}
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        {!id ? <p className="text-sm text-muted-foreground">Missing employee id.</p> : null}
        {id && companyLoading ? <p className="text-sm text-muted-foreground">Loading profile…</p> : null}
        {id && !companyLoading && restricted ? (
          <p className="text-sm text-muted-foreground">
            You can only open your own profile, unless you have team access.
          </p>
        ) : null}
        {employee ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4 flex-wrap h-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="employment">Employment</TabsTrigger>
              {canOpenPayrollTab ? <TabsTrigger value="payroll">Payroll</TabsTrigger> : null}
              <TabsTrigger value="leave">Leave</TabsTrigger>
              <TabsTrigger value="payslips">Payslips</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Department" value={employee.department || "—"} />
                <Stat label="Job title" value={employee.job_title || "—"} />
                <Stat label="Leave available" value={employee.leave_available ?? "—"} />
                <Stat label="Payslips" value={employee.payslip_count ?? (bundle.payslips || []).length} />
              </div>
              {attention.length ? (
                <p className="text-sm text-amber-800 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mt-4">
                  {attention.map((reason) => attentionReasonLabel(reason)).join(" · ")}
                  {attention.includes("incomplete_pay_rate") && canOpenPayrollTab ? (
                    <>
                      {" "}
                      <button type="button" className="underline" onClick={() => setTab("payroll")}>
                        Complete Payroll Setup
                      </button>
                    </>
                  ) : null}
                </p>
              ) : null}
              <Card className="rounded-xl mt-4">
                <CardContent className="pt-4 text-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <EmployeeLifecycleBadges employee={employee} />
                    <EmployeeDirectoryActions
                      employee={employee}
                      roster={managers}
                      departments={employee.department ? [employee.department] : []}
                      canManage={canReassign}
                      onUpdated={syncEmployee}
                    />
                  </div>
                  <p>Number: {employee.employee_number || "—"}</p>
                  <p>Manager: {employee.manager_name || "—"}</p>
                </CardContent>
              </Card>
              <EmployeePortalAccessPanel
                employee={employee}
                canManage={canReassign}
                onUpdated={(next) => {
                  if (next) syncEmployee(next);
                  else void workforceApi.profile(id).then(syncEmployee);
                }}
              />
            </TabsContent>

            <TabsContent value="personal">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Personal</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  {canReassign ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                      </div>
                      <p>Email: {employee.email || employee.invited_email || "—"}</p>
                      <p>Employee number: {employee.employee_number || "—"}</p>
                      <Button size="sm" className="rounded-xl" disabled={savingPersonal} onClick={savePersonal}>
                        {savingPersonal ? "Saving…" : "Save personal"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p>Name: {employee.full_name || employee.label || "—"}</p>
                      <p>Email: {employee.email || employee.invited_email || "—"}</p>
                      <p>Phone: {employee.phone || "—"}</p>
                      <p>Employee number: {employee.employee_number || "—"}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="employment">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Employment</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  <EmployeeLifecycleBadges employee={employee} />
                  {canReassign ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Department / team</Label>
                          <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Job title</Label>
                          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Start date</Label>
                          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                      </div>
                      <Button size="sm" className="rounded-xl" disabled={savingEmployment} onClick={saveEmployment}>
                        {savingEmployment ? "Saving…" : "Save employment"}
                      </Button>
                      <div className="pt-2 space-y-2">
                        <Label>Assign manager</Label>
                        <EmployeeSelect
                          employees={managers}
                          value={managerId}
                          onChange={setManagerId}
                          emptyLabel="No manager"
                        />
                        <Button size="sm" className="rounded-xl" disabled={savingManager} onClick={saveManager}>
                          {savingManager ? "Saving…" : "Save manager"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>Number: {employee.employee_number || "—"}</p>
                      <p>Department: {employee.department || "—"}</p>
                      <p>Job title: {employee.job_title || "—"}</p>
                      <p>Manager: {employee.manager_name || "—"}</p>
                      <p>Start date: {employee.employment_start_date || "—"}</p>
                      <p>End date: {employee.employment_end_date || "—"}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {canOpenPayrollTab ? (
            <TabsContent value="payroll">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Payroll</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  {canSeePay ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Pay type</Label>
                          <select className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" value={payType} onChange={(e) => setPayType(e.target.value)}>
                            {PAY_TYPES.map((value) => (
                              <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>Pay frequency</Label>
                          <select className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" value={payFrequency} onChange={(e) => setPayFrequency(e.target.value)}>
                            {PAY_FREQUENCIES.map((value) => (
                              <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
                            ))}
                          </select>
                        </div>
                        {payType === "hourly" ? (
                          <div className="space-y-2">
                            <Label>Hourly rate</Label>
                            <Input type="number" min="0" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
                          </div>
                        ) : payType === "daily" ? (
                          <div className="space-y-2">
                            <Label>Daily rate</Label>
                            <Input type="number" min="0" step="0.01" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label>Base salary</Label>
                            <Input type="number" min="0" step="0.01" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
                          </div>
                        )}
                      </div>
                      {!employee.pay_rate_complete ? (
                        <p className="text-sm text-amber-800">This employee is in the pay run with a zero rate. Enter a salary or rate before the next calculate.</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" className="rounded-xl" disabled={savingPayroll} onClick={savePayroll}>
                          {savingPayroll ? "Saving…" : "Save payroll"}
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={runPreview}>
                          Preview pay
                        </Button>
                      </div>
                      {preview ? (
                        <p className="text-sm text-muted-foreground">
                          Preview net {preview.net_pay ?? preview.net ?? "—"} · gross {preview.gross_pay ?? preview.gross ?? "—"}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-muted-foreground">Salary is visible only to payroll managers.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            ) : null}

            <TabsContent value="leave">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Leave</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sectionLoading === "leave" ? <p className="text-sm text-muted-foreground">Loading leave…</p> : null}
                  <p className="text-sm text-muted-foreground">{eligibility?.copy}</p>
                  {(bundle.leave_balances || []).length ? (
                    <ul className="text-sm space-y-1">
                      {bundle.leave_balances.map((row) => (
                        <li key={row.id || row.leave_types?.code} className="flex justify-between gap-3">
                          <span>{row.leave_types?.name || row.leave_types?.code || "Leave"}</span>
                          <span className="tabular-nums">{row.available ?? "—"} available</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {(bundle.leave_requests || []).length === 0 && sectionLoading !== "leave" ? (
                    <p className="text-sm text-muted-foreground">No leave requests.</p>
                  ) : (
                    <ul className="text-sm space-y-2">
                      {(bundle.leave_requests || []).map((row) => (
                        <li key={row.id} className="flex justify-between gap-3">
                          <span>
                            {row.leave_types?.name || "Leave"} · {row.start_date} → {row.end_date} · {row.working_days}d
                          </span>
                          <Badge variant="outline">{row.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payslips">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Payslips</CardTitle>
                </CardHeader>
                <CardContent>
                  {sectionLoading === "payslips" ? <p className="text-sm text-muted-foreground">Loading payslips…</p> : null}
                  {(bundle.payslips || []).length === 0 && sectionLoading !== "payslips" ? (
                    <p className="text-sm text-muted-foreground">No payslips.</p>
                  ) : (
                    <ul className="text-sm space-y-3">
                      {(bundle.payslips || []).map((row) => (
                        <li key={row.id} className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <Link className="underline" to={`${createPageUrl("ViewPayslip")}?id=${row.id}`}>
                              {row.payslip_number || "Payslip"} · {row.pay_period_start} → {row.pay_period_end}
                            </Link>
                            <p className="tabular-nums text-muted-foreground">
                              {canSeePay ? row.net_pay ?? "—" : "Hidden"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <PayslipStatusBadge payslip={row} status={row.status} />
                            {canOpenPayrollTab && row.status === "draft" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-xl"
                                onClick={async () => {
                                  try {
                                    await payrollApi.publishPayslip(row.id);
                                    const data = await workforceApi.sections(id, "payslips");
                                    setBundle((prev) => ({ ...prev, ...data }));
                                    toast({ title: "Payslip published" });
                                  } catch (err) {
                                    toast({ variant: "destructive", title: "Could not publish", description: err.message });
                                  }
                                }}
                              >
                                Publish
                              </Button>
                            ) : null}
                            {canOpenPayrollTab ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-xl"
                                onClick={async () => {
                                  try {
                                    await payrollApi.sendPayslip(row.id);
                                    toast({ title: "Payslip emailed" });
                                  } catch (err) {
                                    toast({ variant: "destructive", title: "Could not send", description: err.message });
                                  }
                                }}
                              >
                                Email
                              </Button>
                            ) : null}
                            <Button asChild size="sm" variant="ghost" className="rounded-xl">
                              <Link to={`${createPageUrl("PayslipPDF")}?id=${row.id}&download=true`}>Download</Link>
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  {sectionLoading === "documents" ? <p className="text-sm text-muted-foreground">Loading documents…</p> : null}
                  {(bundle.documents || []).length === 0 && sectionLoading !== "documents" ? (
                    <p className="text-sm text-muted-foreground">No hub documents linked to this employee.</p>
                  ) : (
                    <ul className="text-sm space-y-2">
                      {(bundle.documents || []).map((row) => (
                        <li key={row.id} className="flex justify-between gap-3">
                          <Link className="underline" to={`${createPageUrl("Documents")}/${row.id}`}>
                            {row.title || row.type} · {row.type}
                          </Link>
                          <Badge variant="outline">{row.status || "—"}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attendance">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Attendance</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {sectionLoading === "attendance" ? <p className="text-muted-foreground">Loading attendance…</p> : null}
                  <p>
                    Status: <Badge variant="outline">{bundle.attendance?.status || employee.attendance_status || "unprovisioned"}</Badge>
                  </p>
                  <p className="text-muted-foreground">
                    Clock-in is not on this release. This attendance profile uses the same employee id and will hold timesheets when that product ships.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {sectionLoading === "activity" ? <p className="text-sm text-muted-foreground">Loading activity…</p> : null}
                  {(bundle.audit || []).length === 0 && sectionLoading !== "activity" ? (
                    <p className="text-sm text-muted-foreground">No workforce events yet.</p>
                  ) : (
                    <ul className="text-sm space-y-3">
                      {(bundle.audit || []).map((row) => (
                        <li key={`${row.source}-${row.id}`} className="border-b border-border/60 pb-2 last:border-0">
                          <div className="flex justify-between gap-3">
                            <span className="font-medium">{row.action}</span>
                            <span className="text-xs text-muted-foreground">{row.at ? String(row.at).slice(0, 16).replace("T", " ") : ""}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{row.source}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : null}
      </PageTemplate.Body>
    </PageTemplate>
  );
}

function Stat({ label, value }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
