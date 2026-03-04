import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Building2, Loader2, Lock, Mail, Phone, User, Eye, EyeOff } from "lucide-react";
import { createPageUrl } from "@/utils";
import { userService } from "@/services/ExcelUserService";
import { useAuth } from "@/components/auth/AuthContext";

const USERS_STORAGE_KEY = "breakapi_users";
const PLAN_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" }
];

export default function Signup() {
  const { login } = useAuth();
  const navigate = useNavigate();

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
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

    setIsLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
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
      try {
        const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
        await SupabaseAuthService.signUpWithEmail(normalizedEmail, password, {
          full_name: fullName.trim(),
          company_name: companyName.trim(),
          company_address: companyAddress.trim(),
          phone: phone.trim(),
          plan,
          role: "user"
        });
      } catch (supabaseErr) {
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
        id: Date.now().toString(),
        email: normalizedEmail,
        full_name: fullName.trim(),
        password,
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

      setCreatedUserId(newUserRecord.id);
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
      // Don't auto-redirect - user must confirm email first
    } catch (err) {
      setError(err?.message || "Failed to finish setup");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] auth-page-bg flex items-center justify-center p-4 safe-y safe-x overflow-auto">
      <Card className="w-full max-w-md shadow-xl rounded-2xl border border-border overflow-hidden max-h-[calc(100dvh-2rem)] flex flex-col my-auto">
        <CardHeader className="space-y-1 pb-4 sm:pb-6 text-center px-4 sm:px-6 pt-6 shrink-0">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-lg shadow-primary/20">
            <img src="/logo.svg" alt="Paidly" className="w-9 h-9 sm:w-10 sm:h-10 object-contain" />
          </div>
          <CardTitle className="text-xl sm:text-2xl font-semibold text-foreground font-display">Create your account</CardTitle>
          <p className="text-sm text-muted-foreground">Step {step} of 2</p>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-6 overflow-y-auto min-h-0 flex-1">
          {success ? (
            <div className="text-center space-y-6 py-12 px-2">
              {/* Success Icon */}
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center animate-bounce">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19a9 9 0 019-9 9.003 9.003 0 01.946-9m2.048 0A9.967 9.967 0 0112 3c4.478 0 8.268 2.943 9.542 7m-9.542 9a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>

              {/* Main Message */}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Check your email!</h2>
                <p className="text-lg text-primary font-semibold">Confirm your account to get started</p>
              </div>

              {/* Instructions */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
                <p className="text-sm text-foreground font-medium">We sent a confirmation link to:</p>
                <p className="text-sm font-semibold text-primary break-all">{email}</p>
                <p className="text-xs text-muted-foreground">Click the link in the email to activate your Paidly account and start your 7-day free trial.</p>
              </div>

              {/* Tips */}
              <div className="space-y-2 text-left text-sm">
                <p className="font-semibold text-foreground">💡 Pro tips:</p>
                <ul className="text-muted-foreground space-y-1 pl-4">
                  <li>• The link expires in 24 hours</li>
                  <li>• Check your spam or junk folder if you don&apos;t see it</li>
                  <li>• You can request a new link below</li>
                </ul>
              </div>

              {/* Buttons */}
              <div className="space-y-2 pt-2">
                <Button
                  className="w-full min-h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl shadow-lg"
                  onClick={async () => {
                    try {
                      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
                      await SupabaseAuthService.signInWithMagicLink(email);
                      alert("✓ Confirmation email resent! Check your inbox.");
                    } catch (err) {
                      alert(err?.message || "Failed to resend confirmation email.");
                    }
                  }}
                >
                  📧 Resend Confirmation Email
                </Button>
                <Button
                  variant="outline"
                  className="w-full min-h-11 rounded-xl"
                  onClick={() => navigate(createPageUrl("Login"))}
                >
                  Back to Login
                </Button>
              </div>
            </div>
          ) : step === 1 ? (
            <form onSubmit={handleStepOne} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-foreground">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10 rounded-xl border-border"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
className="pl-10 rounded-xl border-border"
                  required
                />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 rounded-xl border-border"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="********"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10 rounded-xl border-border"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                className="w-full min-h-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg rounded-xl ring-2 ring-primary/30 hover:ring-primary/50 transition touch-manipulation"
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

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate(createPageUrl("Login"))}
                  className="text-sm text-primary hover:text-primary/80 font-medium"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleStepTwo} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="plan" className="text-foreground">Plan</Label>
                <select
                  id="plan"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  required
                >
                  {PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Your 7-day trial starts after this step.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-foreground">Company (optional)</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="Acme Inc"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="pl-10 rounded-xl border-border"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyAddress" className="text-foreground">Company address</Label>
                <Input
                  id="companyAddress"
                  type="text"
                  placeholder="123 Main St, City, Country"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="rounded-xl border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-foreground">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+27 123 456 7890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10 rounded-xl border-border"
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
                  className="w-full"
                  onClick={() => setStep(1)}
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl" disabled={isLoading}>
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
  );
}
