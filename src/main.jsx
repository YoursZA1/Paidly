import ReactDOM from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppQueryClient } from '@/lib/query-client'
import App from '@/App.jsx'
import '@/index.css'
import ErrorBoundary from '@/components/ErrorBoundary.jsx'
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import ConnectionMonitor from "@/components/connection/ConnectionMonitor.jsx";
import SessionActivityBeacon from "@/components/activity/SessionActivityBeacon.jsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
    installGlobalAsyncErrorHandlers,
} from '@/utils/globalAsyncErrorHandlers'

installGlobalAsyncErrorHandlers()

/** Legacy `paidly_data` only. Supabase auth keys use `safeAuthStorage` (scrub on read) and are not nuked here. */
function recoverFromCorruptedStorage() {
    if (typeof window === "undefined") return;

    const RECOVERY_RELOAD_ONCE_KEY = "paidly_storage_recovery_reloaded_once";
    try {
        const raw = localStorage.getItem("paidly_data");
        if (!raw) return;

        const data = JSON.parse(raw);
        if (!data || !data.user) {
            throw new Error("Invalid data");
        }
    } catch {
        // Prevent infinite reload loops if storage is consistently unreadable.
        const alreadyReloaded = sessionStorage.getItem(RECOVERY_RELOAD_ONCE_KEY) === "1";
        if (alreadyReloaded) return;
        try {
            sessionStorage.setItem(RECOVERY_RELOAD_ONCE_KEY, "1");
            localStorage.clear();
            sessionStorage.clear();
        } catch {
            // ignore
        }
        window.location.reload();
    }
}

recoverFromCorruptedStorage()

const queryClient = createAppQueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" storageKey="theme" enableSystem>
        <TooltipProvider delayDuration={0} skipDelayDuration={0}>
          <ErrorBoundary>
            <AuthProvider>
              <AppProvider>
                <ConnectionMonitor />
                <SessionActivityBeacon />
                <App />
              </AppProvider>
            </AuthProvider>
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
)