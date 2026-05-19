import { useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AuthSocialButtons from "@/components/auth/AuthSocialButtons";
import {
  createPageUrl,
  createSignupUrl,
  getAppDashboardUrl,
  shouldRedirectToAppAfterAuth,
} from "@/utils";
import {
  getLoginThrottleState,
  recordLoginFailure,
  clearLoginFailures,
} from "@/utils/loginRateLimit";
import { isStaffDashboardRole, staffDashboardHomePath } from "@/lib/staffDashboard";
import { User } from "@/api/entities";
import { useTurnstileChallenge } from "@/hooks/useTurnstileChallenge";
import TurnstileChallenge from "@/components/security/TurnstileChallenge";
import SupabaseAuthService from "@/services/SupabaseAuthService";

function formatRetryMinutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || createPageUrl("Dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState("");
  const submitLockRef = useRef(false);
  const resendLockRef = useRef(false);

  const turnstile = useTurnstileChallenge({ requiredEnvKey: "VITE_TURNSTILE_REQUIRE_SIGNIN", requireInProdByDefault: false });

  const resolvePostLoginRoute = (userLike, fallbackPath) => {
    const role = String(userLike?.role || "").toLowerCase();
    if (isStaffDashboardRole(role)) return staffDashboardHomePath();
    const safeFallback = fallbackPath?.startsWith("/admin") ? createPageUrl("Dashboard") : fallbackPath;
    return safeFallback || createPageUrl("Dashboard");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading || submitLockRef.current) return;

    setError("");

    if (honeypot) return;

    const normalizedEmail = email.trim().toLowerCase();
    const throttle = getLoginThrottleState(normalizedEmail);
    if (throttle.blocked) {
      setError(`Too many sign-in attempts. Try again in about ${formatRetryMinutes(throttle.retryAfterMs)} minute(s).`);
      return;
    }

    if (turnstile.required && !turnstile.ready) {
      setError("Please complete the security check before signing in.");
      return;
    }

    submitLockRef.current = true;
    setIsLoading(true);

    try {
      await login({ email: normalizedEmail, password, turnstileToken: turnstile.token });
      clearLoginFailures(normalizedEmail);
      if (shouldRedirectToAppAfterAuth()) {
        window.location.href = getAppDashboardUrl();
        return;
      }
      const appUser = (await User.getCurrentUser?.()) || null;
      navigate(resolvePostLoginRoute(appUser, from), { replace: true });
    } catch (err) {
      recordLoginFailure(normalizedEmail);
      turnstile.reset();
      if (
        err?.message?.toLowerCase().includes("email not confirmed") ||
        err?.message?.toLowerCase().includes("confirm your email")
      ) {
        setShowVerifyDialog(true);
        setError("");
      } else {
        setError(err?.message || "Sign in failed. Please check your credentials.");
      }
    } finally {
      submitLockRef.current = false;
      setIsLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (resendLoading || resendLockRef.current) return;
    resendLockRef.current = true;
    setResendLoading(true);
    setResendSuccess("");
    try {
      await SupabaseAuthService.resendSignupEmail(email.trim().toLowerCase());
      setResendSuccess("If an account exists for this email, we sent a confirmation message. Check your inbox.");
    } catch (err) {
      setResendSuccess(err?.message || "Failed to resend confirmation email.");
    } finally {
      resendLockRef.current = false;
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Link to={createPageUrl("Home")} className="flex items-center gap-2.5 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF4F00] shadow-lg shadow-[#FF4F00]/25">
              <img src="/logo.svg" alt="Paidly" className="h-7 w-7 object-contain" />
            </div>
            <span className="text-xl font-semibold text-white tracking-tight">Paidly</span>
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-50">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-400">Sign in to your account</p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Honeypot */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
              <label htmlFor="login-hp">Leave this blank</label>
              <input id="login-hp" name="email_address" type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-zinc-200 text-sm">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-10 rounded-xl border-zinc-700 bg-zinc-950/60 text-zinc-100 placeholder:text-zinc-500 focus:border-[#FF4F00]/50 focus:ring-[#FF4F00]/20"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password" className="text-zinc-200 text-sm">Password</Label>
                <Link
                  to={createPageUrl("ForgotPassword")}
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pl-10 pr-10 rounded-xl border-zinc-700 bg-zinc-950/60 text-zinc-100 placeholder:text-zinc-500 focus:border-[#FF4F00]/50 focus:ring-[#FF4F00]/20"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1 rounded-md transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2.5 rounded-xl" role="alert">
                {error}
              </div>
            )}

            <TurnstileChallenge
              siteKey={turnstile.siteKey}
              required={turnstile.required}
              ready={turnstile.ready}
              containerRef={turnstile.containerRef}
              helperClassName="text-xs text-zinc-500"
            />

            <Button
              type="submit"
              className="w-full h-11 rounded-xl bg-[#FF4F00] text-white hover:bg-[#E64700] font-semibold shadow-lg shadow-[#FF4F00]/20 transition-colors"
              disabled={isLoading || (turnstile.required && !turnstile.ready)}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="mt-4">
            <AuthSocialButtons mode="signin" compact />
          </div>
        </div>

        <p className="mt-5 text-center text-sm text-zinc-500">
          Don&apos;t have an account?{" "}
          <Link to={createSignupUrl()} className="text-zinc-300 hover:text-white font-medium transition-colors">
            Create one
          </Link>
        </p>
      </div>

      {/* Email verification dialog */}
      {showVerifyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-zinc-900 border border-zinc-700 p-8 max-w-sm w-full text-center rounded-2xl shadow-2xl">
            <h2 className="text-lg font-semibold text-zinc-50 mb-2">Confirm your email</h2>
            <p className="mb-5 text-zinc-400 text-sm">
              We need a verified email before you can sign in. Check your inbox for the confirmation link.
            </p>
            <Button
              onClick={handleResendConfirmation}
              disabled={resendLoading}
              className="w-full mb-2 bg-[#FF4F00] hover:bg-[#E64700] text-white rounded-xl"
            >
              {resendLoading ? "Sending…" : "Resend confirmation email"}
            </Button>
            {resendSuccess && <p className="text-sm text-zinc-400 mt-2">{resendSuccess}</p>}
            <Button
              variant="outline"
              onClick={() => setShowVerifyDialog(false)}
              className="w-full mt-2 rounded-xl border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
