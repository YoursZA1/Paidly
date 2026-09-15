import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { workforceApi, employeeProfilePath } from "@/services/WorkforceApiService";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import {
  filterWorkforceDirectory,
  leaveStatusLabel,
  sortWorkforceDirectory,
} from "@/lib/workforceDirectory.js";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";
import EmployeeSelect from "@/components/workforce/EmployeeSelect";
import EmployeeLifecycleBadges from "@/components/workforce/EmployeeLifecycleBadges.jsx";
import EmployeeDirectoryActions from "@/components/workforce/EmployeeDirectoryActions.jsx";
import { eligibleManagersFromRoster } from "@shared/workforce/employeeLifecycle.js";

const selectClass = "h-10 rounded-xl border border-border bg-background px-3 text-sm";

export default function Employees({ embedded = false }) {
  const { toast } = useToast();
  const { hasPermission } = useCompanyContext();
  const canPayroll = hasPermission(PERMISSIONS.MANAGE_PAYROLL);
  const canManage = hasPermission(PERMISSIONS.MANAGE_EMPLOYEES);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("active");
  const [managerId, setManagerId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [leaveStatus, setLeaveStatus] = useState("");
  const [attention, setAttention] = useState(false);
  const [sort, setSort] = useState("name");
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = () => {
    workforceApi
      .list()
      .then((data) => setRows(Array.isArray(data) ? data : data?.data || []))
      .catch((err) => toast({ variant: "destructive", title: "Could not load employees", description: err.message }))
      .finally(() => setLoading(false));
    workforceApi
      .summary()
      .then(setSummary)
      .catch(() => setSummary(null));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const replaceRow = (updated) => {
    if (!updated?.id) {
      load();
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
    load();
  };

  const departments = useMemo(
    () => [...new Set(rows.map((row) => row.department).filter(Boolean))].sort(),
    [rows]
  );
  const jobTitles = useMemo(
    () => [...new Set(rows.map((row) => row.job_title).filter(Boolean))].sort(),
    [rows]
  );
  const managers = useMemo(() => {
    const byId = new Map();
    for (const row of rows) {
      if (!row.manager_membership_id) continue;
      if (!byId.has(row.manager_membership_id)) {
        byId.set(row.manager_membership_id, row.manager_name || "Manager");
      }
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const next = filterWorkforceDirectory(rows, {
      search,
      department,
      status,
      managerId,
      jobTitle,
      leaveStatus,
      attention,
    });
    return sortWorkforceDirectory(next, sort);
  }, [rows, search, department, status, managerId, jobTitle, leaveStatus, attention, sort]);

  const inactiveManagerGroups = useMemo(() => {
    const byId = new Map();
    for (const row of rows) {
      if (row.manager_assignment !== "inactive" || !row.manager_membership_id) continue;
      const current = byId.get(row.manager_membership_id) || {
        id: row.manager_membership_id,
        name: row.manager_name || "Manager",
        count: 0,
      };
      current.count += 1;
      byId.set(row.manager_membership_id, current);
    }
    return [...byId.values()];
  }, [rows]);

  const eligibleManagers = useMemo(() => eligibleManagersFromRoster(rows), [rows]);

  const runBulkReassign = async () => {
    if (!bulkFrom || !bulkTo) return;
    setBulkSaving(true);
    try {
      const result = await workforceApi.reassignReports(bulkFrom, bulkTo);
      toast({ title: "Team reassigned", description: `${result?.updated || 0} employee(s) moved to an active manager.` });
      setBulkFrom("");
      setBulkTo("");
      load();
    } catch (err) {
      toast({ variant: "destructive", title: "Could not reassign team", description: err.message });
    } finally {
      setBulkSaving(false);
    }
  };

  const table = (
    <>
      {!embedded && summary ? (
        <div className="grid gap-2 sm:grid-cols-5 mb-4">
          <Kpi label="Active" value={summary.workforce?.active ?? 0} />
          <Kpi label="Inactive" value={summary.workforce?.inactive ?? 0} />
          <Kpi label="Needs attention" value={summary.workforce?.needs_attention ?? 0} />
          <Kpi label="Reassignment" value={summary.workforce?.awaiting_reassignment ?? 0} />
          <Kpi label="Payslips issued" value={summary.payroll?.payslips_generated ?? 0} />
        </div>
      ) : null}
      {!embedded && summary?.payroll?.needs_adjustment_run ? (
        <p className="text-sm text-amber-800 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-4">
          Leave was approved after a finalized pay run. Open Payroll and create an adjustment run so unpaid leave is not missed.
        </p>
      ) : null}
      {canManage && inactiveManagerGroups.length > 0 ? (
        <Card className="rounded-xl mb-4 border-amber-500/30 bg-amber-500/10">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium">Manager inactive — reassignment required</p>
            <p className="text-sm text-muted-foreground">
              Deactivated managers are kept. Their teams stay assigned until you move them to an active manager.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <select className={selectClass} value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)}>
                <option value="">Inactive manager</option>
                {inactiveManagerGroups.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} ({row.count})
                  </option>
                ))}
              </select>
              <EmployeeSelect
                employees={eligibleManagers}
                value={bulkTo}
                onChange={setBulkTo}
                emptyLabel="Active manager"
              />
              <Button className="rounded-xl h-10" disabled={bulkSaving || !bulkFrom || !bulkTo} onClick={runBulkReassign}>
                {bulkSaving ? "Reassigning…" : "Reassign team"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Input
          className="rounded-xl h-10"
          placeholder="Search name or number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={selectClass} value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
        <select className={selectClass} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}>
          <option value="">All job titles</option>
          {jobTitles.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="">All statuses</option>
        </select>
        <select className={selectClass} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">All managers</option>
          <option value="__none__">No manager</option>
          <option value="__inactive__">Manager inactive</option>
          {managers.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
        <select className={selectClass} value={leaveStatus} onChange={(e) => setLeaveStatus(e.target.value)}>
          <option value="">All leave statuses</option>
          <option value="on_leave">On leave</option>
          <option value="pending">Pending leave</option>
          <option value="upcoming">Upcoming leave</option>
          <option value="none">None</option>
        </select>
        <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Sort by name</option>
          <option value="number">Sort by number</option>
          <option value="title">Sort by job title</option>
          <option value="department">Sort by department</option>
          <option value="start">Sort by start date</option>
          <option value="status">Sort by status</option>
        </select>
        <label className="flex items-center gap-2 text-sm px-1">
          <input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} />
          Needs attention
        </label>
      </div>
      <Card className="rounded-xl">
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No employees in your scope.</p>
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2">Employee</th>
                  <th className="px-4 py-2">Number</th>
                  <th className="px-4 py-2">Job title</th>
                  <th className="px-4 py-2">Department</th>
                  <th className="px-4 py-2">Manager</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Joined</th>
                  <th className="px-4 py-2">Leave</th>
                  {canPayroll ? <th className="px-4 py-2">Pay type</th> : null}
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <Link className="underline" to={employeeProfilePath(row.id)}>
                        {row.full_name || row.label}
                      </Link>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{row.employee_number || "—"}</td>
                    <td className="px-4 py-2">{row.job_title || "—"}</td>
                    <td className="px-4 py-2">{row.department || "—"}</td>
                    <td className="px-4 py-2">{row.manager_name || "—"}</td>
                    <td className="px-4 py-2">
                      <EmployeeLifecycleBadges employee={row} compact />
                    </td>
                    <td className="px-4 py-2">{row.employment_start_date || "—"}</td>
                    <td className="px-4 py-2">{leaveStatusLabel(row.leave_status)}</td>
                    {canPayroll ? <td className="px-4 py-2">{row.pay_type || "—"}</td> : null}
                    <td className="px-4 py-2 text-right">
                      <EmployeeDirectoryActions
                        employee={row}
                        roster={rows}
                        departments={departments}
                        canManage={canManage}
                        onUpdated={replaceRow}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );

  if (embedded) return table;

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader title="Employees" description="One employee profile feeds leave, payroll, and payslips." icon={<Users className="h-4 w-4" />} />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <WorkforceSubnav />
        {table}
      </PageTemplate.Body>
    </PageTemplate>
  );
}

function Kpi({ label, value }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
