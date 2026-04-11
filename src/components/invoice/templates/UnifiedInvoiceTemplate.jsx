import { formatCurrency } from "@/utils/currencyCalculations";
import {
  formatLineItemNameAndDescription,
  invoiceItemsRequireShipping,
} from "@/utils/invoiceTemplateData";

/**
 * Typography scale (print + PDF): title 20px, section headers 12px, body 12–13px,
 * table 12px, notes/terms 11px (headers 12px). Terms use block wrap (no line-clamp) for PDF fidelity.
 * Line items paginate via chunkRows for A4 flow.
 */

/** Normalize whitespace so terms wrap predictably inside the 400px-wide block (PDF-safe; no line-clamp). */
function termsForDisplay(raw) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const labelCls = `text-[12px] uppercase tracking-wide mb-1 text-neutral-600 ${heavy ? "font-black" : "font-bold"}`;
  const valueCls = `text-[13px] text-foreground ${heavy ? "font-bold" : "font-semibold"}`;
  const dueHeading =
    dueLabel === "Valid until" ? "Valid Until:" : "Due date";
  return (
    <div className="space-y-1.5 leading-[1.35] text-right">
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
          className={`text-[12px] uppercase tracking-wide mb-2 ${heavy ? "font-black" : "font-bold"}`}
        >
          Ship to
        </h3>
        {lines.length === 0 ? (
          <p className="text-neutral-500 text-[12px] leading-[1.4]">Same as invoice address</p>
        ) : (
          <div className="space-y-0.5 text-[12px] leading-[1.4]">
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
        className={`text-[12px] uppercase tracking-wide mb-2 ${heavy ? "font-black" : "font-bold"}`}
      >
        Invoice to
      </h3>
      <div className="space-y-0.5 text-[12px] leading-[1.4]">
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

/** Tuned for 12px table body + description wrap — fewer rows per page than 11px era. */
/** Denser rows (6px vertical padding) allow more lines per A4 page. */
const ROWS_PER_PAGE = 18;
const PAGE_HEIGHT_BUDGET = 340;

function estimateRowHeight(text) {
  const base = 20;
  const extra = Math.ceil(String(text || "").length / 68) * 11;
  return base + extra;
}

function chunkRows(rows, maxRows = ROWS_PER_PAGE, maxHeight = PAGE_HEIGHT_BUDGET) {
  const input = Array.isArray(rows) ? rows : [];
  if (input.length === 0) return [[]];
  const pages = [];
  let current = [];
  let currentHeight = 0;

  for (const row of input) {
    const label = formatLineItemNameAndDescription(row);
    const rowHeight = estimateRowHeight(label);
    const wouldOverflowCount = current.length >= maxRows;
    const wouldOverflowHeight = currentHeight + rowHeight > maxHeight;

    if (current.length > 0 && (wouldOverflowCount || wouldOverflowHeight)) {
      pages.push(current);
      current = [];
      currentHeight = 0;
    }

    current.push(row);
    currentHeight += rowHeight;
  }

  if (current.length > 0) pages.push(current);
  return pages;
}

/**
 * Shared invoice / quote layout: header, gray band (invoice to | ship-to or dates),
 * optional dates row when shipping goods, line table, payment details | totals row, footer.
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
  const resolvedTitle =
    documentTitle || (invoice.type === "QUOTE" ? "QUOTE" : "INVOICE");
  const isQuote = resolvedTitle === "QUOTE";
  const deliveryDate = safeFormatDate(
    isQuote ? invoice.valid_until ?? invoice.delivery_date : invoice.delivery_date
  );
  // Template safeFormatDate is typically month-first ("March 30, 2026").
  // For QUOTE, the design spec expects day-first: "30 March 2026".
  const deliveryDateLabel = (() => {
    if (!isQuote) return deliveryDate;
    const s = String(deliveryDate || "").trim();
    const m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (!m) return deliveryDate;
    const [, month, day, year] = m;
    return `${day} ${month} ${year}`;
  })();
  const dueLabel = isQuote ? "Valid until" : "Due date";
  const numberLabel = isQuote ? "Quote no" : "Invoice no";
  const displayNumber = isQuote
    ? invoice.quote_number ?? invoice.number ?? "—"
    : invoice.invoice_number ?? invoice.number ?? "—";

  const logoSrc =
    user?.logo_url ||
    user?.company_logo_url ||
    invoice?.owner_logo_url ||
    invoice?.company?.logo_url ||
    null;
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
  const itemPages = chunkRows(items, ROWS_PER_PAGE, PAGE_HEIGHT_BUDGET);

  const pyBand = cfg.sparse ? "py-4 px-5" : "py-5 px-5";

  return (
    <div
      className={`invoice invoice-root unified-invoice-template max-w-[720px] mx-auto bg-white text-gray-900 text-[12px] leading-[1.4] box-border ${cfg.font || ""}`}
    >
      <main aria-label="Invoice details">
        {itemPages.map((pageRows, index) => {
          const isFirst = index === 0;
          const isLast = index === itemPages.length - 1;
          return (
            <section className="page" key={`page-${index}`}>
              {isFirst ? (
                <>
                  <header
                    className={`no-break mb-6 ${cfg.headerAccent || ""}`}
                    aria-label={`${resolvedTitle} ${numberLabel}: ${displayNumber}`}
                  >
                    <div className={`flex flex-row justify-between items-start ${isQuote ? "gap-2" : "gap-3"}`}>
                      <div className="flex min-w-0 items-start">
                        {logoSrc ? (
                          <img
                            src={logoSrc}
                            alt=""
                            className="h-auto w-auto object-contain object-left shrink-0 max-h-[64px] max-w-[180px]"
                            style={{ maxHeight: 64, maxWidth: 180 }}
                          />
                        ) : (
                          <div className={`h-16 w-16 shrink-0 rounded-sm ${cfg.logoFallback}`} aria-hidden />
                        )}
                      </div>
                      <div className="invoice-doc-title-block text-right shrink-0">
                        <h2 className={`text-[20px] uppercase tracking-tight ${cfg.title} ${cfg.heavy ? "font-black" : "font-semibold"}`}>
                          {resolvedTitle}
                        </h2>
                        <p className={`text-foreground text-[13px] mt-1 uppercase tracking-wide ${cfg.heavy ? "font-black" : "font-semibold"}`}>
                          {numberLabel}: {displayNumber}
                        </p>
                      </div>
                    </div>
                  </header>

                  <section className={`section no-break invoice-section ${cfg.band} ${pyBand}`}>
                    <div className="grid grid-cols-2 gap-4">
                      <InvoiceToBlock client={client} heavy={cfg.heavy} />
                      <ShipToBlock
                        client={client}
                        heavy={cfg.heavy}
                        itemsRequireShipping={itemsRequireShipping}
                        issueDate={issueDate}
                        deliveryDate={deliveryDateLabel}
                        dueLabel={dueLabel}
                      />
                    </div>
                  </section>

                  {itemsRequireShipping ? (
                    <div className="no-break invoice-section mb-4">
                      <InvoiceDatesColumn
                        issueDate={issueDate}
                        deliveryDate={deliveryDateLabel}
                        dueLabel={dueLabel}
                        heavy={cfg.heavy}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              <section className="section">
                <table className={`items invoice-table unified-invoice-line-table w-full text-[12px] leading-[1.35] border-collapse table-fixed border-t border-b ${cfg.rule}`}>
                  <colgroup>
                    <col className="min-w-0" style={{ width: "50%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "19.5%" }} />
                    <col style={{ width: "19.5%" }} />
                  </colgroup>
                  <thead className="no-break">
                    <tr className={`border-b ${cfg.rule}`}>
                      <th className={`py-[6px] px-0 text-left text-[12px] uppercase tracking-wide ${cfg.heavy ? "font-black" : "font-semibold"}`}>Description</th>
                      <th className={`py-[6px] px-0 text-center text-[12px] uppercase tracking-wide whitespace-nowrap ${cfg.heavy ? "font-black" : "font-semibold"}`}>Quantity</th>
                      <th className={`py-[6px] px-0 text-right text-[12px] uppercase tracking-wide whitespace-nowrap ${cfg.heavy ? "font-black" : "font-semibold"}`}>Price</th>
                      <th className={`py-[6px] px-0 text-right text-[12px] uppercase tracking-wide whitespace-nowrap ${cfg.heavy ? "font-black" : "font-semibold"}`}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length > 0 ? pageRows.map((item, rowIndex) => {
                      const lineLabel = formatLineItemNameAndDescription(item);
                      return (
                        <tr key={`${index}-${rowIndex}`} className={`border-b border-black/10 ${cfg.rule}`}>
                          <td className="py-[6px] px-0 align-top min-w-0">
                            <p
                              className={`unified-invoice-line-description text-[12px] text-foreground leading-snug ${cfg.heavy ? "font-bold" : "font-semibold"}`}
                            >
                              {lineLabel}
                            </p>
                          </td>
                          <td className="py-[6px] px-0 align-top text-center tabular-nums text-[12px] text-foreground">{item.quantity}</td>
                          <td className="py-[6px] px-0 align-top text-right tabular-nums currency-value text-[12px] whitespace-nowrap">{formatCurrency(item.unit_price, userCurrency)}</td>
                          <td className="py-[6px] px-0 align-top text-right font-medium tabular-nums currency-value text-[12px] whitespace-nowrap">{formatCurrency(item.total_price || 0, userCurrency)}</td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={4} className="py-[6px] px-0 text-center text-neutral-500 text-[12px]">No items found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>

              {isLast ? (
                <>
                  <section
                    className={`section no-break invoice-section unified-invoice-totals grid grid-cols-2 ${isQuote ? "gap-6" : "gap-8"} gap-y-6 border-t border-black/10 pt-6 mb-4 min-w-0 items-start text-[12px]`}
                  >
                    <div className="min-w-0 no-break">
                      <h3 className={`text-[12px] uppercase tracking-wide mb-2 ${cfg.heavy ? "font-black" : "font-semibold"}`}>
                        Payment details
                      </h3>
                      <div className="space-y-3 text-neutral-700">
                        {hasAccountDetailsSection ? (
                          accountBankRows.length > 0 ? (
                            <dl className="unified-invoice-banking-details space-y-1">
                              {accountBankRows.map((row) => (
                                <div key={row.key}>
                                  <dt className="text-[7px] text-neutral-500 font-medium leading-snug">{row.label}</dt>
                                  <dd
                                    className={`font-medium text-foreground text-[8px] leading-[1.45] break-words ${row.multiline ? "whitespace-pre-line" : ""}`}
                                  >
                                    {row.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="text-neutral-500 text-[8px] leading-[1.45]">
                              Add default bank details in Settings, or choose a bank account on the invoice.
                            </p>
                          )
                        ) : (
                          <p className="text-neutral-500 text-[8px] leading-[1.45]">—</p>
                        )}
                        <div>
                          <p className="text-[11px] text-neutral-500 mb-2 font-medium">Payment structure</p>
                          <ul className="space-y-1 text-[12px] leading-[1.4]">
                            {[
                              { pct: "25%", value: paymentStructureTotal * 0.25 },
                              { pct: "50%", value: paymentStructureTotal * 0.5 },
                              { pct: "100%", value: paymentStructureTotal },
                            ].map(({ pct, value }) => (
                              <li key={pct} className="flex flex-nowrap items-baseline justify-start gap-2 tabular-nums">
                                <span className="text-neutral-600 shrink-0">{pct}</span>
                                <span className="font-medium text-foreground currency-value">{formatCurrency(value, userCurrency)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 w-full justify-self-end">
                      <div className="ml-auto w-full max-w-xs space-y-1 text-[12px]">
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-600">Subtotal</span>
                          <span className="font-medium tabular-nums currency-value">{formatCurrency(invoice.subtotal, userCurrency)}</span>
                        </div>
                        {discountAmt > 0 && (
                          <div className="flex justify-between gap-4">
                            <span className="text-neutral-600">
                              Discount{invoice.discount_type === "percentage" ? ` (${invoice.discount_value}%)` : ""}
                            </span>
                            <span className="font-medium tabular-nums currency-value text-red-600">-{formatCurrency(discountAmt, userCurrency)}</span>
                          </div>
                        )}
                        {hasItemTax && (
                          <div className="flex justify-between gap-4">
                            <span className="text-neutral-600">Item taxes</span>
                            <span className="font-medium tabular-nums currency-value">{formatCurrency(invoice.item_taxes || 0, userCurrency)}</span>
                          </div>
                        )}
                        {Number(invoice.tax_rate) > 0 && (
                          <div className="flex justify-between gap-4">
                            <span className="text-neutral-600">Tax ({invoice.tax_rate}%)</span>
                            <span className="font-medium tabular-nums currency-value">{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                          </div>
                        )}
                        <div className={`flex justify-between gap-4 mt-2 pt-2 border-t border-black/10 ${cfg.heavy ? "font-black" : "font-semibold"}`}>
                          <span>{isQuote ? "Total" : "Total due"}</span>
                          <span className="tabular-nums currency-value">{formatCurrency(invoice.total_amount, userCurrency)}</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="section invoice-flow-section border-t border-black/10 pt-3 text-[12px]">
                    <h3 className={`text-[12px] uppercase tracking-wide mb-2.5 text-neutral-500 ${cfg.heavy ? "font-black" : "font-bold"}`}>Notes</h3>
                    <p className="text-neutral-600 text-[11px] leading-relaxed mb-3">{NOTES_PAYMENT_MILESTONES_COPY}</p>
                    {invoice.notes ? (
                      <p className="text-neutral-700 text-[11px] leading-relaxed whitespace-pre-line border-t border-black/10 pt-3 mt-3 break-words">
                        {invoice.notes}
                      </p>
                    ) : null}
                  </section>

                  {invoice.terms_conditions ? (
                    <section className="section invoice-flow-section border-t border-black/10 pt-2 min-w-0">
                      <div className="invoice-terms-stack min-w-0">
                        <p
                          className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 ${cfg.heavy ? "font-black" : ""}`}
                        >
                          Terms
                        </p>
                        <p className="invoice-terms-body" title={String(invoice.terms_conditions).trim()}>
                          {termsForDisplay(invoice.terms_conditions)}
                        </p>
                      </div>
                    </section>
                  ) : null}

                  <footer className="footer no-break invoice-section border-t border-black/20 pt-5 text-[11px] leading-snug text-neutral-600">
                    <div className="flex justify-between items-end gap-3">
                      <div className="min-w-0">
                        {user?.company_address ? <p className="whitespace-pre-line">{user.company_address}</p> : null}
                        {user?.website ? <p className="mt-1 text-neutral-500">{user.website}</p> : null}
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        {user?.phone ? <p>Tel: {user.phone}</p> : null}
                        <p>Thank you for your business.</p>
                        <p>Invoicing made easy with Paidly</p>
                      </div>
                    </div>
                  </footer>
                </>
              ) : null}

              <div className="mt-4 pt-2 text-[10px] text-gray-400 text-right">
                Page {index + 1} of {itemPages.length}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
