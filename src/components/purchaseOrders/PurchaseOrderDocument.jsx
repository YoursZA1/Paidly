import { forwardRef } from "react";
import { formatCurrencyInvoice } from "@/components/CurrencySelector";
import { DocumentLogo } from "@/components/documentPdf/PaidlyDocumentSections";

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

/** Only states that change what the paper means are printed; internal workflow states are not. */
const DOCUMENT_MARK = {
  draft: ["DRAFT — NOT APPROVED", "#92400e", "#fef3c7"],
  pending_approval: ["DRAFT — AWAITING APPROVAL", "#5b21b6", "#ede9fe"],
  cancelled: ["CANCELLED", "#991b1b", "#fee2e2"],
};

/** Rows and blocks the PDF / print engine must not split across pages. */
const KEEP_TOGETHER = { pageBreakInside: "avoid", breakInside: "avoid" };

const label = {
  fontSize: "10px",
  fontWeight: 700,
  color: MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: "6px",
};

function Lines({ children }) {
  return <div style={{ fontSize: "12px", color: "#374151", lineHeight: 1.5, whiteSpace: "pre-line" }}>{children}</div>;
}

/**
 * Printable purchase order (A4 width). Inline styles only, so Print (outerHTML in a new window) and
 * Download PDF (html2canvas) render the same thing as the preview.
 */
const PurchaseOrderDocument = forwardRef(function PurchaseOrderDocument({ model, accent = INK }, ref) {
  const m = model;
  const money = (v) => formatCurrencyInvoice(v, m.currency);
  const mark = DOCUMENT_MARK[m.status];
  const th = (align = "left") => ({
    textAlign: align,
    padding: "8px 8px",
    fontSize: "10px",
    fontWeight: 700,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    borderBottom: `2px solid ${INK}`,
  });
  const td = (align = "left") => ({
    whiteSpace: align === "right" ? "nowrap" : "normal",
    textAlign: align,
    padding: "9px 8px",
    fontSize: "12px",
    color: INK,
    borderBottom: `1px solid ${LINE}`,
    verticalAlign: "top",
  });

  return (
    <div
      ref={ref}
      className="document-preview-styled"
      style={{
        width: "794px",
        minHeight: "1000px",
        boxSizing: "border-box",
        padding: "48px 52px",
        background: "#ffffff",
        color: INK,
        fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          {m.business ? (
            <>
              <div style={{ marginBottom: "12px" }}>
                <DocumentLogo logoUrl={m.business.logo} companyName={m.business.name} primary={accent} />
              </div>
              <div style={{ fontWeight: 700, fontSize: "14px" }}>{m.business.name}</div>
              <Lines>
                {[m.business.address, [m.business.phone, m.business.email].filter(Boolean).join(" · "), m.business.vatNumber ? `VAT ${m.business.vatNumber}` : ""]
                  .filter(Boolean)
                  .join("\n")}
              </Lines>
            </>
          ) : null}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "0.08em", color: accent }}>PURCHASE ORDER</div>
          <div style={{ fontSize: "16px", fontWeight: 700, marginTop: "4px" }}>{m.number}</div>
          {mark ? (
            <div
              style={{
                display: "inline-block",
                marginTop: "8px",
                padding: "3px 10px",
                borderRadius: "4px",
                background: mark[2],
                color: mark[1],
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {mark[0]}
            </div>
          ) : null}
          <table style={{ marginTop: "12px", marginLeft: "auto", borderCollapse: "collapse", fontSize: "12px" }}>
            <tbody>
              {m.orderDate ? (
                <tr>
                  <td style={{ color: MUTED, padding: "2px 0 2px 16px", textAlign: "right" }}>Order date</td>
                  <td style={{ padding: "2px 0 2px 12px", textAlign: "right", fontWeight: 600 }}>{m.orderDate}</td>
                </tr>
              ) : null}
              {m.expectedDate ? (
                <tr>
                  <td style={{ color: MUTED, padding: "2px 0 2px 16px", textAlign: "right" }}>Expected</td>
                  <td style={{ padding: "2px 0 2px 12px", textAlign: "right", fontWeight: 600 }}>{m.expectedDate}</td>
                </tr>
              ) : null}
              {m.paymentTerms ? (
                <tr>
                  <td style={{ color: MUTED, padding: "2px 0 2px 16px", textAlign: "right" }}>Payment terms</td>
                  <td style={{ padding: "2px 0 2px 12px", textAlign: "right", fontWeight: 600 }}>{m.paymentTerms}</td>
                </tr>
              ) : null}
              {m.dueDate ? (
                <tr>
                  <td style={{ color: MUTED, padding: "2px 0 2px 16px", textAlign: "right" }}>Payment due</td>
                  <td style={{ padding: "2px 0 2px 12px", textAlign: "right", fontWeight: 600 }}>{m.dueDate}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parties */}
      <div style={{ display: "flex", gap: "24px", marginTop: "32px" }}>
        <div style={{ flex: 1, minWidth: 0, border: `1px solid ${LINE}`, borderRadius: "8px", padding: "14px 16px" }}>
          <div style={label}>Supplier</div>
          {m.supplier ? (
            <>
              <div style={{ fontWeight: 700, fontSize: "13px" }}>{m.supplier.name}</div>
              <Lines>
                {[m.supplier.address, m.supplier.email, m.supplier.phone, m.supplier.taxNumber ? `VAT/Tax no. ${m.supplier.taxNumber}` : ""]
                  .filter(Boolean)
                  .join("\n")}
              </Lines>
            </>
          ) : (
            <Lines>No supplier selected</Lines>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, border: `1px solid ${LINE}`, borderRadius: "8px", padding: "14px 16px" }}>
          <div style={label}>Deliver to</div>
          {m.business?.name ? <div style={{ fontWeight: 700, fontSize: "13px" }}>{m.business.name}</div> : null}
          <Lines>{m.deliveryAddress || "—"}</Lines>
          {m.deliveryInstructions ? (
            <div style={{ marginTop: "8px", fontSize: "11px", color: MUTED, whiteSpace: "pre-line" }}>{m.deliveryInstructions}</div>
          ) : null}
        </div>
      </div>

      {/* Items */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "28px" }}>
        <thead>
          <tr>
            <th style={{ ...th(), width: "28px" }}>#</th>
            <th style={th()}>Product</th>
            <th style={th("right")}>Qty</th>
            <th style={th("right")}>Unit price</th>
            {m.hasDiscount ? <th style={th("right")}>Disc.</th> : null}
            <th style={th("right")}>VAT</th>
            <th style={th("right")}>Total</th>
          </tr>
        </thead>
        <tbody>
          {m.lines.map((l, i) => (
            <tr key={l.id || i} style={KEEP_TOGETHER}>
              <td style={{ ...td(), color: MUTED }}>{i + 1}</td>
              <td style={{ ...td(), overflowWrap: "anywhere", wordBreak: "break-word" }}>
                <div style={{ fontWeight: 600 }}>{l.name}</div>
                {l.detail ? <div style={{ fontSize: "11px", color: MUTED }}>{l.detail}</div> : null}
                {l.sku ? <div style={{ fontSize: "10px", color: MUTED }}>SKU {l.sku}</div> : null}
              </td>
              <td style={td("right")}>{l.quantity}</td>
              <td style={td("right")}>{money(l.unitPrice)}</td>
              {m.hasDiscount ? <td style={td("right")}>{l.discountPercent ? `${l.discountPercent}%` : "—"}</td> : null}
              <td style={td("right")}>{l.vatRate ? `${l.vatRate}%` : "—"}</td>
              <td style={{ ...td("right"), fontWeight: 600 }}>{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px", ...KEEP_TOGETHER }}>
        <table style={{ width: "300px", borderCollapse: "collapse", fontSize: "12px" }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 0", color: MUTED }}>Subtotal</td>
              <td style={{ padding: "4px 0", textAlign: "right" }}>{money(m.totals.subtotal)}</td>
            </tr>
            {m.totals.discountTotal ? (
              <tr>
                <td style={{ padding: "4px 0", color: MUTED }}>Discount</td>
                <td style={{ padding: "4px 0", textAlign: "right" }}>−{money(m.totals.discountTotal)}</td>
              </tr>
            ) : null}
            <tr>
              <td style={{ padding: "4px 0", color: MUTED }}>VAT</td>
              <td style={{ padding: "4px 0", textAlign: "right" }}>{money(m.totals.vatTotal)}</td>
            </tr>
            <tr>
              <td style={{ padding: "10px 0 0", fontWeight: 700, fontSize: "13px", borderTop: `2px solid ${INK}` }}>Total Order Value</td>
              <td style={{ padding: "10px 0 0", textAlign: "right", fontWeight: 800, fontSize: "16px", borderTop: `2px solid ${INK}` }}>
                {money(m.totals.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Terms */}
      <div style={{ display: "flex", gap: "24px", marginTop: "32px", ...KEEP_TOGETHER }}>
        {m.notes ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={label}>Notes</div>
            <Lines>{m.notes}</Lines>
          </div>
        ) : null}
        {m.terms ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={label}>Terms & conditions</div>
            <Lines>{m.terms}</Lines>
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: "16px", fontSize: "11px", color: MUTED }}>
        Please quote {m.number} on all invoices, delivery notes and correspondence.
      </div>

      {/* Authorisation */}
      <div style={{ display: "flex", gap: "48px", marginTop: "48px", ...KEEP_TOGETHER }}>
        {["Authorised by", "Date"].map((caption) => (
          <div key={caption} style={{ flex: 1 }}>
            <div style={{ borderBottom: `1px solid ${INK}`, height: "28px" }} />
            <div style={{ fontSize: "10px", color: MUTED, marginTop: "4px" }}>{caption}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {m.business ? (
        <div
          style={{
            marginTop: "40px",
            paddingTop: "10px",
            borderTop: `1px solid ${LINE}`,
            fontSize: "10px",
            color: MUTED,
            textAlign: "center",
            ...KEEP_TOGETHER,
          }}
        >
          {[m.business.name, m.business.email, m.business.phone, m.business.vatNumber ? `VAT ${m.business.vatNumber}` : ""]
            .filter(Boolean)
            .join("  ·  ")}
        </div>
      ) : null}
    </div>
  );
});

export default PurchaseOrderDocument;
