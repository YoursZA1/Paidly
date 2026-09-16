import { View, Text } from "@react-pdf/renderer";

/**
 * Displays stored invoice totals only — does not recalculate.
 * @param {{ data: object, styles: object, formatMoney: (n: number) => string }} props
 */
export function Totals({ data, styles, formatMoney }) {
  const subtotal = Number(data?.subtotal) || 0;
  const discount = Number(data?.discount_amount) || 0;
  const taxAmount = Number(data?.tax_amount) || 0;
  const taxRate = Number(data?.tax_rate) || 0;
  const total = Number(data?.total) || 0;
  const amountPaid = Number(data?.amount_paid) || 0;
  const balanceDue =
    data?.balance_due != null && data.balance_due !== ""
      ? Number(data.balance_due)
      : null;

  return (
    <View style={styles.totalsWrap} wrap={false}>
      <View style={styles.totalsBox}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{formatMoney(subtotal)}</Text>
        </View>

        {discount > 0 ? (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Discount</Text>
            <Text style={styles.totalsValue}>-{formatMoney(discount)}</Text>
          </View>
        ) : null}

        {taxAmount > 0 || taxRate > 0 ? (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>
              {taxRate > 0 ? `VAT (${taxRate}%)` : "VAT"}
            </Text>
            <Text style={styles.totalsValue}>{formatMoney(taxAmount)}</Text>
          </View>
        ) : null}

        <View style={styles.totalsDivider} />

        <View style={styles.totalsDueRow}>
          <Text style={styles.totalsDueLabel}>Total due</Text>
          <Text style={styles.totalsDueValue}>{formatMoney(total)}</Text>
        </View>

        {amountPaid > 0 ? (
          <View style={styles.totalsSubRow}>
            <Text style={styles.totalsLabel}>Amount paid</Text>
            <Text style={styles.totalsValue}>{formatMoney(amountPaid)}</Text>
          </View>
        ) : null}

        {balanceDue != null && Number.isFinite(balanceDue) && amountPaid > 0 ? (
          <View style={styles.totalsSubRow}>
            <Text style={styles.totalsLabel}>Balance due</Text>
            <Text style={styles.totalsValue}>{formatMoney(balanceDue)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
