import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, Loader2, AlertCircle } from "lucide-react";
import { createPageUrl } from "@/utils";
import {
  storePendingInviteToken,
  acceptPendingInviteToken,
} from "@/services/TenantRoleService";
import { validatePublicInviteToken } from "@/services/CompanyInvitesService";
import { formatPosTillInviteCode, normalizePosTillInviteCode } from "@shared/posTillInviteCode.js";
import { isPosInviteDest, POS_JOB_FUNCTION } from "@shared/posStaffInvite.js";
import { invitePublicErrorMessage } from "@shared/companyInviteMessages.js";
import { useAuth } from "@/contexts/AuthContext";
import { JOB_FUNCTION_LABELS } from "@/lib/companyJobFunctions";
import { COMPANY_ROLE_LABELS } from "@/lib/companyPermissions";
import { resolveCompanyHomePath } from "@/lib/postAuthNavigation.js";

function emailsMatch(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

/**
 * Company invitation links: /invite/:token or /invite?token=…
 * POS till invites: /pos/invite/:code or /pos/join (manual code).
 */
export default function InvitePage() {
  const [searchParams] = useSearchParams();
  const { token: tokenParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, authUserId } = useAuth() || {};
  const tokenFromUrl = String(tokenParam || searchParams.get("token") || "").trim();

  const [codeDraft, setCodeDraft] = useState(tokenFromUrl ? formatPosTillInviteCode(tokenFromUrl) : "");
  const [token, setToken] = useState(tokenFromUrl);
  const [loading, setLoading] = useState(Boolean(tokenFromUrl));
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      if (!/\/pos\/(invite|join)/i.test(location.pathname || "") && !searchParams.get("token")) {
        setError(invitePublicErrorMessage("missing_token"));
      }
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setAcceptError(null);
      try {
        const data = await validatePublicInviteToken(token);
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
  }, [token, location.pathname, searchParams]);

  const posFromPath = /\/pos\/(invite|join)/i.test(location.pathname || "");

  const posInviteCopy = useMemo(() => {
    if (posFromPath || isPosInviteDest(searchParams.get("next"))) return true;
    if (String(invite?.job_function || "").toLowerCase() === POS_JOB_FUNCTION) return true;
    if (String(invite?.source || "").toLowerCase() === "pos") return true;
    return invite?.pos_only === true;
  }, [posFromPath, searchParams, invite]);

  const sessionEmail = String(user?.email || "").trim().toLowerCase();
  const invitedEmail = String(invite?.email || "").trim().toLowerCase();
  const signedIn = Boolean(authUserId || user?.id);
  const emailMismatch = signedIn && invitedEmail && sessionEmail && !emailsMatch(sessionEmail, invitedEmail);

  const continueToSignup = () => {
    const email = invite?.email ? `&email=${encodeURIComponent(invite.email)}` : "";
    const next = posInviteCopy ? "&next=POS" : "";
    navigate(`${createPageUrl("Signup")}?invite=1${email}${next}`);
  };

  const submitCode = (event) => {
    event.preventDefault();
    const normalized = normalizePosTillInviteCode(codeDraft);
    if (!normalized) {
      setError("Enter your till invite code.");
      return;
    }
    setInvite(null);
    setToken(formatPosTillInviteCode(normalized) || normalized);
  };

  const handleAccept = async () => {
    if (!token || !invite) return;
    if (emailMismatch) {
      setAcceptError(invitePublicErrorMessage("email_mismatch"));
      return;
    }
    setAccepting(true);
    setAcceptError(null);
    try {
      const result = await acceptPendingInviteToken(token);
      const destination = posInviteCopy
        ? createPageUrl("POS")
        : resolveCompanyHomePath({
            companyId: result?.org_id || "joined",
            companyRole: result?.role || invite.role,
            jobFunction: result?.job_function || invite.job_function,
            isOrgOwner: false,
          });
      navigate(destination, { replace: true });
    } catch (e) {
      setAcceptError(e?.message || invitePublicErrorMessage("not_found"));
    } finally {
      setAccepting(false);
    }
  };

  const showJoinForm = posFromPath && !tokenFromUrl && !invite && !loading;
  const roleLabel =
    COMPANY_ROLE_LABELS[String(invite?.role || "").toLowerCase()] || invite?.role || "Employee";
  const functionLabel = posInviteCopy
    ? "POS only"
    : JOB_FUNCTION_LABELS[String(invite?.job_function || "").toLowerCase()] || invite?.job_function || "—";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border shadow-none">
        <CardHeader className="space-y-1 pb-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary">
            <Store className="size-8 text-primary-foreground" />
          </div>
          <CardTitle className="font-display text-2xl font-bold">
            {posInviteCopy || showJoinForm ? "You're invited to Paidly POS" : "You're invited to Paidly"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {showJoinForm
              ? "Enter your till invite code."
              : posInviteCopy
                ? "POS-only access to the assigned till. Not the dashboard, invoices, clients, reports, or settings."
                : "Join your team on Paidly with the role assigned by your administrator."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {showJoinForm ? (
            <form className="space-y-3" onSubmit={submitCode}>
              <div className="space-y-2">
                <Label htmlFor="till-invite-code">Till invite code</Label>
                <Input
                  id="till-invite-code"
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
                  placeholder="7K4M-X92Q"
                  className="h-14 text-center font-mono text-xl tracking-[0.2em]"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </div>
              {error ? (
                <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  <AlertCircle className="size-5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
              <Button type="submit" className="h-12 w-full">
                Join till
              </Button>
            </form>
          ) : null}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Validating invitation…
            </div>
          )}

          {!loading && error && !showJoinForm && (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <AlertCircle className="size-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && invite && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
              <p>
                Business: <strong>{invite.company_name || "your company"}</strong>
              </p>
              {posInviteCopy ? (
                <>
                  <p>
                    Till: <strong>{invite.register_name || "Assigned till"}</strong>
                  </p>
                  <p>
                    Role: <strong>POS Staff</strong>
                  </p>
                  <p>
                    Access: <strong>POS only</strong>
                  </p>
                  <p className="font-mono tracking-widest">
                    Invite code: {formatPosTillInviteCode(token) || token}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Your role: <strong>{roleLabel}</strong>
                  </p>
                  <p>
                    Function: <strong>{functionLabel}</strong>
                  </p>
                </>
              )}
              {invite.email ? (
                <p className="text-muted-foreground">
                  Issued to <strong>{invite.email}</strong>
                </p>
              ) : null}
            </div>
          )}

          {emailMismatch ? (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <AlertCircle className="size-5 shrink-0" />
              <span>{invitePublicErrorMessage("email_mismatch")}</span>
            </div>
          ) : null}

          {acceptError ? (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <AlertCircle className="size-5 shrink-0" />
              <span>{acceptError}</span>
            </div>
          ) : null}

          {!loading && invite && signedIn && !emailMismatch ? (
            <Button type="button" onClick={() => void handleAccept()} disabled={accepting} className="h-12 w-full">
              {accepting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Accepting…
                </>
              ) : (
                "Accept invitation"
              )}
            </Button>
          ) : null}

          {!loading && invite && !signedIn && (
            <>
              <Button type="button" onClick={continueToSignup} className="h-12 w-full">
                {posInviteCopy ? "Create POS account" : "Create account"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full"
                onClick={() =>
                  navigate(`${createPageUrl("Login")}#sign-in`, {
                    state: { from: { pathname: `${location.pathname}${location.search}` } },
                  })
                }
              >
                Sign in
              </Button>
            </>
          )}

          {!invite && !showJoinForm ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                navigate(`${createPageUrl("Login")}#sign-in`, {
                  state: { from: { pathname: `${location.pathname}${location.search}` } },
                })
              }
              className="h-12 w-full"
            >
              Already have an account? Sign in
            </Button>
          ) : null}

          {posInviteCopy || showJoinForm ? (
            <p className="text-center text-xs text-muted-foreground">
              {tokenFromUrl ? (
                <Link to="/pos/join" className="text-primary underline">
                  Enter a code instead
                </Link>
              ) : (
                "Ask your manager for the till invite code if you do not have a link."
              )}
            </p>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Received an email invite instead?{" "}
              <Link to={createPageUrl("AcceptInvite")} className="text-primary underline">
                Use your email link
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
