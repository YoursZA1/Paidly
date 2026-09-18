import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Cake, CalendarDays } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";
import { workforceApi, employeeProfilePath } from "@/services/WorkforceApiService";
import { useToast } from "@/components/ui/use-toast";

const VIEWS = [
  { id: "upcoming", label: "Next 30 days", days: 30 },
  { id: "month", label: "This month", days: 45 },
  { id: "extended", label: "Next 90 days", days: 90 },
];

function formatDisplayDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export default function WorkforcePeopleCalendar() {
  const { toast } = useToast();
  const [view, setView] = useState("upcoming");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const daysAhead = VIEWS.find((v) => v.id === view)?.days || 30;

  useEffect(() => {
    setLoading(true);
    workforceApi
      .peopleCalendar({ daysAhead })
      .then(setData)
      .catch((err) =>
        toast({
          variant: "destructive",
          title: "Could not load people calendar",
          description: err.message,
        })
      )
      .finally(() => setLoading(false));
  }, [daysAhead, toast]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (view === "month") return data.this_month || [];
    return data.upcoming || data.events || [];
  }, [data, view]);

  const birthdays = rows.filter((e) => e.kind === "birthday");
  const anniversaries = rows.filter((e) => e.kind === "work_anniversary");

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="People calendar"
          description="Upcoming birthdays and work anniversaries from employee profiles — one calendar, not a separate HR system."
          icon={<CalendarDays className="h-4 w-4" />}
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <WorkforceSubnav />
        <div className="mb-4 flex flex-wrap gap-2">
          {VIEWS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={view === item.id ? "default" : "outline"}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <EventList
              title="Upcoming birthdays"
              icon={<Cake className="h-4 w-4" />}
              empty="No birthdays in this window. Add date of birth on employee profiles."
              events={birthdays}
            />
            <EventList
              title="Work anniversaries"
              icon={<CalendarDays className="h-4 w-4" />}
              empty="No work anniversaries in this window."
              events={anniversaries}
            />
          </div>
        )}
      </PageTemplate.Body>
    </PageTemplate>
  );
}

function EventList({ title, icon, empty, events }) {
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!events?.length ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li
                key={`${event.kind}-${event.membership_id}-${event.event_date}`}
                className="rounded-lg border border-border px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={employeeProfilePath(event.membership_id)}
                    className="text-sm font-medium hover:underline"
                  >
                    {event.employee_name}
                  </Link>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatDisplayDate(event.event_date)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{event.label}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {event.department ? <Badge variant="secondary">{event.department}</Badge> : null}
                  {event.kind === "birthday" && event.age != null ? (
                    <Badge variant="outline">Age {event.age}</Badge>
                  ) : null}
                  {event.kind === "work_anniversary" && event.years != null ? (
                    <Badge variant="outline">{event.years} yr</Badge>
                  ) : null}
                  {event.milestone ? <Badge>Milestone</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
