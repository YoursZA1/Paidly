import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { createPageUrl } from "@/utils";
import SupabaseAuthService from "@/services/SupabaseAuthService";
import { validatePasswordForSignup } from "@/utils/authPasswordPolicy";

export default function ResetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function validate() {
      try {
        const session = await SupabaseAuthService.getSession();
        if (!cancelled && session?.user) {
          setTokenValid(true);
          if (typeof window !== "undefined" && window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
          return;
        }
      } catch {
        // no session
      }
      if (!cancelled) {
        setError(
          "This link is invalid or has expired. Request a new reset link from the forgot password page."
        );
        setTokenValid(false);
      }
    }

    validate();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }

      const policy = validatePasswordForSignup(password);
      if (!policy.ok) {
        setError(policy.message);
        return;
      }

      await SupabaseAuthService.updatePassword(password);
      setSuccess(true);
      setTimeout(() => navigate(`${createPageUrl("Login")}#sign-in`), 2000);
    } catch (err) {
      setError(err?.message || "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  if (tokenValid === null) {
    return (
      <div className="min-h-screen min-h-[100dvh] auth-page-bg flex items-center justify-center p-4 safe-y safe-x">
        <Card className="w-full max-w-layout-narrow shadow-lg rounded-2xl border border-border">
          <CardContent className="pt-8 pb-0 text-center">
            <div className="w-12 h-12 border-4 border-border border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Validating reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tokenValid === false) {
    return (
      <div className="min-h-screen min-h-[100dvh] auth-page-bg flex items-center justify-center p-4 safe-y safe-x">
        <Card className="w-full max-w-layout-narrow shadow-lg rounded-2xl border border-border">
          <CardContent className="pt-4 pb-0 text-center sm:pt-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2 font-display">Invalid reset link</h2>
            <p className="text-sm text-muted-foreground mb-6">{error}</p>
            <Button
              onClick={() => navigate(createPageUrl("ForgotPassword"))}
              className="w-full min-h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl touch-manipulation"
            >
              Request new reset link
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen min-h-[100dvh] auth-page-bg flex items-center justify-center p-4 safe-y safe-x">
        <Card className="w-full max-w-layout-narrow shadow-lg rounded-2xl border border-border">
          <CardContent className="pt-4 pb-0 text-center sm:pt-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-status-paid/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-status-paid" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2 font-display">Password reset successful</h2>
            <p className="text-sm text-muted-foreground">
              You can now log in with your new password
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] auth-page-bg flex items-center justify-center p-4 safe-y safe-x">
      <Card className="w-full max-w-layout-narrow shadow-lg rounded-2xl border border-border">
        <CardHeader className="space-y-1 pb-0 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Lock className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl sm:text-2xl font-bold text-foreground font-display">Create new password</CardTitle>
          <p className="text-sm text-muted-foreground">Enter your new password below</p>
        </CardHeader>
        <CardContent className="pb-0">
          <form onSubmit={handleSubmit} className="form-field-stack">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="form-field">
              <Label htmlFor="password" className="text-foreground">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="form-field">
              <Label htmlFor="confirmPassword" className="text-foreground">Confirm password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl touch-manipulation"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isLoading ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
