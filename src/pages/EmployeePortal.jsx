import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2, ShieldAlert, Store, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { isValidPortalSlug, normalizePortalSlug } from "@shared/workforce/portalSlug.js";
import { enterWorkforcePortal, exitWorkforcePortal } from "@/lib/workforcePortal/switchPortal.js";
import { getActivePortalSlug } from "@/lib/workforcePortal/portalState.js";

/**
 * /employee/<slug> — a company's employee portal.
 *
 * The slug only says WHICH workforce portal this is. Access is decided by the database for the signed-in
 * person: resolve_my_workforce_portal(slug) checks auth.uid() has an active (not disabled, not revoked)
 * membership in that org. Every later request is re-checked server-side (X-Paidly-Portal + RLS).
 */

const DENIED_COPY = {
  no_employment: (company) =>
    `This account isn't part of ${company}'s team. Sign in with the account your employer invited, or ask them to send you an invitation.`,
  revoked: (company) => `Your access to ${company}'s employee portal has been switched off. Please contact your employer.`,
  deactivated: (company) => `Your employment at ${company} is inactive, so the employee portal is closed. Please contact your employer.`,
  not_found: () => "We couldn't find this employee portal. Check the link your employer sent you.",
};

function Shell({ icon: Icon = Building2, logoUrl, title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border shadow-none">
        <CardHeader className="space-y-1 pb-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-primary">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <Icon className="size-8 text-primary-foreground" aria-hidden="true" />
            )}
          </div>
          <CardTitle className="font-display text-2xl font-bold">{title}</CardTitle>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}

function SignInForm({ companyName }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login({ email, password });
    } catch (err) {
      setError(err?.message || "Could not sign in. Check your email and password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="portal-email">Email</Label>
        <Input
          id="portal-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="portal-password">Password</Label>
        <Input
          id="portal-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy || !email || !password}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
        Sign in to {companyName}
      </Button>
      <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
        <Link to="/ForgotPassword" className="underline underline-offset-4">
          Forgot your password?
        </Link>
        <p className="text-center">First time here? Open the activation link in your invitation email to set your password.</p>
      </div>
    </form>
  );
}

export default function EmployeePortal() {
  const { slug: rawSlug } = useParams();
  const slug = normalizePortalSlug(rawSlug);
  const slugValid = isValidPortalSlug(slug);
  const { authUserId, authReady, logout } = useAuth() || {};

  const [branding, setBranding] = useState(null); // { found, company_name, logo_url }
  const [access, setAccess] = useState(null); // resolve_my_workforce_portal result
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!slugValid) {
      setBranding({ found: false });
      return undefined;
    }
    setBranding(null);
    supabase.rpc("get_workforce_portal", { p_slug: slug }).then(({ data, error }) => {
      if (!cancelled) setBranding(error ? { found: false } : data || { found: false });
    });
    return () => {
      cancelled = true;
    };
  }, [slug, slugValid]);

  // Server decides: active employment in THIS org for THIS signed-in user.
  useEffect(() => {
    let cancelled = false;
    setAccess(null);
    if (!slugValid || !authReady || !authUserId || !branding?.found) return undefined;
    supabase.rpc("resolve_my_workforce_portal", { p_slug: slug }).then(async ({ data, error }) => {
      if (cancelled) return;
      const result = error ? { ok: false, reason: "error" } : data || { ok: false, reason: "error" };
      if (!result.ok && getActivePortalSlug() === slug) await exitWorkforcePortal();
      setAccess(result);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, slugValid, authReady, authUserId, branding?.found]);

  const open = useCallback(
    async (path) => {
      setEntering(true);
      await enterWorkforcePortal(slug);
      // Full navigation: in-memory caches from any other business context start clean.
      window.location.assign(path);
    },
    [slug]
  );

  // Plain employees go straight to their workspace; till staff choose.
  useEffect(() => {
    if (access?.ok && !access.pos_enabled && !entering) void open("/Workforce");
  }, [access, entering, open]);

  const companyName = branding?.company_name || "your employer";

  if (!branding) {
    return (
      <Shell title="Employee portal">
        <div className="flex justify-center py-6" aria-label="Loading portal">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (!branding.found) {
    return (
      <Shell icon={ShieldAlert} title="Portal not found" subtitle={DENIED_COPY.not_found()}>
        <Button asChild variant="outline" className="w-full">
          <Link to="/">Go to Paidly</Link>
        </Button>
      </Shell>
    );
  }

  if (!authReady) {
    return (
      <Shell logoUrl={branding.logo_url} title={companyName} subtitle="Employee portal">
        <div className="flex justify-center py-6" aria-label="Checking your session">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (!authUserId) {
    return (
      <Shell logoUrl={branding.logo_url} title={companyName} subtitle="Employee portal · sign in">
        <SignInForm companyName={companyName} />
      </Shell>
    );
  }

  if (!access || entering || (access.ok && !access.pos_enabled)) {
    return (
      <Shell logoUrl={branding.logo_url} title={companyName} subtitle="Opening your employee portal…">
        <div className="flex justify-center py-6" aria-label="Opening portal">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (!access.ok) {
    const copy = (DENIED_COPY[access.reason] || DENIED_COPY.no_employment)(companyName);
    return (
      <Shell icon={ShieldAlert} logoUrl={branding.logo_url} title="No access" subtitle={copy}>
        <Button variant="outline" className="w-full" onClick={() => logout?.()}>
          Sign in with a different account
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link to="/">Back to Paidly</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell logoUrl={branding.logo_url} title={companyName} subtitle="Employee portal">
      <Button className="w-full justify-start gap-3" onClick={() => open("/Workforce")}>
        <UserRound className="size-4" aria-hidden="true" />
        My workspace — payslips, leave, profile
      </Button>
      <Button variant="outline" className="w-full justify-start gap-3" onClick={() => open("/pos")}>
        <Store className="size-4" aria-hidden="true" />
        Open the till
      </Button>
    </Shell>
  );
}
