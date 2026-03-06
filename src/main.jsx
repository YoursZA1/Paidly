import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import App from '@/App.jsx'
import '@/index.css'

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('App crashed:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-white text-slate-900 flex items-center justify-center p-6">
                    <div className="max-w-xl text-center">
                        <h1 className="text-2xl font-semibold mb-2">Application error</h1>
                        <p className="text-sm text-slate-600 mb-4">Open the browser console for details.</p>
                        <pre className="text-left text-xs bg-slate-100 rounded-md p-3 overflow-auto">
                            {String(this.state.error?.message || this.state.error)}
                        </pre>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <AppErrorBoundary>
        <ThemeProvider attribute="class" defaultTheme="system" storageKey="theme" enableSystem>
            <App />
        </ThemeProvider>
    </AppErrorBoundary>
)