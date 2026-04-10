import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppQueryClient } from '@/lib/query-client'
import App from '@/App.jsx'
import ApplicationErrorPage from '@/pages/ApplicationErrorPage.jsx'
import '@/index.css'
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import { logUnhandledError, getCurrentPage } from '@/utils/apiLogger'
import {
    installGlobalAsyncErrorHandlers,
    PAIDLY_APPLICATION_ERROR_EVENT,
} from '@/utils/globalAsyncErrorHandlers'

installGlobalAsyncErrorHandlers()

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

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidMount() {
        this._onApplicationError = (e) => {
            const err = e?.detail?.error;
            if (!(err instanceof Error)) return;
            this.setState({ hasError: true, error: err });
        };
        window.addEventListener(PAIDLY_APPLICATION_ERROR_EVENT, this._onApplicationError);
    }

    componentWillUnmount() {
        window.removeEventListener(PAIDLY_APPLICATION_ERROR_EVENT, this._onApplicationError);
    }

    componentDidCatch(error, info) {
        logUnhandledError(error, getCurrentPage());
        console.error('App crashed:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <ApplicationErrorPage
                    error={this.state.error}
                    onReset={() => this.setState({ hasError: false, error: null })}
                />
            );
        }

        return this.props.children;
    }
}

const queryClient = createAppQueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" storageKey="theme" enableSystem>
        <AuthProvider>
          <AppProvider>
            <AppErrorBoundary>
              <App />
            </AppErrorBoundary>
          </AppProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
)