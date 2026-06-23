import { useEffect } from "react";
import { AppProvider } from "@/contexts/AppContext";
import { CompanyContextProvider } from "@/contexts/CompanyContext";
import ConnectionMonitor from "@/components/connection/ConnectionMonitor";
import SyncEngine from "@/components/sync/SyncEngine";
import SessionActivityBeacon from "@/components/activity/SessionActivityBeacon";
import InactivitySessionGuard from "@/components/session/InactivitySessionGuard";
import SessionExpiredModal from "@/components/session/SessionExpiredModal";
import PaymentReminderScheduler from "@/components/reminders/PaymentReminderScheduler";
import ProfileRealtimeBridge from "@/components/auth/ProfileRealtimeBridge";
import { connectExcelDatabase } from "@/services/ExcelDatabaseService";
import { installSessionTelemetryAdapter } from "@/lib/sessionTelemetryAdapter";

/**
 * Mounts all authenticated-only infrastructure providers.
 * Must NOT be rendered on public/auth routes (/Login, /Signup, /ForgotPassword, etc.)
 * so those pages carry zero realtime, sync, or activity overhead.
 *
 * Mount order matters:
 * - AppProvider: data hydration state (Dashboard, Invoices depend on useAppContext)
 * - ConnectionMonitor: kicks realtime on mount, maps transport state to UX
 * - SyncEngine: offline job queue + realtime bridge (needs userId from auth)
 * - SessionActivityBeacon: heartbeat on user interaction (needs active session)
 * - InactivitySessionGuard: idle-timeout logout (needs active session)
 * - SessionExpiredModal: full-screen expired UI (needs session state)
 */
export default function AuthenticatedShell({ children }) {
  useEffect(() => {
    connectExcelDatabase({ url: "/paidly_data.xlsx" }).catch(() => {
      // ignore bootstrap errors
    });
  }, []);

  useEffect(() => {
    let cleanup = null;
    void installSessionTelemetryAdapter().then((dispose) => {
      cleanup = typeof dispose === "function" ? dispose : null;
    });
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <AppProvider>
      <CompanyContextProvider>
      <ConnectionMonitor />
      <SyncEngine />
      <ProfileRealtimeBridge />
      <PaymentReminderScheduler />
      <SessionActivityBeacon />
      <InactivitySessionGuard />
      <SessionExpiredModal />
      {children}
      </CompanyContextProvider>
    </AppProvider>
  );
}
