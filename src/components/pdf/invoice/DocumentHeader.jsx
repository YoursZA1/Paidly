import { View, Text, Image } from "@react-pdf/renderer";

/**
 * @param {{ data: object, styles: object }} props
 */
export function DocumentHeader({ data, styles }) {
  const issuer = data?.issuer || {};
  const lines = [
    issuer.address,
    issuer.email,
    issuer.phone,
    issuer.website,
    issuer.vatNumber ? `VAT ${issuer.vatNumber}` : "",
    issuer.registrationNumber ? `Reg ${issuer.registrationNumber}` : "",
  ].filter(Boolean);

  return (
    <View style={styles.header} wrap={false}>
      <View style={styles.headerLeft}>
        {data?.logo_url ? (
          <Image src={data.logo_url} style={styles.logo} />
        ) : null}
        {issuer.name ? <Text style={styles.brandName}>{issuer.name}</Text> : null}
        {lines.map((line) => (
          <Text key={line} style={styles.issuerLine}>
            {line}
          </Text>
        ))}
      </View>

      <View style={styles.headerRight}>
        <Text style={styles.invoiceTitle}>INVOICE</Text>
        <Text style={styles.invoiceNumber}>{data?.number || "—"}</Text>

        {data?.issuedDateFormatted ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Issued</Text>
            <Text style={styles.metaValue}>{data.issuedDateFormatted}</Text>
          </View>
        ) : null}

        {data?.dueDateFormatted ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Due</Text>
            <Text style={styles.metaValue}>{data.dueDateFormatted}</Text>
          </View>
        ) : null}

        {data?.statusLabel ? (
          <Text style={styles.statusText}>{data.statusLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}
