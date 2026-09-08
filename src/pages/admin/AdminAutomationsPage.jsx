import PageContainer from "@/components/admin/shell/PageContainer";
import { AdminUnavailableState } from "@/components/admin/ui/AdminStates";

export default function AdminAutomationsPage() {
  return (
    <PageContainer
      title="Automations"
      description="Reminders and dunning already run through /api/cron. There is no separate automations catalog table to list here."
    >
      <AdminUnavailableState reason="Paidly does not persist a platform automations registry. Scheduled jobs live in cron (dunning, reminders, admin broadcast email). Use System Health and Audit Logs for operational follow-up." />
    </PageContainer>
  );
}
