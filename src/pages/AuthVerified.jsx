import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SupabaseAuthService, { AUTH_VERIFIED_PATH } from "@/services/SupabaseAuthService";
import { createPageUrl } from "@/utils";

const SIGNUP_ONBOARDING_DRAFT_KEY = "paidly_signup_onboarding_draft";

/** Where "Go to Paidly" leads: the invited till, unfinished signup setup, or the dashboard. */
function continueDestination(posInviteToken) {
  if (posInviteToken) return `/pos/invite/${encodeURIComponent(posInviteToken)}`;
  try {
    if (localStorage.getItem(SIGNUP_ONBOARDING_DRAFT_KEY)) return `${createPageUrl("Signup")}?signup_onboarding=1`;
  } catch {
    /* storage unavailable */
  }
  return createPageUrl("Dashboard");
}

function Shell({ children }) {
  return (
    <div className="min-h-screen min-h-[100dvh] auth-page-bg flex items-center justify-center p-4 safe-y safe-x">
      <Card className="w-full max-w-layout-narrow shadow-lg rounded-2xl border border-border">
        <CardContent className="px-6 pt-8 pb-8 text-center sm:px-8">
          <img src="/logo.svg" alt="Paidly" className="mx-auto mb-5 h-10 w-10" />
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * /auth/verified — Paidly's email-verification landing.
 * The confirmation email links here with ?token_hash=…&type=email; Supabase verifies the token
 * (verifyOtp) and returns that account's session. Nothing here grants access by itself.
 */
export default function AuthVerified() {
  const navigate = useNavigate();
  const { inviteToken } = useParams();
  const [params] = useSearchParams();
  const tokenHash = params.get("token_hash");
  // Links built from {{ .ConfirmationURL }} arrive here as ?code=… — Supabase only redirects with a
  // code after it has verified the email (failures come back as #error=…).
  const code = params.get("code");
  const type = params.get("type") || "email";
  const [state, setState] = useState("verifying"); // verifying | verified | verified_signin | error
  const [email, setEmail] = useState(params.get("email") || "");
  const [resend, setResend] = useState({ status: "idle", message: "" });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      // Strip the one-time token from the address bar and history either way.
      if (tokenHash && typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }
      const hash = typeof window !== "undefined" ? String(window.location.hash || "") : "";
      if (/error_description=|error=/.test(hash) && !tokenHash) {
        setState("error");
        return;
      }
      try {
        let session = null;
        if (tokenHash) {
          ({ session } = await SupabaseAuthService.verifyEmailTokenHash(tokenHash, type === "signup" ? "email" : type));
        } else if (code) {
          // The app exchanges the code for a session in this browser (AuthContext). On another device
          // there is none — the email is still verified; the user just signs in.
          for (let i = 0; i < 8 && !session; i++) {
            session = await SupabaseAuthService.getVerifiedSession().catch(() => null);
            if (!session) await new Promise((r) => setTimeout(r, 400));
          }
          if (!session) {
            setState("verified_signin");
            return;
          }
        } else {
          // Opened without a token (e.g. revisited): verified only if this browser's session says so.
          session = await SupabaseAuthService.getVerifiedSession();
          if (!session) throw new Error("No verification token");
        }
        setState("verified");
        if (session?.access_token) void SupabaseAuthService.requestWelcomeEmail(session.access_token);
      } catch {
        // A second click on an already-used link: if this browser is signed in as a verified user, fine.
        const verified = await SupabaseAuthService.getVerifiedSession().catch(() => null);
        if (verified) {
          setState("verified");
          return;
        }
        setState("error");
      }
    })();
  }, [tokenHash, code, type]);

  const resendLink = async (e) => {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;
    setResend({ status: "sending", message: "" });
    try {
      const redirect = inviteToken
        ? `${window.location.origin}${AUTH_VERIFIED_PATH}/pos-invite/${encodeURIComponent(inviteToken)}`
        : null;
      await SupabaseAuthService.resendSignupEmail(target, redirect);
      setResend({ status: "sent", message: `If ${target} has a Paidly account awaiting verification, a new link is on its way.` });
    } catch (err) {
      setResend({ status: "error", message: err?.message || "Could not send a new link. Please try again." });
    }
  };

  if (state === "verifying") {
    return (
      <Shell>
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Confirming your email…</p>
      </Shell>
    );
  }

  if (state === "verified_signin") {
    return (
      <Shell>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
        </div>
        <h1 className="mb-2 text-xl font-bold text-foreground font-display">Email verified ✓</h1>
        <p className="mb-6 text-sm text-muted-foreground">Your Paidly account is now active. Sign in to continue.</p>
        <Button
          className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate(`${createPageUrl("Home")}#sign-in`, { replace: true })}
        >
          Sign in to Paidly
        </Button>
      </Shell>
    );
  }

  if (state === "verified") {
    return (
      <Shell>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
        </div>
        <h1 className="mb-2 text-xl font-bold text-foreground font-display">Email verified ✓</h1>
        <p className="mb-6 text-sm text-muted-foreground">Your Paidly account is now active.</p>
        <Button
          className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate(continueDestination(inviteToken), { replace: true })}
        >
          Go to Paidly
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
      </div>
      <h1 className="mb-2 text-xl font-bold text-foreground font-display">This link has expired</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Verification links can be used once and expire after a while. Enter your email and we&apos;ll send you a new
        one. Already verified? Just sign in.
      </p>
      <form onSubmit={resendLink} className="space-y-3 text-left">
        <div className="space-y-1.5">
          <Label htmlFor="verify-email">Email</Label>
          <Input
            id="verify-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.co.za"
          />
        </div>
        <Button type="submit" className="w-full min-h-12 rounded-xl" disabled={resend.status === "sending"}>
          <MailCheck className="mr-2 h-4 w-4" aria-hidden />
          {resend.status === "sending" ? "Sending…" : "Resend verification email"}
        </Button>
        {resend.message ? (
          <p role="status" className={`text-sm ${resend.status === "error" ? "text-destructive" : "text-emerald-600"}`}>
            {resend.message}
          </p>
        ) : null}
      </form>
      <Button variant="ghost" className="mt-3 w-full" onClick={() => navigate(`${createPageUrl("Home")}#sign-in`)}>
        Sign in
      </Button>
    </Shell>
  );
}
