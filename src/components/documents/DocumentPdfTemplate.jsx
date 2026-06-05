import { forwardRef, useMemo } from "react";
import { format, isValid, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { resolveDocumentBrandColors } from "@/utils/documentBrandColors";
import { mergeLiveBrandingForDocuments } from "@/utils/documentPreviewData";
import { typeLabel, isFinancialType } from "@/document-engine";
import { formatCurrency } from "@/utils/currencyCalculations";

const SLATE_900 = "#0f172a";

/* CSS injected into the template for print / html2pdf rendering */
const PDF_STYLES = `
  .doc-pdf-root {
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    background: #ffffff;
    color: #111827;
    font-size: 12px;
    line-height: 1.5;
    max-width: 794px;
    margin: 0 auto;
  }

  /* Page-break helpers */
  .docpdf-keep-together { page-break-inside: avoid; break-inside: avoid; }
  .docpdf-page-break    { page-break-before: always; break-before: always; }

  /* Print: A4 margins, page counter in footer */
  @media print {
    @page {
      size: A4 portrait;
      margin: 15mm 18mm;
    }

    body { margin: 0; }

    .doc-pdf-no-print { display: none !important; }

    /* Page numbers via CSS counters */
    .doc-pdf-page-footer::after {
      content: "Page " counter(page);
      counter-increment: page;
    }
  }
`;

function safeDate(v) {
  if (!v) return null;
  try {
    const d =
      typeof v === "string"
        ? parseISO(v.includes("T") ? v : `${v}T12:00:00`)
        : new Date(v);
    return isValid(d) ? format(d, "MMMM d, yyyy") : null;
  } catch {
    return null;
  }
}

function normalizeItems(doc) {
  const items = doc.document_items || doc.items || [];
  return items.map((it) => {
    const qty = Number(it.quantity ?? 1) || 1;
    const unit = Number(it.unit_price ?? it.unit ?? 0) || 0;
    const rawTotal = it.total_price ?? it.total;
    const total =
      rawTotal != null && rawTotal !== ""
        ? Number(rawTotal)
        : Math.round(qty * unit * 100) / 100;
    return {
      description: it.description || "Item",
      quantity: qty,
      unit_price: unit,
      total,
    };
  });
}

/**
 * Universal PDF-ready renderer for every Paidly document type.
 *
 * - Financial documents (invoice, quote, PO, …): line-items table + totals
 * - Prose documents (contract, brief, NDA, …): branded header + body content
 *
 * Use `forwardRef` to capture the element with html2pdf.js.
 * Works for print (browser), Preview modal, and direct download.
 */
const DocumentPdfTemplate = forwardRef(function DocumentPdfTemplate(
  { doc, workspace, client },
  ref
) {
  const { user: authUser } = useAuth();

  const effectiveUser = useMemo(
    () => mergeLiveBrandingForDocuments(workspace, authUser),
    [workspace, authUser]
  );

  const { primary: BRAND_PRIMARY, secondary: BRAND_SECONDARY } = useMemo(
    () => resolveDocumentBrandColors(effectiveUser),
    [effectiveUser?.document_brand_primary, effectiveUser?.document_brand_secondary]
  );

  if (!doc) return null;

  const financial = isFinancialType(doc.type);
  const docTypeLabel = typeLabel(doc.type);
  const currency = doc.currency || "ZAR";

  // Company info
  const companyName =
    String(effectiveUser?.company_name || "Your Company").trim();
  const companyEmail = String(effectiveUser?.email || "").trim();
  const companyPhone = String(effectiveUser?.phone || "").trim();
  const companyAddress = String(
    effectiveUser?.company_address || ""
  ).trim();
  const logoUrl =
    effectiveUser?.logo_url || effectiveUser?.company_logo_url || null;

  // Client info
  const clientName =
    doc.client_name || client?.name || client?.company || "";
  const clientEmail = doc.client_email || client?.email || "";
  const clientAddress =
    doc.client_address ||
    [client?.address, client?.city, client?.country]
      .filter(Boolean)
      .join(", ") ||
    "";

  // Dates
  const issueDateStr = safeDate(doc.issue_date || doc.created_at);
  const dueDateStr = safeDate(doc.due_date || doc.valid_until);

  // Financial totals
  const lineRows = normalizeItems(doc);
  const subtotal =
    Number(doc.subtotal) || lineRows.reduce((s, r) => s + r.total, 0);
  const taxRate = Number(doc.tax_rate) || 0;
  const taxAmount = Number(doc.tax_amount) || 0;
  const discountAmount = Number(doc.discount_amount) || 0;
  const total =
    Number(doc.total_amount) || subtotal + taxAmount - discountAmount;
  const fmt = (n) => formatCurrency(n, currency);

  // Prose body
  const bodyText = doc.body || "";

  const accentBar = {
    background: `linear-gradient(135deg, ${SLATE_900} 0%, #431407 45%, ${BRAND_PRIMARY} 85%, ${BRAND_SECONDARY} 100%)`,
  };

  return (
    <div
      ref={ref}
      data-invoice-pdf-capture="true"
      className="doc-pdf-root"
      style={{
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        backgroundColor: "#ffffff",
        color: "#111827",
        fontSize: "12px",
        lineHeight: 1.5,
        maxWidth: "794px",
        margin: "0 auto",
      }}
    >
      {/* Inject print/pdf CSS */}
      <style dangerouslySetInnerHTML={{ __html: PDF_STYLES }} />

      {/* ── Top accent bar ── */}
      <div style={{ ...accentBar, height: 6 }} />

      {/* ── Document body ── */}
      <div style={{ padding: "40px 48px" }}>

        {/* ── Header: logo + company info (left) | type + number + status (right) ── */}
        <div
          className="docpdf-keep-together"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 28,
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          {/* Left */}
          <div style={{ flex: "1 1 200px" }}>
            {/* Logo */}
            <div style={{ marginBottom: 16 }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  crossOrigin="anonymous"
                  style={{
                    maxHeight: 64,
                    maxWidth: 180,
                    objectFit: "contain",
                    objectPosition: "left",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    background: `linear-gradient(135deg, ${SLATE_900}, ${BRAND_PRIMARY})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{ color: "#fff", fontWeight: 700, fontSize: 20 }}
                  >
                    {(companyName || "C").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Company details */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: BRAND_PRIMARY,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              From
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                color: SLATE_900,
                marginBottom: 4,
              }}
            >
              {companyName}
            </div>
            {companyPhone && (
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                {companyPhone}
              </div>
            )}
            {companyEmail && (
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
                {companyEmail}
              </div>
            )}
            {companyAddress && (
              <div
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                  whiteSpace: "pre-line",
                  marginTop: 4,
                }}
              >
                {companyAddress}
              </div>
            )}
          </div>

          {/* Right: document title block */}
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: SLATE_900,
                textTransform: "uppercase",
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
              }}
            >
              {docTypeLabel}
            </div>
            {doc.document_number && (
              <div
                style={{
                  fontSize: 13,
                  color: "#6b7280",
                  marginTop: 6,
                  fontWeight: 600,
                }}
              >
                #{doc.document_number}
              </div>
            )}
            {doc.status && (
              <div
                style={{
                  display: "inline-block",
                  marginTop: 10,
                  padding: "3px 12px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: BRAND_PRIMARY,
                  border: `1.5px solid ${BRAND_PRIMARY}`,
                }}
              >
                {String(doc.status).replace(/_/g, " ")}
              </div>
            )}
          </div>
        </div>

        {/* Gradient divider */}
        <div
          style={{
            height: 1,
            background: `linear-gradient(to right, rgba(15,23,42,0.12), rgba(242,78,0,0.22), transparent)`,
            marginBottom: 32,
          }}
        />

        {/* ── Client + Dates ── */}
        {(clientName || issueDateStr || dueDateStr) && (
          <div
            className="docpdf-keep-together"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 32,
              marginBottom: 32,
            }}
          >
            {/* Bill-to */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: BRAND_PRIMARY,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 8,
                }}
              >
                {financial ? "Bill to" : "To"}
              </div>
              {clientName && (
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    color: SLATE_900,
                    marginBottom: 4,
                  }}
                >
                  {clientName}
                </div>
              )}
              {clientEmail && (
                <div
                  style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}
                >
                  {clientEmail}
                </div>
              )}
              {clientAddress && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    whiteSpace: "pre-line",
                    marginTop: 4,
                  }}
                >
                  {clientAddress}
                </div>
              )}
            </div>

            {/* Dates */}
            <div style={{ textAlign: "right" }}>
              {issueDateStr && (
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: BRAND_PRIMARY,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 3,
                    }}
                  >
                    Date
                  </div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: SLATE_900 }}
                  >
                    {issueDateStr}
                  </div>
                </div>
              )}
              {dueDateStr && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: BRAND_PRIMARY,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 3,
                    }}
                  >
                    {doc.type === "quote" ? "Valid Until" : "Due Date"}
                  </div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: SLATE_900 }}
                  >
                    {dueDateStr}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Document title ── */}
        {doc.title && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: SLATE_900,
                lineHeight: 1.3,
              }}
            >
              {doc.title}
            </div>
          </div>
        )}

        {/* ── Financial: line-items table + totals ── */}
        {financial && (
          <div style={{ marginBottom: 32 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                pageBreakInside: "auto",
              }}
            >
              <thead>
                <tr style={{ background: SLATE_900 }}>
                  {["Description", "Qty", "Unit Price", "Total"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 8px",
                        textAlign: i === 0 ? "left" : "right",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: "12px 8px",
                        fontSize: 12,
                        color: "#9ca3af",
                      }}
                    >
                      No line items
                    </td>
                  </tr>
                ) : (
                  lineRows.map((item, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: i % 2 === 0 ? "#ffffff" : "#f8fafc",
                        pageBreakInside: "avoid",
                      }}
                    >
                      <td
                        style={{
                          padding: "8px 8px",
                          fontSize: 12,
                          color: "#374151",
                          wordBreak: "break-word",
                        }}
                      >
                        {item.description}
                      </td>
                      <td
                        style={{
                          padding: "8px 8px",
                          fontSize: 12,
                          color: "#374151",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.quantity}
                      </td>
                      <td
                        style={{
                          padding: "8px 8px",
                          fontSize: 12,
                          color: "#374151",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmt(item.unit_price)}
                      </td>
                      <td
                        style={{
                          padding: "8px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: SLATE_900,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmt(item.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Totals block */}
            <div
              className="docpdf-keep-together"
              style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}
            >
              <div style={{ minWidth: 240, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "3px 0",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#6b7280" }}>Subtotal</span>
                  <span style={{ fontWeight: 500, color: SLATE_900 }}>
                    {fmt(subtotal)}
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "3px 0",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "#6b7280" }}>Discount</span>
                    <span style={{ fontWeight: 500, color: "#ef4444" }}>
                      -{fmt(discountAmount)}
                    </span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "3px 0",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "#6b7280" }}>
                      Tax{taxRate > 0 ? ` (${taxRate}%)` : ""}
                    </span>
                    <span style={{ fontWeight: 500, color: SLATE_900 }}>
                      {fmt(taxAmount)}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "2px solid #e5e7eb",
                    fontSize: 14,
                    fontWeight: 700,
                    color: SLATE_900,
                  }}
                >
                  <span>Total</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmt(total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Prose: body content ── */}
        {!financial && bodyText && (
          <div style={{ marginBottom: 32 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: BRAND_PRIMARY,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 10,
              }}
            >
              Content
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#374151",
                lineHeight: 1.75,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {bodyText}
            </div>
          </div>
        )}

        {!financial && !bodyText && (
          <div
            style={{
              marginBottom: 32,
              padding: "28px 0",
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 12,
              borderTop: "1px dashed #e5e7eb",
              borderBottom: "1px dashed #e5e7eb",
            }}
          >
            No content
          </div>
        )}

        {/* ── Persistent footer (visible in preview + print) ── */}
        <div
          className="doc-pdf-page-footer"
          style={{
            marginTop: 48,
            paddingTop: 16,
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 11,
            color: "#9ca3af",
          }}
        >
          <span>Thank you for your business.</span>
          {companyEmail && <span>{companyEmail}</span>}
        </div>
      </div>

      {/* ── Bottom accent bar ── */}
      <div style={{ ...accentBar, height: 4 }} />
    </div>
  );
});

DocumentPdfTemplate.displayName = "DocumentPdfTemplate";
export default DocumentPdfTemplate;
