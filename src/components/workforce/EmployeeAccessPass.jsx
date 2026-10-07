import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  endEmployeeAccessSession,
  fetchEmployeeAccessSession,
  redeemEmployeeAccessLink,
  requestEmployeeAccessLink,
} from "@/lib/workforcePortal/employeeAccessClient.js";
import { EMPLOYEE_ACCESS_SENT_MESSAGE } from "@shared/workforce/employeeAccessLink.js";

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Details({ session, onEnded }) {
  const employee = session.employee || {};
  const payslips = Array.isArray(session.payslips) ? session.payslips : [];
  const documents = Array.isArray(session.documents) ? session.documents : [];
  const leave = Array.isArray(session.leave_balances) ? session.leave_balances : [];
  const expires = when(session.expires_at);

  return (
    <div className="space-y-5 text-left text-sm">
      <div>
        <p className="font-display text-lg font-semibold text-foreground">{employee.name || "Employee"}</p>
        <p className="text-muted-foreground">
          {[employee.employee_number, employee.job_title, employee.department].filter(Boolean).join(" · ") || employee.email}
        </p>
        {expires ? <p className="mt-2 text-muted-foreground">This access expires {expires}.</p> : null}
      </div>

      <section className="space-y-2">
        <h2 className="font-medium text-foreground">Payslips</h2>
        {payslips.length ? (
          <ul className="space-y-2">
            {payslips.map((row) => (
              <li key={row.id} className="rounded-lg border border-border px-3 py-2">
                <p className="font-medium text-foreground">{row.payslip_number || "Payslip"}</p>
                <p className="text-muted-foreground">
                  {row.pay_period_start || "—"} – {row.pay_period_end || "—"}
                  {row.net_pay != null ? ` · ${money(row.net_pay)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No payslips yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium text-foreground">Leave</h2>
        {leave.length ? (
          <ul className="space-y-1 text-muted-foreground">
            {leave.map((row) => (
              <li key={row.id}>
                {row.name}: {row.available ?? "—"} available
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No leave balances yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium text-foreground">Documents</h2>
        {documents.length ? (
          <ul className="space-y-1 text-muted-foreground">
            {documents.map((row) => (
              <li key={row.id}>{row.title}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No documents yet.</p>
        )}
      </section>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          void endEmployeeAccessSession().finally(onEnded);
        }}
      >
        End this access
      </Button>
    </div>
  );
}

/**
 * Email on the employment record → 24-hour link → this employee's details only.
 */
export default function EmployeeAccessPass({ slug, companyName, passwordForm = null }) {
  const [params, setParams] = useSearchParams();
  const token = params.get("access") || "";
  const [phase, setPhase] = useState(token ? "opening" : "loading");
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (token) {
      setPhase("opening");
      redeemEmployeeAccessLink(token)
        .then((data) => {
          if (cancelled) return;
          setSession(data);
          setPhase("details");
          const next = new URLSearchParams(params);
          next.delete("access");
          setParams(next, { replace: true });
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err?.message || "This link has expired.");
          setPhase("request");
          const next = new URLSearchParams(params);
          next.delete("access");
          setParams(next, { replace: true });
        });
      return () => {
        cancelled = true;
      };
    }
    setPhase("loading");
    fetchEmployeeAccessSession()
      .then((data) => {
        if (cancelled) return;
        if (data?.ok) {
          setSession(data);
          setPhase("details");
        } else {
          setPhase("request");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "");
        setPhase("request");
      });
    return () => {
      cancelled = true;
    };
    // Redeem once per token. Clearing the query must not redeem again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await requestEmployeeAccessLink(slug, email);
      setNotice(data?.message || EMPLOYEE_ACCESS_SENT_MESSAGE);
    } catch (err) {
      setError(err?.message || "We couldn't send the link.");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "loading" || phase === "opening") {
    return (
      <div className="flex justify-center py-6" aria-label="Opening your employee details">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (phase === "details" && session) {
    return (
      <Details
        session={session}
        onEnded={() => {
          setSession(null);
          setPhase("request");
          setNotice("");
        }}
      />
    );
  }

  if (showPassword && passwordForm) {
    return (
      <div className="space-y-4">
        {passwordForm}
        <button
          type="button"
          className="w-full text-center text-sm text-muted-foreground underline underline-offset-4"
          onClick={() => setShowPassword(false)}
        >
          Email me a 24-hour link instead
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Enter the email on your employment record. We'll send a link that opens your details for 24 hours.
      </p>
      <div className="space-y-2">
        <Label htmlFor="employee-access-email">Email</Label>
        <Input
          id="employee-access-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      {notice ? <p className="text-sm text-foreground">{notice}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy || !email}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
        Email me a 24-hour link
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        The link is not a permanent login. It expires 24 hours after we send it.
      </p>
      <button
        type="button"
        className="w-full text-center text-sm text-muted-foreground underline underline-offset-4"
        onClick={() => setShowPassword(true)}
      >
        I already have a password for {companyName}
      </button>
    </form>
  );
}
