import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { createPageUrl } from "@/utils";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Simulate password reset request
      const users = JSON.parse(localStorage.getItem("breakapi_users") || "[]");
      const userExists = users.some((u) => u.email === email);

      if (!userExists) {
        setError("Email not found");
        setIsLoading(false);
        return;
      }

      // Generate reset token and store with expiry (1 hour)
      const resetToken = Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
      const expiresAt = Date.now() + 3600000; // 1 hour

      const resetRequests = JSON.parse(
        localStorage.getItem("breakapi_password_resets") || "{}"
      );
      resetRequests[resetToken] = {
        email,
        expiresAt,
        createdAt: Date.now()
      };
      localStorage.setItem("breakapi_password_resets", JSON.stringify(resetRequests));

      // Show reset link in console (since no email backend)
      const resetLink = `${window.location.origin}/reset-password?token=${resetToken}`;
      console.log("Password Reset Link:", resetLink);

      setSubmitted(true);
    } catch (err) {
      setError(err?.message || "Failed to process request");
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg rounded-2xl border border-border">
          <CardContent className="pt-12 pb-6 text-center">
            <div className="w-16 h-16 bg-status-paid/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-status-paid" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2 font-display">Check your email</h2>
            <p className="text-sm text-muted-foreground mb-4">
              We&apos;ve sent a password reset link to <strong className="text-foreground">{email}</strong>
            </p>
            <p className="text-xs text-muted-foreground mb-6 bg-muted p-3 rounded-lg border border-border">
              <strong className="text-foreground">Demo Note:</strong> The reset link is logged in the browser console (F12).
              Check the console to copy the reset link.
            </p>
            <Button
              onClick={() => navigate(createPageUrl("Login"))}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
            >
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg rounded-2xl border border-border">
        <CardHeader className="space-y-1 pb-6 text-center">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground font-display">Reset your password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a link to reset your password
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email address</Label>
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

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isLoading ? "Sending..." : "Send reset link"}
            </Button>
          </form>

          <button
            onClick={() => navigate(createPageUrl("Login"))}
            className="w-full mt-4 flex items-center justify-center text-sm text-primary hover:text-primary/90 font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to login
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
