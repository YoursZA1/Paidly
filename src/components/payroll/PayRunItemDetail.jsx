import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/components/CurrencySelector";
import { inputEarningLines } from "@shared/payroll/calculatePayroll.js";

const money = (v) => formatCurrency(Number(v || 0), "ZAR");
const pct = (r) => `${Math.round(Number(r || 0) * 10000) / 100}%`;

function Row({ label, value, strong, muted }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "mt-1 border-t border-border pt-1.5 font-semibold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-1">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function lineAmount(item, code) {
  const line = (item?.earnings || []).find((l) => String(l.code || "").toUpperCase() === code);
  return line ? String(line.amount) : "";
}

/**
 * Pay run item: calculation audit view (from the stored item — never recalculated here) and, while
 * the run is open, the payroll inputs for this employee (units, overtime, bonus, commission).
 */
export default function PayRunItemDetail({ item, editable, onRecalculate, busy }) {
  const calc = item?.calculation && typeof item.calculation === "object" ? item.calculation : {};
  const inputs = calc.inputs || {};
  const paye = calc.paye || null;
  const payType = inputs.pay_type || null;
  const [form, setForm] = useState({});

  useEffect(() => {
    setForm({
      ordinary_hours: item?.ordinary_hours ?? (payType === "hourly" ? inputs.units ?? "" : ""),
      days_worked: item?.days_worked ?? "",
      overtime_hours: item?.overtime_hours ?? "",
      overtime_rate: item?.overtime_rate ?? "",
      bonus: lineAmount(item, "BONUS"),
      commission: lineAmount(item, "COMMISSION"),
    });
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

  const submit = () => {
    const kept = inputEarningLines(item?.earnings).filter((l) => !["BONUS", "COMMISSION"].includes(String(l.code || "").toUpperCase()));
    const bonus = numOrNull(form.bonus);
    const commission = numOrNull(form.commission);
    const earnings = [
      ...kept,
      ...(bonus ? [{ code: "BONUS", name: "Bonus", type: "bonus", amount: bonus, taxable: true, irregular: true }] : []),
      ...(commission ? [{ code: "COMMISSION", name: "Commission", type: "commission", amount: commission, taxable: true }] : []),
    ];
    onRecalculate({
      id: item.id,
      ordinary_hours: numOrNull(form.ordinary_hours),
      days_worked: numOrNull(form.days_worked),
      overtime_hours: numOrNull(form.overtime_hours) ?? 0,
      overtime_rate: numOrNull(form.overtime_rate) ?? 0,
      earnings,
    });
  };

  const statutory = item?.statutory_deductions || [];
  const uif = statutory.find((l) => String(l.code).toUpperCase() === "UIF");
  const ec = calc.employer_contributions;

  return (
    <div className="space-y-4 text-sm">
      <Section title="Earnings">
        {(item?.earnings || []).map((line) => (
          <Row key={line.code} label={line.name} value={money(line.amount)} />
        ))}
        <Row label="Gross pay" value={money(item?.gross_pay)} strong />
      </Section>

      <Section title={`PAYE${calc.tax_year?.label ? ` · tax year ${calc.tax_year.label}` : ""}`}>
        {paye ? (
          <>
            <Row label="Taxable remuneration (period)" value={money(calc.period_taxable)} muted />
            {Number(calc.retirement_deductible) > 0 ? (
              <Row label="Less deductible retirement contribution" value={money(calc.retirement_deductible)} muted />
            ) : null}
            <Row label={`Annual equivalent (${paye.method === "run_to_date" ? `run-to-date, ${paye.periods_used} of ${paye.periods_per_year}` : `× ${paye.periods_per_year}`})`} value={money(paye.annual_equivalent)} muted />
            {paye.bracket ? (
              <Row
                label={`Bracket: ${money(paye.bracket.base)} + ${pct(paye.bracket.rate)} above ${money(paye.bracket.threshold)}`}
                value={money(paye.tax_before_rebates)}
                muted
              />
            ) : null}
            <Row label="Less primary rebate" value={money(paye.rebates?.primary)} muted />
            {paye.rebates?.secondary ? <Row label="Less secondary rebate (65+)" value={money(paye.rebates.secondary)} muted /> : null}
            {paye.rebates?.tertiary ? <Row label="Less tertiary rebate (75+)" value={money(paye.rebates.tertiary)} muted /> : null}
            {paye.medical_credit_annual ? <Row label="Less medical tax credits (annual)" value={money(paye.medical_credit_annual)} muted /> : null}
            <Row label="Annual tax on regular pay" value={money(paye.annual_tax)} muted />
            {paye.irregular_taxable ? <Row label={`Tax on irregular pay (${money(paye.irregular_taxable)})`} value={money(paye.irregular_tax)} muted /> : null}
            <Row label="PAYE this period" value={money(paye.paye)} strong />
            <p className="text-[11px] text-muted-foreground">
              Age at tax-year end: {paye.age ?? "not captured"} · SARS rules effective by payment date {inputs.pay_date || "—"}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Not calculated with the tax-year engine yet — recalculate to see the PAYE workings.</p>
        )}
      </Section>

      <Section title="UIF">
        <Row label={`UIF remuneration${uif?.base_amount != null ? " (capped at ceiling)" : ""}`} value={money(uif?.base_amount ?? calc.uif_remuneration)} muted />
        <Row label={`Employee ${uif?.rate != null ? pct(uif.rate) : "1%"}`} value={money(uif?.amount)} />
      </Section>

      <Section title="Net pay">
        <Row label="Gross pay" value={money(item?.gross_pay)} muted />
        {statutory
          .filter((l) => l.employee_portion !== false && Number(l.amount) > 0)
          .map((l) => (
            <Row key={l.code} label={`− ${l.name}`} value={money(l.amount)} muted />
          ))}
        {(item?.other_deductions || [])
          .filter((l) => l.employee_portion !== false)
          .map((l) => (
            <Row key={l.code} label={`− ${l.name}`} value={money(l.amount)} muted />
          ))}
        <Row label="Net pay" value={money(item?.net_pay)} strong />
      </Section>

      {ec ? (
        <Section title="Employer contributions (not deducted)">
          <Row label="UIF (employer)" value={money(ec.uif)} muted />
          <Row label="SDL" value={money(ec.sdl)} muted />
          {ec.benefits ? <Row label="Benefit contributions" value={money(ec.benefits)} muted /> : null}
          <Row label="Total employer cost" value={money(calc.employer_cost)} strong />
        </Section>
      ) : null}

      {(item?.warnings || []).map((w) => (
        <p key={w} className="text-xs text-amber-700">{w}</p>
      ))}

      {editable ? (
        <Section title="Payroll inputs for this run">
          <div className="grid grid-cols-2 gap-2">
            {payType !== "monthly_salary" && payType !== "daily" ? (
              <Field label="Ordinary hours" value={form.ordinary_hours} onChange={set("ordinary_hours")} />
            ) : null}
            {payType !== "monthly_salary" && payType !== "hourly" ? (
              <Field label="Days worked" value={form.days_worked} onChange={set("days_worked")} placeholder="Working days" />
            ) : null}
            <Field label="Overtime hours" value={form.overtime_hours} onChange={set("overtime_hours")} />
            <Field label="Overtime rate (R/h)" value={form.overtime_rate} onChange={set("overtime_rate")} />
            <Field label="Bonus (R)" value={form.bonus} onChange={set("bonus")} />
            <Field label="Commission (R)" value={form.commission} onChange={set("commission")} />
          </div>
          <Button className="mt-2 w-full rounded-xl" disabled={busy} onClick={submit}>
            {busy ? "Recalculating…" : "Save inputs & recalculate"}
          </Button>
        </Section>
      ) : null}
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-9" {...props} />
    </div>
  );
}
