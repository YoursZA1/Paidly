import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronUp, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Full-screen recovery UI when the app throws during render (see AppErrorBoundary in main.jsx).
 * @param {{ error: Error | null, onReset: () => void }} props
 */
export default function ApplicationErrorPage({ error, onReset }) {
  const [showDetails, setShowDetails] = useState(import.meta.env.DEV);
  const message = error?.message || String(error || 'Unknown error');

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  const handleHome = useCallback(() => {
    window.location.assign('/');
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 20%, hsl(var(--primary)) 0%, transparent 45%),
            radial-gradient(circle at 80% 80%, hsl(var(--primary)) 0%, transparent 40%)`,
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Paidly ran into an unexpected problem. This is usually temporary — try again, refresh the page, or go back
          home. If the application just got updated, try a hard refresh so your browser loads the latest version.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button type="button" onClick={onReset} className="gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={handleReload} className="gap-2">
            Reload page
          </Button>
          <Button type="button" variant="secondary" onClick={handleHome} className="gap-2">
            <Home className="h-4 w-4" aria-hidden />
            Go home
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="mt-10 flex items-center gap-2 text-left text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {showDetails ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              Hide technical details
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              Show technical details
            </>
          )}
        </button>

        {showDetails ? (
          <pre
            className="mt-3 max-h-48 overflow-auto rounded-lg border border-border bg-muted/50 p-3 text-left font-mono text-[11px] leading-relaxed text-foreground"
            role="region"
            aria-label="Error details"
          >
            {message}
            {import.meta.env.DEV && error?.stack ? `\n\n${error.stack}` : ''}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Unknown route — same visual language as {@link ApplicationErrorPage} (inside Router).
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[70vh] overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `radial-gradient(circle at 30% 30%, hsl(var(--primary)) 0%, transparent 50%)`,
        }}
      />
      <div className="relative mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
        <p className="mb-2 text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Page not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          That URL does not match any page in Paidly. Check the address or use the navigation to continue.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button type="button" className="gap-2" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => navigate('/')}>
            <Home className="h-4 w-4" aria-hidden />
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}
