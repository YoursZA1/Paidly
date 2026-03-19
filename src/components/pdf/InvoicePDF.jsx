import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Image
} from "@react-pdf/renderer";

const formatCurrency = (value, currency = "ZAR") =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency
  }).format(Number(value) || 0);

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica"
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16
  },

  brand: {
    fontSize: 16,
    fontWeight: "bold"
  },

  invoiceTitle: {
    fontSize: 22,
    color: "#F15A24",
    fontWeight: "bold"
  },

  section: {
    marginBottom: 14
  },

  table: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    marginTop: 14
  },

  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 7,
    paddingHorizontal: 0
  },

  description: {
    width: "55%",
    paddingRight: 8,
    flexShrink: 1,
    flexWrap: "wrap",
    lineHeight: 1.35
  },

  qty: {
    width: "10%",
    textAlign: "center"
  },

  price: {
    width: "15%",
    textAlign: "right"
  },

  total: {
    width: "20%",
    textAlign: "right"
  },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F5E5DC",
    paddingVertical: 7,
    paddingHorizontal: 0,
    fontWeight: "bold"
  },

  totals: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    alignItems: "flex-end"
  },

  moneyRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    marginBottom: 6
  },

  moneyLabel: {
    width: "55%",
    color: "#333"
  },

  moneyValue: {
    width: "45%",
    textAlign: "right"
  },

  grandTotalValue: {
    fontSize: 18,
    color: "#F15A24",
    fontWeight: "bold"
  },

  notesSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#eee"
  },

  notesTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 6,
    color: "#333"
  },

  notesText: {
    fontSize: 9,
    lineHeight: 1.4,
    color: "#555"
  }
});

export default function InvoicePDF({ invoice, currency = "ZAR" }) {
  const fmt = (value) => formatCurrency(value, currency);

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{invoice.brand}</Text>
            <Text>{invoice.address}</Text>
          </View>

          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text>#: {invoice.number}</Text>
          </View>
        </View>

        {/* Billing */}
        <View style={styles.section}>
          <Text>BILLED TO</Text>
          <Text>{invoice.client.name}</Text>
          <Text>{invoice.client.address}</Text>
        </View>

        {/* Table: wrap={false} on rows so long invoices break between rows, not mid-row */}
        <View style={styles.table}>
          <View style={styles.tableHeader} wrap={false}>
            <Text style={styles.description}>DESCRIPTION</Text>
            <Text style={styles.qty}>QTY</Text>
            <Text style={styles.price}>PRICE</Text>
            <Text style={styles.total}>TOTAL</Text>
          </View>

          {invoice.items.map((item, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={styles.description}>
                {item.description}
              </Text>

              <Text style={styles.qty}>
                {item.qty}
              </Text>

              <Text style={styles.price}>
                {fmt(item.price)}
              </Text>

              <Text style={styles.total}>
                {fmt(item.total)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.moneyRow}>
            <Text style={styles.moneyLabel}>Subtotal</Text>
            <Text style={styles.moneyValue}>{fmt(invoice.subtotal)}</Text>
          </View>
          <View style={[styles.moneyRow, { marginBottom: 0 }]}>
            <Text style={styles.moneyLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{fmt(invoice.total)}</Text>
          </View>
        </View>

        {/* Notes: invoice notes + service/line item notes */}
        {invoice.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

      </Page>
    </Document>
  );
}
