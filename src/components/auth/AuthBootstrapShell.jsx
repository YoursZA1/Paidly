import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

/**
 * Full-screen gate while the initial Supabase session + profile bootstrap runs.
 * Matches RequireAuth fail-safe UX (retry / reload).
 */
export default function AuthBootstrapShell() {
  const { authLoadingTimedOut, retryAuthBootstrap } = useAuth();

  if (authLoadingTimedOut) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          We could not finish loading your session in time. This is usually a slow connection or a temporary
          server issue.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button type="button" onClick={() => void retryAuthBootstrap()}>
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex flex-col items-center justify-center gap-3">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden
      />
      <div className="text-sm text-muted-foreground">Checking session…</div>
    </div>
  );
}
