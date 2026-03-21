import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '@/App.jsx'
import '@/index.css'
import { logUnhandledError, getCurrentPage } from '@/utils/apiLogger'

// WebKit/Chromium often emit this during layout (Radix, tables); it is harmless and floods the console.
const RESIZE_OBSERVER_LOOP_RE = /^ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)/i
if (typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    (event) => {
      if (RESIZE_OBSERVER_LOOP_RE.test(String(event?.message || ''))) {
        event.stopImmediatePropagation()
      }
    },
    true
  )
}

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        logUnhandledError(error, getCurrentPage());
        console.error('App crashed:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold mb-2">Application error</h1>
                        <p className="text-sm text-muted-foreground mb-4">Open the browser console for details.</p>
                        <pre className="text-left text-xs bg-muted rounded-md p-3 overflow-auto text-foreground">
                            {String(this.state.error?.message || this.state.error)}
                        </pre>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 5 min so navigating back (Dashboard → Clients → Invoices → Dashboard) uses cache
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
      // Avoid refetch when mounting a page that already has cached data (e.g. back to Invoices/Clients)
      refetchOnMount: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
    <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="system" storageKey="theme" enableSystem>
            <App />
          </ThemeProvider>
        </QueryClientProvider>
    </AppErrorBoundary>
)