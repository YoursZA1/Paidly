import { forwardRef, useMemo } from "react";
import { format, isValid, parseISO } from "date-fns";
import { formatCurrency } from "@/components/CurrencySelector";
import LogoImage from "@/components/shared/LogoImage";
import { resolveDocumentBrandColors } from "@/utils/documentBrandColors";
import { mergeLiveBrandingForDocuments } from "@/utils/documentPreviewData";
import { useAuth } from "@/contexts/AuthContext";
import { formatLineItemNameAndDescription } from "@/utils/invoiceTemplateData";
import { effectiveBankingDetail } from "@/utils/effectiveBankingDetail";
import { formatDocumentPreviewBankingLines } from "@/utils/formatDocumentPreviewBankingLines";

const SLATE_900 = "#0f172a";

function formatWebsiteDisplay(url) {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return "";
  return s.replace(/^https?:\/\//i, "");
}

function websiteHref(url) {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function safeFormatDate(value) {
  if (!value) return "—";
  try {
    const d =
      typeof value === "string"
        ? parseISO(value.includes("T") ? value : `${value}T12:00:00`)
        : value instanceof Date
          ? value
          : new Date(value);
    return isValid(d) ? format(d, "MMMM dd, yyyy") : "—";
  } catch {
    return "—";
  }
}

function normalizeDocType(doc, docTypeProp) {
  const t = (docTypeProp || doc?.type || "invoice").toString().toLowerCase();
  if (t === "quote" || t === "quotes") return "quote";
  return "invoice";
}

function isDiscountItem(it) {
  const name = String(it?.service_name || it?.name || "").trim();
  const tp = Number(it?.total_price ?? it?.total ?? 0);
  return /^discount$/i.test(name) && tp < 0;
}

/** Rows for the line-items table (no synthetic discount line — discount is in totals). */
function normalizeLineItems(doc) {
  if (Array.isArray(doc?.line_items) && doc.line_items.length > 0) {
    return doc.line_items
      .map((row) => {
        const qty = Number(row.quantity) || 0;
        const unit = Number(row.unit_price) || 0;
        const total =
          row.total != null && row.total !== ""
            ? Number(row.total)
            : Math.round(qty * unit * 100) / 100;
        const desc = formatLineItemNameAndDescription(row);
        return { description: desc, quantity: qty || 1, unit_price: unit, total };
      })
      .filter((row) => row.description || row.unit_price || row.quantity !== 1 || row.total);
  }

  if (Array.isArray(doc?.items) && doc.items.length > 0) {
    return doc.items
      .filter((it) => !isDiscountItem(it))
      .map((it) => {
        const qty = Number(it.quantity ?? it.qty ?? 1) || 1;
        const unit = Number(it.unit_price ?? it.rate ?? it.price ?? 0) || 0;
        const total =
          Number(it.total_price ?? it.total) != null && !Number.isNaN(Number(it.total_price ?? it.total))
            ? Number(it.total_price ?? it.total)
            : Math.round(qty * unit * 100) / 100;
        const desc = formatLineItemNameAndDescription(it) || "Item";
        return { description: desc, quantity: qty, unit_price: unit, total };
      });
  }

  return [];
}

/** Status badge colors (sending/preparing use profile brand accent inside the component). */
const STATUS_STYLES_BASE = {
  paid: { color: "#10b981", border: "#10b981" },
  partial_paid: { color: "#f59e0b", border: "#f59e0b" },
  sent: { color: "#3b82f6", border: "#3b82f6" },
  viewed: { color: "#3b82f6", border: "#3b82f6" },
  accepted: { color: "#10b981", border: "#10b981" },
  pending: { color: "#f59e0b", border: "#f59e0b" },
  overdue: { color: "#ef4444", border: "#ef4444" },
  declined: { color: "#6b7280", border: "#6b7280" },
  rejected: { color: "#6b7280", border: "#6b7280" },
  expired: { color: "#6b7280", border: "#6b7280" },
  draft: { color: "#9ca3af", border: "#9ca3af" },
  cancelled: { color: "#6b7280", border: "#6b7280" },
};

function statusLabel(status) {
  if (!status) return "";
  return String(status).replace(/_/g, " ");
}

/**
 * Styled invoice/quote preview for CreateDocument, ViewDocument, and capture ref (e.g. PDF export).
 * Accepts the same `doc` + `docType` + `clients` + `user` props as before.
 * @param {object|null} [bankingDetail] — Saved banking row; merged with profile defaults via effectiveBankingDetail.
 * @param {boolean} [hideStatus] — Omit status pill (use for PDF download / print capture).
 */
const DocumentPreview = forwardRef(function DocumentPreview(
  { doc, docType: docTypeProp, clients = [], user, bankingDetail = null, hideStatus = false },
  ref
) {
  const { user: authUser } = useAuth();
  const effectiveUser = useMemo(
    () => mergeLiveBrandingForDocuments(user, authUser),
    [user, authUser]
  );

  const { primary: BRAND_PRIMARY, secondary: BRAND_SECONDARY } = useMemo(
    () => resolveDocumentBrandColors(effectiveUser),
    [effectiveUser?.document_brand_primary, effectiveUser?.document_brand_secondary]
  );

  const statusStylesMap = useMemo(
    () => ({
      ...STATUS_STYLES_BASE,
      sending: { color: BRAND_PRIMARY, border: BRAND_PRIMARY },
      preparing: { color: BRAND_PRIMARY, border: BRAND_PRIMARY },
    }),
    [BRAND_PRIMARY]
  );

  const bankingLines = useMemo(() => {
    const merged = effectiveBankingDetail(bankingDetail, effectiveUser);
    return formatDocumentPreviewBankingLines(merged);
  }, [bankingDetail, effectiveUser]);

  const resolved = useMemo(() => {
    if (!doc) return null;
    const docType = normalizeDocType(doc, docTypeProp);
    const currency = doc.currency || effectiveUser?.currency || "ZAR";

    const clientFromList =
      doc.client_id && Array.isArray(clients) ? clients.find((c) => c.id === doc.client_id) : null;
    const client_name = doc.client_name || clientFromList?.name || "Client";
    const client_email = doc.client_email || clientFromList?.email || "";
    const client_address =
      doc.client_address ||
      [clientFromList?.address, clientFromList?.city, clientFromList?.country].filter(Boolean).join("\n") ||
      "";

    const company_name = doc.company_name || effectiveUser?.company_name || "Your Company";
    const company_email = doc.company_email || effectiveUser?.email || "";
    const company_phone = String(doc.company_phone || effectiveUser?.phone || "").trim();
    const company_website = String(
      doc.company_website || effectiveUser?.company_website || effectiveUser?.website || ""
    ).trim();
    const company_address = doc.company_address || effectiveUser?.company_address || "";
    const logo_url =
      doc.owner_logo_url || effectiveUser?.logo_url || effectiveUser?.company_logo_url || null;

    const number = doc.number || doc.invoice_number || doc.quote_number || "—";
    const status = doc.status || "draft";

    const issue_date = doc.issue_date || doc.invoice_date || doc.created_at;
    const due_date =
      doc.due_date || (docType === "quote" ? doc.valid_until : null) || doc.delivery_date || doc.valid_until;

    const lineRows = normalizeLineItems(doc);
    const lineSubtotal = lineRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    const discount = Math.max(0, Number(doc.discount) || 0);
    const tax_rate = Number(doc.tax_rate) || 0;
    const tax_amount = Number(doc.tax_amount ?? 0);
    const total =
      Number(doc.total ?? doc.total_amount) ||
      Math.round((lineSubtotal - discount + tax_amount) * 100) / 100;

    const fmt = (amount) => formatCurrency(amount, currency);

    return {
      docType,
      currency,
      client_name,
      client_email,
      client_address,
      company_name,
      company_email,
      company_phone,
      company_website,
      company_address,
      number,
      status,
      issue_date,
      due_date,
      lineRows,
      lineSubtotal,
      discount,
      tax_rate,
      tax_amount,
      total,
      notes: doc.notes || "",
      terms_conditions: doc.terms_conditions || "",
      fmt,
      logo_url,
    };
  }, [doc, docTypeProp, clients, effectiveUser]);

  if (!doc || !resolved) return null;

  const {
    docType,
    client_name,
    client_email,
    client_address,
    company_name,
    company_email,
    company_phone,
    company_website,
    company_address,
    number,
    status,
    issue_date,
    due_date,
    lineRows,
    lineSubtotal,
    discount,
    tax_rate,
    tax_amount,
    total,
    notes,
    terms_conditions,
    fmt,
    logo_url,
  } = resolved;

  const showStatusPill = !hideStatus && status;
  const st = showStatusPill ? statusStylesMap[status] || { color: "#9ca3af", border: "#9ca3af" } : null;
  const dueLabel = docType === "quote" ? "Valid until" : "Due date";

  return (
    <div
      ref={ref}
      className="document-preview-styled"
      style={{
        fontFamily: "system-ui, Inter, sans-serif",
        backgroundColor: "#fff",
        color: "#111827",
        fontSize: "12px",
        lineHeight: 1.4,
        maxWidth: "720px",
        margin: "0 auto",
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${SLATE_900} 0%, #431407 45%, ${BRAND_PRIMARY} 85%, ${BRAND_SECONDARY} 100%)`,
          height: "6px",
        }}
      />

      <div className="invoice-root" style={{ padding: "40px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "24px",
            flexWrap: "wrap",
            gap: "24px",
          }}
        >
          <div>
            <div style={{ marginBottom: "12px", marginTop: "-3rem" }}>
              {logo_url ? (
                <LogoImage
                  src={logo_url}
                  alt=""
                  className="shrink-0 object-contain object-left"
                  style={{ maxHeight: 64, maxWidth: 180, width: "auto", height: "auto" }}
                />
              ) : (
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "10px",
                    background: `linear-gradient(135deg, ${SLATE_900}, ${BRAND_PRIMARY})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: "20px" }}>
                    {(company_name || "C").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div style={{ marginTop: "4px" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: BRAND_PRIMARY,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "10px",
                }}
              >
                From
              </div>
              <div style={{ fontWeight: 700, fontSize: "12px", color: SLATE_900, marginBottom: "10px" }}>
                {company_name}
              </div>
              {company_phone ? (
                <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.35 }}>
                  <span style={{ fontWeight: 600, color: "#374151" }}>Tel </span>
                  {company_phone}
                </div>
              ) : null}
              {company_email ? (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    lineHeight: 1.35,
                    marginTop: company_phone ? "4px" : 0,
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#374151" }}>Email </span>
                  {company_email}
                </div>
              ) : null}
              {company_website ? (
                <div
                  style={{
                    fontSize: "12px",
                    lineHeight: 1.35,
                    marginTop: company_phone || company_email ? "4px" : 0,
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#374151" }}>Web </span>
                  <a
                    href={websiteHref(company_website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: BRAND_PRIMARY, textDecoration: "none", fontWeight: 500 }}
                  >
                    {formatWebsiteDisplay(company_website)}
                  </a>
                </div>
              ) : null}
              {company_address ? (
                <div style={{ marginTop: company_phone || company_email || company_website ? "12px" : 0 }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: BRAND_PRIMARY,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: "6px",
                    }}
                  >
                    Location
                  </div>
                  <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.35, whiteSpace: "pre-line" }}>
                    {company_address}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ textAlign: "right", minWidth: "200px" }}>
            <div
              style={{
                fontSize: "20px",
                fontWeight: 600,
                letterSpacing: "-1px",
                color: SLATE_900,
                textTransform: "uppercase",
              }}
            >
              {docType === "quote" ? "Quote" : "Invoice"}
            </div>
            <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px", fontWeight: 600 }}>#{number}</div>
            {showStatusPill && st && (
              <div
                style={{
                  display: "inline-block",
                  marginTop: "10px",
                  padding: "3px 12px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: st.color,
                  border: `1.5px solid ${st.border}`,
                }}
              >
                {statusLabel(status)}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            height: "1px",
            background: `linear-gradient(to right, rgba(15,23,42,0.12), rgba(242,78,0,0.22), transparent)`,
            marginBottom: "36px",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "40px",
            marginBottom: "32px",
          }}
        >
          <div className="docpdf-keep-together">
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: BRAND_PRIMARY,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "10px",
              }}
            >
              Bill to
            </div>
            <div style={{ fontWeight: 700, fontSize: "12px", color: SLATE_900, marginBottom: "4px" }}>
              {client_name}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.35, whiteSpace: "pre-line" }}>
              {client_address}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>{client_email}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: BRAND_PRIMARY,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "4px",
                }}
              >
                Issue date
              </div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: SLATE_900 }}>{safeFormatDate(issue_date)}</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: BRAND_PRIMARY,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: "4px",
                }}
              >
                {dueLabel}
              </div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: SLATE_900 }}>{safeFormatDate(due_date)}</div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: "32px" }}>
          {/* Mobile: stacked line-item cards (no horizontal table scroll) */}
          <div className="document-line-items-cards space-y-3 md:hidden">
            {lineRows.length === 0 ? (
              <div
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
              >
                No line items
              </div>
            ) : (
              lineRows.map((item, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}
                >
                  <div
                    className="text-sm font-semibold leading-snug text-slate-900"
                    style={{ maxWidth: "min(100%, 300px)", wordBreak: "break-word" }}
                  >
                    {item.description || "—"}
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                    <div>
                      <span className="font-medium text-slate-500">Qty: </span>
                      {item.quantity}
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Unit price: </span>
                      {fmt(item.unit_price)}
                    </div>
                    <div className="pt-0.5 text-base font-semibold text-slate-900">
                      <span className="text-sm font-medium text-slate-500">Total: </span>
                      {fmt(item.total)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* md+: table layout; always used when printing */}
          <div className="document-line-items-table-wrap hidden overflow-x-auto md:block" style={{ marginBottom: 0 }}>
            <table
              className="document-line-items-table"
              style={{ width: "100%", borderCollapse: "collapse", minWidth: "480px" }}
            >
              <thead>
                <tr style={{ background: SLATE_900 }}>
                  <th
                    style={{
                      padding: "6px 0",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Description
                  </th>
                  <th
                    style={{
                      padding: "6px 0",
                      textAlign: "right",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      width: "72px",
                    }}
                  >
                    Qty
                  </th>
                  <th
                    style={{
                      padding: "6px 0",
                      textAlign: "right",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      width: "100px",
                    }}
                  >
                    Unit price
                  </th>
                  <th
                    style={{
                      padding: "6px 0",
                      textAlign: "right",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: BRAND_SECONDARY,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      width: "108px",
                    }}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "6px 0", fontSize: "12px", color: "#9ca3af", lineHeight: "16px" }}>
                      No line items
                    </td>
                  </tr>
                ) : (
                  lineRows.map((item, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                      <td
                        style={{
                          padding: "6px 0",
                          fontSize: "12px",
                          lineHeight: "16px",
                          color: "#374151",
                          maxWidth: "300px",
                          wordBreak: "break-word",
                        }}
                      >
                        {item.description}
                      </td>
                      <td style={{ padding: "6px 0", fontSize: "12px", lineHeight: "16px", color: "#374151", textAlign: "right" }}>
                        {item.quantity}
                      </td>
                      <td style={{ padding: "6px 0", fontSize: "12px", lineHeight: "16px", color: "#374151", textAlign: "right" }}>
                        {fmt(item.unit_price)}
                      </td>
                      <td style={{ padding: "6px 0", fontSize: "12px", lineHeight: "16px", fontWeight: 600, color: SLATE_900, textAlign: "right" }}>
                        {fmt(item.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="docpdf-keep-together"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "32px",
            alignItems: "start",
            marginBottom: "16px",
            paddingTop: "24px",
            borderTop: "1px solid #f1f5f9",
          }}
        >
          <div className="min-w-0">
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: BRAND_PRIMARY,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "6px",
              }}
            >
              Payment details
            </div>
            {bankingLines ? (
              <div
                role="group"
                aria-label="Bank details for payment"
                style={{
                  fontSize: "8px",
                  color: "#374151",
                  lineHeight: 1.45,
                  whiteSpace: "pre-line",
                  wordBreak: "break-word",
                }}
              >
                {bankingLines}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "8px", color: "#9ca3af", lineHeight: 1.45 }}>
                Add bank details in Settings or on the document.
              </p>
            )}
          </div>
          <div className="min-w-0" style={{ justifySelf: "end", width: "100%", maxWidth: "280px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "12px" }}>
              <span style={{ color: "#6b7280" }}>Subtotal</span>
              <span style={{ fontWeight: 500, color: SLATE_900 }}>{fmt(lineSubtotal)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "12px" }}>
                <span style={{ color: "#6b7280" }}>Discount</span>
                <span style={{ fontWeight: 500, color: "#ef4444" }}>-{fmt(discount)}</span>
              </div>
            )}
            {tax_rate > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "12px" }}>
                <span style={{ color: "#6b7280" }}>Tax ({tax_rate}%)</span>
                <span style={{ fontWeight: 500, color: SLATE_900 }}>{fmt(tax_amount)}</span>
              </div>
            )}
            {tax_rate === 0 && tax_amount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "12px" }}>
                <span style={{ color: "#6b7280" }}>Tax</span>
                <span style={{ fontWeight: 500, color: SLATE_900 }}>{fmt(tax_amount)}</span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: "1px solid #e5e7eb",
                fontSize: "12px",
                fontWeight: 600,
                color: SLATE_900,
              }}
            >
              <span>{docType === "quote" ? "Total" : "Total due"}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(total)}</span>
            </div>
          </div>
        </div>

        {(notes || terms_conditions) && (
          <>
            <div style={{ height: "1px", background: "#f1f5f9", marginBottom: "10px" }} />
            {notes ? (
              <div style={{ marginBottom: terms_conditions ? "12px" : 0 }}>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: BRAND_PRIMARY,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: "8px",
                  }}
                >
                  Notes
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280", lineHeight: 1.5, whiteSpace: "pre-line", wordBreak: "break-word" }}>
                  {notes}
                </div>
              </div>
            ) : null}
            {terms_conditions ? (
              <div style={{ paddingRight: "28px" }}>
                <div className="min-w-0" style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                  <p
                    style={{
                      margin: "0 0 6px 0",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#737373",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Terms
                  </p>
                  <p
                    className="document-preview-terms-body"
                    style={{
                      margin: 0,
                      maxWidth: "100%",
                      fontSize: "11px",
                      lineHeight: 1.45,
                      color: "#9ca3af",
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                      overflow: "visible",
                    }}
                    title={String(terms_conditions).trim()}
                  >
                    {String(terms_conditions).replace(/\s+/g, " ").trim()}
                  </p>
                </div>
              </div>
            ) : null}
          </>
        )}

        <div
          style={{
            marginTop: "48px",
            paddingTop: "20px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div style={{ fontSize: "11px", lineHeight: 1.45, color: "#9ca3af" }}>Thank you for your business.</div>
          <div style={{ fontSize: "11px", lineHeight: 1.45, color: "#9ca3af" }}>{company_email}</div>
        </div>
      </div>

      <div
        style={{
          background: `linear-gradient(135deg, ${SLATE_900} 0%, #431407 45%, ${BRAND_PRIMARY} 85%, ${BRAND_SECONDARY} 100%)`,
          height: "4px",
        }}
      />
    </div>
  );
});

DocumentPreview.displayName = "DocumentPreview";

export default DocumentPreview;
