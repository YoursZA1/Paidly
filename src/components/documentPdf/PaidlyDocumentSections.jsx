import LogoImage from "@/components/shared/LogoImage";

const SLATE_900 = "#0f172a";

export function formatWebsiteDisplay(url) {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return "";
  return s.replace(/^https?:\/\//i, "");
}

export function websiteHref(url) {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

export function BrandBar({ primary, secondary, height = 6 }) {
  return (
    <div
      data-paidly-brand-bar=""
      style={{
        background: `linear-gradient(135deg, ${SLATE_900} 0%, #431407 45%, ${primary} 85%, ${secondary} 100%)`,
        height,
      }}
    />
  );
}

export function DocumentLogo({ logoUrl, companyName, primary }) {
  if (logoUrl) {
    return (
      <LogoImage
        src={logoUrl}
        alt=""
        loading="eager"
        className="shrink-0 object-contain object-left"
        style={{ maxHeight: 64, maxWidth: 180, width: "auto", height: "auto" }}
      />
    );
  }
  return (
    <div
      style={{
        width: "80px",
        height: "80px",
        borderRadius: "10px",
        background: `linear-gradient(135deg, ${SLATE_900}, ${primary})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ color: "#fff", fontWeight: 700, fontSize: "20px" }}>
        {(companyName || "C").charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

export function IssuerBlock({ resolved, primary }) {
  const {
    company_name,
    company_phone,
    company_email,
    company_website,
    company_address,
    logo_url,
  } = resolved;
  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <DocumentLogo logoUrl={logo_url} companyName={company_name} primary={primary} />
      </div>
      <div style={{ marginTop: "4px" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: primary,
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
              style={{ color: primary, textDecoration: "none", fontWeight: 500 }}
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
                color: primary,
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
  );
}

export function TitleBlock({ resolved, showStatusPill, statusStyle, statusLabelFn }) {
  const { docType, number, status } = resolved;
  return (
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
      {showStatusPill && statusStyle ? (
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
            color: statusStyle.color,
            border: `1.5px solid ${statusStyle.border}`,
          }}
        >
          {statusLabelFn(status)}
        </div>
      ) : null}
    </div>
  );
}

export function ContinuationHeader({ resolved, primary }) {
  const { docType, number } = resolved;
  const kind = docType === "quote" ? "Quote" : "Invoice";
  return (
    <div
      data-measure="continuation-header"
      data-doc-chrome="continuation-header"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: "12px",
        paddingBottom: "8px",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <div>
        <div style={{ fontSize: "13px", fontWeight: 700, color: SLATE_900 }}>
          {kind} #{number}
        </div>
        <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>Continued</div>
      </div>
      <div style={{ fontSize: "11px", fontWeight: 600, color: primary, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {kind}
      </div>
    </div>
  );
}

export function FirstHeader({ resolved, primary, secondary, showStatusPill, statusStyle, statusLabelFn }) {
  return (
    <div data-measure="first-header" data-doc-chrome="first-header">
      <BrandBar primary={primary} secondary={secondary} height={6} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "24px",
          paddingTop: "16px",
        }}
      >
        <IssuerBlock resolved={resolved} primary={primary} />
        <TitleBlock
          resolved={resolved}
          showStatusPill={showStatusPill}
          statusStyle={statusStyle}
          statusLabelFn={statusLabelFn}
        />
      </div>
      <div
        style={{
          height: "1px",
          background: `linear-gradient(to right, rgba(15,23,42,0.12), rgba(242,78,0,0.22), transparent)`,
          marginBottom: "24px",
        }}
      />
    </div>
  );
}

export function BillToDates({ resolved, primary }) {
  const { client_name, client_email, client_address, issue_date, due_date, dueLabel, safeFormatDate } = resolved;
  return (
    <div
      data-measure="bill-to"
      data-doc-chrome="first-only"
      className="paidly-doc-keep"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "40px",
        marginBottom: "20px",
      }}
    >
      <div>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: primary,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: "10px",
          }}
        >
          Bill to
        </div>
        <div style={{ fontWeight: 700, fontSize: "12px", color: SLATE_900, marginBottom: "4px" }}>{client_name}</div>
        <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.35, whiteSpace: "pre-line" }}>{client_address}</div>
        <div style={{ fontSize: "12px", color: "#6b7280" }}>{client_email}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ marginBottom: "16px" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: primary,
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
              color: primary,
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
  );
}

function thStyle(color, width) {
  return {
    padding: "6px 0",
    textAlign: width ? "right" : "left",
    fontSize: "12px",
    fontWeight: 600,
    color,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    width: width || undefined,
  };
}

export function LineItemsTableHeader({ secondary }) {
  return (
    <thead data-measure="table-header" data-doc-repeat-chrome-measure="line-table">
      <tr style={{ background: SLATE_900 }}>
        <th style={thStyle("#94a3b8")}>Description</th>
        <th style={thStyle("#94a3b8", "72px")}>Qty</th>
        <th style={thStyle("#94a3b8", "100px")}>Unit price</th>
        <th style={thStyle(secondary, "108px")}>Total</th>
      </tr>
    </thead>
  );
}

export function LineItemRow({ item, index, fmt }) {
  return (
    <tr
      data-measure="row"
      data-doc-block="line-item"
      data-doc-block-id={`line:${index}`}
      data-doc-repeat-chrome="line-table"
      data-doc-meta={JSON.stringify({ rowIndex: index })}
      className="paidly-doc-row"
      style={{ borderBottom: "1px solid #f1f5f9", background: index % 2 === 0 ? "#fff" : "#f8fafc" }}
    >
      <td
        style={{
          padding: "6px 8px 6px 0",
          fontSize: "12px",
          lineHeight: "16px",
          color: "#374151",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
      >
        {item.description || "—"}
      </td>
      <td style={{ padding: "6px 0", fontSize: "12px", lineHeight: "16px", color: "#374151", textAlign: "right", whiteSpace: "nowrap" }}>
        {item.quantity}
      </td>
      <td style={{ padding: "6px 0", fontSize: "12px", lineHeight: "16px", color: "#374151", textAlign: "right", whiteSpace: "nowrap" }}>
        {fmt(item.unit_price)}
      </td>
      <td style={{ padding: "6px 0", fontSize: "12px", lineHeight: "16px", fontWeight: 600, color: SLATE_900, textAlign: "right", whiteSpace: "nowrap" }}>
        {fmt(item.total)}
      </td>
    </tr>
  );
}

export function LineItemsTable({ rows, fmt, secondary, continued }) {
  return (
    <div className="document-line-items-table-wrap" style={{ marginBottom: "16px" }}>
      {continued ? (
        <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "6px", fontWeight: 600 }}>
          Line items — Continued
        </div>
      ) : null}
      <table className="document-line-items-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <LineItemsTableHeader secondary={secondary} />
        <tbody>
          {rows.length === 0 ? (
            <tr
              data-measure="empty-row"
              data-doc-block="line-item-empty"
              data-doc-block-id="line-empty"
              data-doc-repeat-chrome="line-table"
            >
              <td colSpan={4} style={{ padding: "6px 0", fontSize: "12px", color: "#9ca3af", lineHeight: "16px" }}>
                No line items
              </td>
            </tr>
          ) : (
            rows.map((item, i) => <LineItemRow key={item.key ?? i} item={item} index={i} fmt={fmt} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

export function TotalsPaymentBlock({ resolved, primary, bankingLines }) {
  const {
    fmt,
    lineSubtotal,
    discount,
    tax_rate,
    tax_amount,
    total,
    docType,
    amount_paid,
    balance_due,
  } = resolved;
  return (
    <div
      data-measure="totals"
      data-doc-block="totals-payment"
      data-doc-block-id="totals-payment"
      className="paidly-doc-keep"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "32px",
        alignItems: "start",
        marginBottom: "16px",
        paddingTop: "16px",
        borderTop: "1px solid #f1f5f9",
      }}
    >
      <div className="min-w-0">
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: primary,
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
        {docType === "invoice" && amount_paid != null && Number.isFinite(amount_paid) ? (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "12px" }}>
            <span style={{ color: "#6b7280" }}>Amount paid</span>
            <span style={{ fontWeight: 500, color: SLATE_900 }}>{fmt(amount_paid)}</span>
          </div>
        ) : null}
        {docType === "invoice" && balance_due != null && Number.isFinite(balance_due) ? (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "12px" }}>
            <span style={{ color: "#6b7280" }}>Balance due</span>
            <span style={{ fontWeight: 600, color: SLATE_900 }}>{fmt(balance_due)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function NotesBlock({ notes, primary }) {
  if (!notes) return null;
  return (
    <div
      data-measure="notes"
      data-doc-block="notes"
      data-doc-block-id="notes"
      className="paidly-doc-keep"
      style={{ marginBottom: "12px" }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 700,
          color: primary,
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
  );
}

export function TermsHeading({ continued }) {
  return (
    <p
      data-measure={continued ? "terms-continued-heading" : "terms-heading"}
      {...(continued
        ? { "data-doc-flow-continued": "terms" }
        : { "data-doc-flow-leading": "terms" })}
      style={{
        margin: "0 0 6px 0",
        fontSize: "11px",
        fontWeight: 600,
        color: "#737373",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {continued ? "Terms — Continued" : "Terms"}
    </p>
  );
}

export function TermsPart({ text, index }) {
  return (
    <p
      data-measure="terms-part"
      data-terms-index={index}
      data-doc-block="terms-part"
      data-doc-block-id={`terms:${index}`}
      data-doc-policy="flow-part"
      data-doc-flow-group="terms"
      data-doc-meta={JSON.stringify({ termsIndex: index })}
      style={{
        margin: "0 0 8px 0",
        maxWidth: "100%",
        fontSize: "11px",
        lineHeight: 1.45,
        color: "#9ca3af",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        whiteSpace: "pre-line",
      }}
    >
      {text}
    </p>
  );
}

export function PageFooter({ companyEmail, pageIndex, pageCount }) {
  return (
    <div
      data-measure="footer"
      data-doc-chrome="footer"
      style={{
        marginTop: "auto",
        paddingTop: "16px",
        borderTop: "1px solid #f1f5f9",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "8px",
      }}
    >
      <div style={{ fontSize: "11px", lineHeight: 1.45, color: "#9ca3af" }}>Thank you for your business.</div>
      <div style={{ fontSize: "11px", lineHeight: 1.45, color: "#9ca3af" }}>
        {pageCount > 1 ? `Page ${pageIndex + 1} of ${pageCount}` : companyEmail}
        {pageCount > 1 && companyEmail ? ` · ${companyEmail}` : null}
      </div>
    </div>
  );
}
