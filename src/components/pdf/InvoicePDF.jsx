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
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica"
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20
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
    marginBottom: 20
  },

  table: {
    width: "100%",
    borderTop: "1px solid #ddd",
    marginTop: 20
  },

  tableRow: {
    flexDirection: "row",
    borderBottom: "1px solid #eee",
    padding: 8
  },

  description: {
    width: "55%",
    paddingRight: 10,
    lineHeight: 1.4
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
    padding: 8,
    fontWeight: "bold"
  },

  totals: {
    marginTop: 30,
    alignItems: "flex-end"
  },

  grandTotal: {
    fontSize: 22,
    color: "#F15A24",
    fontWeight: "bold"
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
          <Text>Subtotal: {fmt(invoice.subtotal)}</Text>
          <Text style={styles.grandTotal}>
            Total: {fmt(invoice.total)}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
