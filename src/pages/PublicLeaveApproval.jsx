import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { decidePublicLeave, fetchPublicLeaveApproval } from "@/api/publicLeaveApiClient";

function tokenFromLocation(params, search) {
  if (params?.token) return String(params.token);
  return new URLSearchParams(search).get("token") || "";
}

export default function PublicLeaveApproval() {
  const params = useParams();
  const location = useLocation();
  const token = tokenFromLocation(params, location.search);
  const preset = new URLSearchParams(location.search).get("action") || "";
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Invalid approval link.");
      return;
    }
    fetchPublicLeaveApproval(token)
      .then((data) => setPayload(data.request || data))
      .catch((err) => setError(err.message));
  }, [token]);

  const decided = Boolean(payload?.already_decided || done);

  const submit = async (action) => {
    if (action === "decline" && !reason.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await decidePublicLeave({ token, action, reason, comment: reason });
      setDone(result.decision || action);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remaining = payload?.remaining_after_approval;
  const title = useMemo(() => {
    if (done === "approved") return "Leave approved";
    if (done === "rejected" || done === "decline") return "Leave declined";
    if (payload?.already_decided) return "This request was already decided";
    return "Leave approval";
  }, [done, payload]);

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{payload?.company_name || "Paidly"}</p>
          <h1 className="text-xl font-semibold mt-1">{title}</h1>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!payload && !error ? <p className="text-sm text-muted-foreground">Loading request…</p> : null}
        {payload ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Employee</dt>
              <dd className="font-medium">{payload.employee_name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Leave type</dt>
              <dd>{payload.leave_type}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dates</dt>
              <dd>
                {payload.start_date} → {payload.end_date}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Duration</dt>
              <dd>{payload.working_days} working days</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Current balance</dt>
              <dd>{payload.current_balance ?? "—"} days</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Remaining after approval</dt>
              <dd>{remaining ?? "—"} days</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reason</dt>
              <dd>{payload.reason || "—"}</dd>
            </div>
          </dl>
        ) : null}
        {payload && !decided ? (
          <>
            <Textarea
              className="rounded-xl"
              placeholder="Add a comment (required to decline)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                className="flex-1 rounded-xl"
                disabled={saving}
                onClick={() => submit("approve")}
              >
                {saving && preset !== "decline" ? "Saving…" : "Approve leave"}
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                disabled={saving}
                onClick={() => submit("decline")}
              >
                Decline leave
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
