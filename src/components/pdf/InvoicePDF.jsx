import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet
} from "@react-pdf/renderer";
import { formatLineItemNameAndDescription } from "@/utils/invoiceTemplateData";

const formatCurrency = (value, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency
  }).format(Number(value) || 0);

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const calcLineTotal = (item) => {
  // Prefer explicit `total` if present, otherwise compute from qty * price.
  if (item?.total != null) return toNumber(item.total);
  return toNumber(item?.qty) * toNumber(item?.price);
};

const calculateTotals = (items) => {
  const safeItems = Array.isArray(items) ? items : [];
  const subtotal = safeItems.reduce((sum, item) => sum + calcLineTotal(item), 0);
  // For now we treat "grand total" as the final amount due (tax/discount not modeled here).
  const grandTotal = subtotal;
  return { subtotal, grandTotal };
};

/** Layout rhythm: section gaps 20–24, table row pad 8–12, clear space above line items. */
const GAP_SECTION = 22;
const PAD_ROW = 10;
const SPACE_ABOVE_TABLE = 16;

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#333333",
  },

  gridSectionBillDates: {
    marginBottom: GAP_SECTION,
  },

  /** Full-width line items — summary is a separate block below. */
  tableSection: {
    width: "100%",
    marginTop: SPACE_ABOVE_TABLE,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },

  brandBlock: {
    width: "50%",
    flexDirection: "column",
    alignItems: "flex-start",
  },

  invoiceBlock: {
    width: "50%",
    flexDirection: "column",
    alignItems: "flex-end",
  },

  invoiceTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f97316",
    textAlign: "right",
    width: "100%",
  },

  invoiceNumber: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "normal",
    color: "#6b7280",
    textAlign: "right",
    width: "100%",
  },

  brand: {
    fontSize: 18,
    fontWeight: 800,
    color: "#111111",
    marginBottom: 0,
  },

  address: {
    fontSize: 9,
    color: "#777777",
    lineHeight: 1.35,
    maxWidth: 240,
    marginTop: 4,
  },

  /** Dates + status below header (right-aligned) */
  headerMeta: {
    width: "100%",
    alignItems: "flex-end",
    marginBottom: GAP_SECTION,
  },

  headerMetaInner: {
    width: "100%",
    alignItems: "flex-end",
  },

  headerDatesBlock: {
    marginTop: 4,
    width: "100%",
    alignItems: "flex-end",
  },

  headerDateLabel: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#9CA3AF",
    textAlign: "right",
    marginTop: PAD_ROW,
  },

  headerDateLabelFirst: {
    marginTop: 0,
  },

  headerDateValue: {
    fontSize: 10,
    fontWeight: 700,
    color: "#111111",
    textAlign: "right",
    marginTop: 2,
  },

  headerDateValueDue: {
    fontSize: 10,
    fontWeight: 700,
    color: "#C2410C",
    textAlign: "right",
    marginTop: 2,
  },

  status: {
    fontSize: 8,
    fontWeight: 600,
    color: "#9CA3AF",
    marginTop: PAD_ROW,
    textAlign: "right",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  billToSection: {
    width: "100%",
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: 900,
    color: "#999999",
    marginBottom: PAD_ROW,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  clientName: {
    fontSize: 10,
    fontWeight: 900,
    marginBottom: 8,
  },

  clientAddress: {
    fontSize: 9,
    color: "#777777",
    lineHeight: 1.35,
  },

  billToUnderline: {
    width: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: PAD_ROW,
  },

  tableOuter: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 0,
    overflow: "hidden",
  },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingVertical: PAD_ROW,
    paddingHorizontal: PAD_ROW,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },

  tableThText: {
    fontSize: 9,
    fontWeight: 900,
  },

  /** Right-aligned column headers for numeric columns */
  tableThNumeric: {
    textAlign: "right",
  },

  emptyBody: {
    minHeight: 200,
    paddingHorizontal: PAD_ROW,
    paddingVertical: GAP_SECTION * 2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },

  emptyDraftLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "#9CA3AF",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: PAD_ROW,
  },

  emptyText: {
    fontSize: 14,
    fontWeight: 700,
    color: "#999999",
    marginTop: 0,
  },

  notesSection: {
    marginTop: 0,
    paddingTop: PAD_ROW,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },

  notesBlockTitle: {
    fontSize: 9,
    fontWeight: 900,
    color: "#999999",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: PAD_ROW,
  },

  notesBlockSpacing: {
    marginBottom: PAD_ROW,
  },

  notesBlockText: {
    fontSize: 9,
    color: "#555555",
    lineHeight: 1.45,
  },
});

/** Table body columns: 55% + 10% + 15% + 20% — React-PDF uses borderWidth/Color, not CSS border shorthand. */
const tableStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
    paddingVertical: PAD_ROW,
    paddingHorizontal: PAD_ROW,
  },

  colDesc: {
    width: "55%",
    flexWrap: "wrap",
    paddingRight: 8,
    lineHeight: 1.35,
  },

  colQty: {
    width: "10%",
    textAlign: "center",
    fontWeight: 700,
  },

  colPrice: {
    width: "15%",
    textAlign: "right",
    fontWeight: 700,
  },

  colTotal: {
    width: "20%",
    textAlign: "right",
    fontWeight: 700,
  },
});

/** Below table, right-rail — React-PDF: borderTopWidth/Color, not CSS border shorthand. */
const summaryStyles = StyleSheet.create({
  summary: {
    marginTop: 20,
    marginBottom: 8,
    width: "40%",
    marginLeft: "auto",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    width: "100%",
  },

  subtotalText: {
    fontSize: 10,
    color: "#6b7280",
  },

  subtotalAmount: {
    fontSize: 10,
    fontWeight: 700,
    color: "#111111",
    textAlign: "right",
  },

  /** Final anchor: type only — no heavy rule (fintech reads as statement, not UI card). */
  total: {
    marginTop: PAD_ROW,
    paddingTop: PAD_ROW,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    width: "100%",
  },

  totalLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#6b7280",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingBottom: 2,
  },

  totalAmount: {
    fontSize: 17,
    fontWeight: 900,
    color: "#111111",
    textAlign: "right",
  },
});

/** Below total, above payment terms / notes — React-PDF: borderTopWidth/Color, not CSS border shorthand. */
const bankStyles = StyleSheet.create({
  container: {
    width: "100%",
    marginTop: 24,
    marginBottom: GAP_SECTION,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    alignSelf: "stretch",
    textAlign: "left",
  },

  title: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#111111",
    textAlign: "left",
  },

  row: {
    flexDirection: "row",
    marginBottom: 4,
    width: "100%",
    alignItems: "flex-start",
  },

  label: {
    width: "40%",
    fontSize: 9,
    color: "#6b7280",
    textAlign: "left",
  },

  value: {
    width: "60%",
    fontSize: 9,
    color: "#111111",
    lineHeight: 1.35,
    fontWeight: 500,
    textAlign: "left",
  },

  emptyHint: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 8,
    textAlign: "left",
  },

  paymentHint: {
    marginTop: 8,
    fontSize: 9,
    color: "#6b7280",
    textAlign: "left",
  },
});

const InvoicePDF = React.memo(function InvoicePDF({ invoice, data, currency = "ZAR" }) {
  const inv = invoice ?? data ?? null;

  if (!inv) {
    return (
      <Document>
        <Page size="A4" />
      </Document>
    );
  }

  const fmt = (value) => formatCurrency(value, currency);

  const status = (inv?.status || "draft").toString().toUpperCase();
  const paymentTerms =
    inv?.paymentTerms ||
    "Due within 15 days upon acceptance. Late payments may incur interest.";
  const items = Array.isArray(inv?.items) ? inv.items : [];
  const { subtotal, grandTotal } = calculateTotals(items);
  const hasItems = items.length > 0;

  const rawInvoiceNumber =
    inv.invoice_number != null && String(inv.invoice_number).trim() !== ""
      ? String(inv.invoice_number).trim()
      : inv.number != null && String(inv.number).trim() !== ""
        ? String(inv.number).trim()
        : "—";
  const invoiceNumberForDisplay =
    rawInvoiceNumber
      .replace(/^#:\s*/i, "")
      .replace(/^#\s*/, "")
      .trim() || "—";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>{inv.brand || "Company"}</Text>
            {inv.address ? (
              <Text style={styles.address}>{inv.address}</Text>
            ) : null}
          </View>

          <View style={styles.invoiceBlock}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{`#: ${invoiceNumberForDisplay}`}</Text>
          </View>
        </View>

        <View style={styles.headerMeta} wrap={false}>
          <View style={styles.headerMetaInner}>
            <View style={styles.headerDatesBlock}>
              <Text style={[styles.headerDateLabel, styles.headerDateLabelFirst]}>Issue date</Text>
              <Text style={styles.headerDateValue}>{inv.issuedDateFormatted || "—"}</Text>
              <Text style={styles.headerDateLabel}>Due date</Text>
              <Text style={styles.headerDateValueDue}>{inv.dueDateFormatted || "—"}</Text>
            </View>
            <Text style={styles.status}>
              {status === "PAID" ? "Paid" : status === "DRAFT" ? "Draft" : status}
            </Text>
          </View>
        </View>

        {/* Bill to */}
        <View style={[styles.billToSection, styles.gridSectionBillDates]} wrap={false}>
          <Text style={styles.sectionLabel}>BILL TO</Text>
          <View style={styles.billToUnderline} />
          <Text style={styles.clientName}>{inv.client?.name || ""}</Text>
          {inv.client?.address ? (
            <Text style={styles.clientAddress}>{inv.client.address}</Text>
          ) : null}
        </View>

        {/* Line items (full width) */}
        <View style={styles.tableSection}>
          <View style={styles.tableOuter}>
            <View style={styles.tableHeader} wrap={false}>
              <Text style={[tableStyles.colDesc, styles.tableThText]}>DESCRIPTION</Text>
              <Text style={[tableStyles.colQty, styles.tableThText]}>QTY</Text>
              <Text style={[tableStyles.colPrice, styles.tableThText, styles.tableThNumeric]}>
                PRICE
              </Text>
              <Text style={[tableStyles.colTotal, styles.tableThText, styles.tableThNumeric]}>
                TOTAL
              </Text>
            </View>

            {hasItems ? (
              items.map((item, i) => (
                <View key={i} style={tableStyles.row}>
                  <Text style={tableStyles.colDesc} wrap>
                    {formatLineItemNameAndDescription(item)}
                  </Text>
                  <Text style={tableStyles.colQty} wrap={false}>
                    {item.qty ?? ""}
                  </Text>
                  <Text style={tableStyles.colPrice} wrap={false}>
                    {fmt(item.price)}
                  </Text>
                  <Text style={tableStyles.colTotal} wrap={false}>
                    {fmt(calcLineTotal(item))}
                  </Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyBody}>
                {status === "DRAFT" ? (
                  <Text style={styles.emptyDraftLabel}>Draft</Text>
                ) : null}
                <Text style={styles.emptyText}>No items added</Text>
              </View>
            )}
          </View>
        </View>

        {/* Summary below table */}
        <View style={summaryStyles.summary}>
          <View style={summaryStyles.row}>
            <Text style={summaryStyles.subtotalText}>Subtotal</Text>
            <Text style={summaryStyles.subtotalAmount}>
              {fmt(inv.subtotal ?? subtotal)}
            </Text>
          </View>
          <View style={summaryStyles.total}>
            <Text style={summaryStyles.totalLabel}>Total</Text>
            <Text style={summaryStyles.totalAmount}>
              {fmt(inv.total ?? grandTotal)}
            </Text>
          </View>
        </View>

        {/* Bank details: after total, before terms / notes */}
        <View style={bankStyles.container} wrap={false}>
          <Text style={bankStyles.title}>Bank Details</Text>
          {inv.bankDetails &&
          (inv.bankDetails.bank ||
            inv.bankDetails.accountName ||
            inv.bankDetails.accountNumber ||
            inv.bankDetails.branchCode ||
            inv.bankDetails.swiftCode) ? (
            <>
              {inv.bankDetails.bank ? (
                <View style={bankStyles.row}>
                  <Text style={bankStyles.label}>Bank:</Text>
                  <Text style={bankStyles.value}>{inv.bankDetails.bank}</Text>
                </View>
              ) : null}
              {inv.bankDetails.accountName ? (
                <View style={bankStyles.row}>
                  <Text style={bankStyles.label}>Account Name:</Text>
                  <Text style={bankStyles.value}>{inv.bankDetails.accountName}</Text>
                </View>
              ) : null}
              {inv.bankDetails.accountNumber ? (
                <View style={bankStyles.row}>
                  <Text style={bankStyles.label}>Account Number:</Text>
                  <Text style={bankStyles.value}>{inv.bankDetails.accountNumber}</Text>
                </View>
              ) : null}
              {inv.bankDetails.branchCode ? (
                <View style={bankStyles.row}>
                  <Text style={bankStyles.label}>Branch Code:</Text>
                  <Text style={bankStyles.value}>{inv.bankDetails.branchCode}</Text>
                </View>
              ) : null}
              {inv.bankDetails.swiftCode ? (
                <View style={bankStyles.row}>
                  <Text style={bankStyles.label}>SWIFT:</Text>
                  <Text style={bankStyles.value}>{inv.bankDetails.swiftCode}</Text>
                </View>
              ) : null}
              <View style={bankStyles.row}>
                <Text style={bankStyles.label}>Reference:</Text>
                <Text style={bankStyles.value}>
                  {inv.bankDetails.reference || invoiceNumberForDisplay}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={bankStyles.emptyHint}>Bank details not specified</Text>
              <View style={bankStyles.row}>
                <Text style={bankStyles.label}>Reference:</Text>
                <Text style={bankStyles.value}>{invoiceNumberForDisplay}</Text>
              </View>
            </>
          )}
          <Text style={bankStyles.paymentHint}>
            Please use your invoice number as payment reference.
          </Text>
        </View>

        {/* Payment terms, then notes */}
        <View style={styles.notesSection}>
          {paymentTerms ? (
            <View style={inv.notes ? styles.notesBlockSpacing : undefined}>
              <Text style={styles.notesBlockTitle}>Payment terms</Text>
              <Text style={styles.notesBlockText}>{paymentTerms}</Text>
            </View>
          ) : null}
          {inv.notes ? (
            <View>
              <Text style={styles.notesBlockTitle}>Notes</Text>
              <Text style={styles.notesBlockText}>{inv.notes}</Text>
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
});

export default InvoicePDF;
