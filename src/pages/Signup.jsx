import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Home from "./Home";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Loader2, Lock, Mail, Phone, User, Eye, EyeOff, CheckCircle } from "lucide-react";
import { createPageUrl, getAppDashboardUrl, shouldRedirectToAppAfterAuth } from "@/utils";
import { validatePasswordForSignup } from "@/utils/authPasswordPolicy";
import {
  getSignupThrottleState,
  recordSignupAttempt,
  clearSignupAttempts,
} from "@/utils/signupRateLimit";

function formatRetryMinutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}
import { userService } from "@/services/ExcelUserService";
import { useAuth } from "@/components/auth/AuthContext";
import AuthSocialButtons from "@/components/auth/AuthSocialButtons";

const USERS_STORAGE_KEY = "breakapi_users";
const PLAN_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" }
];

export default function Signup() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState("starter");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [createdUserId, setCreatedUserId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showEmailConfirmPopup, setShowEmailConfirmPopup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (location.hash !== "#sign-up") return;
    const scrollToForm = () =>
      document.getElementById("sign-up")?.scrollIntoView({ behavior: "smooth", block: "start" });
    scrollToForm();
    const t = window.setTimeout(scrollToForm, 150);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.hash]);

  const validateStepOne = () => {
    if (!fullName.trim()) {
      setError("Full name is required");
      return false;
    }

    if (!email.trim()) {
      setError("Email is required");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return false;
    }

    const pwPolicy = validatePasswordForSignup(password);
    if (!pwPolicy.ok) {
      setError(pwPolicy.message);
      return false;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }

    return true;
  };

  const validateStepTwo = () => {
    if (!plan) {
      setError("Please select a plan");
      return false;
    }
    return true;
  };

  const handleStepOne = async (e) => {
    e.preventDefault();
    setError("");

    if (!validateStepOne()) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const signupThrottle = getSignupThrottleState(normalizedEmail);
    if (signupThrottle.blocked) {
      setError(
        `Too many sign-up attempts for this email. Try again in about ${formatRetryMinutes(signupThrottle.retryAfterMs)} minute(s).`
      );
      return;
    }

    setIsLoading(true);

    try {
      const existingUser = userService.getUserByEmail(normalizedEmail);

      if (existingUser) {
        setError("An account with this email already exists");
        setIsLoading(false);
        return;
      }

      const storedUsers = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || "[]");
      if (storedUsers.some((user) => user.email === normalizedEmail)) {
        setError("An account with this email already exists");
        setIsLoading(false);
        return;
      }

      // Create Supabase user (trigger creates profile + org + membership)
      let authUserId = null;
      try {
        const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
        const { user: createdAuthUser } = await SupabaseAuthService.signUpWithEmail(
          normalizedEmail,
          password,
          {
            full_name: fullName.trim(),
            company_name: companyName.trim(),
            company_address: companyAddress.trim(),
            phone: phone.trim(),
            plan,
            role: "user",
          }
        );
        authUserId = createdAuthUser?.id || null;
        if (!authUserId) {
          recordSignupAttempt(normalizedEmail);
          setError("Signup could not be completed. Please try again or contact support.");
          setIsLoading(false);
          return;
        }
        clearSignupAttempts(normalizedEmail);
      } catch (supabaseErr) {
        recordSignupAttempt(normalizedEmail);
        const msg = supabaseErr?.message || "Failed to create Supabase user";
        const isSchemaOrDbError = /database error saving new user|company_address|schema cache|profiles|trigger|column.*does not exist|relation.*does not exist|signup.*failed/i.test(msg);
        setError(
          isSchemaOrDbError
            ? "Signup failed due to database setup. If you're the administrator, open your Supabase project → SQL Editor, run the script in scripts/fix-signup-trigger.sql (or apply supabase/schema.postgres.sql), then try again."
            : msg
        );
        setIsLoading(false);
        return;
      }

      const now = new Date();
      const newUserRecord = {
        id: authUserId,
        email: normalizedEmail,
        full_name: fullName.trim(),
        role: "user",
        plan,
        status: "pending",
        company_name: companyName.trim(),
        company_address: companyAddress.trim(),
        phone: phone.trim(),
        currency: "ZAR",
        timezone: "UTC",
        logo_url: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };

      storedUsers.push(newUserRecord);
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(storedUsers));

      userService.createUser({
        email: normalizedEmail,
        full_name: fullName.trim(),
        display_name: fullName.trim(),
        company_name: companyName.trim(),
        company_address: companyAddress.trim(),
        role: "user",
        plan,
        status: "pending",
        currency: "ZAR",
        timezone: "UTC",
        phone: phone.trim()
      });

      setCreatedUserId(authUserId);
      setShowEmailConfirmPopup(true);
      setStep(2);
    } catch (err) {
      setError(err?.message || "Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStepTwo = async (e) => {
    e.preventDefault();
    setError("");

    if (!validateStepTwo()) {
      return;
    }

    setIsLoading(true);

    try {
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const normalizedEmail = email.trim().toLowerCase();
      const storedUsers = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || "[]");
      const userIndex = storedUsers.findIndex((user) => user.id === createdUserId);

      if (userIndex === -1) {
        throw new Error("Unable to find your account. Please try again.");
      }


      storedUsers[userIndex] = {
        ...storedUsers[userIndex],
        plan,
        status: "trial",
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        company_name: companyName.trim(),
        company_address: companyAddress.trim(),
        phone: phone.trim(),
        updated_at: now.toISOString()
      };

      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(storedUsers));

      const excelUser = userService.getUserByEmail(normalizedEmail);
      if (excelUser) {
        userService.updateUser(excelUser.id, {
          plan,
          status: "trial",
          trial_started_at: now.toISOString(),
          trial_ends_at: trialEndsAt.toISOString(),
          company_name: companyName.trim(),
          company_address: companyAddress.trim(),
          phone: phone.trim(),
          full_name: fullName.trim(),
          display_name: fullName.trim()
        });
      }

      await login({
        email: normalizedEmail,
        password,
        full_name: fullName.trim(),
        company_name: companyName.trim(),
        company_address: companyAddress.trim()
      });
      
      // After login, sync Step 2 company updates to Supabase profile
      try {
        const { User } = await import("@/api/entities");
        await User.updateMyUserData({
          full_name: fullName.trim(),
          company_name: companyName.trim(),
          company_address: companyAddress.trim(),
          phone: phone.trim(),
          currency: "ZAR"
        });
      } catch (profileErr) {
        console.warn("Could not sync profile updates:", profileErr);
        // Don't fail signup if profile sync fails; user can update in Settings later
      }
      
      setSuccess(true);
      setTimeout(() => {
        if (shouldRedirectToAppAfterAuth()) {
          window.location.href = getAppDashboardUrl();
        } else {
          navigate(createPageUrl("Dashboard"));
        }
      }, 800);
    } catch (err) {
      setError(err?.message || "Failed to finish setup");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Popup after Create account: check your email for confirmation link (step 2) */}
      <Dialog open={showEmailConfirmPopup} onOpenChange={(open) => !open && setShowEmailConfirmPopup(false)}>
        <DialogContent className="sm:max-w-md rounded-2xl border-border" onPointerDownOutside={(e) => e.preventDefault()} aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5 shrink-0" />
              Check your email
            </DialogTitle>
          </DialogHeader>
          <p className="text-green-700 font-medium">
            We&apos;ve sent a confirmation link to <span className="font-semibold">{email}</span>. Please check your inbox and click the link to verify your account, then continue with the setup below.
          </p>
          <p className="text-sm text-muted-foreground">
            If you don&apos;t see it, check your spam or junk folder.
          </p>
          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setShowEmailConfirmPopup(false)}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Home
        navActive="signup"
        showWaitlist={false}
        authSlot={
          <section
            id="sign-up"
            className="scroll-mt-28 border-t border-white/[0.06] px-4 py-14 sm:px-6 sm:py-20"
          >
            <div className="mx-auto flex w-full max-w-lg justify-center">
              <Card className="w-full max-h-[calc(100dvh-8rem)] flex flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900/90 shadow-2xl shadow-black/40 backdrop-blur-md sm:max-h-[calc(100dvh-6rem)]">
        <CardHeader className="space-y-1 pb-4 sm:pb-6 text-center px-4 sm:px-6 pt-6 shrink-0">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#FF4F00] rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-lg shadow-[#FF4F00]/25">
            <img src="/logo.svg" alt="Paidly" className="w-9 h-9 sm:w-10 sm:h-10 object-contain" />
          </div>
          <CardTitle className="text-xl sm:text-2xl font-semibold text-zinc-50 font-display">Create your account</CardTitle>
          <p className="text-sm text-zinc-400">Step {step} of 2</p>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-6 overflow-y-auto min-h-0 flex-1">
          {success ? (
            <div className="text-center space-y-6 py-8">
              <div className="text-3xl">🎉</div>
              <div className="text-lg font-semibold text-zinc-50">Account created!</div>
              <div className="text-zinc-400">Please check your email and click the confirmation link to activate your account before logging in.</div>
              <div className="text-sm text-zinc-400">If you don&apos;t see the email, check your spam or junk folder.</div>
              <Button
                className="mt-4"
                onClick={async () => {
                  try {
                    const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
                    await SupabaseAuthService.resendSignupEmail(email);
                    alert(
                      "If an account exists for this email, a confirmation message was sent. Please check your inbox."
                    );
                  } catch (err) {
                    alert(err?.message || "Failed to resend confirmation email.");
                  }
                }}
              >
                Resend confirmation email
              </Button>
            </div>
          ) : step === 1 ? (
            <form onSubmit={handleStepOne} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-zinc-200">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10 rounded-xl border-zinc-600/80 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-400"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-200">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <Input
                    id="email"
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
                <Label htmlFor="password" className="text-zinc-200">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 rounded-xl border-zinc-600/80 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-400"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#FF4F00]/30"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-zinc-200">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="********"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10 rounded-xl border-zinc-600/80 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-400"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#FF4F00]/30"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full min-h-12 rounded-xl bg-[#FF4F00] text-white shadow-lg shadow-[#FF4F00]/20 transition hover:bg-[#E64700] touch-manipulation"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  "Create account"
                )}
              </Button>

              <AuthSocialButtons mode="signup" />

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate(`${createPageUrl("Login")}#sign-in`)}
                  className="text-sm font-medium text-[#FF8C42] hover:text-[#FF4F00]"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleStepTwo} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="plan" className="text-zinc-200">Plan</Label>
                <select
                  id="plan"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-zinc-600/80 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-100 ring-offset-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4F00]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
                  required
                >
                  {PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-400">Your 7-day trial starts after this step.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-zinc-200">Company (optional)</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="Acme Inc"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="pl-10 rounded-xl border-zinc-600/80 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-400"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyAddress" className="text-zinc-200">Company address</Label>
                <Input
                  id="companyAddress"
                  type="text"
                  placeholder="123 Main St, City, Country"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="rounded-xl border-zinc-600/80 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-400"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-zinc-200">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+27 123 456 7890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10 rounded-xl border-zinc-600/80 bg-zinc-950/50 text-zinc-100 placeholder:text-zinc-400"
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              {success && (
                <div className="text-sm text-status-paid bg-status-paid/10 border border-status-paid/20 rounded-xl px-3 py-2">
                  Trial activated. Redirecting to your dashboard...
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-zinc-600 bg-transparent text-zinc-200 hover:bg-white/5 hover:text-white"
                  onClick={() => setStep(1)}
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button type="submit" className="w-full rounded-xl bg-[#FF4F00] text-white hover:bg-[#E64700]" disabled={isLoading}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Finishing setup...
                    </span>
                  ) : (
                    "Finish"
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
            </div>
          </section>
        }
      />
    </>
  );
}
