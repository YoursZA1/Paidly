import React from "react";
import { formatCurrency } from "@/utils/currencyCalculations";
import {
  formatLineItemDisplayName,
  invoiceItemsRequireShipping,
} from "@/utils/invoiceTemplateData";

/** Shown under Notes to clarify deposit/milestone behaviour. */
const NOTES_PAYMENT_MILESTONES_COPY =
  "Payment milestones may apply (for example 50% when work is started, if required). " +
  "Specific amounts, timing, and any other conditions are as agreed in writing.";

const VARIANT_CONFIG = {
  classic: {
    band: "bg-[#F2F2F2]",
    hatchBg: "#E5E5E5",
    title: "text-black",
    rule: "border-black/25",
    logoFallback: "bg-black",
  },
  modern: {
    band: "bg-[#FFF5F0]",
    hatchBg: "#fde8dc",
    title: "text-[#f24e00]",
    rule: "border-[#f24e00]/35",
    headerAccent: "border-b-4 border-[#f24e00] pb-4",
    logoFallback: "bg-[#f24e00]",
  },
  minimal: {
    band: "bg-neutral-50",
    hatchBg: "#e5e5e5",
    title: "text-neutral-800 font-medium",
    rule: "border-neutral-200",
    logoFallback: "bg-neutral-800",
    sparse: true,
  },
  bold: {
    band: "bg-neutral-200",
    hatchBg: "#d4d4d4",
    title: "text-black font-black",
    rule: "border-black",
    logoFallback: "bg-black",
    heavy: true,
  },
  paidlypro: {
    band: "bg-orange-50/90",
    hatchBg: "#fed7aa",
    title: "text-orange-600",
    rule: "border-orange-300",
    logoFallback: "bg-orange-600",
    font: "font-geist antialiased",
  },
};

function InvoiceDatesColumn({ issueDate, deliveryDate, dueLabel, heavy }) {
  const labelCls = `text-xs uppercase tracking-wide mb-1 text-neutral-600 ${heavy ? "font-black" : "font-bold"}`;
  const valueCls = `text-foreground ${heavy ? "font-bold" : "font-semibold"}`;
  const dueHeading =
    dueLabel === "Valid until" ? "Valid until" : "Due date";
  return (
    <div className="space-y-3 text-sm text-right">
      <div>
        <p className={labelCls}>Date of issue</p>
        <p className={valueCls}>{issueDate}</p>
      </div>
      <div>
        <p className={labelCls}>{dueHeading}</p>
        <p className={valueCls}>{deliveryDate}</p>
      </div>
    </div>
  );
}

function clientLines(client) {
  const lines = [];
  if (client?.name) lines.push({ key: "name", text: client.name, bold: true });
  if (client?.contact_person) lines.push({ key: "cp", text: `Attn: ${client.contact_person}` });
  if (client?.address) {
    String(client.address)
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((part, i) => lines.push({ key: `addr-${i}`, text: part }));
  }
  if (client?.tax_id) lines.push({ key: "tax", text: `Tax ID: ${client.tax_id}` });
  if (client?.phone) lines.push({ key: "phone", text: client.phone });
  if (client?.email) lines.push({ key: "email", text: client.email });
  return lines;
}

/** Company profile fields for the Business contact block (Settings). */
function accountInfoRowsFromUser(user) {
  if (!user || typeof user !== "object") return [];
  const rows = [];
  const company = typeof user.company_name === "string" ? user.company_name.trim() : "";
  if (company) rows.push({ key: "company", label: "Company", value: company });
  const name =
    (typeof user.full_name === "string" && user.full_name.trim()) ||
    (typeof user.display_name === "string" && user.display_name.trim()) ||
    "";
  if (name) rows.push({ key: "name", label: "Name", value: name });
  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (email) rows.push({ key: "email", label: "Email", value: email });
  const phone = typeof user.phone === "string" ? user.phone.trim() : "";
  if (phone) rows.push({ key: "phone", label: "Phone", value: phone });
  const addr = typeof user.company_address === "string" ? user.company_address.trim() : "";
  if (addr) rows.push({ key: "address", label: "Address", value: addr, multiline: true });
  return rows;
}

/** Bank / account lines — saved banking row on the invoice or default from profile `user.business`. */
function accountDetailsBankRows(bankingDetail, user) {
  const b = bankingDetail && typeof bankingDetail === "object" ? bankingDetail : null;
  const biz = user?.business && typeof user.business === "object" ? user.business : null;
  const t = (v) => (typeof v === "string" ? v.trim() : "");
  const bankName = t(b?.bank_name || biz?.bank_name);
  const accountName = t(b?.account_name || biz?.account_name);
  const accountNo = t(b?.account_number || biz?.account_number);
  const branch = t(b?.routing_number || b?.branch_code || biz?.branch_code);
  const swift = t(b?.swift_code);
  const addInfo = t(b?.additional_info);
  const rows = [];
  if (bankName) rows.push({ key: "bank", label: "Bank name", value: bankName });
  if (accountName) rows.push({ key: "acctnm", label: "Account name", value: accountName });
  if (accountNo) rows.push({ key: "acctno", label: "Account number", value: accountNo });
  if (branch) rows.push({ key: "branch", label: "Branch / routing code", value: branch });
  if (swift) rows.push({ key: "swift", label: "SWIFT / BIC", value: swift });
  if (addInfo) rows.push({ key: "add", label: "Payment reference", value: addInfo, multiline: true });
  return rows;
}

/** Product / material lines → ship-to. Otherwise → date of issue & due date (no physical shipment). */
function ShipToBlock({
  client,
  heavy,
  itemsRequireShipping,
  issueDate,
  deliveryDate,
  dueLabel,
}) {
  const lines = clientLines(client);

  if (itemsRequireShipping) {
    return (
      <div>
        <h3
          className={`text-xs uppercase tracking-wide mb-2 ${heavy ? "font-black" : "font-bold"}`}
        >
          Ship to
        </h3>
        {lines.length === 0 ? (
          <p className="text-neutral-500 text-sm">Same as invoice address</p>
        ) : (
          <div className="space-y-0.5 text-sm">
            {lines.map(({ key, text, bold }) => (
              <p
                key={key}
                className={`${bold ? "font-bold" : "text-neutral-700"} ${heavy && bold ? "font-black" : ""}`}
              >
                {text}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <InvoiceDatesColumn
      issueDate={issueDate}
      deliveryDate={deliveryDate}
      dueLabel={dueLabel}
      heavy={heavy}
    />
  );
}

function InvoiceToBlock({ client, heavy }) {
  const lines = clientLines(client);
  return (
    <div>
      <h3
        className={`text-xs uppercase tracking-wide mb-2 ${heavy ? "font-black" : "font-bold"}`}
      >
        Invoice to
      </h3>
      <div className="space-y-0.5 text-sm">
        {lines.length === 0 ? (
          <p className="text-neutral-500">—</p>
        ) : (
          lines.map(({ key, text, bold }) => (
            <p
              key={key}
              className={`${bold ? "font-bold" : "text-neutral-700"} ${heavy && bold ? "font-black" : ""}`}
            >
              {text}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Shared invoice / quote layout: header, gray band (invoice to | ship-to or dates),
 * optional dates row when shipping goods, line table, totals, payment structure | account details, footer.
 */
export default function UnifiedInvoiceTemplate({
  variant = "classic",
  invoice,
  client,
  user,
  bankingDetail,
  userCurrency,
  safeFormatDate,
  documentTitle,
}) {
  const cfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.classic;
  const issueDate = safeFormatDate(invoice.created_date);
  const deliveryDate = safeFormatDate(invoice.delivery_date);
  const resolvedTitle =
    documentTitle || (invoice.type === "QUOTE" ? "QUOTE" : "INVOICE");
  const isQuote = resolvedTitle === "QUOTE";
  const dueLabel = isQuote ? "Valid until" : "Due date";
  const numberLabel = isQuote ? "Quote no" : "Invoice no";

  const taglineRaw =
    typeof user?.invoice_header === "string" ? user.invoice_header.trim() : "";
  const tagline =
    taglineRaw && taglineRaw.length <= 140
      ? taglineRaw.split("\n")[0].trim()
      : taglineRaw
        ? `${taglineRaw.slice(0, 100)}${taglineRaw.length > 100 ? "…" : ""}`
        : "";

  const companyTitle = (user?.company_name || "Your company").toUpperCase();
  const logoSrc =
    user?.logo_url || user?.company_logo_url || null;
  const businessContactRows = accountInfoRowsFromUser(user);
  const accountBankRows = accountDetailsBankRows(bankingDetail, user);
  const hasAccountDetailsSection =
    accountBankRows.length > 0 || businessContactRows.length > 0;

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  /** Empty drafts: show issue/due dates, not Ship to (`invoiceItemsRequireShipping` is false for []). */
  const itemsRequireShipping = invoiceItemsRequireShipping(items);
  const hasItemTax = items.some((item) => Number(item.item_tax_rate) > 0);
  const discountAmt = Number(invoice.discount_amount || 0);
  const paymentStructureTotal = Number(invoice.total_amount ?? 0);

  const hatchStyle = {
    backgroundColor: cfg.hatchBg,
    backgroundImage: `repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 5px,
      rgba(255,255,255,0.5) 5px,
      rgba(255,255,255,0.5) 6px
    )`,
  };

  const pyBand = cfg.sparse ? "py-4 px-4 sm:px-6" : "py-5 px-5 sm:px-8";
  const pySection = cfg.sparse ? "py-4" : "py-6";

  return (
    <div
      className={`invoice unified-invoice-template max-w-[210mm] mx-auto bg-white text-black text-sm leading-normal ${cfg.font || ""}`}
    >
      <header className={`mb-6 sm:mb-8 ${cfg.headerAccent || ""}`}>
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex gap-3 sm:gap-4 min-w-0 items-start">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt=""
                className="h-24 sm:h-28 w-auto max-w-[280px] sm:max-w-[320px] object-contain object-left shrink-0"
                style={{ maxHeight: "112px" }}
              />
            ) : (
              <div
                className={`h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-sm ${cfg.logoFallback}`}
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1">
              <h1
                className={`text-base sm:text-lg tracking-tight ${cfg.title} ${cfg.heavy ? "font-black" : "font-bold"}`}
              >
                {companyTitle}
              </h1>
              {tagline ? (
                <p className="text-xs sm:text-sm text-neutral-500 mt-1 uppercase tracking-wide">
                  {tagline}
                </p>
              ) : null}
              {user?.company_address ? (
                <p className="text-xs text-neutral-600 mt-2 whitespace-pre-line max-w-md">
                  {user.company_address}
                </p>
              ) : null}
            </div>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <h2
              className={`text-3xl sm:text-4xl uppercase tracking-tight ${cfg.title} ${cfg.heavy ? "font-black" : "font-bold"}`}
            >
              {resolvedTitle}
            </h2>
            <p
              className={`text-foreground text-xs sm:text-sm mt-1 uppercase tracking-wide ${cfg.heavy ? "font-black" : "font-bold"}`}
            >
              {numberLabel}: {invoice.invoice_number || "—"}
            </p>
          </div>
        </div>
      </header>

      <section className={`${cfg.band} ${pyBand} mb-5 sm:mb-6`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12">
          <InvoiceToBlock client={client} heavy={cfg.heavy} />
          <ShipToBlock
            client={client}
            heavy={cfg.heavy}
            itemsRequireShipping={itemsRequireShipping}
            issueDate={issueDate}
            deliveryDate={deliveryDate}
            dueLabel={dueLabel}
          />
        </div>
      </section>

      {itemsRequireShipping ? (
        <div className="mb-4 sm:mb-5">
          <InvoiceDatesColumn
            issueDate={issueDate}
            deliveryDate={deliveryDate}
            dueLabel={dueLabel}
            heavy={cfg.heavy}
          />
        </div>
      ) : null}

      <section className="mb-6 sm:mb-8">
        <table
          className={`items invoice-table unified-invoice-line-table w-full border-collapse table-fixed border-t border-b ${cfg.rule}`}
        >
          <colgroup>
            <col className="min-w-0" style={{ width: "50%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "19.5%" }} />
            <col style={{ width: "19.5%" }} />
          </colgroup>
          <thead>
            <tr className={`border-b ${cfg.rule}`}>
              <th
                className={`py-3 pr-4 sm:pr-6 text-left text-[10px] sm:text-xs uppercase tracking-wide ${cfg.heavy ? "font-black" : "font-bold"}`}
              >
                Description
              </th>
              <th
                className={`py-3 px-2 sm:px-3 text-center text-[10px] sm:text-xs uppercase tracking-wide whitespace-nowrap ${cfg.heavy ? "font-black" : "font-bold"}`}
              >
                Quantity
              </th>
              <th
                className={`py-3 pl-2 sm:pl-3 pr-2 text-right text-[10px] sm:text-xs uppercase tracking-wide whitespace-nowrap ${cfg.heavy ? "font-black" : "font-bold"}`}
              >
                Price
              </th>
              <th
                className={`py-3 pl-2 text-right text-[10px] sm:text-xs uppercase tracking-wide whitespace-nowrap ${cfg.heavy ? "font-black" : "font-bold"}`}
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item, index) => {
                const title = formatLineItemDisplayName(
                  item.service_name || item.name
                );
                const sub = typeof item.description === "string" ? item.description.trim() : "";
                return (
                  <tr key={index} className={`border-b border-black/10 ${cfg.rule}`}>
                    <td className="py-3.5 pr-4 sm:pr-6 align-top min-w-0">
                      <p
                        className={`text-foreground leading-snug ${cfg.heavy ? "font-bold" : "font-semibold"}`}
                      >
                        {title}
                      </p>
                      {sub ? (
                        <p className="text-xs text-neutral-500 mt-1 whitespace-pre-line leading-relaxed">
                          {sub}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3.5 px-2 sm:px-3 align-top text-center tabular-nums text-foreground">
                      {item.quantity}
                    </td>
                    <td className="py-3.5 pl-2 sm:pl-3 pr-2 align-top text-right tabular-nums currency-value text-xs sm:text-sm whitespace-nowrap">
                      {formatCurrency(item.unit_price, userCurrency)}
                    </td>
                    <td className="py-3.5 pl-2 align-top text-right font-medium tabular-nums currency-value text-xs sm:text-sm whitespace-nowrap">
                      {formatCurrency(item.total_price || 0, userCurrency)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="py-10 text-center text-neutral-500 text-sm"
                >
                  No items found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section
        className={`unified-invoice-totals grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 mb-8 sm:mb-10 ${pySection}`}
      >
        <div>
          <h3
            className={`text-xs uppercase tracking-wide mb-2 ${cfg.heavy ? "font-black" : "font-bold"}`}
          >
            Total due
          </h3>
          <div
            className="px-4 py-5 sm:py-6 border border-black/10"
            style={hatchStyle}
          >
            <p
              className={`text-2xl sm:text-3xl tabular-nums currency-value tracking-tight ${cfg.heavy ? "font-black" : "font-bold"}`}
            >
              {formatCurrency(invoice.total_amount, userCurrency)}
            </p>
          </div>
        </div>
        <div className="sm:justify-self-end w-full sm:max-w-xs">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-black/10 pb-2">
              <span className="text-neutral-600 uppercase text-xs tracking-wide">
                Subtotal
              </span>
              <span className="font-medium tabular-nums currency-value">
                {formatCurrency(invoice.subtotal, userCurrency)}
              </span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between gap-4 border-b border-black/10 pb-2">
                <span className="text-neutral-600 uppercase text-xs tracking-wide">
                  Discount
                  {invoice.discount_type === "percentage"
                    ? ` (${invoice.discount_value}%)`
                    : ""}
                </span>
                <span className="font-medium tabular-nums currency-value text-red-600">
                  -{formatCurrency(discountAmt, userCurrency)}
                </span>
              </div>
            )}
            {hasItemTax && (
              <div className="flex justify-between gap-4 border-b border-black/10 pb-2">
                <span className="text-neutral-600 uppercase text-xs tracking-wide">
                  Item taxes
                </span>
                <span className="font-medium tabular-nums currency-value">
                  {formatCurrency(invoice.item_taxes || 0, userCurrency)}
                </span>
              </div>
            )}
            {Number(invoice.tax_rate) > 0 && (
              <div className="flex justify-between gap-4 border-b border-black/10 pb-2">
                <span className="text-neutral-600 uppercase text-xs tracking-wide">
                  Tax ({invoice.tax_rate}%)
                </span>
                <span className="font-medium tabular-nums currency-value">
                  {formatCurrency(invoice.tax_amount, userCurrency)}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4 pt-1">
              <span
                className={`uppercase text-xs tracking-wide ${cfg.heavy ? "font-black" : "font-bold"}`}
              >
                Grand total
              </span>
              <span
                className={`tabular-nums currency-value ${cfg.heavy ? "font-black" : "font-bold"}`}
              >
                {formatCurrency(invoice.total_amount, userCurrency)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 text-sm border-t border-black/10 pt-6">
        <div>
          <h3
            className={`text-xs uppercase tracking-wide mb-3 ${cfg.heavy ? "font-black" : "font-bold"}`}
          >
            Payment info
          </h3>
          <div className="space-y-4 text-neutral-700">
            <div>
              <p className="text-xs text-neutral-500 mb-2">Payment structure</p>
              <ul className="space-y-1.5 text-sm">
                {[
                  { pct: "25%", value: paymentStructureTotal * 0.25 },
                  { pct: "50%", value: paymentStructureTotal * 0.5 },
                  { pct: "100%", value: paymentStructureTotal },
                ].map(({ pct, value }) => (
                  <li
                    key={pct}
                    className="flex flex-nowrap items-baseline justify-start gap-2 tabular-nums"
                  >
                    <span className="text-neutral-600 shrink-0">{pct}</span>
                    <span className="font-medium text-foreground currency-value">
                      {formatCurrency(value, userCurrency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div>
          <h3
            className={`text-xs uppercase tracking-wide mb-3 ${cfg.heavy ? "font-black" : "font-bold"}`}
          >
            Account details
          </h3>
          {hasAccountDetailsSection ? (
            <div className="space-y-4 text-neutral-700">
              {accountBankRows.length > 0 ? (
                <dl className="space-y-2">
                  {accountBankRows.map((row) => (
                    <div key={row.key}>
                      <dt className="text-xs text-neutral-500">{row.label}</dt>
                      <dd
                        className={`font-medium text-foreground text-sm ${row.multiline ? "whitespace-pre-line" : ""}`}
                      >
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-neutral-500 text-sm">
                  Add default bank details in Settings, or choose a bank account on the invoice.
                </p>
              )}
              {businessContactRows.length > 0 ? (
                <div
                  className={
                    accountBankRows.length > 0 ? "pt-3 border-t border-black/10" : ""
                  }
                >
                  <p
                    className={`text-xs uppercase tracking-wide mb-2 text-neutral-500 ${cfg.heavy ? "font-black" : "font-bold"}`}
                  >
                    Business contact
                  </p>
                  <dl className="space-y-2">
                    {businessContactRows.map((row) => (
                      <div key={row.key}>
                        <dt className="text-xs text-neutral-500">{row.label}</dt>
                        <dd
                          className={`font-medium text-foreground text-sm ${row.multiline ? "whitespace-pre-line" : ""}`}
                        >
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-neutral-500 text-sm">—</p>
          )}
        </div>
      </section>

      <section className="mb-8 text-sm border-t border-black/10 pt-6">
        <h3
          className={`text-xs uppercase tracking-wide mb-3 ${cfg.heavy ? "font-black" : "font-bold"}`}
        >
          Notes
        </h3>
        <p className="text-neutral-700 text-xs sm:text-sm leading-relaxed mb-4">
          {NOTES_PAYMENT_MILESTONES_COPY}
        </p>
        {invoice.notes ? (
          <p className="text-neutral-700 whitespace-pre-line border-t border-black/10 pt-4 mt-4">
            {invoice.notes}
          </p>
        ) : null}
        {items.filter((item) => item.description?.trim()).length > 0 && (
          <ul className="mt-4 pt-4 border-t border-black/10 space-y-1 text-neutral-700">
            {items
              .filter((item) => item.description?.trim())
              .map((item, idx) => (
                <li key={idx}>
                  <span className="font-medium text-foreground">
                    {formatLineItemDisplayName(item.service_name || item.name)}:
                  </span>{" "}
                  <span className="whitespace-pre-line">{item.description.trim()}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-black/20 pt-5 text-xs text-neutral-600">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end">
          <div className="min-w-0">
            {user?.company_address ? (
              <p className="whitespace-pre-line">{user.company_address}</p>
            ) : null}
            {user?.website ? (
              <p className="mt-1 text-neutral-500">{user.website}</p>
            ) : null}
          </div>
          <div className="text-left sm:text-right shrink-0 space-y-0.5">
            {user?.phone ? <p>Tel: {user.phone}</p> : null}
            {user?.email ? <p>{user.email}</p> : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
