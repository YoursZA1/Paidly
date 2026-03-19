import React from 'react';
import InvoicePDF from './InvoicePDF';

/**
 * React-PDF invoice "structure" component.
 * Kept as a stable wrapper so generators can render via:
 *   pdf(<Invoice data={invoiceData} />).toBlob()
 */
const Invoice = React.memo(function Invoice({ data, currency }) {
  if (!data) return null;
  return <InvoicePDF invoice={data} currency={currency ?? data.currency ?? 'ZAR'} />;
});

export default Invoice;


