import { View, Text } from "@react-pdf/renderer";

/**
 * Fixed footer on every page.
 * @param {{ data: object, styles: object }} props
 */
export function DocumentFooter({ data, styles }) {
  const brand = data?.issuer?.name || "";
  const number = data?.number || "";

  return (
    <View style={styles.pageFooter} fixed>
      <Text style={styles.footerText}>
        {[brand, number ? `Invoice ${number}` : ""].filter(Boolean).join(" · ")}
      </Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
      <Text style={styles.footerBrand}>Generated with Paidly</Text>
    </View>
  );
}
