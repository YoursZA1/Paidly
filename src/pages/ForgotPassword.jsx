import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { createPageUrl } from "@/utils";
import SupabaseAuthService from "@/services/SupabaseAuthService";
import { useTurnstileChallenge } from "@/hooks/useTurnstileChallenge";
import TurnstileChallenge from "@/components/security/TurnstileChallenge";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const turnstile = useTurnstileChallenge({
    requiredEnvKey: "VITE_TURNSTILE_REQUIRE_FORGOT_PASSWORD",
    theme: "light",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (turnstile.required && !turnstile.token) {
      setError("Please complete the security check.");
      return;
    }
    setIsLoading(true);

    try {
      const redirectTo = `${window.location.origin}${createPageUrl("ResetPassword")}`;
      await SupabaseAuthService.resetPasswordForEmail(email.trim().toLowerCase(), redirectTo, {
        turnstileToken: turnstile.token,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err?.message || "Failed to send reset link. Try again or contact support.");
      turnstile.reset();
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen min-h-[100dvh] auth-page-bg flex items-center justify-center p-4 safe-y safe-x">
        <Card className="w-full max-w-layout-narrow shadow-lg rounded-2xl border border-border">
          <CardContent className="pt-4 pb-0 text-center sm:pt-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-status-paid/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-status-paid" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2 font-display">Check your email</h2>
            <p className="text-sm text-muted-foreground mb-6">
              If an account exists for <strong className="text-foreground">{email}</strong>, you will receive a password reset link shortly. Check your inbox and spam folder.
            </p>
            <Button
              onClick={() => navigate(`${createPageUrl("Login")}#sign-in`)}
              className="w-full min-h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl touch-manipulation"
            >
              Back to Login
            </Button>
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
            <Mail className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl sm:text-2xl font-bold text-foreground font-display">Reset your password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a link to reset your password
          </p>
        </CardHeader>
        <CardContent className="pb-0">
          <form onSubmit={handleSubmit} className="form-field-stack">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="form-field">
              <Label htmlFor="email" className="text-foreground">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <TurnstileChallenge
              siteKey={turnstile.siteKey}
              required={turnstile.required}
              ready={turnstile.ready}
              containerRef={turnstile.containerRef}
            />

            <Button
              type="submit"
              disabled={isLoading || (turnstile.required && !turnstile.ready)}
              className="w-full min-h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl touch-manipulation"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isLoading ? "Sending..." : "Send reset link"}
            </Button>
          </form>

          <button
            onClick={() => navigate(`${createPageUrl("Login")}#sign-in`)}
            className="w-full mt-4 flex items-center justify-center text-sm text-primary hover:text-primary/90 font-medium min-h-10 touch-manipulation"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to login
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
