import { useState } from "react";
import { MailCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import SupabaseAuthService from "@/services/SupabaseAuthService";
import { createPageUrl } from "@/utils";

/**
 * Shown instead of the app when a session exists but its email is not verified.
 * Renders in place (no redirect), so it cannot loop; no business data is loaded behind it.
 */
export default function VerifyEmailRequired({ email }) {
  const { logout } = useAuth();
  const [status, setStatus] = useState({ kind: "idle", message: "" });

  const resend = async () => {
    setStatus({ kind: "sending", message: "" });
    try {
      await SupabaseAuthService.resendSignupEmail(email);
      setStatus({ kind: "sent", message: "A new verification link is on its way. Check your inbox (and spam folder)." });
    } catch (err) {
      setStatus({ kind: "error", message: err?.message || "Could not resend the email. Please try again." });
    }
  };

  const changeEmail = async () => {
    try {
      await logout?.();
    } finally {
      window.location.assign(createPageUrl("Signup"));
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] auth-page-bg flex items-center justify-center p-4 safe-y safe-x">
      <Card className="w-full max-w-layout-narrow shadow-lg rounded-2xl border border-border">
        <CardContent className="px-6 pt-8 pb-8 text-center sm:px-8">
          <img src="/logo.svg" alt="Paidly" className="mx-auto mb-5 h-10 w-10" />
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <MailCheck className="h-7 w-7 text-primary" aria-hidden />
          </div>
          <h1 className="mb-2 text-xl font-bold text-foreground font-display">Verify your email</h1>
          <p className="text-sm text-muted-foreground">We&apos;ve sent a verification link to:</p>
          <p className="my-2 break-all text-sm font-semibold text-foreground">{email}</p>
          <p className="mb-6 text-sm text-muted-foreground">Please verify your email to activate your Paidly account.</p>
          <div className="space-y-2">
            <Button className="w-full min-h-12 rounded-xl" disabled={status.kind === "sending"} onClick={resend}>
              {status.kind === "sending" ? "Sending…" : "Resend verification email"}
            </Button>
            <Button variant="outline" className="w-full min-h-12 rounded-xl" onClick={changeEmail}>
              Change email
            </Button>
          </div>
          {status.message ? (
            <p role="status" className={`mt-3 text-sm ${status.kind === "error" ? "text-destructive" : "text-emerald-600"}`}>
              {status.message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
