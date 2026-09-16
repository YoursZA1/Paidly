/**
 * Server-side invoice PDF for nodemailer (plain JS, no JSX / no Vite aliases).
 * Visual parity with src/components/pdf/invoice/InvoiceDocument.jsx.
 * Canonical browser/email send path uses generateInvoicePDF → @react-pdf InvoiceDocument.
 */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
const colours = {
  text: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  border: "#e5e7eb",
  borderStrong: "#d1d5db",
  tableHeaderBg: "#f9fafb",
};

function formatMoney(value, currency = "ZAR") {
  const n = Number(value);
  const amount = Number.isFinite(n) ? n : 0;
  try {
    if (currency === "ZAR") {
      return new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
      }).format(amount);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `R${amount.toFixed(2)}`;
  }
}

function createStyles(accent) {
  return StyleSheet.create({
    page: {
      paddingTop: 40,
      paddingHorizontal: 40,
      paddingBottom: 56,
      fontSize: 9.5,
      fontFamily: "Helvetica",
      color: colours.text,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.xl,
      paddingBottom: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colours.border,
      borderBottomStyle: "solid",
    },
    headerLeft: { width: "54%", paddingRight: spacing.md },
    headerRight: { width: "44%", alignItems: "flex-end" },
    logo: { maxWidth: 140, maxHeight: 48, marginBottom: spacing.sm, objectFit: "contain" },
    brandName: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: spacing.xs },
    issuerLine: { fontSize: 9.5, color: colours.textSecondary, lineHeight: 1.4, marginBottom: 1 },
    invoiceTitle: {
      fontSize: 26,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 1.2,
      textAlign: "right",
      marginBottom: spacing.xs,
    },
    invoiceNumber: {
      fontSize: 13,
      fontFamily: "Helvetica-Bold",
      textAlign: "right",
      marginBottom: spacing.md,
    },
    metaRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 3, width: "100%" },
    metaLabel: {
      fontSize: 8,
      color: colours.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginRight: spacing.sm,
    },
    metaValue: { fontSize: 9.5, textAlign: "right", minWidth: 88 },
    statusText: {
      marginTop: spacing.sm,
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: colours.textSecondary,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      textAlign: "right",
    },
    section: { marginBottom: spacing.xl },
    sectionLabel: {
      fontSize: 8.5,
      fontFamily: "Helvetica-Bold",
      color: accent,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: spacing.sm,
    },
    clientName: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
    clientLine: { fontSize: 9.5, color: colours.textSecondary, lineHeight: 1.4, marginBottom: 1 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: colours.tableHeaderBg,
      borderBottomWidth: 1,
      borderBottomColor: colours.borderStrong,
      borderBottomStyle: "solid",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    tableHeaderText: {
      fontSize: 8.5,
      fontFamily: "Helvetica-Bold",
      color: colours.textSecondary,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colours.border,
      borderBottomStyle: "solid",
    },
    colDesc: { width: "48%", paddingRight: spacing.sm, fontSize: 9 },
    colQty: { width: "12%", textAlign: "right", fontSize: 9, color: colours.textSecondary },
    colRate: { width: "20%", textAlign: "right", fontSize: 9, color: colours.textSecondary },
    colTotal: { width: "20%", textAlign: "right", fontSize: 9 },
    totalsWrap: { alignItems: "flex-end", marginBottom: spacing.xl, marginTop: spacing.sm },
    totalsBox: { width: 220 },
    totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
    totalsLabel: { fontSize: 9.5, color: colours.textSecondary },
    totalsValue: { fontSize: 9.5, textAlign: "right" },
    totalsDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colours.borderStrong,
      borderBottomStyle: "solid",
      marginVertical: spacing.sm,
    },
    totalsDueRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    totalsDueLabel: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    totalsDueValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: accent, textAlign: "right" },
    paymentRow: { flexDirection: "row", marginBottom: spacing.sm },
    paymentLabel: {
      width: "38%",
      fontSize: 8,
      color: colours.textMuted,
      textTransform: "uppercase",
      paddingRight: spacing.sm,
    },
    paymentValue: { width: "62%", fontSize: 9.5 },
    notesTitle: {
      fontSize: 8.5,
      fontFamily: "Helvetica-Bold",
      color: colours.textSecondary,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: spacing.xs,
    },
    notesText: {
      fontSize: 9.5,
      color: colours.textSecondary,
      lineHeight: 1.45,
      marginBottom: spacing.md,
    },
    pageFooter: {
      position: "absolute",
      left: 40,
      right: 40,
      bottom: 18,
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: colours.border,
      borderTopStyle: "solid",
      paddingTop: spacing.sm,
    },
    footerText: { fontSize: 7.5, color: colours.textMuted },
  });
}

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

export default function InvoiceEmailPDF({ invoice, currency = "ZAR" }) {
  const inv = invoice || {};
  const currencyCode = currency || inv.currency || "ZAR";
  const accent = str(inv.brandPrimary) || "#f24e00";
  const styles = createStyles(accent);
  const issuer = inv.issuer || {};
  const client = inv.client || {};
  const items = Array.isArray(inv.items) ? inv.items : [];
  const bankingRows = Array.isArray(inv.bankingRows) ? inv.bankingRows : [];
  const fmt = (v) => formatMoney(v, currencyCode);

  const issuerLines = [
    issuer.address || inv.address,
    issuer.email,
    issuer.phone,
    issuer.website,
    issuer.vatNumber ? `VAT ${issuer.vatNumber}` : "",
  ].filter(Boolean);

  const clientLines = [
    client.contactPerson,
    client.address,
    client.email,
    client.phone,
    client.vatNumber ? `VAT ${client.vatNumber}` : "",
  ].filter(Boolean);

  const discount = Number(inv.discount_amount) || 0;
  const taxAmount = Number(inv.tax_amount) || 0;
  const taxRate = Number(inv.tax_rate) || 0;
  const amountPaid = Number(inv.amount_paid) || 0;

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page, wrap: true },
      React.createElement(
        View,
        { style: styles.header, wrap: false },
        React.createElement(
          View,
          { style: styles.headerLeft },
          inv.logo_url
            ? React.createElement(Image, { src: inv.logo_url, style: styles.logo })
            : null,
          React.createElement(Text, { style: styles.brandName }, issuer.name || inv.brand || "Company"),
          ...issuerLines.map((line) =>
            React.createElement(Text, { key: line, style: styles.issuerLine }, line)
          )
        ),
        React.createElement(
          View,
          { style: styles.headerRight },
          React.createElement(Text, { style: styles.invoiceTitle }, "INVOICE"),
          React.createElement(Text, { style: styles.invoiceNumber }, inv.number || "—"),
          inv.issuedDateFormatted
            ? React.createElement(
                View,
                { style: styles.metaRow },
                React.createElement(Text, { style: styles.metaLabel }, "Issued"),
                React.createElement(Text, { style: styles.metaValue }, inv.issuedDateFormatted)
              )
            : null,
          inv.dueDateFormatted
            ? React.createElement(
                View,
                { style: styles.metaRow },
                React.createElement(Text, { style: styles.metaLabel }, "Due"),
                React.createElement(Text, { style: styles.metaValue }, inv.dueDateFormatted)
              )
            : null,
          inv.statusLabel
            ? React.createElement(Text, { style: styles.statusText }, inv.statusLabel)
            : null
        )
      ),
      React.createElement(
        View,
        { style: styles.section, wrap: false },
        React.createElement(Text, { style: styles.sectionLabel }, "Bill to"),
        client.name
          ? React.createElement(Text, { style: styles.clientName }, client.name)
          : null,
        ...clientLines.map((line) =>
          React.createElement(Text, { key: line, style: styles.clientLine }, line)
        )
      ),
      React.createElement(
        View,
        { style: styles.tableHeader, wrap: false },
        React.createElement(Text, { style: [styles.colDesc, styles.tableHeaderText] }, "Description"),
        React.createElement(Text, { style: [styles.colQty, styles.tableHeaderText] }, "Qty"),
        React.createElement(Text, { style: [styles.colRate, styles.tableHeaderText] }, "Rate"),
        React.createElement(Text, { style: [styles.colTotal, styles.tableHeaderText] }, "Total")
      ),
      ...items.map((item, i) =>
        React.createElement(
          View,
          { key: i, style: styles.tableRow, wrap: false },
          React.createElement(Text, { style: styles.colDesc }, item.description || "Item"),
          React.createElement(Text, { style: styles.colQty }, String(item.qty ?? item.quantity ?? 1)),
          React.createElement(Text, { style: styles.colRate }, fmt(item.price)),
          React.createElement(Text, { style: styles.colTotal }, fmt(item.total))
        )
      ),
      React.createElement(
        View,
        { style: styles.totalsWrap, wrap: false },
        React.createElement(
          View,
          { style: styles.totalsBox },
          React.createElement(
            View,
            { style: styles.totalsRow },
            React.createElement(Text, { style: styles.totalsLabel }, "Subtotal"),
            React.createElement(Text, { style: styles.totalsValue }, fmt(inv.subtotal))
          ),
          discount > 0
            ? React.createElement(
                View,
                { style: styles.totalsRow },
                React.createElement(Text, { style: styles.totalsLabel }, "Discount"),
                React.createElement(Text, { style: styles.totalsValue }, `-${fmt(discount)}`)
              )
            : null,
          taxAmount > 0 || taxRate > 0
            ? React.createElement(
                View,
                { style: styles.totalsRow },
                React.createElement(
                  Text,
                  { style: styles.totalsLabel },
                  taxRate > 0 ? `VAT (${taxRate}%)` : "VAT"
                ),
                React.createElement(Text, { style: styles.totalsValue }, fmt(taxAmount))
              )
            : null,
          React.createElement(View, { style: styles.totalsDivider }),
          React.createElement(
            View,
            { style: styles.totalsDueRow },
            React.createElement(Text, { style: styles.totalsDueLabel }, "Total due"),
            React.createElement(Text, { style: styles.totalsDueValue }, fmt(inv.total))
          ),
          amountPaid > 0
            ? React.createElement(
                View,
                { style: styles.totalsRow },
                React.createElement(Text, { style: styles.totalsLabel }, "Amount paid"),
                React.createElement(Text, { style: styles.totalsValue }, fmt(amountPaid))
              )
            : null
        )
      ),
      bankingRows.length
        ? React.createElement(
            View,
            { style: styles.section, wrap: false },
            React.createElement(Text, { style: styles.sectionLabel }, "Payment details"),
            ...bankingRows.map((row) =>
              React.createElement(
                View,
                { key: `${row.label}:${row.value}`, style: styles.paymentRow },
                React.createElement(Text, { style: styles.paymentLabel }, row.label || " "),
                React.createElement(Text, { style: styles.paymentValue }, row.value)
              )
            )
          )
        : null,
      inv.paymentTerms || inv.notes
        ? React.createElement(
            View,
            { style: styles.section },
            inv.paymentTerms
              ? React.createElement(
                  View,
                  null,
                  React.createElement(Text, { style: styles.notesTitle }, "Terms"),
                  React.createElement(Text, { style: styles.notesText }, inv.paymentTerms)
                )
              : null,
            inv.notes
              ? React.createElement(
                  View,
                  null,
                  React.createElement(Text, { style: styles.notesTitle }, "Notes"),
                  React.createElement(Text, { style: styles.notesText }, inv.notes)
                )
              : null
          )
        : null,
      React.createElement(
        View,
        { style: styles.pageFooter, fixed: true },
        React.createElement(
          Text,
          { style: styles.footerText },
          [issuer.name || inv.brand, inv.number ? `Invoice ${inv.number}` : ""]
            .filter(Boolean)
            .join(" · ")
        ),
        React.createElement(Text, {
          style: styles.footerText,
          render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`,
        }),
        React.createElement(Text, { style: styles.footerText }, "Generated with Paidly")
      )
    )
  );
}
