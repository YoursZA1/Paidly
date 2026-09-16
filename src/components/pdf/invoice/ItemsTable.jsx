import { View, Text } from "@react-pdf/renderer";

/**
 * @param {{ data: object, styles: object, formatMoney: (n: number) => string, formatQty: (n: unknown) => string }} props
 */
export function ItemsTable({ data, styles, formatMoney, formatQty }) {
  const items = Array.isArray(data?.items) ? data.items : [];

  return (
    <View style={styles.table}>
      <View style={styles.tableHeader} wrap={false}>
        <Text style={[styles.colDesc, styles.tableHeaderText]}>Description</Text>
        <Text style={[styles.colQty, styles.tableHeaderText]}>Qty</Text>
        <Text style={[styles.colRate, styles.tableHeaderText]}>Rate</Text>
        <Text style={[styles.colTotal, styles.tableHeaderText]}>Total</Text>
      </View>

      {items.length === 0 ? (
        <Text style={styles.emptyItems}>No items added</Text>
      ) : (
        items.map((item, index) => (
          <View key={item.key || index} style={styles.tableRow} wrap={false}>
            <Text style={[styles.colDesc, styles.tableCell]}>{item.description}</Text>
            <Text style={[styles.colQty, styles.tableCellMuted]}>
              {formatQty(item.qty)}
            </Text>
            <Text style={[styles.colRate, styles.tableCellMuted]}>
              {formatMoney(item.price)}
            </Text>
            <Text style={[styles.colTotal, styles.tableCell]}>
              {formatMoney(item.total)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}
