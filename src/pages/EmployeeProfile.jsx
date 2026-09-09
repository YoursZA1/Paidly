import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { workforceApi } from "@/services/WorkforceApiService";
import { parseUuid } from "@shared/ids/uuid.js";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import EmployeeSelect from "@/components/workforce/EmployeeSelect";
import { createPageUrl } from "@/utils";

function employeeIdFromRoute(params, search) {
  return parseUuid(params?.id) || parseUuid(new URLSearchParams(search).get("id"));
}

export default function EmployeeProfile() {
  const { toast } = useToast();
  const { hasPermission } = useCompanyContext();
  const params = useParams();
  const location = useLocation();
  const id = employeeIdFromRoute(params, location.search);
  const canReassign = hasPermission(PERMISSIONS.MANAGE_EMPLOYEES);
  const [bundle, setBundle] = useState(null);
  const [roster, setRoster] = useState([]);
  const [managerId, setManagerId] = useState("");
  const [savingManager, setSavingManager] = useState(false);

  const employee = bundle?.employee || null;
  const canSeePay = Boolean(employee && !employee.compensation_redacted);

  useEffect(() => {
    if (!id) return;
    workforceApi
      .profile(id)
      .then((data) => {
        setBundle(data);
        setManagerId(parseUuid(data?.employee?.manager_membership_id) || "");
      })
      .catch((err) => toast({ variant: "destructive", title: "Could not load profile", description: err.message }));
    if (canReassign) {
      workforceApi
        .list()
        .then((rows) => setRoster(Array.isArray(rows) ? rows : rows?.data || []))
        .catch(() => setRoster([]));
    }
  }, [id, toast, canReassign]);

  const saveManager = async () => {
    if (!id) return;
    setSavingManager(true);
    try {
      const updated = await workforceApi.update(id, {
        manager_membership_id: parseUuid(managerId) || null,
      });
      setBundle((prev) => ({ ...prev, employee: updated }));
      setManagerId(parseUuid(updated?.manager_membership_id) || "");
      toast({ title: "Manager updated" });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not update manager", description: err.message });
    } finally {
      setSavingManager(false);
    }
  };

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
        {employee ? (
          <Tabs defaultValue="overview">
            <TabsList className="mb-4 flex-wrap h-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="employment">Employment</TabsTrigger>
              <TabsTrigger value="compensation">Compensation</TabsTrigger>
              <TabsTrigger value="leave">Leave</TabsTrigger>
              <TabsTrigger value="payslips">Payslips</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Department" value={employee.department || "—"} />
                <Stat label="Job title" value={employee.job_title || "—"} />
                <Stat label="Leave available" value={employee.leave_available ?? "—"} />
                <Stat label="Payslips" value={employee.payslip_count ?? (bundle.payslips || []).length} />
              </div>
              <Card className="rounded-xl mt-4">
                <CardContent className="pt-4 text-sm space-y-1">
                  <p>Number: {employee.employee_number || "—"}</p>
                  <p>Manager: {employee.manager_name || "—"}</p>
                  <p>
                    Status: <Badge variant="outline">{employee.employment_status}</Badge> · Portal {employee.portal_status}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="employment">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Employment</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>Number: {employee.employee_number || "—"}</p>
                  <p>Department: {employee.department || "—"}</p>
                  <p>Job title: {employee.job_title || "—"}</p>
                  <p>Manager: {employee.manager_name || "—"}</p>
                  <p>Start date: {employee.employment_start_date || "—"}</p>
                  <p>End date: {employee.employment_end_date || "—"}</p>
                  <p>
                    Status: <Badge variant="outline">{employee.employment_status}</Badge>
                  </p>
                  <p>Portal: {employee.portal_status}</p>
                  {canReassign ? (
                    <div className="pt-2 space-y-2">
                      <Label>Reassign manager</Label>
                      <EmployeeSelect
                        employees={roster.filter((row) => row.id !== id)}
                        value={managerId}
                        onChange={setManagerId}
                        emptyLabel="No manager"
                      />
                      <Button size="sm" className="rounded-xl" disabled={savingManager} onClick={saveManager}>
                        {savingManager ? "Saving…" : "Save manager"}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="compensation">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Compensation</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {canSeePay ? (
                    <>
                      <p>Pay type: {employee.pay_type || "—"}</p>
                      <p>Salary: {employee.base_salary ?? "—"}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Salary is visible only to payroll managers or the employee.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="leave">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Leave</CardTitle>
                </CardHeader>
                <CardContent>
                  {(bundle.leave_requests || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No leave requests.</p>
                  ) : (
                    <ul className="text-sm space-y-2">
                      {bundle.leave_requests.map((row) => (
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
                  {(bundle.payslips || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payslips.</p>
                  ) : (
                    <ul className="text-sm space-y-2">
                      {bundle.payslips.map((row) => (
                        <li key={row.id} className="flex justify-between gap-3">
                          <Link className="underline" to={`${createPageUrl("ViewPayslip")}?id=${row.id}`}>
                            {row.payslip_number || "Payslip"} · {row.pay_period_start} → {row.pay_period_end}
                          </Link>
                          <span className="tabular-nums text-muted-foreground">
                            {canSeePay ? row.net_pay ?? "—" : "Hidden"}
                          </span>
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
                  {(bundle.documents || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hub documents linked to this employee.</p>
                  ) : (
                    <ul className="text-sm space-y-2">
                      {bundle.documents.map((row) => (
                        <li key={row.id} className="flex justify-between gap-3">
                          <span>
                            {row.title || row.type} · {row.type}
                          </span>
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
                  <p>
                    Status: <Badge variant="outline">{bundle.attendance?.status || employee.attendance_status || "unprovisioned"}</Badge>
                  </p>
                  <p className="text-muted-foreground">
                    Attendance is provisioned with the employee. Clock-in product features subscribe later without a second person record.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audit">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Audit</CardTitle>
                </CardHeader>
                <CardContent>
                  {(bundle.audit || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No workforce events yet.</p>
                  ) : (
                    <ul className="text-sm space-y-3">
                      {bundle.audit.map((row) => (
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
