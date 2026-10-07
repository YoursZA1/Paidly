import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  applyEmployeeLeave,
  downloadEmployeePayslip,
  employeeAttachmentUrl,
  employeeDocumentUrl,
  endEmployeeAccessSession,
  fetchEmployeeAccessSession,
  previewEmployeeLeave,
  redeemEmployeeAccessLink,
  requestEmployeeAccessLink,
} from "@/lib/workforcePortal/employeeAccessClient.js";
import { EMPLOYEE_ACCESS_SENT_MESSAGE } from "@shared/workforce/employeeAccessLink.js";
import { countWorkingDays } from "@shared/leave/leaveMath.js";

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
      <p className="mt-0.5 break-words text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "download";
  link.click();
  URL.revokeObjectURL(url);
}

function DownloadButton({ children, onClick, busy }) {
  return (
    <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy} onClick={onClick}>
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
      {children}
    </Button>
  );
}

function ApplyLeave({ balances, onSubmitted }) {
  const types = balances.filter((row) => row.leave_type_id);
  const [leaveTypeId, setLeaveTypeId] = useState(types[0]?.leave_type_id || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedType = types.find((row) => row.leave_type_id === leaveTypeId);
  const workingDays = useMemo(() => {
    if (!startDate || !endDate) return null;
    return countWorkingDays(startDate, endDate, { halfDay: halfDay && startDate === endDate });
  }, [startDate, endDate, halfDay]);

  useEffect(() => {
    if (!leaveTypeId || !startDate || !endDate) {
      setPreview(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      previewEmployeeLeave({
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        half_day: halfDay && startDate === endDate,
        reason,
      })
        .then((data) => {
          if (!cancelled) setPreview(data);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [leaveTypeId, startDate, endDate, halfDay, reason]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await applyEmployeeLeave({
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        half_day: halfDay && startDate === endDate,
        reason,
      });
      setNotice(
        result?.working_days != null
          ? `Leave submitted. ${result.working_days} working day(s) are waiting for approval.`
          : "Leave submitted and waiting for approval."
      );
      setReason("");
      setStartDate("");
      setEndDate("");
      setHalfDay(false);
      setPreview(null);
      await onSubmitted?.();
    } catch (err) {
      setError(err?.message || "We couldn't submit this leave request.");
    } finally {
      setBusy(false);
    }
  };

  if (!types.length) return null;

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-border pt-4">
      <p className="text-sm font-medium text-foreground">Apply for leave</p>
      <div>
        <Label htmlFor="portal-leave-type">Leave type</Label>
        <select
          id="portal-leave-type"
          className="mt-1 h-12 w-full rounded-xl border border-border bg-background px-3 text-sm"
          value={leaveTypeId}
          onChange={(event) => setLeaveTypeId(event.target.value)}
        >
          {types.map((row) => (
            <option key={row.leave_type_id} value={row.leave_type_id}>
              {row.name} ({row.available ?? "—"} available)
            </option>
          ))}
        </select>
        {selectedType?.note ? <p className="mt-2 text-xs text-muted-foreground">{selectedType.note}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="portal-leave-start">Start date</Label>
          <Input id="portal-leave-start" type="date" className="mt-1 rounded-xl" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
        </div>
        <div>
          <Label htmlFor="portal-leave-end">End date</Label>
          <Input id="portal-leave-end" type="date" className="mt-1 rounded-xl" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox checked={halfDay} onCheckedChange={(value) => setHalfDay(Boolean(value))} disabled={!startDate || startDate !== endDate} />
        Half day
      </label>
      <div>
        <Label htmlFor="portal-leave-reason">Reason</Label>
        <Textarea id="portal-leave-reason" className="mt-1 rounded-xl" value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>
      <p className="text-sm text-muted-foreground">
        Working days: {preview?.working_days ?? workingDays ?? "—"}
        {preview?.remaining != null ? ` · Balance after approval: ${preview.remaining}` : ""}
      </p>
      {preview?.errors?.length ? (
        <ul className="space-y-0.5 text-sm text-destructive">
          {preview.errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      {notice ? <p className="text-sm text-foreground">{notice}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="rounded-xl" disabled={busy || !leaveTypeId || !startDate || !endDate}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Submit leave request
      </Button>
    </form>
  );
}

function Details({ session, onEnded, onSession }) {
  const employee = session.employee || {};
  const payslips = Array.isArray(session.payslips) ? session.payslips : [];
  const documents = Array.isArray(session.documents) ? session.documents : [];
  const leave = Array.isArray(session.leave_balances) ? session.leave_balances : [];
  const requests = Array.isArray(session.leave_requests) ? session.leave_requests : [];
  const latest = payslips[0] || null;
  const expires = when(session.expires_at);
  const name = employee.name || "Employee";
  const [actionError, setActionError] = useState("");
  const [downloading, setDownloading] = useState("");

  const refresh = async () => {
    const next = await fetchEmployeeAccessSession();
    if (next?.ok) onSession?.(next);
  };

  const runDownload = async (key, action) => {
    setActionError("");
    setDownloading(key);
    try {
      await action();
    } catch (err) {
      setActionError(err?.message || "We couldn't download that.");
    } finally {
      setDownloading("");
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit p-6">
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
        </Card>

        <main className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
              <Building2 className="size-4 text-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                {session.company_name || "Employee details"}
              </h2>
              <p className="text-xs text-muted-foreground">Your record, leave, payslips, and documents</p>
            </div>
          </div>
          {actionError ? (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Time off balance</CardTitle>
            </CardHeader>
            <CardContent>
            {leave.length ? (
              <div className="mt-4 flex gap-4 overflow-x-auto pb-1">
                {leave.map((row) => (
                  <div key={row.id} className="flex w-28 shrink-0 flex-col items-center text-center">
                    <div className="flex size-16 items-center justify-center rounded-full border border-border text-xl font-semibold text-foreground">
                      {Number.isFinite(Number(row.available)) ? Number(row.available).toFixed(2) : "—"}
                    </div>
                    <p className="mt-2 text-xs font-medium text-foreground">Available</p>
                    <p className="text-xs text-muted-foreground">{row.name}</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      Accrued {Number(row.accrued || 0).toFixed(2)} · Used {Number(row.used || 0).toFixed(2)}
                    </p>
                    {row.cycle_label ? <p className="text-[11px] leading-snug text-muted-foreground">{row.cycle_label}</p> : null}
                    {row.note ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{row.note}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No leave balances yet.</p>
            )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Applied leave</CardTitle>
            </CardHeader>
            <CardContent>
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
              <p className="text-sm text-muted-foreground">No leave requests yet.</p>
            )}
            {session.can_apply_leave ? <ApplyLeave balances={leave} onSubmitted={refresh} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg">Payslip</CardTitle>
              {latest ? (
                <DownloadButton
                  busy={downloading === latest.id}
                  onClick={() =>
                    runDownload(latest.id, async () => {
                      const file = await downloadEmployeePayslip(latest.id);
                      saveBlob(file.blob, file.filename);
                    })
                  }
                >
                  Download PDF
                </DownloadButton>
              ) : null}
            </CardHeader>
            <CardContent>
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
              <p className="text-sm text-muted-foreground">No payslips yet.</p>
            )}
            {latest ? (
              <p className="mt-3 text-xs text-muted-foreground">The PDF opens with your ID number.</p>
            ) : null}
            {payslips.length > 1 ? (
              <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                {payslips.slice(1).map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {row.payslip_number || "Payslip"} · {day(row.pay_period_start)} – {day(row.pay_period_end)} · {money(row.net_pay)}
                    </span>
                    <DownloadButton
                      busy={downloading === row.id}
                      onClick={() =>
                        runDownload(row.id, async () => {
                          const file = await downloadEmployeePayslip(row.id);
                          saveBlob(file.blob, file.filename);
                        })
                      }
                    >
                      PDF
                    </DownloadButton>
                  </li>
                ))}
              </ul>
            ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Documents</CardTitle>
            </CardHeader>
            <CardContent>
            {documents.length ? (
              <ul className="space-y-3 text-sm">
                {documents.map((row) => (
                  <li key={row.id} className="border-t border-border py-3 first:border-t-0 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-foreground">{row.title}</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {[row.type, row.status].filter(Boolean).join(" · ").replace(/_/g, " ")}
                        </p>
                      </div>
                      <DownloadButton
                        busy={downloading === `doc-${row.id}`}
                        onClick={() =>
                          runDownload(`doc-${row.id}`, async () => {
                            const url = await employeeDocumentUrl(row.id);
                            window.open(url, "_blank", "noopener,noreferrer");
                          })
                        }
                      >
                        Download
                      </DownloadButton>
                    </div>
                    {Array.isArray(row.files) && row.files.length ? (
                      <ul className="mt-2 space-y-2">
                        {row.files.map((file) => (
                          <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 pl-3 text-muted-foreground">
                            <span>{file.file_name}</span>
                            <DownloadButton
                              busy={downloading === `file-${file.id}`}
                              onClick={() =>
                                runDownload(`file-${file.id}`, async () => {
                                  const url = await employeeAttachmentUrl(file.id);
                                  window.open(url, "_blank", "noopener,noreferrer");
                                })
                              }
                            >
                              File
                            </DownloadButton>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No documents yet.</p>
            )}
            </CardContent>
          </Card>
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
        onSession={setSession}
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
