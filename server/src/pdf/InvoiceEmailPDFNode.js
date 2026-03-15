/**
 * Server-side invoice PDF for email (plain JS, no JSX).
 * Mirrors src/components/pdf/InvoiceEmailPDF.jsx for use with renderToBuffer in Node.
 */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet
} from "@react-pdf/renderer";

const formatCurrency = (value, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency
  }).format(Number(value) || 0);

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25
  },
  title: {
    fontSize: 24,
    color: "#F15A24",
    fontWeight: "bold"
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F3E6DF",
    padding: 8
  },
  row: {
    flexDirection: "row",
    padding: 8,
    borderBottom: "1px solid #eee"
  },
  description: { width: "55%", paddingRight: 10 },
  qty: { width: "10%", textAlign: "center" },
  price: { width: "15%", textAlign: "right" },
  total: { width: "20%", textAlign: "right" },
  totalBox: { marginTop: 30, alignItems: "flex-end" },
  totalText: {
    fontSize: 20,
    color: "#F15A24",
    fontWeight: "bold"
  }
});

export default function InvoiceEmailPDF({ invoice, currency = "ZAR" }) {
  const fmt = (value) => formatCurrency(value, currency);

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(View, null, React.createElement(Text, null, invoice.brand), React.createElement(Text, null, invoice.address)),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.title }, "INVOICE"),
          React.createElement(Text, null, `#: ${invoice.number}`)
        )
      ),
      React.createElement(
        View,
        { style: styles.tableHeader, wrap: false },
        React.createElement(Text, { style: styles.description }, "DESCRIPTION"),
        React.createElement(Text, { style: styles.qty }, "QTY"),
        React.createElement(Text, { style: styles.price }, "PRICE"),
        React.createElement(Text, { style: styles.total }, "TOTAL")
      ),
      ...(invoice.items || []).map((item, i) =>
        React.createElement(
          View,
          { key: i, style: styles.row, wrap: false },
          React.createElement(Text, { style: styles.description }, item.description),
          React.createElement(Text, { style: styles.qty }, String(item.qty)),
          React.createElement(Text, { style: styles.price }, fmt(item.price)),
          React.createElement(Text, { style: styles.total }, fmt(item.total))
        )
      ),
      React.createElement(
        View,
        { style: styles.totalBox },
        React.createElement(Text, null, `Subtotal: ${fmt(invoice.subtotal)}`),
        React.createElement(Text, { style: styles.totalText }, `Total: ${fmt(invoice.total)}`)
      )
    )
  );
}
