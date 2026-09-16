import { View, Text } from "@react-pdf/renderer";

/**
 * @param {{ data: object, styles: object }} props
 */
export function PaymentDetails({ data, styles }) {
  const rows = Array.isArray(data?.bankingRows) ? data.bankingRows : [];
  if (rows.length === 0) return null;

  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionLabel}>Payment details</Text>
      {rows.map((row) => (
        <View key={`${row.label}:${row.value}`} style={styles.paymentRow}>
          {row.label ? (
            <Text style={styles.paymentLabel}>{row.label}</Text>
          ) : (
            <Text style={styles.paymentLabel}> </Text>
          )}
          <Text style={styles.paymentValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}
