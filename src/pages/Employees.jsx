import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { workforceApi, employeeProfilePath } from "@/services/WorkforceApiService";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { filterWorkforceDirectory } from "@/lib/workforceDirectory.js";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";

const selectClass = "h-10 rounded-xl border border-border bg-background px-3 text-sm";

export default function Employees({ embedded = false }) {
  const { toast } = useToast();
  const { hasPermission } = useCompanyContext();
  const canPayroll = hasPermission(PERMISSIONS.MANAGE_PAYROLL);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [managerId, setManagerId] = useState("");

  useEffect(() => {
    workforceApi
      .list()
      .then((data) => setRows(Array.isArray(data) ? data : data?.data || []))
      .catch((err) => toast({ variant: "destructive", title: "Could not load employees", description: err.message }))
      .finally(() => setLoading(false));
    workforceApi
      .summary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [toast]);

  const departments = useMemo(
    () => [...new Set(rows.map((row) => row.department).filter(Boolean))].sort(),
    [rows]
  );
  const statuses = useMemo(
    () => [...new Set(rows.map((row) => row.employment_status).filter(Boolean))].sort(),
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

  const filtered = useMemo(
    () => filterWorkforceDirectory(rows, { search, department, status, managerId }),
    [rows, search, department, status, managerId]
  );

  const table = (
    <>
      {!embedded && summary ? (
        <div className="grid gap-2 sm:grid-cols-4 mb-4">
          <Kpi label="Workforce" value={summary.workforce?.active ?? summary.workforce?.total ?? 0} />
          <Kpi label="Pending leave" value={summary.leave?.pending ?? 0} />
          <Kpi label="Upcoming leave" value={summary.leave?.upcoming ?? 0} />
          <Kpi label="Payslips issued" value={summary.payroll?.payslips_generated ?? 0} />
        </div>
      ) : null}
      {!embedded && summary?.payroll?.needs_adjustment_run ? (
        <p className="text-sm text-amber-800 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-4">
          Leave was approved after a finalized pay run. Open Payroll and create an adjustment run so unpaid leave is not missed.
        </p>
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
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select className={selectClass} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">All managers</option>
          {managers.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
      </div>
      <Card className="rounded-xl">
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No employees in your scope.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2">Employee</th>
                  <th className="px-4 py-2">Department</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Leave</th>
                  {canPayroll ? <th className="px-4 py-2">Pay type</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <Link className="underline" to={employeeProfilePath(row.id)}>
                        {row.label || row.full_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{row.employee_number}</p>
                    </td>
                    <td className="px-4 py-2">{row.department || "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline">{row.employment_status}</Badge>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{row.leave_available ?? "—"}</td>
                    {canPayroll ? <td className="px-4 py-2">{row.pay_type || "—"}</td> : null}
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
