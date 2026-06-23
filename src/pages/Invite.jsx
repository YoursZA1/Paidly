import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Loader2, AlertCircle } from "lucide-react";
import { createPageUrl } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { storePendingInviteToken } from "@/services/TenantRoleService";

/**
 * Entry point for company invitation links: /invite?token=xxxxxxxx
 * Validates the token, stores it for signup metadata, and directs the user to register or sign in.
 * Supabase auth invite emails remain the primary acceptance path; this page supports shareable links.
 */
export default function InvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = String(searchParams.get("token") || "").trim();

  const [loading, setLoading] = useState(Boolean(token));
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("No invitation token was provided.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcErr } = await supabase.rpc("validate_company_invite_token", {
          p_token: token,
        });
        if (rpcErr) throw new Error(getSupabaseErrorMessage(rpcErr, "Could not validate invitation"));
        if (!data?.ok) {
          const reason = data?.error || "invalid";
          const messages = {
            not_found: "This invitation link is invalid or has already been used.",
            expired: "This invitation has expired. Ask your administrator to send a new invite.",
            not_pending: "This invitation is no longer active.",
            missing_token: "No invitation token was provided.",
          };
          throw new Error(messages[reason] || "This invitation is not valid.");
        }
        if (!cancelled) {
          storePendingInviteToken(token);
          setInvite(data);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const continueToSignup = () => {
    const email = invite?.email ? `&email=${encodeURIComponent(invite.email)}` : "";
    navigate(`${createPageUrl("Signup")}?invite=1${email}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-primary/5 to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardHeader className="space-y-1 pb-6 text-center">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Company invitation</CardTitle>
          <p className="text-sm text-slate-500">
            Join your team on Paidly with the role and company assigned by your administrator.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Validating invitation…
            </div>
          )}

          {!loading && error && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 flex gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-700" />
              <span>{error}</span>
            </div>
          )}

          {!loading && invite && (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
              <p>
                You&apos;ve been invited to join{" "}
                <strong>{invite.company_name || "your company"}</strong>
                {invite.email ? (
                  <>
                    {" "}
                    as <strong>{invite.email}</strong>
                  </>
                ) : null}
                .
              </p>
              <p className="text-muted-foreground capitalize">
                Role: {String(invite.role || "employee").replace(/_/g, " ")}
              </p>
            </div>
          )}

          {!loading && invite && (
            <Button type="button" onClick={continueToSignup} className="w-full">
              Create account
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`${createPageUrl("Login")}#sign-in`)}
            className="w-full"
          >
            Already have an account? Sign in
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Received an email invite instead?{" "}
            <Link to={createPageUrl("AcceptInvite")} className="text-primary underline">
              Use your email link
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

