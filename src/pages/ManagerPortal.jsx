import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ClipboardList } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { leaveApi } from "@/services/PayrollApiService";
import { workforceApi, employeeProfilePath } from "@/services/WorkforceApiService";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ManagerPortal() {
  const { toast } = useToast();
  const [requests, setRequests] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [team, setTeam] = useState([]);
  const [acting, setActing] = useState("");
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = () =>
    Promise.all([
      leaveApi.requests({ status: "pending" }),
      leaveApi.requests({ status: "approved", from: todayIso() }),
      workforceApi.list().catch(() => []),
    ])
      .then(([pending, approved, employees]) => {
        setRequests(Array.isArray(pending) ? pending : []);
        setUpcoming(Array.isArray(approved) ? approved : []);
        setTeam(Array.isArray(employees) ? employees : employees?.data || []);
      })
      .catch((err) => toast({ variant: "destructive", title: "Could not load leave", description: err.message }));

  useEffect(() => {
    load();
  }, []);

  const decide = async (id, approve) => {
    if (!approve && !rejectReason.trim()) {
      toast({ variant: "destructive", title: "Decline reason required" });
      return;
    }
    setActing(id);
    try {
      if (approve) await leaveApi.approve(id);
      else {
        await leaveApi.reject(id, rejectReason.trim());
        setRejectId(null);
        setRejectReason("");
      }
      await load();
    } catch (err) {
      toast({ variant: "destructive", title: "Could not update leave", description: err.message });
    } finally {
      setActing("");
    }
  };

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Manager portal"
          description="Approve leave for your direct reports. This is the same leave record payroll uses."
          icon={<ClipboardList className="h-4 w-4" />}
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-xl lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Pending leave</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending requests for your team.</p>
              ) : (
                requests.map((row) => (
                  <div key={row.id} className="rounded-xl border p-3 space-y-2">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-medium">{row.payroll_profiles?.full_name || "Employee"}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.leave_types?.name} · {row.start_date} → {row.end_date} · {row.working_days} days
                        </p>
                        {row.reason ? <p className="text-xs text-muted-foreground mt-1">{row.reason}</p> : null}
                      </div>
                      <Badge variant="outline">{row.status}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="rounded-xl" disabled={acting === row.id} onClick={() => decide(row.id, true)}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        disabled={acting === row.id}
                        onClick={() => setRejectId(row.id)}
                      >
                        Decline
                      </Button>
                      {row.employee_id ? (
                        <Link className="text-xs underline self-center" to={employeeProfilePath(row.employee_id)}>
                          Profile
                        </Link>
                      ) : null}
                    </div>
                    {rejectId === row.id ? (
                      <div className="flex gap-2">
                        <Input
                          className="h-9 rounded-xl"
                          placeholder="Decline reason"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                        <Button size="sm" variant="destructive" className="rounded-xl" disabled={acting === row.id} onClick={() => decide(row.id, false)}>
                          Confirm
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-base">Upcoming approved leave</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming leave for your reports.</p>
              ) : (
                upcoming.map((row) => (
                  <div key={row.id} className="flex justify-between gap-3 text-sm">
                    <span>
                      {row.payroll_profiles?.full_name} · {row.leave_types?.name} · {row.start_date} → {row.end_date}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{row.working_days}d</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-base">Team balances</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {team.length === 0 ? (
                <p className="text-sm text-muted-foreground">No direct reports.</p>
              ) : (
                team.map((row) => (
                  <div key={row.id} className="flex justify-between gap-3 text-sm">
                    <Link className="underline" to={employeeProfilePath(row.id)}>
                      {row.label || row.full_name}
                    </Link>
                    <span className="tabular-nums text-muted-foreground">{row.leave_available ?? "—"}d</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </PageTemplate.Body>
    </PageTemplate>
  );
}
