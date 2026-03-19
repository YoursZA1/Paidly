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
    padding: 28,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#0F172A",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },

  headerLeft: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    minWidth: 0,
  },

  logo: {
    width: 46,
    height: 46,
    objectFit: "contain",
  },

  brandBlock: {
    flexGrow: 1,
    minWidth: 0,
  },

  brand: {
    fontSize: 14,
    fontWeight: 800,
    marginBottom: 2,
  },

  address: {
    fontSize: 9,
    color: "#64748B",
    lineHeight: 1.25,
    maxWidth: 230,
  },

  headerRight: {
    alignItems: "flex-end",
    minWidth: 180,
  },

  invoiceWord: {
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: 0.2,
  },

  invoiceNumber: {
    fontSize: 10,
    fontWeight: 800,
    marginTop: 4,
  },

  status: {
    fontSize: 10,
    fontWeight: 800,
    color: "#334155",
    marginTop: 2,
  },

  datesRow: {
    flexDirection: "row",
    gap: 18,
    marginTop: 10,
  },

  dateBlock: {
    alignItems: "flex-start",
  },

  dateLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: "#64748B",
    letterSpacing: 0.3,
  },

  dateValue: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: 900,
    color: "#0F172A",
  },

  billTo: {
    marginTop: 6,
    marginBottom: 14,
  },

  sectionLabel: {
    fontSize: 9,
    fontWeight: 900,
    color: "#64748B",
    marginBottom: 6,
    letterSpacing: 0.35,
  },

  clientName: {
    fontSize: 10,
    fontWeight: 900,
    marginBottom: 3,
  },

  clientAddress: {
    fontSize: 9,
    color: "#64748B",
    lineHeight: 1.3,
  },

  tableOuter: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    overflow: "hidden",
  },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },

  thDesc: {
    width: "55%",
    fontSize: 9,
    fontWeight: 900,
  },

  thQty: {
    width: "10%",
    fontSize: 9,
    fontWeight: 900,
    textAlign: "center",
  },

  thPrice: {
    width: "15%",
    fontSize: 9,
    fontWeight: 900,
    textAlign: "right",
  },

  thTotal: {
    width: "20%",
    fontSize: 9,
    fontWeight: 900,
    textAlign: "right",
  },

  row: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
  },

  descCell: {
    width: "55%",
    paddingRight: 8,
    flexShrink: 1,
    flexWrap: "wrap",
    lineHeight: 1.35,
  },

  qtyCell: {
    width: "10%",
    textAlign: "center",
    fontWeight: 700,
  },

  moneyCell: {
    width: "15%",
    textAlign: "right",
    fontWeight: 700,
  },

  totalCell: {
    width: "20%",
    textAlign: "right",
    fontWeight: 900,
  },

  emptyBody: {
    minHeight: 260,
    paddingHorizontal: 10,
    paddingVertical: 26,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },

  watermark: {
    fontSize: 44,
    fontWeight: 900,
    color: "#E5E7EB",
    marginBottom: 18,
  },

  emptyText: {
    fontSize: 12,
    fontWeight: 800,
    color: "#94A3B8",
  },

  footer: {
    marginTop: 18,
    padding: 18,
    backgroundColor: "#0B1D33",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
  },

  footerLeft: {
    flexGrow: 1,
    maxWidth: 330,
  },

  footerLabel: {
    fontSize: 9,
    fontWeight: 900,
    color: "#CBD5E1",
    letterSpacing: 0.35,
  },

  footerText: {
    fontSize: 9,
    color: "#94A3B8",
    lineHeight: 1.35,
    marginTop: 6,
  },

  footerSpacer: {
    height: 14,
  },

  footerRight: {
    minWidth: 130,
    alignItems: "flex-end",
  },

  footerMoneyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 10,
  },

  footerMoneyLabel: {
    fontSize: 9,
    fontWeight: 900,
    color: "#94A3B8",
  },

  footerMoneyValue: {
    fontSize: 10,
    fontWeight: 900,
    color: "#FFFFFF",
  },

  footerAmountDueLabel: {
    fontSize: 9,
    fontWeight: 900,
    color: "#CBD5E1",
    marginBottom: 6,
  },

  footerAmountDueValue: {
    fontSize: 18,
    fontWeight: 900,
    color: "#FFFFFF",
  },
});

export default function InvoicePDF({ invoice, currency = "ZAR" }) {
  const fmt = (value) => formatCurrency(value, currency);

  const status = (invoice?.status || "draft").toString().toUpperCase();
  const paymentInfo = invoice?.paymentInfo || "Bank details not specified";
  const paymentTerms =
    invoice?.paymentTerms ||
    "Due within 15 days upon acceptance. Late payments may incur interest.";
  const hasItems = Array.isArray(invoice?.items) && invoice.items.length > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {invoice?.logo_url ? (
              <Image src={invoice.logo_url} style={styles.logo} />
            ) : null}
            <View style={styles.brandBlock}>
              <Text style={styles.brand}>{invoice.brand}</Text>
              <Text style={styles.address}>{invoice.address}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.invoiceWord}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>#{invoice.number}</Text>
            <Text style={styles.status}>
              {status === "PAID" ? "Paid" : status === "DRAFT" ? "Draft" : status}
            </Text>
            <View style={styles.datesRow}>
              <View style={styles.dateBlock}>
                <Text style={styles.dateLabel}>ISSUED</Text>
                <Text style={styles.dateValue}>{invoice.issuedDateFormatted || ""}</Text>
              </View>
              <View style={styles.dateBlock}>
                <Text style={styles.dateLabel}>DUE DATE</Text>
                <Text style={styles.dateValue}>{invoice.dueDateFormatted || ""}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Billing */}
        <View style={styles.billTo}>
          <Text style={styles.sectionLabel}>BILL TO</Text>
          <Text style={styles.clientName}>{invoice.client?.name || ""}</Text>
          {invoice.client?.address ? (
            <Text style={styles.clientAddress}>{invoice.client.address}</Text>
          ) : null}
        </View>

        {/* Table */}
        <View style={styles.tableOuter}>
          <View style={styles.tableHeader} wrap={false}>
            <Text style={styles.thDesc}>DESCRIPTION</Text>
            <Text style={styles.thQty}>QTY</Text>
            <Text style={styles.thPrice}>PRICE</Text>
            <Text style={styles.thTotal}>TOTAL</Text>
          </View>

          {hasItems ? (
            invoice.items.map((item, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.descCell}>{item.description}</Text>
                <Text style={styles.qtyCell}>{item.qty}</Text>
                <Text style={styles.moneyCell}>{fmt(item.price)}</Text>
                <Text style={styles.totalCell}>{fmt(item.total)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyBody}>
              {status === "DRAFT" ? <Text style={styles.watermark}>DRAFT</Text> : null}
              <Text style={styles.emptyText}>No items added</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerLabel}>PAYMENT INFO</Text>
            <Text style={styles.footerText}>{paymentInfo}</Text>

            <View style={styles.footerSpacer} />

            <Text style={styles.footerLabel}>PAYMENT TERMS</Text>
            <Text style={styles.footerText}>{paymentTerms}</Text>
          </View>

          <View style={styles.footerRight}>
            <View style={styles.footerMoneyRow}>
              <Text style={styles.footerMoneyLabel}>Sub Total</Text>
              <Text style={styles.footerMoneyValue}>{fmt(invoice.subtotal)}</Text>
            </View>
            <Text style={styles.footerAmountDueLabel}>AMOUNT DUE</Text>
            <Text style={styles.footerAmountDueValue}>{fmt(invoice.total)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
