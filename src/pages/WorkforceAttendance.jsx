import { ClipboardList } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";

export default function WorkforceAttendance() {
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
          <CardContent className="p-6 text-sm text-muted-foreground">
            Attendance stays on the same membership ID. Deactivating an employee pauses attendance participation without deleting historical clock data when that product ships.
          </CardContent>
        </Card>
      </PageTemplate.Body>
    </PageTemplate>
  );
}
