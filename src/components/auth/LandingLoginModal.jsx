import { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
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

function formatRetryMinutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

/**
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void }} props
 */
export default function LandingLoginModal({ open, onOpenChange }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || createPageUrl("Dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submitLockRef = useRef(false);
  const resendLockRef = useRef(false);

  const closeAndNavigate = (to) => {
    onOpenChange(false);
    navigate(to);
  };

  const resolvePostLoginRoute = (userLike, fallbackPath) => {
    const role = String(userLike?.role || "").toLowerCase();
    if (isStaffDashboardRole(role)) return staffDashboardHomePath();
    const safeFallback = fallbackPath?.startsWith("/admin") ? createPageUrl("Dashboard") : fallbackPath;
    return safeFallback || createPageUrl("Dashboard");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    const throttle = getLoginThrottleState(normalizedEmail);
    if (throttle.blocked) {
      setError(
        `Too many sign-in attempts. Try again in about ${formatRetryMinutes(throttle.retryAfterMs)} minute(s).`
      );
      return;
    }

    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setIsLoading(true);

    try {
      await login({ email: normalizedEmail, password });
      onOpenChange(false);
      if (shouldRedirectToAppAfterAuth()) {
        window.location.href = getAppDashboardUrl();
        return;
      }
      const storedUser = JSON.parse(localStorage.getItem("breakapi_user") || "null");
      const destination = resolvePostLoginRoute(storedUser, from);
      navigate(destination, { replace: true });
      clearLoginFailures(normalizedEmail);
    } catch (err) {
      recordLoginFailure(normalizedEmail);
      if (
        err?.message?.toLowerCase().includes("email not confirmed") ||
        err?.message?.toLowerCase().includes("confirm your email")
      ) {
        setShowVerifyDialog(true);
        setError("");
      } else {
        setError(err?.message || "Login failed. Please try again.");
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
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-md border-0 bg-transparent p-0 shadow-none sm:max-w-md [&>button]:text-zinc-400 [&>button]:hover:text-white"
          onOpenAutoFocus={(e) => {
            const el = e.currentTarget.querySelector("#landing-login-email");
            if (el && typeof el.focus === "function") {
              e.preventDefault();
              el.focus();
            }
          }}
        >
          <DialogTitle className="sr-only">Sign in</DialogTitle>
          <DialogDescription className="sr-only">
            Sign in to manage your business with email and password or Google.
          </DialogDescription>
          <Card className="w-full rounded-2xl border border-zinc-700/80 bg-zinc-900/90 shadow-2xl shadow-black/40 backdrop-blur-md overflow-hidden">
            <CardHeader className="space-y-1 pb-4 sm:pb-6 text-center px-4 sm:px-6 pt-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#FF4F00] rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-lg shadow-[#FF4F00]/25">
                <img src="/logo.svg" alt="Paidly" className="w-9 h-9 sm:w-10 sm:h-10 object-contain" />
              </div>
              <CardTitle className="text-xl sm:text-2xl font-semibold text-zinc-50 font-display">
                Welcome back
              </CardTitle>
              <p className="text-sm text-zinc-400">Sign in to manage your business.</p>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="landing-login-email" className="text-zinc-200">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      id="landing-login-email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 rounded-xl border-zinc-600/80 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-400"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="landing-login-password" className="text-zinc-200">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      id="landing-login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 rounded-xl border-zinc-600/80 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-400"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-xl">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full min-h-12 rounded-xl bg-[#FF4F00] text-white hover:bg-[#E64700] touch-manipulation"
                  disabled={isLoading}
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </Button>

                <AuthSocialButtons mode="signin" />

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => closeAndNavigate(createPageUrl("ForgotPassword"))}
                    className="text-sm font-medium text-amber-300 hover:text-amber-200 hover:underline"
                  >
                    Forgot your password?
                  </button>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => closeAndNavigate(createSignupUrl())}
                    className="text-sm font-medium text-zinc-400 hover:text-zinc-200"
                  >
                    Don&apos;t have an account? Create one
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {showVerifyDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4">
          <div className="bg-card border border-border p-8 max-w-sm w-full text-center rounded-2xl shadow-xl">
            <h2 className="text-xl font-semibold text-foreground mb-2">Email Not Verified</h2>
            <p className="mb-4 text-muted-foreground text-sm">
              Your email address has not been confirmed. Please check your inbox and click the
              confirmation link.
            </p>
            <Button
              onClick={handleResendConfirmation}
              disabled={resendLoading}
              className="w-full mb-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
            >
              {resendLoading ? "Resending..." : "Resend confirmation email"}
            </Button>
            {resendSuccess && <div className="text-primary text-sm mt-2">{resendSuccess}</div>}
            <Button
              variant="outline"
              onClick={() => setShowVerifyDialog(false)}
              className="w-full mt-2 rounded-xl"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
