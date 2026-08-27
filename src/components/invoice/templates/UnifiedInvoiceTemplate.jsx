import { formatCurrency } from "@/utils/currencyCalculations";
import {
  formatLineItemNameAndDescription,
  invoiceItemsRequireShipping,
} from "@/utils/invoiceTemplateData";
import LogoImage from "@/components/shared/LogoImage";
import { paginateInvoice } from "./invoicePageLayout";
import { resolveIssuerLogoPath, resolveIssuerName } from "@/lib/documentIssuerBrand";

/**
 * Typography scale (print + PDF): title 20–24px, section headers 11–12px, body 12–13px,
 * table 12px, notes/terms 11px. Terms use block wrap (no line-clamp) for PDF fidelity.
 * Line items paginate via chunkRows for A4 flow.
 *
 * Each `variant` renders a genuinely distinct layout (header treatment, table style,
 * accent colour) so the rendered invoice matches its Settings picker thumbnail.
 */

/** Normalize whitespace so terms wrap predictably inside the block (PDF-safe; no line-clamp). */
function termsForDisplay(raw) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Shown under Notes to clarify deposit/milestone behaviour. */
const NOTES_PAYMENT_MILESTONES_COPY =
  "Payment milestones may apply (for example 50% when work is started, if required). " +
  "Specific amounts, timing, and any other conditions are as agreed in writing.";

/** Ensures background colours render in printed/PDF output. */
const PRINT_EXACT = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" };

/**
 * Per-variant design language. `headerKind` and `bandStyle` drive real structural
 * differences; `accent` colours section labels, totals and rules.
 */
const VARIANT_CONFIG = {
  classic: {
    headerKind: "rule",
    headerColor: "#1e293b",
    accent: "#3b82f6",
    sectionBg: "#f1f5f9",
    titleColor: "#1e293b",
    bandStyle: "filled",
    tableHead: "filled",
    tableHeadFill: "#1e293b",
    tableHeadText: "#ffffff",
    zebra: "#f1f5f9",
    rule: "border-slate-300",
  },
  modern: {
    headerKind: "band",
    headerColor: "#7c3aed",
    headerGradient: "linear-gradient(135deg,#7c3aed 0%,#a855f7 100%)",
    accent: "#7c3aed",
    sectionBg: "#faf5ff",
    titleColor: "#ffffff",
    bandStyle: "filled",
    tableHead: "filled",
    tableHeadFill: "#7c3aed",
    tableHeadText: "#ffffff",
    zebra: "#faf5ff",
    rule: "border-purple-200",
  },
  minimal: {
    headerKind: "minimal",
    headerColor: "#18181b",
    accent: "#71717a",
    sectionBg: "#ffffff",
    titleColor: "#18181b",
    bandStyle: "none",
    tableHead: "plain",
    zebra: null,
    rule: "border-neutral-200",
    sparse: true,
  },
  bold: {
    headerKind: "band",
    headerColor: "#0f766e",
    accent: "#0f766e",
    sectionBg: "#f0fdfa",
    titleColor: "#ffffff",
    bandStyle: "filled",
    tableHead: "filled",
    tableHeadFill: "#0f766e",
    tableHeadText: "#ffffff",
    zebra: "#f0fdfa",
    rule: "border-teal-700",
    heavy: true,
  },
  paidlypro: {
    headerKind: "card",
    headerColor: "#ea580c",
    accent: "#ea580c",
    sectionBg: "#f8fafc",
    titleColor: "#0f172a",
    bandStyle: "card",
    tableHead: "filled",
    tableHeadFill: "#0f172a",
    tableHeadText: "#ffffff",
    zebra: "#f8fafc",
    rule: "border-orange-200",
    font: "font-geist antialiased",
    cards: true,
  },
};

function InvoiceDatesColumn({ issueDate, deliveryDate, dueLabel, heavy, accent }) {
  const labelCls = `text-[10px] uppercase tracking-[0.1em] mb-1 ${heavy ? "font-black" : "font-semibold"}`;
  const valueCls = `text-[12px] text-gray-800 ${heavy ? "font-bold" : "font-semibold"}`;
  const dueHeading = dueLabel === "Valid until" ? "Valid Until:" : "Due date";
  return (
    <div className="space-y-1.5 leading-[1.35] text-right">
      <div>
        <p className={labelCls} style={{ color: accent }}>Date of issue</p>
        <p className={valueCls}>{issueDate}</p>
      </div>
      <div>
        <p className={labelCls} style={{ color: accent }}>{dueHeading}</p>
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

function SectionLabel({ children, heavy, accent, className = "" }) {
  return (
    <h3
      className={`text-[10px] uppercase tracking-[0.1em] mb-2 ${heavy ? "font-black" : "font-semibold"} ${className}`}
      style={{ color: accent }}
    >
      {children}
    </h3>
  );
}

/** Product / material lines → ship-to. Otherwise → date of issue & due date (no physical shipment). */
function ShipToBlock({ client, heavy, accent, itemsRequireShipping, issueDate, deliveryDate, dueLabel }) {
  const lines = clientLines(client);

  if (itemsRequireShipping) {
    return (
      <div>
        <SectionLabel heavy={heavy} accent={accent}>Ship to</SectionLabel>
        {lines.length === 0 ? (
          <p className="text-neutral-500 text-[12px] leading-[1.4]">Same as invoice address</p>
        ) : (
          <div className="space-y-0.5 text-[12px] leading-[1.4]">
            {lines.map(({ key, text, bold }) => (
              <p key={key} className={`${bold ? "font-bold" : "text-neutral-700"} ${heavy && bold ? "font-black" : ""}`}>
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
      accent={accent}
    />
  );
}

function InvoiceToBlock({ client, heavy, accent }) {
  const lines = clientLines(client);
  return (
    <div>
      <SectionLabel heavy={heavy} accent={accent}>Invoice to</SectionLabel>
      <div className="space-y-0.5 text-[12px] leading-[1.4]">
        {lines.length === 0 ? (
          <p className="text-neutral-500">—</p>
        ) : (
          lines.map(({ key, text, bold }) => (
            <p key={key} className={`${bold ? "font-bold" : "text-neutral-700"} ${heavy && bold ? "font-black" : ""}`}>
              {text}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

/** Variant-specific document header (logo + title + number). */
function InvoiceHeader({ cfg, logoPath, resolvedTitle, numberLabel, displayNumber }) {
  const fallbackBox = (onBand) => (
    <div
      className="h-12 w-12 shrink-0 rounded"
      style={onBand ? { background: "rgba(255,255,255,0.25)" } : { background: cfg.headerColor, ...PRINT_EXACT }}
      aria-hidden
    />
  );
  const logoEl = (maxH = 56, maxW = 170) =>
    logoPath ? (
      <LogoImage
        src={logoPath}
        alt=""
        className="h-auto w-auto object-contain object-left shrink-0"
        style={{ maxHeight: maxH, maxWidth: maxW }}
      />
    ) : null;

  // Modern / Bold — full-width colour band with the title reversed out in white.
  if (cfg.headerKind === "band") {
    return (
      <header className="no-break mb-6" aria-label={`${resolvedTitle} ${numberLabel}: ${displayNumber}`}>
        <div
          className="flex flex-row items-center justify-between gap-3 rounded-lg px-6 py-5"
          style={{ background: cfg.headerGradient || cfg.headerColor, ...PRINT_EXACT }}
        >
          <div className="flex min-w-0 items-center">
            {logoPath ? (
              <div className="rounded-md bg-white px-2.5 py-1.5" style={PRINT_EXACT}>
                {logoEl(44, 150)}
              </div>
            ) : (
              fallbackBox(true)
            )}
          </div>
          <div className="text-right shrink-0">
            <h2 className="text-[24px] font-black uppercase tracking-tight text-white">{resolvedTitle}</h2>
            <p className="mt-0.5 text-[12px] uppercase tracking-[0.12em] font-semibold text-white/85">
              {numberLabel}: {displayNumber}
            </p>
          </div>
        </div>
      </header>
    );
  }

  // Minimal — hairline rule, restrained weights, generous whitespace.
  if (cfg.headerKind === "minimal") {
    const niceTitle = resolvedTitle === "QUOTE" ? "Quote" : "Invoice";
    return (
      <header className="no-break mb-8" aria-label={`${resolvedTitle} ${numberLabel}: ${displayNumber}`}>
        <div className="flex flex-row items-baseline justify-between gap-3 border-b border-neutral-200 pb-4">
          <div className="flex min-w-0 items-center">{logoPath ? logoEl(40, 150) : fallbackBox(false)}</div>
          <div className="text-right shrink-0">
            <h2 className="text-[21px] font-medium tracking-tight text-neutral-900">{niceTitle}</h2>
            <p className="mt-0.5 text-[11px] tracking-[0.08em] text-neutral-400">
              {numberLabel}: {displayNumber}
            </p>
          </div>
        </div>
      </header>
    );
  }

  // Paidly Pro — refined card style with a slim accent bar.
  if (cfg.headerKind === "card") {
    return (
      <header className="no-break mb-6" aria-label={`${resolvedTitle} ${numberLabel}: ${displayNumber}`}>
        <div className="mb-5 h-1.5 w-full rounded-full" style={{ background: cfg.headerColor, ...PRINT_EXACT }} />
        <div className="flex flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 items-center">{logoPath ? logoEl(56, 170) : fallbackBox(false)}</div>
          <div className="text-right shrink-0">
            <h2 className="text-[24px] font-semibold tracking-tight" style={{ color: cfg.titleColor }}>
              {resolvedTitle}
            </h2>
            <p className="mt-1 text-[12px] uppercase tracking-[0.12em] font-semibold" style={{ color: cfg.accent }}>
              {numberLabel}: {displayNumber}
            </p>
          </div>
        </div>
      </header>
    );
  }

  // Classic (default) — logo + title with a solid accent rule beneath.
  return (
    <header className="no-break mb-6" aria-label={`${resolvedTitle} ${numberLabel}: ${displayNumber}`}>
      <div className="flex flex-row items-start justify-between gap-3 pb-4">
        <div className="flex min-w-0 items-center">{logoPath ? logoEl(56, 170) : fallbackBox(false)}</div>
        <div className="text-right shrink-0">
          <h2 className="text-[24px] font-semibold uppercase tracking-tight" style={{ color: cfg.titleColor }}>
            {resolvedTitle}
          </h2>
          <p className="mt-1 text-[12px] uppercase tracking-[0.12em] font-semibold" style={{ color: cfg.accent }}>
            {numberLabel}: {displayNumber}
          </p>
        </div>
      </div>
      <div className="h-[2.5px] w-full rounded-full" style={{ background: cfg.headerColor, ...PRINT_EXACT }} />
    </header>
  );
}

/** Compact running header for continuation pages (page 2+) so every page is identifiable. */
function ContinuationHeader({ cfg, logoPath, resolvedTitle, numberLabel, displayNumber }) {
  // Band variants reverse the title to white; on a white continuation header use the band colour instead.
  const titleColor = cfg.titleColor === "#ffffff" ? cfg.headerColor : cfg.titleColor;
  return (
    <header
      className="no-break mb-5"
      aria-label={`${resolvedTitle} ${numberLabel}: ${displayNumber} (continued)`}
    >
      <div
        className="flex flex-row items-center justify-between gap-3 pb-3"
        style={{ borderBottom: `1.5px solid ${cfg.headerColor}`, ...PRINT_EXACT }}
      >
        <div className="flex items-center">
          {logoPath ? (
            <LogoImage
              src={logoPath}
              alt=""
              className="h-auto w-auto object-contain object-left shrink-0"
              style={{ maxHeight: 32, maxWidth: 120 }}
            />
          ) : (
            <div
              className="h-8 w-8 shrink-0 rounded"
              style={{ background: cfg.headerColor, ...PRINT_EXACT }}
              aria-hidden
            />
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[13px] font-semibold uppercase tracking-tight" style={{ color: titleColor }}>
            {resolvedTitle} · {displayNumber}
          </p>
          <p className="text-[9.5px] uppercase tracking-[0.14em]" style={{ color: cfg.accent }}>
            Continued
          </p>
        </div>
      </div>
    </header>
  );
}

/** Slim footer for non-final pages — company name + page position. */
function RunningFooter({ user, cfg, pageLabel }) {
  return (
    <footer
      className="footer no-break pt-3 text-[10px] leading-snug text-neutral-500"
      style={{ borderTop: `1.5px solid ${cfg.headerColor}`, ...PRINT_EXACT }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-semibold" style={{ color: cfg.accent }}>
          {user?.company_name || ""}
        </span>
        {pageLabel ? <span className="shrink-0 text-neutral-400">{pageLabel}</span> : null}
      </div>
    </footer>
  );
}

/** Full footer for the final page — company contact details + page position. */
function DetailedFooter({ user, cfg, pageLabel }) {
  return (
    <footer
      className="footer no-break invoice-section pt-4 text-[10.5px] leading-snug text-neutral-500"
      style={{ borderTop: `2px solid ${cfg.headerColor}`, ...PRINT_EXACT }}
    >
      <div className="flex justify-between items-end gap-3">
        <div className="min-w-0 space-y-0.5">
          {user?.company_name ? (
            <p className="font-semibold" style={{ color: cfg.accent }}>{user.company_name}</p>
          ) : null}
          {user?.company_address ? <p className="whitespace-pre-line">{user.company_address}</p> : null}
          {user?.website ? <p className="mt-0.5">{user.website}</p> : null}
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          {user?.phone ? <p>{user.phone}</p> : null}
          {user?.email ? <p>{user.email}</p> : null}
          <p className="mt-1 text-neutral-400 text-[10px]">Thank you for your business.</p>
          {pageLabel ? <p className="text-neutral-400 text-[10px]">{pageLabel}</p> : null}
        </div>
      </div>
    </footer>
  );
}

/**
 * Shared invoice / quote engine. The `variant` prop selects a distinct design
 * (header, table style, accent) while pagination and data shaping stay common.
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
  const issuerName = resolveIssuerName({
    document: invoice,
    company: invoice?.company,
    profile: user,
  });
  const brandedUser = user
    ? { ...user, company_name: issuerName || user.company_name }
    : { company_name: issuerName || "Company" };
  const accent = cfg.accent;
  const heavy = Boolean(cfg.heavy);
  const issueDate = safeFormatDate(invoice.created_date);
  const resolvedTitle = documentTitle || (invoice.type === "QUOTE" ? "QUOTE" : "INVOICE");
  const isQuote = resolvedTitle === "QUOTE";
  const deliveryDate = safeFormatDate(
    isQuote ? invoice.valid_until ?? invoice.delivery_date : invoice.delivery_date
  );
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

  const logoPath = resolveIssuerLogoPath({
    document: invoice,
    company: invoice?.company,
    profile: user,
  });
  const businessContactRows = accountInfoRowsFromUser(brandedUser);
  const accountBankRows = accountDetailsBankRows(bankingDetail, user);
  const hasAccountDetailsSection = accountBankRows.length > 0 || businessContactRows.length > 0;

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const itemsRequireShipping = invoiceItemsRequireShipping(items);
  const hasItemTax = items.some((item) => Number(item.item_tax_rate) > 0);
  const discountAmt = Number(invoice.discount_amount || 0);
  const paymentStructureTotal = Number(invoice.total_amount ?? 0);
  // Height-aware pagination — each entry is one printable A4 page (rows that
  // fit, plus whether the line-item table renders on it). The totals block is
  // pinned to the final page and never splits. See invoicePageLayout.js.
  const itemPages = paginateInvoice(items, { getLabel: formatLineItemNameAndDescription });

  // Invoice-to / ship-to block styling per variant.
  const bandClass =
    cfg.bandStyle === "card"
      ? `rounded-lg border ${cfg.rule}`
      : cfg.bandStyle === "none"
        ? ""
        : "rounded-lg";
  const bandStyle =
    cfg.bandStyle === "filled" ? { background: cfg.sectionBg, ...PRINT_EXACT } : undefined;
  const bandPad = cfg.bandStyle === "none" ? "py-3" : cfg.sparse ? "p-4" : "p-5";

  const tableFilled = cfg.tableHead === "filled";
  /**
   * Cell padding is applied inline because the scoped rule
   * `.unified-invoice-line-table th,td { padding: 6px 0 }` outranks Tailwind
   * utilities (no `important` in the Tailwind config). Inline styles win.
   */
  const cellPadX = tableFilled ? 12 : 0;

  return (
    <div
      className={`invoice invoice-root unified-invoice-template mx-auto bg-white text-gray-900 text-[12px] leading-[1.4] box-border ${cfg.font || ""}`}
    >
      <main aria-label="Invoice details">
        {itemPages.map((page, index) => {
          const pageRows = page.rows;
          const { hasTable } = page;
          const isFirst = index === 0;
          const isLast = index === itemPages.length - 1;
          const pageLabel =
            itemPages.length > 1 ? `Page ${index + 1} of ${itemPages.length}` : "";
          return (
            <section
              className="page"
              key={`page-${index}`}
              style={{ display: "flex", flexDirection: "column" }}
            >
              {/* Header — full layout on page 1, compact running header on continuation pages. */}
              {isFirst ? (
                <InvoiceHeader
                  cfg={cfg}
                  logoPath={logoPath}
                  resolvedTitle={resolvedTitle}
                  numberLabel={numberLabel}
                  displayNumber={displayNumber}
                />
              ) : (
                <ContinuationHeader
                  cfg={cfg}
                  logoPath={logoPath}
                  resolvedTitle={resolvedTitle}
                  numberLabel={numberLabel}
                  displayNumber={displayNumber}
                />
              )}

              {isFirst ? (
                <>
                  <section
                    className={`section no-break invoice-section ${bandClass} ${bandPad} mb-4`}
                    style={bandStyle}
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <InvoiceToBlock client={client} heavy={heavy} accent={accent} />
                      <ShipToBlock
                        client={client}
                        heavy={heavy}
                        accent={accent}
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
                        heavy={heavy}
                        accent={accent}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              {/* Line-item table — its column header repeats on every table
                  page. Suppressed on a trailing totals-only page (hasTable). */}
              {hasTable ? (
              <section className="section">
                <table
                  className={`items invoice-table unified-invoice-line-table w-full text-[12px] leading-[1.35] border-collapse table-fixed ${tableFilled ? "" : `border-t border-b ${cfg.rule}`}`}
                >
                  <colgroup>
                    <col className="min-w-0" style={{ width: "50%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "19.5%" }} />
                    <col style={{ width: "19.5%" }} />
                  </colgroup>
                  <thead className="no-break">
                    <tr
                      style={tableFilled ? { background: cfg.tableHeadFill, ...PRINT_EXACT } : undefined}
                      className={tableFilled ? "" : `border-b ${cfg.rule}`}
                    >
                      {["Description", "Qty", "Price", "Total"].map((label, i) => (
                        <th
                          key={label}
                          className={`text-[11px] uppercase tracking-[0.08em] ${heavy ? "font-black" : "font-semibold"} ${
                            i === 0 ? "text-left" : i === 1 ? "text-center" : "text-right"
                          } ${i > 0 ? "whitespace-nowrap" : ""}`}
                          style={{
                            paddingLeft: cellPadX,
                            paddingRight: cellPadX,
                            paddingTop: 10,
                            paddingBottom: 10,
                            color: tableFilled ? cfg.tableHeadText : "#737373",
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length > 0 ? (
                      pageRows.map((item, rowIndex) => {
                        const lineLabel = formatLineItemNameAndDescription(item);
                        const zebra = cfg.zebra && rowIndex % 2 === 1;
                        const tdStyle = {
                          paddingLeft: cellPadX,
                          paddingRight: cellPadX,
                          paddingTop: 8,
                          paddingBottom: 8,
                        };
                        return (
                          <tr
                            key={`${index}-${rowIndex}`}
                            className="border-b border-black/[0.07]"
                            style={zebra ? { background: cfg.zebra, ...PRINT_EXACT } : undefined}
                          >
                            <td className="align-top min-w-0" style={tdStyle}>
                              <p
                                className={`unified-invoice-line-description text-[12px] text-gray-900 leading-snug ${heavy ? "font-bold" : "font-medium"}`}
                              >
                                {lineLabel}
                              </p>
                            </td>
                            <td
                              className="align-top text-center tabular-nums text-[12px] text-gray-700"
                              style={tdStyle}
                            >
                              {item.quantity}
                            </td>
                            <td
                              className="align-top text-right tabular-nums currency-value text-[12px] text-gray-700 whitespace-nowrap"
                              style={tdStyle}
                            >
                              {formatCurrency(item.unit_price, userCurrency)}
                            </td>
                            <td
                              className="align-top text-right tabular-nums currency-value text-[12px] text-gray-900 font-semibold whitespace-nowrap"
                              style={tdStyle}
                            >
                              {formatCurrency(item.total_price || 0, userCurrency)}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={4}
                          className="text-center text-neutral-400 text-[12px]"
                          style={{ paddingTop: 12, paddingBottom: 12 }}
                        >
                          No items found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
              ) : null}

              {/* Totals + notes + terms — rendered once, on the final page,
                  as one no-break group so they never split across pages. */}
              {isLast ? (
                <>
                  <section
                    className={`section no-break invoice-section unified-invoice-totals grid grid-cols-2 ${isQuote ? "gap-6" : "gap-8"} gap-y-6 pt-6 mb-4 min-w-0 items-start text-[12px]`}
                  >
                    <div className="min-w-0 no-break">
                      <SectionLabel heavy={heavy} accent={accent} className="mb-2.5">
                        Payment details
                      </SectionLabel>
                      <div className="space-y-3 text-neutral-700">
                        {hasAccountDetailsSection ? (
                          accountBankRows.length > 0 ? (
                            <dl className="unified-invoice-banking-details space-y-1.5">
                              {accountBankRows.map((row) => (
                                <div key={row.key}>
                                  <dt className="text-[10px] text-neutral-400 font-medium leading-snug">{row.label}</dt>
                                  <dd
                                    className={`font-semibold text-gray-800 text-[11px] leading-[1.45] break-words ${row.multiline ? "whitespace-pre-line" : ""}`}
                                  >
                                    {row.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="text-neutral-400 text-[10px] leading-[1.45]">
                              Add default bank details in Settings, or choose a bank account on the invoice.
                            </p>
                          )
                        ) : (
                          <p className="text-neutral-400 text-[10px] leading-[1.45]">—</p>
                        )}
                        <div>
                          <p className="text-[10px] text-neutral-400 mb-1.5 font-medium uppercase tracking-[0.06em]">
                            Payment structure
                          </p>
                          <ul className="space-y-1 text-[11px] leading-[1.4]">
                            {[
                              { pct: "25%", value: paymentStructureTotal * 0.25 },
                              { pct: "50%", value: paymentStructureTotal * 0.5 },
                              { pct: "100%", value: paymentStructureTotal },
                            ].map(({ pct, value }) => (
                              <li key={pct} className="flex flex-nowrap items-baseline justify-start gap-2 tabular-nums">
                                <span className="text-neutral-500 shrink-0 w-8">{pct}</span>
                                <span className="font-semibold text-gray-800 currency-value">
                                  {formatCurrency(value, userCurrency)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 w-full justify-self-end">
                      <div className="ml-auto w-full max-w-xs space-y-1.5 text-[12px]">
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-500">Subtotal</span>
                          <span className="font-medium tabular-nums currency-value text-gray-800">
                            {formatCurrency(invoice.subtotal, userCurrency)}
                          </span>
                        </div>
                        {discountAmt > 0 && (
                          <div className="flex justify-between gap-4">
                            <span className="text-neutral-500">
                              Discount{invoice.discount_type === "percentage" ? ` (${invoice.discount_value}%)` : ""}
                            </span>
                            <span className="font-medium tabular-nums currency-value text-red-500">
                              −{formatCurrency(discountAmt, userCurrency)}
                            </span>
                          </div>
                        )}
                        {hasItemTax && (
                          <div className="flex justify-between gap-4">
                            <span className="text-neutral-500">Item taxes</span>
                            <span className="font-medium tabular-nums currency-value text-gray-800">
                              {formatCurrency(invoice.item_taxes || 0, userCurrency)}
                            </span>
                          </div>
                        )}
                        {Number(invoice.tax_rate) > 0 && (
                          <div className="flex justify-between gap-4">
                            <span className="text-neutral-500">Tax ({invoice.tax_rate}%)</span>
                            <span className="font-medium tabular-nums currency-value text-gray-800">
                              {formatCurrency(invoice.tax_amount, userCurrency)}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex justify-between gap-4 mt-3 px-3 py-2.5 rounded-md ${heavy ? "font-black" : "font-bold"} text-[13px]`}
                          style={{ background: cfg.sectionBg, color: cfg.accent, ...PRINT_EXACT }}
                        >
                          <span>{isQuote ? "Total" : "Total due"}</span>
                          <span className="tabular-nums currency-value">
                            {formatCurrency(invoice.total_amount, userCurrency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="section invoice-flow-section border-t border-black/10 pt-3 text-[12px]">
                    <SectionLabel heavy={heavy} accent={accent}>Notes</SectionLabel>
                    <p className="text-neutral-500 text-[10.5px] leading-relaxed mb-3">{NOTES_PAYMENT_MILESTONES_COPY}</p>
                    {invoice.notes ? (
                      <p className="text-neutral-700 text-[11px] leading-relaxed whitespace-pre-line border-t border-black/[0.07] pt-3 mt-3 break-words">
                        {invoice.notes}
                      </p>
                    ) : null}
                  </section>

                  {invoice.terms_conditions ? (
                    <section className="section invoice-flow-section border-t border-black/10 pt-2.5 min-w-0">
                      <div className="invoice-terms-stack min-w-0">
                        <SectionLabel heavy={heavy} accent={accent} className="mb-1.5">
                          Terms &amp; Conditions
                        </SectionLabel>
                        <p className="invoice-terms-body" title={String(invoice.terms_conditions).trim()}>
                          {termsForDisplay(invoice.terms_conditions)}
                        </p>
                      </div>
                    </section>
                  ) : null}

                </>
              ) : null}

              {/* Footer — present on every page, pinned to the page bottom. */}
              <div className="mt-auto">
                {isLast ? (
                  <DetailedFooter user={brandedUser} cfg={cfg} pageLabel={pageLabel} />
                ) : (
                  <RunningFooter user={brandedUser} cfg={cfg} pageLabel={pageLabel} />
                )}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
