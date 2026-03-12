import { useState } from "react";
import { Button } from "@/components/ui/button";
import SupabaseAuthService from "@/services/SupabaseAuthService";

/** Google "G" logo - multicolor */
function GoogleIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/** Apple logo - single color for dark/light backgrounds */
function AppleIcon({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-1.18 1.62-2.38 3.23-4.07 4.43-.96.71-1.95 1.48-3.23 1.47-1.27-.01-1.68-.42-3.18-.42-1.51 0-1.95.41-3.2.42-1.3.01-2.37-.74-3.35-1.47-2.02-1.5-3.57-3.34-4.74-5.38-2.57-3.83-4.54-10.1-1.89-14.5 1.33-2.2 3.71-3.59 6.27-3.59 1.27 0 2.4.43 3.4 1.2.99-.29 1.99-.54 3.09-.54 2.89 0 5.35 1.77 6.38 4.45-1.76 1.12-2.64 2.68-2.42 4.68.21 1.9 1.42 3.18 2.66 4.35z" />
    </svg>
  );
}

export default function AuthSocialButtons({ mode = "signin", className = "" }) {
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [error, setError] = useState("");

  const redirectTo = typeof window !== "undefined" ? window.location.origin : null;

  const handleOAuth = async (provider) => {
    setError("");
    setLoadingProvider(provider);
    try {
      const { data } = await SupabaseAuthService.signInWithOAuth(provider, redirectTo);
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      setError(err?.message || "Could not start sign in.");
      setLoadingProvider(null);
    }
  };

  return (
    <div className={className}>
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">Or continue with</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-12 rounded-xl border-border bg-background hover:bg-muted/50"
          onClick={() => handleOAuth("google")}
          disabled={!!loadingProvider}
        >
          {loadingProvider === "google" ? (
            <span className="inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          ) : (
            <GoogleIcon className="w-5 h-5 shrink-0" />
          )}
          <span className="ml-2 hidden xs:inline">Google</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 rounded-xl border-border bg-background hover:bg-muted/50"
          onClick={() => handleOAuth("apple")}
          disabled={!!loadingProvider}
        >
          {loadingProvider === "apple" ? (
            <span className="inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          ) : (
            <AppleIcon className="w-5 h-5 shrink-0" />
          )}
          <span className="ml-2 hidden xs:inline">Apple</span>
        </Button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
