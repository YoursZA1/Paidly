import { useCallback, useId, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  Maximize2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/components/CurrencySelector";
import { Supplier } from "@/api/entities";
import { initialReceiptFields, NONE } from "@/components/cashflow/receipt/receiptReviewFields";
import {
  confidenceLevel,
  parseMoney,
  RECEIPT_EXPENSE_CATEGORIES,
  RECEIPT_PAYMENT_METHODS,
  suggestExpenseCategory,
  todayIso,
  validateReceiptAmounts,
  validateReceiptExpenseSubmission,
} from "@shared/expenses/receiptScan.js";

function money(value) {
  const n = parseMoney(value);
  return n == null ? "" : n.toFixed(2);
}

function displayDate(iso) {
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return iso || "";
  }
}

/** Field → how sure the reading was, as a person-friendly label. */
function useFieldAttention(extraction, source, touched, suggestion, supplierMatch) {
  return useCallback(
    (field) => {
      if (!extraction || source === "manual" || touched.has(field)) return null;
      const c = extraction.confidence || {};
      const map = {
        vendor: [c.merchantName, Boolean(extraction.merchantName || extraction.supplierName), true],
        date: [c.date, Boolean(extraction.transactionDate), true],
        total: [c.total, extraction.total != null, true],
        subtotal: [c.subtotal, extraction.subtotal != null, false],
        vat: [c.vatAmount, extraction.vatAmount != null, false],
        category: [suggestion.confidence, true, false],
        supplier_id: [supplierMatch?.kind === "close" ? 0.7 : 1, true, false],
      };
      const entry = map[field];
      if (!entry) return null;
      const [score, hasValue, required] = entry;
      if (!hasValue && !required) return null;
      const level = confidenceLevel(score, hasValue);
      if (level === "high") return null;
      return level === "low"
        ? { level, label: "Needs review", hint: hasValue ? "We weren't sure we read this correctly." : "We couldn't find this on the receipt." }
        : { level, label: "Review", hint: "Please check this against the receipt." };
    },
    [extraction, source, touched, suggestion, supplierMatch]
  );
}

function AttentionBadge({ attention, id }) {
  if (!attention) return null;
  const low = attention.level === "low";
  return (
    <span
      id={id}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        low ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-sky-500/10 text-sky-800 dark:text-sky-300"
      }`}
    >
      {low ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : <Info className="h-3 w-3" aria-hidden="true" />}
      {attention.label}
      <span className="sr-only">: {attention.hint}</span>
    </span>
  );
}

function Field({ id, label, attention, error, children, hint, className = "" }) {
  const attentionId = attention ? `${id}-attention` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={`space-y-1.5 ${className}`} data-field={id}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <AttentionBadge attention={attention} id={attentionId} />
      </div>
      {children({ describedBy: [attentionId, errorId].filter(Boolean).join(" ") || undefined, invalid: Boolean(error), attention })}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={errorId} className="flex items-center gap-1 text-sm text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function attentionRing(attention, invalid) {
  if (invalid) return "border-destructive focus-visible:ring-destructive";
  if (attention?.level === "low") return "border-amber-500/70";
  if (attention?.level === "medium") return "border-sky-500/50";
  return "";
}

function MoneyInput({ id, value, onChange, describedBy, invalid, attention, ...rest }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">
        R
      </span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className={`h-11 pl-7 tabular-nums ${attentionRing(attention, invalid)}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const formatted = money(e.target.value);
          if (formatted && formatted !== e.target.value) onChange(formatted);
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        {...rest}
      />
    </div>
  );
}

function ReceiptPreview({ receipt }) {
  const [expanded, setExpanded] = useState(false);
  if (!receipt?.previewUrl) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
        Receipt attached
      </div>
    );
  }
  if (receipt.kind === "pdf") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/30 p-6 text-center">
        <FileText className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{receipt.name || "Receipt PDF"}</p>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <a href={receipt.previewUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open PDF
          </a>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group relative block w-full overflow-hidden rounded-xl border border-border bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={receipt.previewUrl}
          alt="Scanned receipt"
          decoding="async"
          className={`mx-auto w-full object-contain transition-[max-height] ${expanded ? "max-h-[80vh]" : "max-h-56 md:max-h-[calc(90vh-12rem)]"}`}
        />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow md:hidden">
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
          {expanded ? "Show less" : "Show full receipt"}
        </span>
      </button>
    </div>
  );
}

function VatCheck({ check, fields, acknowledged, onAcknowledge, extractionHadVat, error }) {
  const ackId = useId();
  if (check.status === "incomplete") return null;
  if (check.status === "consistent") {
    const rate = fields.vat_rate || (check.impliedRate ? String(check.impliedRate) : "");
    return (
      <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-foreground" role="status">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <span>
          <span className="font-medium">VAT checks out.</span>{" "}
          {fields.subtotal ? `${formatCurrency(parseMoney(fields.subtotal), "ZAR")} + ` : ""}
          {formatCurrency(parseMoney(fields.vat), "ZAR")} VAT = {formatCurrency(parseMoney(fields.total), "ZAR")}
          {rate ? ` · ${Number(rate)}% VAT` : ""}
        </span>
      </p>
    );
  }
  if (check.status === "vat_missing") {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground" role="status">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          <span className="font-medium">{extractionHadVat === false ? "VAT needs review." : "No VAT entered."}</span>{" "}
          {extractionHadVat === false ? "We couldn't find VAT on this receipt. " : ""}
          Only enter VAT if the receipt shows it.
        </span>
      </p>
    );
  }
  if (check.status === "invalid") return null;
  const issues = check.issues || [];
  return (
    <div className={`space-y-2 rounded-lg border p-3 text-sm ${error ? "border-destructive" : "border-amber-500/50"} bg-amber-500/5`} role="alert">
      <p className="flex items-start gap-2 text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <span>
          <span className="font-medium">VAT needs review.</span>{" "}
          {issues.includes("totals_mismatch")
            ? `Subtotal + VAT is ${formatCurrency(check.expectedTotal, "ZAR")}, but the total is ${formatCurrency(parseMoney(fields.total), "ZAR")}.`
            : issues.includes("vat_rate_mismatch")
              ? "The VAT amount doesn't match the VAT rate on the receipt."
              : "The VAT amount looks unusually high."}
        </span>
      </p>
      <label htmlFor={ackId} className="flex min-h-11 cursor-pointer items-center gap-3 pl-6">
        <Checkbox id={ackId} checked={acknowledged} onCheckedChange={(v) => onAcknowledge(Boolean(v))} data-vat-ack />
        <span>I&apos;ve checked these amounts against the receipt</span>
      </label>
    </div>
  );
}

function DuplicateWarning({ duplicates, acknowledged, onAcknowledge, onViewExpense }) {
  if (!duplicates?.length) return null;
  if (acknowledged) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
        Similar receipt found — you chose to save this one anyway.
        <button type="button" className="ml-auto text-primary underline-offset-2 hover:underline" onClick={() => onAcknowledge(false)}>
          Undo
        </button>
      </p>
    );
  }
  const first = duplicates[0];
  return (
    <div className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3" role="alert" data-duplicate-warning>
      <p className="flex items-start gap-2 text-sm text-foreground">
        <Copy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <span>
          <span className="font-medium">Possible duplicate.</span>{" "}
          {first.reason === "same_file" ? "This exact receipt has already been added:" : "A similar receipt already exists:"}
        </span>
      </p>
      <ul className="space-y-1 pl-6 text-sm">
        {duplicates.slice(0, 3).map((d) => (
          <li key={d.id} className="text-foreground">
            <span className="font-medium">{d.vendor || "Expense"}</span>
            {d.date ? ` · ${displayDate(d.date)}` : ""}
            {d.amount != null ? ` · ${formatCurrency(d.amount, "ZAR")}` : ""}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 pl-6 sm:flex-row">
        {onViewExpense ? (
          <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => onViewExpense(first.id)}>
            View existing expense
          </Button>
        ) : null}
        <Button type="button" variant="secondary" size="sm" className="min-h-10" onClick={() => onAcknowledge(true)}>
          Continue anyway
        </Button>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   receipt: any, extraction: any, source: "server" | "on_device" | "manual",
 *   reviewInfo: { suppliers: any[], supplierMatch: any, duplicates: any[], canManageSuppliers: boolean },
 *   saving: boolean, saveError: any,
 *   onSave: (fields: Record<string, unknown>, flags: { duplicateAcknowledged: boolean, vatAcknowledged: boolean, editedFields: string[] }) => void,
 *   onViewExpense?: (id: string) => void,
 *   formId: string,
 * }} props
 */
export default function ReceiptReviewForm({ receipt, extraction, source, reviewInfo, saving, saveError, onSave, onViewExpense, formId }) {
  const uid = useId();
  const id = (name) => `${uid}-${name}`;
  const formRef = useRef(null);
  const initial = useMemo(() => initialReceiptFields(extraction, reviewInfo.supplierMatch), [extraction, reviewInfo.supplierMatch]);
  const [fields, setFields] = useState(initial);
  const [touched, setTouched] = useState(() => new Set());
  const [localErrors, setLocalErrors] = useState({});
  const [vatAcknowledged, setVatAcknowledged] = useState(false);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [suppliers, setSuppliers] = useState(reviewInfo.suppliers || []);
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [supplierMessage, setSupplierMessage] = useState("");

  // Supplier list / match can arrive after the form mounted (manual entry path).
  const [seenMatch, setSeenMatch] = useState(reviewInfo.supplierMatch);
  if (reviewInfo.supplierMatch !== seenMatch) {
    setSeenMatch(reviewInfo.supplierMatch);
    if (reviewInfo.supplierMatch?.supplier?.id && !touched.has("supplier_id")) {
      setFields((f) => ({ ...f, supplier_id: reviewInfo.supplierMatch.supplier.id }));
    }
  }
  const [seenSuppliers, setSeenSuppliers] = useState(reviewInfo.suppliers);
  if (reviewInfo.suppliers !== seenSuppliers) {
    setSeenSuppliers(reviewInfo.suppliers);
    setSuppliers(reviewInfo.suppliers || []);
  }

  const suggestion = useMemo(() => suggestExpenseCategory(extraction), [extraction]);
  const attentionFor = useFieldAttention(extraction, source, touched, suggestion, reviewInfo.supplierMatch);

  const set = useCallback((name, value) => {
    setFields((f) => ({ ...f, [name]: value }));
    setTouched((t) => (t.has(name) ? t : new Set(t).add(name)));
    setLocalErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const amountCheck = useMemo(
    () =>
      validateReceiptAmounts({
        subtotal: parseMoney(fields.subtotal) ?? undefined,
        vatAmount: parseMoney(fields.vat) ?? undefined,
        total: parseMoney(fields.total) ?? undefined,
        vatRate: parseMoney(fields.vat_rate) ?? undefined,
      }),
    [fields.subtotal, fields.vat, fields.total, fields.vat_rate]
  );

  const errors = { ...(saveError?.errors || {}), ...Object.fromEntries(Object.entries(localErrors).filter(([, v]) => v)) };
  const selectedSupplier = suppliers.find((s) => s.id === fields.supplier_id);
  const vendorName = fields.vendor.trim();
  const showNewSupplier =
    vendorName && fields.supplier_id === NONE && reviewInfo.supplierMatch?.kind !== "exact" && !suppliers.some((s) => s.name?.toLowerCase() === vendorName.toLowerCase());

  const payload = useCallback(
    () => ({
      vendor: fields.vendor || selectedSupplier?.name || "",
      supplier_id: fields.supplier_id === NONE ? null : fields.supplier_id,
      receipt_number: fields.receipt_number,
      date: fields.date,
      category: fields.category,
      subtotal: fields.subtotal,
      vat: fields.vat,
      vat_rate: fields.vat_rate,
      total: fields.total,
      payment_method: fields.payment_method === NONE ? "" : fields.payment_method,
      description: fields.description,
      notes: fields.notes,
      is_claimable: fields.is_claimable,
      line_items: extraction?.lineItems || null,
    }),
    [extraction, fields, selectedSupplier]
  );

  const focusField = (name) => {
    const el = formRef.current?.querySelector(`[data-field="${id(name)}"] input, [data-field="${id(name)}"] button`);
    el?.focus();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const body = payload();
    const checked = validateReceiptExpenseSubmission({ ...body, vat_acknowledged: vatAcknowledged }, { today: todayIso() });
    if (!checked.ok) {
      setLocalErrors(checked.errors);
      if (checked.code === "VAT_REVIEW_REQUIRED") {
        formRef.current?.querySelector("[data-vat-ack]")?.focus();
      } else {
        const order = ["vendor", "date", "category", "subtotal", "vat", "total", "payment_method", "supplier_id"];
        focusField(order.find((f) => checked.errors[f]) || "total");
      }
      return;
    }
    if (reviewInfo.duplicates?.length && !duplicateAcknowledged) {
      formRef.current?.querySelector("[data-duplicate-warning] button")?.focus();
      return;
    }
    const editedFields = [...touched].filter((f) => String(fields[f] ?? "") !== String(initial[f] ?? ""));
    onSave(body, { duplicateAcknowledged, vatAcknowledged, editedFields });
  };

  const addSupplier = async () => {
    setSupplierBusy(true);
    setSupplierMessage("");
    try {
      const created = await Supplier.create({ name: vendorName });
      if (created?.id) {
        setSuppliers((list) => [...list, { id: created.id, name: created.name || vendorName }].sort((a, b) => a.name.localeCompare(b.name)));
        set("supplier_id", created.id);
        setSupplierMessage(`${created.name || vendorName} added to your suppliers.`);
      }
    } catch {
      setSupplierMessage("We couldn't add this supplier. You can still save the expense with the name typed above.");
    } finally {
      setSupplierBusy(false);
    }
  };

  const nonZarCurrency = extraction?.currency && extraction.currency !== "ZAR" ? extraction.currency : null;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-6">
      <div className="md:sticky md:top-0 md:self-start">
        <ReceiptPreview receipt={receipt} />
        {source !== "manual" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Paidly read this receipt for you. Check the highlighted fields — nothing is saved until you tap Save expense.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">The receipt is attached. Enter the details from it below.</p>
        )}
      </div>

      <form ref={formRef} id={formId} onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Receipt details">
        <DuplicateWarning
          duplicates={reviewInfo.duplicates}
          acknowledged={duplicateAcknowledged}
          onAcknowledge={setDuplicateAcknowledged}
          onViewExpense={onViewExpense}
        />
        {nonZarCurrency ? (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm" role="status">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            This receipt is in {nonZarCurrency}. Expenses are recorded in rand — convert the amounts before saving.
          </p>
        ) : null}

        <Field id={id("vendor")} label="Supplier / merchant" attention={attentionFor("vendor")} error={errors.vendor}>
          {({ describedBy, invalid, attention }) => (
            <Input
              id={id("vendor")}
              className={`h-11 ${attentionRing(attention, invalid)}`}
              value={fields.vendor}
              onChange={(e) => set("vendor", e.target.value)}
              placeholder="e.g. Woolworths"
              autoComplete="organization"
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        {suppliers.length || reviewInfo.canManageSuppliers ? (
          <Field id={id("supplier_id")} label="Link to supplier" attention={attentionFor("supplier_id")} error={errors.supplier_id}>
            {({ describedBy, invalid }) => (
              <div className="space-y-2">
                {reviewInfo.supplierMatch?.kind === "exact" && fields.supplier_id === reviewInfo.supplierMatch.supplier?.id ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Matched supplier
                  </p>
                ) : null}
                <Select value={fields.supplier_id} onValueChange={(v) => set("supplier_id", v)}>
                  <SelectTrigger id={id("supplier_id")} className="h-11" aria-invalid={invalid || undefined} aria-describedby={describedBy}>
                    <SelectValue placeholder="No supplier" />
                  </SelectTrigger>
                  <SelectContent className="z-[130]">
                    <SelectItem value={NONE}>No supplier</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showNewSupplier ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-2.5 text-sm">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      New supplier detected
                    </span>
                    <span className="text-muted-foreground">“{vendorName}” isn&apos;t in your suppliers.</span>
                    {reviewInfo.canManageSuppliers ? (
                      <Button type="button" variant="outline" size="sm" className="ml-auto min-h-9" onClick={addSupplier} disabled={supplierBusy}>
                        {supplierBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                        Add as supplier
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {supplierMessage ? (
                  <p className="text-xs text-muted-foreground" role="status">
                    {supplierMessage}
                  </p>
                ) : null}
              </div>
            )}
          </Field>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={id("date")} label="Date" attention={attentionFor("date")} error={errors.date}>
            {({ describedBy, invalid, attention }) => (
              <Input
                id={id("date")}
                type="date"
                className={`h-11 ${attentionRing(attention, invalid)}`}
                value={fields.date}
                max={todayIso()}
                onChange={(e) => set("date", e.target.value)}
                required
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field id={id("receipt_number")} label="Receipt / invoice no." error={errors.receipt_number}>
            {({ describedBy, invalid }) => (
              <Input
                id={id("receipt_number")}
                className="h-11"
                value={fields.receipt_number}
                onChange={(e) => set("receipt_number", e.target.value)}
                autoComplete="off"
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
              />
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id={id("subtotal")} label="Subtotal (excl. VAT)" attention={attentionFor("subtotal")} error={errors.subtotal}>
            {(p) => <MoneyInput id={id("subtotal")} value={fields.subtotal} onChange={(v) => set("subtotal", v)} {...p} />}
          </Field>
          <Field id={id("vat")} label="VAT" attention={attentionFor("vat")} error={errors.vat}>
            {(p) => <MoneyInput id={id("vat")} value={fields.vat} onChange={(v) => set("vat", v)} {...p} />}
          </Field>
          <Field id={id("total")} label="Total" attention={attentionFor("total")} error={errors.total}>
            {(p) => <MoneyInput id={id("total")} value={fields.total} onChange={(v) => set("total", v)} required {...p} />}
          </Field>
        </div>

        <VatCheck
          check={amountCheck}
          fields={fields}
          acknowledged={vatAcknowledged}
          onAcknowledge={setVatAcknowledged}
          extractionHadVat={extraction ? extraction.vatAmount != null : undefined}
          error={Boolean(localErrors.vat && amountCheck.status === "mismatch")}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id={id("category")}
            label="Category"
            attention={attentionFor("category")}
            error={errors.category}
            hint={extraction && !touched.has("category") && suggestion.source !== "default" ? "Suggested from the receipt — change it if needed." : undefined}
          >
            {({ describedBy, invalid, attention }) => (
              <Select value={fields.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger id={id("category")} className={`h-11 ${attentionRing(attention, invalid)}`} aria-invalid={invalid || undefined} aria-describedby={describedBy}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[130]">
                  {RECEIPT_EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field id={id("payment_method")} label="Payment method" error={errors.payment_method}>
            {({ describedBy, invalid }) => (
              <Select value={fields.payment_method} onValueChange={(v) => set("payment_method", v)}>
                <SelectTrigger id={id("payment_method")} className="h-11" aria-invalid={invalid || undefined} aria-describedby={describedBy}>
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent className="z-[130]">
                  <SelectItem value={NONE}>Not specified</SelectItem>
                  {RECEIPT_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>

        <details className="group rounded-lg border border-border [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 text-sm font-medium text-foreground">
            More details
            <span className="text-xs text-muted-foreground group-open:hidden">Description, notes{extraction?.lineItems?.length ? ", items" : ""}</span>
          </summary>
          <div className="space-y-4 border-t border-border p-3">
            <Field id={id("description")} label="Description" error={errors.description} hint={`Defaults to “Receipt from ${vendorName || "…"}”.`}>
              {({ describedBy }) => (
                <Input id={id("description")} className="h-11" value={fields.description} onChange={(e) => set("description", e.target.value)} aria-describedby={describedBy} />
              )}
            </Field>
            <Field id={id("notes")} label="Notes" error={errors.notes}>
              {({ describedBy }) => (
                <Textarea id={id("notes")} rows={2} value={fields.notes} onChange={(e) => set("notes", e.target.value)} aria-describedby={describedBy} />
              )}
            </Field>
            <label htmlFor={id("claimable")} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <Checkbox id={id("claimable")} checked={fields.is_claimable} onCheckedChange={(v) => set("is_claimable", Boolean(v))} />
              I paid this myself and need to be reimbursed
            </label>
            {extraction?.lineItems?.length ? (
              <div>
                <p className="mb-1.5 text-sm font-medium text-foreground">Items on this receipt</p>
                <ul className="divide-y divide-border rounded-md border border-border text-sm">
                  {extraction.lineItems.map((item, i) => (
                    <li key={i} className="flex justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate">
                        {item.quantity && item.quantity !== 1 ? `${item.quantity} × ` : ""}
                        {item.description}
                      </span>
                      {item.amount != null ? <span className="tabular-nums text-muted-foreground">{formatCurrency(item.amount, "ZAR")}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>

        {saveError && !Object.keys(saveError.errors || {}).length && saveError.code !== "POSSIBLE_DUPLICATE" ? (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            {saveError.message}
          </p>
        ) : null}
        {saving ? (
          <p className="sr-only" role="status">
            Saving expense…
          </p>
        ) : null}
      </form>
    </div>
  );
}
