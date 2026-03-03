import { useState } from "react";
// import { Dialog } from "@/components/ui/dialog";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import { createPageUrl } from "@/utils";

export default function Login() {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login({ email, password });
      // After login, admins go to Admin Dashboard; others go to their intended page or Dashboard
      const storedUser = JSON.parse(localStorage.getItem("breakapi_user") || "null");
      const isAdmin = storedUser?.role === "admin";
      const safeFrom = from.startsWith("/admin") ? createPageUrl("Dashboard") : from;
      const destination = isAdmin ? createPageUrl("Dashboard") : safeFrom;
      navigate(destination, { replace: true });
    } catch (err) {
      // Detect Supabase unverified email error
      if (err?.message?.toLowerCase().includes("email not confirmed") || err?.message?.toLowerCase().includes("confirm your email")) {
        setShowVerifyDialog(true);
        setError("");
      } else {
        setError(err?.message || "Login failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setResendLoading(true);
    setResendSuccess("");
    try {
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
      await SupabaseAuthService.signInWithMagicLink(email);
      setResendSuccess("Confirmation email resent! Please check your inbox.");
    } catch (err) {
      setResendSuccess(err?.message || "Failed to resend confirmation email.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-2xl border border-border shadow-lg">
          <CardHeader className="space-y-1 pb-6 text-center">
            <div className="w-16 h-16 bg-primary/10 flex items-center justify-center mx-auto mb-4 rounded-2xl">
              <Lock className="size-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-semibold text-foreground font-display">Welcome back</CardTitle>
            <p className="text-sm text-muted-foreground">Sign in to manage your business.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
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
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 rounded-xl border-border"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-xl">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl" disabled={isLoading}>
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate(createPageUrl("ForgotPassword"))}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Forgot your password?
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate(createPageUrl("Signup"))}
                  className="text-sm text-muted-foreground hover:text-foreground font-medium"
                >
                  Don&apos;t have an account? Create one
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      {/* Email not verified dialog */}
      {showVerifyDialog && (
        <>
          <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
            <div className="bg-card border border-border p-8 max-w-sm w-full text-center rounded-2xl shadow-xl">
              <h2 className="text-xl font-semibold text-foreground mb-2">Email Not Verified</h2>
              <p className="mb-4 text-muted-foreground text-sm">Your email address has not been confirmed. Please check your inbox and click the confirmation link.</p>
              <Button onClick={handleResendConfirmation} disabled={resendLoading} className="w-full mb-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl">
                {resendLoading ? "Resending..." : "Resend confirmation email"}
              </Button>
              {resendSuccess && <div className="text-primary text-sm mt-2">{resendSuccess}</div>}
              <Button variant="outline" onClick={() => setShowVerifyDialog(false)} className="w-full mt-2 rounded-xl">Close</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
