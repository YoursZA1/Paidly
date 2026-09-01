import { useEffect, useMemo, useRef, useState } from "react";
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
import { isPosInviteDest, POS_JOB_FUNCTION, posJoinPath, posTillPath, posAccessPath } from "@shared/posStaffInvite.js";
import { invitePublicErrorMessage } from "@shared/companyInviteMessages.js";
import { useAuth } from "@/contexts/AuthContext";
import { JOB_FUNCTION_LABELS } from "@/lib/companyJobFunctions";
import { COMPANY_ROLE_LABELS } from "@/lib/companyPermissions";
import { resolveCompanyHomePath } from "@/lib/postAuthNavigation.js";
import { writeActiveRegisterId } from "@/lib/pos/posRegisterStorage";
import { clearCompanyAccessContextCache } from "@/services/CompanyContextService";

function emailsMatch(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function isPosJoinPath(pathname) {
  return /\/pos\/join\/?$/i.test(pathname || "");
}

function isPosInvitePath(pathname) {
  return /\/pos\/invite\//i.test(pathname || "");
}

function lockTillFromInvite(result, invite) {
  const orgId = result?.org_id || invite?.org_id;
  const registerId = result?.register_id || invite?.register_id;
  if (orgId && registerId) writeActiveRegisterId(orgId, registerId);
}

/**
 * Company invitation links: /invite/:token or /invite?token=…
 * POS email activation: /pos/invite/:secure-token (no typing).
 * Backup device activation: /pos/join (typed till code).
 */
export default function InvitePage() {
  const [searchParams] = useSearchParams();
  const { token: tokenParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, authUserId, loading: authLoading } = useAuth() || {};
  const backupJoin = isPosJoinPath(location.pathname);
  const tokenFromUrl = backupJoin ? "" : String(tokenParam || searchParams.get("token") || "").trim();

  const [codeDraft, setCodeDraft] = useState("");
  const [token, setToken] = useState(tokenFromUrl);
  const [loading, setLoading] = useState(Boolean(tokenFromUrl));
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(null);
  const activateOnceRef = useRef(false);

  useEffect(() => {
    setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      if (!backupJoin && !isPosInvitePath(location.pathname) && !searchParams.get("token")) {
        setError(invitePublicErrorMessage("missing_token"));
      }
      return;
    }

    let cancelled = false;
    activateOnceRef.current = false;

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
  }, [token, backupJoin, location.pathname, searchParams]);

  const posFromPath = backupJoin || isPosInvitePath(location.pathname);

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
  const alreadyUsed =
    Boolean(error) &&
    /already been accepted|no longer active|already belong/i.test(String(error));

  const goToPos = (result) => {
    lockTillFromInvite(result, invite);
    clearCompanyAccessContextCache();
    const registerId = result?.register_id || invite?.register_id;
    navigate(registerId ? posTillPath(registerId) : posAccessPath(), { replace: true });
  };

  const continueToSignup = () => {
    const email = invite?.email ? `&email=${encodeURIComponent(invite.email)}` : "";
    const next = posInviteCopy ? "&next=POS" : "";
    navigate(`${createPageUrl("Signup")}?invite=1${email}${next}`);
  };

  const submitCode = (event) => {
    event.preventDefault();
    const normalized = normalizePosTillInviteCode(codeDraft);
    if (!normalized) {
      setError("Enter the backup device code.");
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
      if (posInviteCopy) {
        goToPos(result);
        return;
      }
      navigate(
        resolveCompanyHomePath({
          companyId: result?.org_id || "joined",
          companyRole: result?.role || invite.role,
          jobFunction: result?.job_function || invite.job_function,
          isOrgOwner: false,
        }),
        { replace: true }
      );
    } catch (e) {
      const message = e?.message || invitePublicErrorMessage("not_found");
      if (posInviteCopy && /already been accepted|already belong/i.test(message)) {
        goToPos(null);
        return;
      }
      setAcceptError(message);
    } finally {
      setAccepting(false);
    }
  };

  useEffect(() => {
    if (authLoading || loading || activateOnceRef.current) return;
    if (posInviteCopy && alreadyUsed && signedIn && !emailMismatch) {
      activateOnceRef.current = true;
      goToPos(null);
      return;
    }
    if (!posInviteCopy || !invite || !token || !signedIn || emailMismatch) return;
    activateOnceRef.current = true;
    void handleAccept();
    // handleAccept reads latest invite/token; run once per validated invite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, loading, invite, token, signedIn, emailMismatch, posInviteCopy, alreadyUsed]);

  const showJoinForm = backupJoin && !invite && !loading && !token;
  const waitingOnAuth = Boolean(invite) && authLoading;
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
              ? "Enter the backup device code from your manager to activate this till."
              : posInviteCopy
                ? "Opening Paidly POS on your assigned till. POS-only — not the dashboard, invoices, clients, reports, or settings."
                : "Join your team on Paidly with the role assigned by your administrator."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {showJoinForm ? (
            <form className="space-y-3" onSubmit={submitCode}>
              <div className="space-y-2">
                <Label htmlFor="till-invite-code">Backup device code</Label>
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
                Activate this device
              </Button>
            </form>
          ) : null}

          {(loading || waitingOnAuth || accepting) && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {accepting || (invite && signedIn && !emailMismatch)
                ? "Activating POS…"
                : "Verifying invitation…"}
            </div>
          )}

          {!loading && !waitingOnAuth && error && !showJoinForm && !(alreadyUsed && posInviteCopy && signedIn) && (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <AlertCircle className="size-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !waitingOnAuth && invite && (
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

          {!loading && !waitingOnAuth && invite && signedIn && !emailMismatch && !accepting ? (
            <Button type="button" onClick={() => void handleAccept()} disabled={accepting} className="h-12 w-full">
              {posInviteCopy ? "Open Paidly POS" : "Accept invitation"}
            </Button>
          ) : null}

          {!loading && !waitingOnAuth && invite && !signedIn && (
            <>
              <Button type="button" onClick={continueToSignup} className="h-12 w-full">
                {posInviteCopy ? "Open Paidly POS" : "Create account"}
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

          {!invite && !showJoinForm && !loading && !waitingOnAuth ? (
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
              {backupJoin ? (
                "Ask your manager for the backup device code if the invitation email cannot open."
              ) : (
                <Link to={posJoinPath()} className="text-primary underline">
                  Activate this device with a backup code
                </Link>
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
