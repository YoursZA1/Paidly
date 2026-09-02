import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarOff, ChevronLeft, ChevronRight } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import { leaveApi } from "@/services/PayrollApiService";
import { useToast } from "@/components/ui/use-toast";
import FeatureGate from "@/components/subscription/FeatureGate";
import { useAuth } from "@/contexts/AuthContext";
import { daysInMonth, eachIsoDateInclusive, formatIsoDate, monthLabel } from "@shared/payroll/dates.js";

function addDays(iso, n) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return formatIsoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export default function LeaveCalendarPage() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const userPlan = profile?.subscription_plan || profile?.plan || "starter";
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState("month");
  const [weekStart, setWeekStart] = useState(() => {
    const day = now.getDay();
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - day));
    return formatIsoDate(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate());
  });
  const [events, setEvents] = useState([]);

  const start = view === "week" ? weekStart : formatIsoDate(year, month, 1);
  const end = view === "week" ? addDays(weekStart, 6) : formatIsoDate(year, month, daysInMonth(year, month));

  const load = async () => {
    try {
      setEvents((await leaveApi.calendar(start, end)) || []);
    } catch (err) {
      toast({ title: "Could not load calendar", description: err.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    load();
  }, [start, end]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      let cursor = ev.start_date;
      while (cursor <= ev.end_date && cursor <= end) {
        if (cursor >= start) {
          const list = map.get(cursor) || [];
          list.push(ev);
          map.set(cursor, list);
        }
        const [y, m, d] = cursor.split("-").map(Number);
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        cursor = formatIsoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
      }
    }
    return map;
  }, [events, start, end]);

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const dim = daysInMonth(year, month);
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= dim; d += 1) cells.push(d);

  const prev = () => {
    if (view === "week") {
      setWeekStart(addDays(weekStart, -7));
      return;
    }
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else setMonth(month - 1);
  };
  const next = () => {
    if (view === "week") {
      setWeekStart(addDays(weekStart, 7));
      return;
    }
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else setMonth(month + 1);
  };

  const weekDays = view === "week" ? eachIsoDateInclusive(start, end) : [];

  return (
    <FeatureGate feature="leave_management" userPlan={userPlan}>
      <PageTemplate>
        <PageTemplate.Header>
          <PageHeader
            title="Leave calendar"
            description="Approved and pending leave. Reasons are not shown."
            icon={<CalendarOff className="h-4 w-4" />}
          >
            <Button asChild variant="outline" className="rounded-xl h-9">
              <Link to={createPageUrl("Leave")}>Requests</Link>
            </Button>
          </PageHeader>
        </PageTemplate.Header>
        <PageTemplate.Body>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <Button variant="outline" size="icon" className="rounded-xl" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-lg font-semibold">
              {view === "week" ? `${start} → ${end}` : monthLabel(year, month)}
            </h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant={view === "month" ? "default" : "outline"} className="rounded-xl" onClick={() => setView("month")}>Month</Button>
              <Button size="sm" variant={view === "week" ? "default" : "outline"} className="rounded-xl" onClick={() => setView("week")}>Week</Button>
              <Button variant="outline" size="icon" className="rounded-xl" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden border border-border bg-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-muted/60 px-2 py-1 text-xs font-medium text-muted-foreground">{d}</div>
            ))}
            {(view === "week" ? weekDays : cells).map((day, i) => {
              const iso = view === "week" ? day : (day ? formatIsoDate(year, month, day) : null);
              const dayEvents = iso ? byDate.get(iso) || [] : [];
              return (
                <Card key={iso || i} className="rounded-none border-0 min-h-[88px]">
                  <CardContent className="p-2">
                    {iso ? <p className="text-xs font-medium mb-1">{iso.slice(8)}</p> : null}
                    <div className="space-y-1">
                      {dayEvents.slice(0, view === "week" ? 8 : 3).map((ev) => (
                        <div key={ev.id + iso} className="truncate text-[11px]">
                          <Badge variant="outline" className="font-normal max-w-full truncate">
                            {ev.employee} · {ev.leave_code} · {ev.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </PageTemplate.Body>
      </PageTemplate>
    </FeatureGate>
  );
}
