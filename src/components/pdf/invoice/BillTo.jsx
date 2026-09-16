import { View, Text } from "@react-pdf/renderer";

/**
 * @param {{ data: object, styles: object }} props
 */
export function BillTo({ data, styles }) {
  const client = data?.client || {};
  const lines = [
    client.contactPerson,
    client.address,
    client.email,
    client.phone,
    client.vatNumber ? `VAT ${client.vatNumber}` : "",
  ].filter(Boolean);

  if (!client.name && lines.length === 0) return null;

  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionLabel}>Bill to</Text>
      {client.name ? <Text style={styles.clientName}>{client.name}</Text> : null}
      {lines.map((line) => (
        <Text key={line} style={styles.clientLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}
