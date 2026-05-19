import { AppProvider } from "@/contexts/AppContext";
import ConnectionMonitor from "@/components/connection/ConnectionMonitor";
import SyncEngine from "@/components/sync/SyncEngine";
import SessionActivityBeacon from "@/components/activity/SessionActivityBeacon";
import InactivitySessionGuard from "@/components/session/InactivitySessionGuard";
import SessionExpiredModal from "@/components/session/SessionExpiredModal";

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
  return (
    <AppProvider>
      <ConnectionMonitor />
      <SyncEngine />
      <SessionActivityBeacon />
      <InactivitySessionGuard />
      <SessionExpiredModal />
      {children}
    </AppProvider>
  );
}
