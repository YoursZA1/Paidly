import LogoImage from "@/components/shared/LogoImage";
import { formatCurrency } from "@/components/CurrencySelector";
import { formatDocumentLineQuantity } from "@/utils/documentInvoiceDisplay";

const TEXT = "#111827";
const SECONDARY = "#6b7280";
const MUTED = "#9ca3af";
const BORDER = "#e5e7eb";
const BORDER_STRONG = "#d1d5db";
const HEADER_BG = "#f9fafb";

/**
 * On-screen Paidly "Clean & professional" document.
 * Same arrangement as the quote and invoice PDF: issuer, bill to, items, totals, payment, terms.
 *
 * @param {{ data: object }} props
 */
export default function PaidlyCleanDocument({ data }) {
  if (!data) return null;
  const accent = data.brandPrimary || "#f24e00";
  const currency = data.currency || "ZAR";
  const money = (value) => formatCurrency(Number(value) || 0, currency);
  const issuer = data.issuer || {};
  const client = data.client || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const issuerLines = [
    issuer.address,
    issuer.email,
    issuer.phone,
    issuer.website,
    issuer.vatNumber ? `VAT ${issuer.vatNumber}` : "",
    issuer.registrationNumber ? `Reg ${issuer.registrationNumber}` : "",
  ].filter(Boolean);
  const clientLines = [
    client.contactPerson,
    client.address,
    client.email,
    client.phone,
    client.vatNumber ? `VAT ${client.vatNumber}` : "",
  ].filter(Boolean);
  const bankingRows = Array.isArray(data.bankingRows) ? data.bankingRows : [];
  const taxRate = Number(data.tax_rate) || 0;
  const taxAmount = Number(data.tax_amount) || 0;
  const discount = Number(data.discount_amount) || 0;
  const amountPaid = Number(data.amount_paid) || 0;
  const balanceDue =
    data.balance_due != null && data.balance_due !== "" ? Number(data.balance_due) : null;
  const showFinancials = data.showFinancials !== false;
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const partyLabel = data.partyLabel || "Bill to";
  const footerLeft =
    data.footerLabel != null
      ? data.footerLabel
      : [issuer.name, data.number ? `Invoice ${data.number}` : ""].filter(Boolean).join(" · ");

  return (
    <article
      className="paidly-clean-document"
      style={{
        width: "100%",
        maxWidth: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        boxSizing: "border-box",
        background: "#fff",
        color: TEXT,
        fontFamily: "Helvetica, Arial, sans-serif",
        fontSize: "9.5px",
        lineHeight: 1.4,
        padding: "40px 40px 56px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "24px",
          marginBottom: "24px",
          paddingBottom: "16px",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <div style={{ width: "54%", minWidth: 0 }}>
          {data.logo_url ? (
            <LogoImage
              src={data.logo_url}
              alt=""
              loading="eager"
              className="object-contain object-left"
              style={{ maxWidth: 140, maxHeight: 48, width: "auto", height: "auto", marginBottom: 8 }}
            />
          ) : null}
          {issuer.name ? (
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: 4 }}>{issuer.name}</div>
          ) : null}
          {issuerLines.map((line) => (
            <div key={line} style={{ color: SECONDARY, whiteSpace: "pre-line" }}>
              {line}
            </div>
          ))}
        </div>
        <div style={{ width: "44%", textAlign: "right" }}>
          <div style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "1.2px", lineHeight: 1 }}>
            {data.documentTitle || "INVOICE"}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 700, marginTop: 4, marginBottom: 12 }}>
            {data.number || "—"}
          </div>
          {data.issuedDateFormatted ? (
            <MetaRow label="Issued" value={data.issuedDateFormatted} />
          ) : null}
          {data.dueDateFormatted ? (
            <MetaRow label={data.dueLabel || "Due"} value={data.dueDateFormatted} />
          ) : null}
          {data.statusLabel ? (
            <div
              style={{
                marginTop: 8,
                fontSize: "8px",
                fontWeight: 700,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: SECONDARY,
              }}
            >
              {data.statusLabel}
            </div>
          ) : null}
        </div>
      </header>

      {client.name || clientLines.length > 0 ? (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel color={accent}>{partyLabel}</SectionLabel>
          {client.name ? (
            <div style={{ fontSize: "11px", fontWeight: 700, marginBottom: 2 }}>{client.name}</div>
          ) : null}
          {clientLines.map((line) => (
            <div key={line} style={{ color: SECONDARY, whiteSpace: "pre-line" }}>
              {line}
            </div>
          ))}
        </section>
      ) : null}

      {data.headline ? (
        <h2 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 700, lineHeight: 1.3 }}>{data.headline}</h2>
      ) : null}

      {sections.map((section) => (
        <section key={`${section.title}:${section.body}`} style={{ marginBottom: 16 }}>
          {section.title ? <div style={notesTitle}>{section.title}</div> : null}
          <div style={{ color: TEXT, whiteSpace: "pre-line" }}>{section.body}</div>
        </section>
      ))}

      {showFinancials ? (
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr style={{ background: HEADER_BG, borderBottom: `1px solid ${BORDER_STRONG}` }}>
            <th style={headCell("left", "48%")}>Description</th>
            <th style={headCell("right", "12%")}>Qty</th>
            <th style={headCell("right", "20%")}>Rate</th>
            <th style={headCell("right", "20%")}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: "16px 8px", color: MUTED }}>
                No items added
              </td>
            </tr>
          ) : (
            items.map((item, index) => (
              <tr key={item.key || index} style={{ borderBottom: `1px solid ${BORDER}` }}>
                <td style={{ ...bodyCell, width: "48%", paddingRight: 12 }}>{item.description}</td>
                <td style={{ ...bodyCell, width: "12%", textAlign: "right", color: SECONDARY }}>
                  {formatDocumentLineQuantity(item.qty)}
                </td>
                <td style={{ ...bodyCell, width: "20%", textAlign: "right", color: SECONDARY }}>
                  {money(item.price)}
                </td>
                <td style={{ ...bodyCell, width: "20%", textAlign: "right" }}>{money(item.total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
        <div style={{ width: 220 }}>
          <TotalRow label="Subtotal" value={money(data.subtotal)} />
          {discount > 0 ? <TotalRow label="Discount" value={`-${money(discount)}`} /> : null}
          {taxAmount > 0 || taxRate > 0 ? (
            <TotalRow label={taxRate > 0 ? `VAT (${taxRate}%)` : "VAT"} value={money(taxAmount)} />
          ) : null}
          <div style={{ borderBottom: `1px solid ${BORDER_STRONG}`, margin: "8px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase" }}>
              {data.totalLabel || "Total due"}
            </span>
            <span style={{ fontSize: "18px", fontWeight: 700, color: accent }}>{money(data.total)}</span>
          </div>
          {amountPaid > 0 ? <TotalRow label="Amount paid" value={money(amountPaid)} /> : null}
          {balanceDue != null && Number.isFinite(balanceDue) && amountPaid > 0 ? (
            <TotalRow label="Balance due" value={money(balanceDue)} />
          ) : null}
        </div>
      </div>
      ) : null}

      {showFinancials && bankingRows.length > 0 ? (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel color={accent}>Payment details</SectionLabel>
          {bankingRows.map((row) => (
            <div key={`${row.label}:${row.value}`} style={{ display: "flex", marginBottom: 8 }}>
              <div
                style={{
                  width: "38%",
                  fontSize: "8px",
                  color: MUTED,
                  letterSpacing: "0.4px",
                  textTransform: "uppercase",
                  paddingRight: 8,
                }}
              >
                {row.label}
              </div>
              <div style={{ width: "62%", color: TEXT }}>{row.value}</div>
            </div>
          ))}
        </section>
      ) : null}

      {data.paymentTerms ? (
        <section style={{ marginBottom: 16 }}>
          <div style={notesTitle}>Terms</div>
          <div style={{ color: SECONDARY, whiteSpace: "pre-line" }}>{data.paymentTerms}</div>
        </section>
      ) : null}
      {data.notes ? (
        <section style={{ marginBottom: 16 }}>
          <div style={notesTitle}>Notes</div>
          <div style={{ color: SECONDARY, whiteSpace: "pre-line" }}>{data.notes}</div>
        </section>
      ) : null}

      <footer
        style={{
          marginTop: "auto",
          paddingTop: 8,
          borderTop: `1px solid ${BORDER}`,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontSize: "7.5px",
          color: MUTED,
        }}
      >
        <span>{footerLeft}</span>
        <span>Page 1 of 1</span>
        <span>Generated with Paidly</span>
      </footer>
    </article>
  );
}

function SectionLabel({ color, children }) {
  return (
    <div
      style={{
        fontSize: "8.5px",
        fontWeight: 700,
        color,
        letterSpacing: "1px",
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 3 }}>
      <span
        style={{
          fontSize: "8px",
          color: MUTED,
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          marginRight: 8,
        }}
      >
        {label}
      </span>
      <span style={{ minWidth: 88, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function TotalRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
      <span style={{ color: SECONDARY }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function headCell(align, width) {
  return {
    width,
    textAlign: align,
    fontSize: "8.5px",
    fontWeight: 700,
    color: SECONDARY,
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    padding: "8px",
  };
}

const bodyCell = {
  fontSize: "9px",
  padding: "12px 8px",
  verticalAlign: "top",
  lineHeight: 1.35,
};

const notesTitle = {
  fontSize: "8.5px",
  fontWeight: 700,
  color: SECONDARY,
  letterSpacing: "0.8px",
  textTransform: "uppercase",
  marginBottom: 4,
};
