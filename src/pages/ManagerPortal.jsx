import { Navigate, useSearchParams } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { createPageUrl } from "@/utils";
import Employees from "@/pages/Employees";
import LeaveManagementPage from "@/pages/Leave";
import LeaveCalendarPage from "@/pages/LeaveCalendar";
import MyPayrollPage from "@/pages/MyPayroll";
import WorkforceSubnav from "@/components/workforce/WorkforceSubnav.jsx";

const TABS = new Set(["team", "leave", "calendar", "me"]);

export default function ManagerPortal() {
  const { loading, hasPermission } = useCompanyContext();
  const [params, setParams] = useSearchParams();
  const requested = String(params.get("tab") || "team").toLowerCase();
  const tab = TABS.has(requested) ? requested : "team";

  if (loading) return <AuthBootstrapShell />;

  if (hasPermission(PERMISSIONS.MANAGE_LEAVE)) {
    return <Navigate to={createPageUrl("Workforce")} replace />;
  }

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Manager portal"
          description="Your direct reports, their leave, and your own payslips. Salary stays off this page."
          icon={<ClipboardList className="h-4 w-4" />}
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <WorkforceSubnav />
        <Tabs
          value={tab}
          onValueChange={(next) => {
            const copy = new URLSearchParams(params);
            copy.set("tab", next);
            setParams(copy, { replace: true });
          }}
        >
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="leave">Leave</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="me">Me</TabsTrigger>
          </TabsList>
          <TabsContent value="team">
            <Employees embedded />
          </TabsContent>
          <TabsContent value="leave">
            <LeaveManagementPage embedded />
          </TabsContent>
          <TabsContent value="calendar">
            <LeaveCalendarPage embedded />
          </TabsContent>
          <TabsContent value="me">
            <MyPayrollPage embedded />
          </TabsContent>
        </Tabs>
      </PageTemplate.Body>
    </PageTemplate>
  );
}
