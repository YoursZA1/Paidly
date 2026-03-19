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

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#333333",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 40,
  },

  headerLeft: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    minWidth: 0,
  },

  logo: {
    width: 40,
    height: 40,
    borderRadius: 4,
    objectFit: "contain",
  },

  brandBlock: {
    flexGrow: 1,
    minWidth: 0,
  },

  brand: {
    fontSize: 18,
    fontWeight: 800,
    marginBottom: 0,
  },

  address: {
    fontSize: 9,
    color: "#777777",
    lineHeight: 1.35,
    maxWidth: 230,
  },

  headerRight: {
    alignItems: "flex-end",
    minWidth: 190,
  },

  invoiceWord: {
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: 0.3,
  },

  invoiceNumber: {
    fontSize: 10,
    fontWeight: 800,
    marginTop: 0,
  },

  invoiceNumberLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: "#999999",
    letterSpacing: 1,
  },

  status: {
    fontSize: 12,
    fontWeight: 800,
    color: "#333333",
    marginTop: 0,
    alignSelf: "flex-end",
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
    color: "#999999",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  dateValue: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: 900,
    color: "#333333",
  },

  dueDateValue: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: 900,
    color: "#E67E22",
  },

  billTo: {
    marginTop: 6,
    marginBottom: 14,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: 900,
    color: "#999999",
    marginBottom: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  clientName: {
    fontSize: 10,
    fontWeight: 900,
    marginBottom: 3,
  },

  clientAddress: {
    fontSize: 9,
    color: "#777777",
    lineHeight: 1.35,
  },

  billToUnderline: {
    width: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#333333",
    marginBottom: 14,
  },

  tableOuter: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 5,
    overflow: "hidden",
  },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },

  thDesc: {
    width: "60%",
    fontSize: 9,
    fontWeight: 900,
  },

  thQty: {
    width: "15%",
    fontSize: 9,
    fontWeight: 900,
    textAlign: "center",
  },

  thPrice: {
    width: "15%",
    fontSize: 9,
    fontWeight: 900,
    textAlign: "center",
  },

  thTotal: {
    width: "10%",
    fontSize: 9,
    fontWeight: 900,
    textAlign: "right",
  },

  row: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },

  descCell: {
    width: "60%",
    paddingRight: 10,
    flexShrink: 1,
    flexWrap: "wrap",
    lineHeight: 1.35,
  },

  qtyCell: {
    width: "15%",
    textAlign: "center",
    fontWeight: 700,
  },

  moneyCell: {
    width: "15%",
    textAlign: "center",
    fontWeight: 700,
  },

  totalCell: {
    width: "10%",
    textAlign: "right",
    fontWeight: 900,
  },

  emptyBody: {
    position: "relative",
    minHeight: 260,
    paddingHorizontal: 10,
    paddingVertical: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },

  watermark: {
    position: "absolute",
    top: 105,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 72,
    fontWeight: 900,
    color: "rgba(229,231,235,0.22)",
    transform: "rotate(-25deg)",
    marginBottom: 0,
  },

  emptyText: {
    fontSize: 14,
    fontWeight: 700,
    color: "#999999",
    marginTop: 0,
  },

  footer: {
    marginTop: 18,
    padding: 30,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
  },

  footerLeft: {
    width: "60%",
  },

  footerLabel: {
    fontSize: 8,
    fontWeight: 900,
    color: "#94A3B8",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  footerText: {
    fontSize: 9,
    color: "#94A3B8",
    lineHeight: 1.35,
    marginTop: 4,
  },

  footerDivider: {
    height: 1,
    backgroundColor: "#334155",
    width: "80%",
    marginVertical: 12,
  },

  footerRight: {
    width: "30%",
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
    color: "#94A3B8",
  },

  footerAmountDueLabel: {
    fontSize: 8,
    fontWeight: 900,
    color: "#94A3B8",
    marginBottom: 6,
  },

  footerAmountDueValue: {
    fontSize: 18,
    fontWeight: 900,
    color: "#FFFFFF",
  },
});

export default function InvoicePDF({ invoice, data, currency = "ZAR" }) {
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
  const paymentInfo = inv?.paymentInfo || "Bank details not specified";
  const paymentTerms =
    inv?.paymentTerms ||
    "Due within 15 days upon acceptance. Late payments may incur interest.";
  const items = Array.isArray(inv?.items) ? inv.items : [];
  const { subtotal, grandTotal } = calculateTotals(items);
  const hasItems = items.length > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {inv?.logo_url ? (
              <Image src={inv.logo_url} style={styles.logo} />
            ) : null}
            <View style={styles.brandBlock}>
              <Text style={styles.brand}>{inv.brand}</Text>
              <Text style={styles.address}>{inv.address}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.invoiceWord}>INVOICE</Text>
            <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
              <View>
                <Text style={styles.invoiceNumberLabel}>INVOICE NUMBER</Text>
                <Text style={styles.invoiceNumber}>{inv.number}</Text>
              </View>
              <Text style={styles.status}>
                {status === "PAID" ? "Paid" : status === "DRAFT" ? "Draft" : status}
              </Text>
            </View>
            <View style={styles.datesRow}>
              <View style={styles.dateBlock}>
                <Text style={styles.dateLabel}>ISSUED</Text>
                <Text style={styles.dateValue}>{inv.issuedDateFormatted || ""}</Text>
              </View>
              <View style={styles.dateBlock}>
                <Text style={styles.dateLabel}>DUE DATE</Text>
                <Text style={styles.dueDateValue}>{inv.dueDateFormatted || ""}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Billing */}
        <View style={styles.billTo}>
          <Text style={styles.sectionLabel}>BILL TO</Text>
          <View style={styles.billToUnderline} />
          <Text style={styles.clientName}>{inv.client?.name || ""}</Text>
          {inv.client?.address ? (
            <Text style={styles.clientAddress}>{inv.client.address}</Text>
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
            items.map((item, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.descCell}>{item.description}</Text>
                <Text style={styles.qtyCell}>{item.qty ?? ""}</Text>
                <Text style={styles.moneyCell}>{fmt(item.price)}</Text>
                <Text style={styles.totalCell}>{fmt(calcLineTotal(item))}</Text>
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

            <View style={styles.footerDivider} />

            <Text style={styles.footerLabel}>PAYMENT TERMS</Text>
            <Text style={styles.footerText}>{paymentTerms}</Text>
          </View>

          <View style={styles.footerRight}>
            <View style={styles.footerMoneyRow}>
              <Text style={styles.footerMoneyLabel}>Sub Total</Text>
              <Text style={styles.footerMoneyValue}>{fmt(inv.subtotal ?? subtotal)}</Text>
            </View>
            <Text style={styles.footerAmountDueLabel}>AMOUNT DUE</Text>
            <Text style={styles.footerAmountDueValue}>{fmt(inv.total ?? grandTotal)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
