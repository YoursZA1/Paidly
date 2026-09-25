import { formatCurrency } from "@/components/CurrencySelector";
import LogoImage from "@/components/shared/LogoImage";
import { resolvePayslipEmployerDisplay } from "@shared/payroll/employerSnapshot.js";
import { buildPayslipView, PAY_TYPE_LABELS } from "@shared/payroll/payslipView.js";

/**
 * Payslip document (screen, print, PDF, public link). Presentation only: every amount is the
 * finalized pay run value stored on the payslip — nothing here calculates payroll.
 */

function valueOrDash(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function Field({ label, value }) {
  if (value == null || String(value).trim() === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function MoneyTable({ title, rows, total, totalLabel, money, muted = false }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 sm:p-5" style={{ pageBreakInside: "avoid" }}>
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
      <table className="mt-2 w-full text-[13px]">
        <tbody className="divide-y divide-border/70">
          {rows.map((row, i) => (
            <tr key={`${row.code || row.label}-${i}`}>
              <td className="py-2 pr-3 text-slate-700">
                {row.label}
                {row.detail ? <span className="block text-[11px] text-slate-500">{row.detail}</span> : null}
              </td>
              <td className={`py-2 text-right tabular-nums ${muted ? "text-slate-600" : "text-slate-900"}`}>{money(row.amount)}</td>
            </tr>
          ))}
        </tbody>
        {totalLabel ? (
          <tfoot>
            <tr className="border-t-2 border-slate-200">
              <td className="pt-2.5 font-semibold text-slate-900">{totalLabel}</td>
              <td className="pt-2.5 text-right font-semibold tabular-nums text-slate-900">{money(total)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export default function PayslipDocument({
  payslip,
  user,
  payDate,
  payPeriodLabel,
  className = "",
}) {
  // Payroll is South African: one money format everywhere on the payslip (R 12 000,00).
  const currency = payslip?.currency || "ZAR";
  const money = (value) => formatCurrency(Number(value || 0), currency);
  const view = buildPayslipView(payslip || {}, { formatMoney: money });
  const employer = resolvePayslipEmployerDisplay(payslip, user);
  const employeeSnap =
    payslip?.employee_snapshot && typeof payslip.employee_snapshot === "object" ? payslip.employee_snapshot : {};
  const leave = Array.isArray(payslip?.leave_summary) ? payslip.leave_summary : [];

  return (
    <article className={`w-full max-w-[800px] mx-auto rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-sm ${className}`}>
      <header className="flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {employer.logo_url ? (
            <LogoImage src={employer.logo_url} alt="Company logo" className="mb-2 h-10 w-auto object-contain" />
          ) : null}
          <p className="text-base font-semibold text-slate-900">{valueOrDash(employer.company_name)}</p>
          {employer.trading_name && employer.trading_name !== employer.company_name ? (
            <p className="text-[12px] text-slate-600">Trading as {employer.trading_name}</p>
          ) : null}
          {employer.address ? (
            <p className="mt-0.5 whitespace-pre-line text-[12px] leading-5 text-slate-600">{employer.address}</p>
          ) : null}
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            {[
              employer.paye_reference ? `PAYE ref ${employer.paye_reference}` : null,
              employer.uif_reference ? `UIF ref ${employer.uif_reference}` : null,
              employer.registration_number ? `Reg ${employer.registration_number}` : null,
              employer.email || null,
              employer.phone || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="shrink-0 sm:text-right">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Payslip</h1>
          <p className="mt-1 text-[13px] text-slate-700">{valueOrDash(payslip?.payslip_number)}</p>
          {view.taxYear ? <p className="text-[12px] text-slate-500">Tax year {view.taxYear}</p> : null}
        </div>
      </header>

      <section className="mt-5 rounded-xl border border-border bg-slate-50/70 p-4 sm:p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="Employee" value={valueOrDash(payslip?.employee_name)} />
          <Field label="Employee no." value={payslip?.employee_id} />
          <Field label="Occupation" value={payslip?.position} />
          <Field label="Department" value={payslip?.department} />
          <Field label="Pay type" value={PAY_TYPE_LABELS[view.payType] || null} />
          <Field label="Tax number" value={employeeSnap.tax_number} />
          <Field label="Pay period" value={valueOrDash(payPeriodLabel)} />
          <Field label="Payment date" value={valueOrDash(payDate)} />
          <Field label="Start date" value={employeeSnap.employment_start_date} />
          <Field label="UIF number" value={employeeSnap.uif_number} />
          <Field
            label="Paid to"
            value={employeeSnap.bank_account_masked ? [employeeSnap.bank_name, employeeSnap.bank_account_masked].filter(Boolean).join(" ") : null}
          />
        </dl>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MoneyTable title="Earnings" rows={view.earnings} total={view.grossPay} totalLabel="Gross pay" money={money} />
        <MoneyTable title="Deductions" rows={view.deductions} total={view.totalDeductions} totalLabel="Total deductions" money={money} />
      </section>

      {view.fringeBenefits.length ? (
        <p className="mt-3 text-[12px] text-slate-600">
          Taxable benefits (not paid in cash):{" "}
          {view.fringeBenefits.map((l) => `${l.label} ${money(l.amount)}`).join(" · ")}
        </p>
      ) : null}

      <section className="mt-5 rounded-2xl bg-primary px-5 py-5 text-primary-foreground sm:flex sm:items-end sm:justify-between" style={{ pageBreakInside: "avoid" }}>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest opacity-90">Net pay</p>
          <p className="text-[12px] opacity-80">{payDate ? `Paid ${payDate}` : null}</p>
        </div>
        <p className="mt-1 text-4xl font-bold tabular-nums sm:mt-0">{money(view.netPay)}</p>
      </section>

      {view.ytd.length || view.employerContributions.length ? (
        <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {view.ytd.length ? (
            <MoneyTable title={`Year to date${view.taxYear ? ` · ${view.taxYear}` : ""}`} rows={view.ytd} money={money} muted />
          ) : null}
          {view.employerContributions.length ? (
            <MoneyTable
              title="Employer contributions"
              rows={view.employerContributions}
              total={view.employerContributionsTotal}
              totalLabel="Total (not deducted from pay)"
              money={money}
              muted
            />
          ) : null}
        </section>
      ) : null}

      {leave.length ? (
        <section className="mt-5 rounded-xl border border-border bg-white p-4 sm:p-5" style={{ pageBreakInside: "avoid" }}>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-700">Leave (days)</h3>
          <table className="mt-2 w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1 font-medium">Type</th>
                <th className="py-1 text-right font-medium">Accrued</th>
                <th className="py-1 text-right font-medium">Taken</th>
                <th className="py-1 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {leave.map((row) => (
                <tr key={row.code || row.name}>
                  <td className="py-1.5">{valueOrDash(row.name)}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.accrued ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.used ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{row.available ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-slate-500">
        <span>Generated by Paidly from finalized payroll · {valueOrDash(payslip?.payslip_number)}</span>
        <span>Keep this payslip for your records.</span>
      </footer>
    </article>
  );
}
