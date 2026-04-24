import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet
} from "@react-pdf/renderer";
import { formatLineItemNameAndDescription } from "@/utils/invoiceTemplateData";
import { LOGO_CONSTRAINTS } from "@/lib/logoUpload";
import { getLogoUrl } from "@/lib/logoUrl";

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
    alignItems: "flex-start",
    marginBottom: 25
  },

  headerRight: {
    width: "48%",
    flexDirection: "column",
    alignItems: "flex-end"
  },

  title: {
    fontSize: 24,
    color: "#F15A24",
    fontWeight: "bold",
    textAlign: "right",
    width: "100%"
  },

  invoiceNumberEmail: {
    marginTop: 6,
    fontSize: 10,
    color: "#374151",
    textAlign: "right",
    width: "100%"
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

  description: {
    width: "55%",
    paddingRight: 10
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

  totalBox: {
    marginTop: 30,
    alignItems: "flex-end"
  },

  totalText: {
    fontSize: 20,
    color: "#F15A24",
    fontWeight: "bold"
  }
});

export default function InvoiceEmailPDF({ invoice, currency = "ZAR" }) {
  const fmt = (value) => formatCurrency(value, currency);
  const logoUrl = getLogoUrl(
    invoice.company?.logo_url ?? invoice.logo_url ?? invoice.owner_logo_url
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        <View style={styles.header}>
          <View>
            {logoUrl ? (
              <Image
                src={logoUrl}
                style={{
                  width: LOGO_CONSTRAINTS.PDF_LOGO_MAX_WIDTH_PX,
                  height: 80,
                  objectFit: "contain"
                }}
              />
            ) : null}
            <Text>{invoice.brand}</Text>
            <Text>{invoice.address}</Text>
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.title}>INVOICE</Text>
            <Text style={styles.invoiceNumberEmail}>{`#: ${invoice.number ?? ""}`}</Text>
          </View>
        </View>

        <View style={styles.tableHeader} wrap={false}>
          <Text style={styles.description}>DESCRIPTION</Text>
          <Text style={styles.qty}>QTY</Text>
          <Text style={styles.price}>PRICE</Text>
          <Text style={styles.total}>TOTAL</Text>
        </View>

        {invoice.items.map((item, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={styles.description}>{formatLineItemNameAndDescription(item)}</Text>
            <Text style={styles.qty}>{item.qty}</Text>
            <Text style={styles.price}>{fmt(item.price)}</Text>
            <Text style={styles.total}>{fmt(item.total)}</Text>
          </View>
        ))}

        <View style={styles.totalBox}>
          <Text>Subtotal: {fmt(invoice.subtotal)}</Text>
          <Text style={styles.totalText}>
            Total: {fmt(invoice.total)}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
