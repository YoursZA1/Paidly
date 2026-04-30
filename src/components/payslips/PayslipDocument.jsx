import { formatCurrency } from "@/components/CurrencySelector";
import LogoImage from "@/components/shared/LogoImage";

function valueOrDash(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function normalizeList(items) {
  return Array.isArray(items) ? items : [];
}

function money(value, currency) {
  return formatCurrency(Number(value || 0), currency);
}

function Row({ label, value, emphasize = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[13px] text-slate-600">{label}</span>
      <span className={`text-[13px] tabular-nums ${emphasize ? "font-semibold text-slate-900" : "text-slate-800"}`}>
        {value}
      </span>
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
  const currency = user?.currency || payslip?.owner_currency || "ZAR";
  const allowances = normalizeList(payslip?.allowances);
  const otherDeductions = normalizeList(payslip?.other_deductions);
  const overtimePay = Number(payslip?.overtime_hours || 0) * Number(payslip?.overtime_rate || 0);

  return (
    <article className={`w-full max-w-[800px] mx-auto rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm ${className}`}>
      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {(user?.logo_url || user?.company_logo_url || payslip?.owner_logo_url) ? (
              <LogoImage
                src={user?.logo_url || user?.company_logo_url || payslip?.owner_logo_url}
                alt="Company logo"
                className="h-12 w-auto object-contain"
              />
            ) : (
              <p className="text-xl font-bold text-slate-900">{valueOrDash(user?.company_name || payslip?.owner_company_name)}</p>
            )}
            <p className="mt-3 text-sm font-semibold text-slate-900">{valueOrDash(user?.company_name || payslip?.owner_company_name)}</p>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-5 text-slate-600">
              {valueOrDash(user?.company_address || payslip?.owner_company_address)}
            </p>
          </div>

          <div className="shrink-0 text-left sm:text-right">
            <h1 className="text-3xl font-bold tracking-tight text-primary">PAYSLIP</h1>
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-semibold">ID:</span> {valueOrDash(payslip?.payslip_number)}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-semibold">Date:</span> {valueOrDash(payDate)}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-6 rounded-xl border border-border bg-slate-50/70 p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Employee Details</h2>
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <p className="text-sm text-slate-700"><span className="font-semibold text-slate-900">Employee Name:</span> {valueOrDash(payslip?.employee_name)}</p>
          <p className="text-sm text-slate-700"><span className="font-semibold text-slate-900">Employee ID:</span> {valueOrDash(payslip?.employee_id)}</p>
          <p className="text-sm text-slate-700"><span className="font-semibold text-slate-900">Position:</span> {valueOrDash(payslip?.position)}</p>
          <p className="text-sm text-slate-700"><span className="font-semibold text-slate-900">Department:</span> {valueOrDash(payslip?.department)}</p>
          <p className="text-sm text-slate-700 sm:col-span-2"><span className="font-semibold text-slate-900">Pay Period:</span> {valueOrDash(payPeriodLabel)}</p>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Earnings</h3>
          <div className="mt-3 divide-y divide-border/80">
            <Row label="Basic salary" value={money(payslip?.basic_salary, currency)} />
            {overtimePay > 0 ? <Row label="Overtime" value={money(overtimePay, currency)} /> : null}
            {allowances.map((item, index) => (
              <Row key={`allowance-${index}`} label={valueOrDash(item?.name)} value={money(item?.amount, currency)} />
            ))}
            <Row label="Gross pay" value={money(payslip?.gross_pay, currency)} emphasize />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Deductions</h3>
          <div className="mt-3 divide-y divide-border/80">
            <Row label="PAYE tax" value={money(payslip?.tax_deduction, currency)} />
            <Row label="UIF" value={money(payslip?.uif_deduction, currency)} />
            {Number(payslip?.pension_deduction || 0) > 0 ? (
              <Row label="Pension fund" value={money(payslip?.pension_deduction, currency)} />
            ) : null}
            {Number(payslip?.medical_aid_deduction || 0) > 0 ? (
              <Row label="Medical aid" value={money(payslip?.medical_aid_deduction, currency)} />
            ) : null}
            {otherDeductions.map((item, index) => (
              <Row key={`deduction-${index}`} label={valueOrDash(item?.name)} value={money(item?.amount, currency)} />
            ))}
            <Row label="Total deductions" value={money(payslip?.total_deductions, currency)} emphasize />
          </div>
        </div>
      </section>

      <section className="mt-6 flex justify-end">
        <div className="w-full rounded-xl border border-primary/20 bg-primary/10 px-5 py-4 text-right sm:max-w-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Net Pay</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{money(payslip?.net_pay, currency)}</p>
        </div>
      </section>
    </article>
  );
}
