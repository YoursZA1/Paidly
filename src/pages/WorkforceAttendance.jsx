import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";
import { workforceApi, employeeProfilePath } from "@/services/WorkforceApiService";
import { useToast } from "@/components/ui/use-toast";

export default function WorkforceAttendance() {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workforceApi
      .list({ include: "attendance", status: "active", limit: 100, sort: "name" })
      .then((data) => setRows(data.items || []))
      .catch((err) => toast({ variant: "destructive", title: "Could not load attendance", description: err.message }))
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Attendance"
          description="Clock-in and timesheets are not on this release. Each employee already has an attendance profile for when that product ships."
          icon={<ClipboardList className="h-4 w-4" />}
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <WorkforceSubnav />
        <Card className="rounded-xl">
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No employees in your scope. Attendance stays on the same membership ID when clock-in ships.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2">Employee</th>
                    <th className="px-4 py-2">Department</th>
                    <th className="px-4 py-2">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Link className="underline" to={employeeProfilePath(row.id, "attendance")}>
                          {row.full_name || row.label}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{row.department || "—"}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline">{row.attendance_status || "unprovisioned"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </PageTemplate.Body>
    </PageTemplate>
  );
}
