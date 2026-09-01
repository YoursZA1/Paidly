import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Lock, Mail, Store } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AuthSocialButtons from "@/components/auth/AuthSocialButtons";
import { createPageUrl } from "@/utils";
import { completePostAuthNavigation } from "@/lib/postAuthNavigation";
import {
  getLoginThrottleState,
  recordLoginFailure,
  clearLoginFailures,
} from "@/utils/loginRateLimit";
import { patchAuthSession } from "@/stores/authSessionStore";
import { isAbortError } from "@/utils/retryOnAbort";
import { posAccessPath, posJoinPath } from "@shared/posStaffInvite.js";

function formatRetryMinutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

/**
 * Secure POS sign-in / device activation. Same Auth as Paidly — not a second POS login.
 * /pos and /pos/till/{id} never skip this when there is no Auth session.
 */
export default function PosAccessSignIn({
  activationOnly = false,
  signedInEmail = "",
  message = "",
} = {}) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submitLockRef = useRef(false);
  const returnPath = `${location.pathname || posAccessPath()}${location.search || ""}`;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isLoading || submitLockRef.current) return;
    if (honeypot) return;

    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    const throttle = getLoginThrottleState(normalizedEmail);
    if (throttle.blocked) {
      setError(
        `Too many sign-in attempts. Try again in about ${formatRetryMinutes(throttle.retryAfterMs)} minute(s).`
      );
      return;
    }

    submitLockRef.current = true;
    setIsLoading(true);
    try {
      await login({ email: normalizedEmail, password });
      clearLoginFailures(normalizedEmail);
      patchAuthSession({ loading: false });
      if (completePostAuthNavigation({ navigate, fromPath: returnPath })) return;
    } catch (err) {
      recordLoginFailure(normalizedEmail);
      setError(
        isAbortError(err)
          ? "Sign-in was interrupted. Please try again."
          : err?.message || "Could not open Paidly POS. Try again."
      );
    } finally {
      submitLockRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border shadow-none">
        <CardHeader className="space-y-1 pb-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary">
            <Store className="size-8 text-primary-foreground" />
          </div>
          <h1 className="font-display text-2xl font-bold">Paidly POS</h1>
          <p className="text-sm text-muted-foreground">
            {message ||
              (activationOnly
                ? "This device is not activated for POS yet."
                : "Sign in to open Paidly POS. A till link does not skip this step.")}
          </p>
        </CardHeader>
        <CardContent>
          {activationOnly ? (
            <div className="space-y-4">
              {signedInEmail ? (
                <p className="text-center text-sm text-muted-foreground">
                  Signed in as <strong>{signedInEmail}</strong>
                </p>
              ) : null}
              <Button asChild className="h-12 w-full">
                <Link to={posJoinPath()}>Activate this device with a backup code</Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Invited by email? Open the invitation link first, then return here.
              </p>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-9999px",
                  width: "1px",
                  height: "1px",
                  overflow: "hidden",
                  opacity: 0,
                  pointerEvents: "none",
                }}
              >
                <label htmlFor="pos-access-hp">Leave this blank</label>
                <input
                  id="pos-access-hp"
                  name="email_address"
                  type="text"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-access-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pos-access-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-access-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pos-access-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {error ? (
                <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="h-12 w-full" disabled={isLoading} aria-busy={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Opening POS…
                  </>
                ) : (
                  "Open Paidly POS"
                )}
              </Button>
              <AuthSocialButtons mode="signin" compact />
              <p className="text-center text-xs text-muted-foreground">
                Invited to this till? Use the link in your email, or{" "}
                <Link to={posJoinPath()} className="text-primary underline">
                  activate this device with a backup code
                </Link>
                .
              </p>
              <p className="text-center text-xs text-muted-foreground">
                <Link to={`${createPageUrl("Home")}#sign-in`} className="text-primary underline">
                  Paidly dashboard sign-in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
