import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  if (value == null || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function day(iso) {
  if (!iso) return "—";
  const date = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

function statusLabel(status) {
  const key = String(status || "active").toLowerCase();
  if (key === "active") return "Available";
  if (key === "on_leave") return "On leave";
  return key.replace(/_/g, " ");
}

function leaveTone(status) {
  const key = String(status || "").toLowerCase();
  if (key === "approved") return "bg-emerald-500";
  if (key === "rejected" || key === "declined") return "bg-red-500";
  return "bg-amber-400";
}

function Fact({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

function Details({ session, onEnded }) {
  const employee = session.employee || {};
  const payslips = Array.isArray(session.payslips) ? session.payslips : [];
  const documents = Array.isArray(session.documents) ? session.documents : [];
  const leave = Array.isArray(session.leave_balances) ? session.leave_balances : [];
  const requests = Array.isArray(session.leave_requests) ? session.leave_requests : [];
  const latest = payslips[0] || null;
  const expires = when(session.expires_at);
  const name = employee.name || "Employee";

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col items-center text-center">
            {employee.avatar_url ? (
              <img src={employee.avatar_url} alt="" className="size-24 rounded-full object-cover" />
            ) : (
              <div className="flex size-24 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
                {initials(name).toUpperCase() || "•"}
              </div>
            )}
            <h1 className="mt-4 font-display text-xl font-semibold text-foreground">{name}</h1>
            <p className="text-sm text-muted-foreground">{employee.job_title || "Employee"}</p>
            <p className="mt-2 text-sm text-foreground">{statusLabel(employee.employment_status)}</p>
          </div>
          <div className="mt-6 space-y-3 border-t border-border pt-5">
            <Fact label="Email" value={employee.email} />
            <Fact label="Phone" value={employee.phone} />
            <Fact label="Department" value={employee.department} />
            <Fact label="Employee number" value={employee.employee_number} />
            <Fact label="Started" value={employee.employment_start_date ? day(employee.employment_start_date) : ""} />
          </div>
          {expires ? <p className="mt-5 text-xs text-muted-foreground">This access expires {expires}.</p> : null}
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full"
            onClick={() => {
              void endEmployeeAccessSession().finally(onEnded);
            }}
          >
            End this access
          </Button>
        </aside>

        <main className="space-y-4">
          <p className="text-sm text-muted-foreground">{session.company_name || "Employee details"}</p>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold text-foreground">Time off balance</h2>
            {leave.length ? (
              <div className="mt-4 flex gap-4 overflow-x-auto pb-1">
                {leave.map((row) => (
                  <div key={row.id} className="flex w-28 shrink-0 flex-col items-center text-center">
                    <div className="flex size-16 items-center justify-center rounded-full border border-border text-xl font-semibold text-foreground">
                      {row.available ?? "—"}
                    </div>
                    <p className="mt-2 text-xs font-medium text-foreground">Available</p>
                    <p className="text-xs text-muted-foreground">{row.name}</p>
                    {row.entitled != null ? (
                      <p className="text-xs text-muted-foreground">of {row.entitled} days</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No leave balances yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold text-foreground">Applied leave</h2>
            {requests.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-medium">Leave type</th>
                      <th className="pb-2 font-medium">Duration</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="py-3 text-foreground">{row.name}</td>
                        <td className="py-3 text-muted-foreground">
                          {day(row.start_date)} – {day(row.end_date)}
                          {row.working_days != null ? ` · ${row.working_days} days` : ""}
                        </td>
                        <td className="py-3">
                          <span className="inline-flex items-center gap-2 capitalize text-foreground">
                            <span className={`size-2 rounded-full ${leaveTone(row.status)}`} aria-hidden="true" />
                            {String(row.status || "pending").replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No leave requests yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold text-foreground">Payslip</h2>
            {latest ? (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  {latest.payslip_number || "Payslip"} · {day(latest.pay_period_start)} – {day(latest.pay_period_end)}
                </p>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <Fact label="Basic salary" value={money(latest.basic_salary)} />
                  <Fact label="Allowances" value={money(latest.allowances)} />
                  <Fact label="Deductions" value={money(latest.total_deductions)} />
                  <Fact label="Net pay" value={money(latest.net_pay)} />
                  <Fact label="Pay date" value={day(latest.pay_date)} />
                </dl>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No payslips yet.</p>
            )}
            {payslips.length > 1 ? (
              <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                {payslips.slice(1).map((row) => (
                  <li key={row.id} className="flex flex-wrap justify-between gap-2 text-muted-foreground">
                    <span>{row.payslip_number || "Payslip"}</span>
                    <span>
                      {day(row.pay_period_start)} – {day(row.pay_period_end)} · {money(row.net_pay)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold text-foreground">Documents</h2>
            {documents.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {documents.map((row) => (
                  <li key={row.id} className="flex justify-between gap-3 border-t border-border py-2 first:border-t-0">
                    <span className="text-foreground">{row.title}</span>
                    <span className="capitalize text-muted-foreground">{row.status || row.type || ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No documents yet.</p>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function RequestCard({ logoUrl, companyName, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border shadow-none">
        <CardHeader className="space-y-1 pb-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-primary">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <Building2 className="size-8 text-primary-foreground" aria-hidden="true" />
            )}
          </div>
          <CardTitle className="font-display text-2xl font-bold">{companyName}</CardTitle>
          <p className="text-sm text-muted-foreground">Employee details</p>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}

/**
 * Email on the employment record → 24-hour link → this employee's details only.
 */
export default function EmployeeAccessPass({ slug, companyName, logoUrl = "", passwordForm = null }) {
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
      <RequestCard logoUrl={logoUrl} companyName={companyName}>
        <div className="flex justify-center py-6" aria-label="Opening your employee details">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </RequestCard>
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
      <RequestCard logoUrl={logoUrl} companyName={companyName}>
        {passwordForm}
        <button
          type="button"
          className="w-full text-center text-sm text-muted-foreground underline underline-offset-4"
          onClick={() => setShowPassword(false)}
        >
          Email me a 24-hour link instead
        </button>
      </RequestCard>
    );
  }

  return (
    <RequestCard logoUrl={logoUrl} companyName={companyName}>
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
    </RequestCard>
  );
}
