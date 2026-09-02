import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarOff } from "lucide-react";
import { leaveApi } from "@/services/PayrollApiService";
import { countWorkingDays } from "@shared/leave/leaveMath.js";
import { createPageUrl } from "@/utils";
import FeatureGate from "@/components/subscription/FeatureGate";

function isoFromDate(d) {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

export default function CreateLeaveRequestPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const userPlan = profile?.subscription_plan || profile?.plan || "starter";
  const [me, setMe] = useState(null);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    leaveApi
      .me()
      .then((data) => {
        setMe(data);
        if (data?.balances?.[0]?.leave_type?.id) setLeaveTypeId(data.balances[0].leave_type.id);
      })
      .catch((err) => toast({ title: "Could not load leave balances", description: err.message, variant: "destructive" }));
  }, [toast]);

  const selected = (me?.balances || []).find((b) => b.leave_type.id === leaveTypeId);
  const workingDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return countWorkingDays(startDate, endDate, {
      excludeWeekends: selected?.leave_type?.exclude_weekends !== false,
      halfDay: halfDay && startDate === endDate,
    });
  }, [startDate, endDate, halfDay, selected]);

  const remaining = selected ? Math.round((selected.available - workingDays) * 100) / 100 : null;

  const submit = async () => {
    if (!leaveTypeId || !startDate || !endDate || workingDays <= 0) {
      toast({ variant: "destructive", title: "Select leave type and valid dates" });
      return;
    }
    setSaving(true);
    try {
      const result = await leaveApi.apply({
        leave_type_id: leaveTypeId,
        start_date: isoFromDate(startDate),
        end_date: isoFromDate(endDate),
        half_day: halfDay && startDate === endDate,
        reason,
      });
      toast({
        title: "Leave application submitted",
        description: `${result.preview?.workingDays} working day(s) · pending approval`,
      });
      navigate(createPageUrl("MyPayroll?tab=requests"));
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not submit leave request",
        description: e?.message || String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FeatureGate feature="leave_management" userPlan={userPlan}>
      <PageTemplate>
        <PageTemplate.Header>
          <PageHeader
            title="Apply for leave"
            description="Balances and working days are calculated on the server."
            icon={<CalendarOff className="h-4 w-4" />}
          >
            <Button className="rounded-xl bg-primary text-primary-foreground" disabled={saving} onClick={submit}>
              {saving ? "Submitting…" : "Submit application"}
            </Button>
          </PageHeader>
        </PageTemplate.Header>
        <PageTemplate.Body
          sidePanel={
            <>
              <Card className="rounded-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Employee</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="font-medium">{me?.profile?.full_name || user?.full_name || user?.email}</p>
                  <p className="text-muted-foreground">{me?.profile?.employee_number}</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Leave balances</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(me?.balances || []).map((b) => (
                    <div key={b.leave_type.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{b.leave_type.name}</span>
                      <span className="tabular-nums font-medium">{b.available}d</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          }
        >
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-base">Leave details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Leave type</Label>
                <select
                  className="mt-1 w-full h-10 rounded-xl border border-border bg-background px-3"
                  value={leaveTypeId}
                  onChange={(e) => setLeaveTypeId(e.target.value)}
                >
                  {(me?.balances || []).map((b) => (
                    <option key={b.leave_type.id} value={b.leave_type.id}>
                      {b.leave_type.name} ({b.available} available)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Start date</Label>
                  <Input type="date" className="rounded-xl mt-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <Label>End date</Label>
                  <Input type="date" className="rounded-xl mt-1" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={halfDay} onCheckedChange={(v) => setHalfDay(Boolean(v))} disabled={startDate !== endDate} />
                Half day (same-day requests only)
              </label>
              <div>
                <Label>Reason</Label>
                <Textarea className="rounded-xl mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm space-y-1">
                <p>You are requesting: <strong className="tabular-nums">{workingDays}</strong> working days</p>
                <p>Available: <strong className="tabular-nums">{selected?.available ?? "—"}</strong> days</p>
                <p>Remaining after approval: <strong className="tabular-nums">{remaining ?? "—"}</strong> days</p>
              </div>
            </CardContent>
          </Card>
        </PageTemplate.Body>
      </PageTemplate>
    </FeatureGate>
  );
}
