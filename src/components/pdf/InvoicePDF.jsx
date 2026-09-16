import React from "react";
import InvoiceDocument from "./invoice/InvoiceDocument";

/**
 * React-PDF invoice document — thin wrapper around the premium InvoiceDocument.
 * Accepts either mapped `invoice`/`data` shape from mapInvoicePdfData.
 */
const InvoicePDF = React.memo(function InvoicePDF({ invoice, data, currency = "ZAR" }) {
  return (
    <InvoiceDocument
      invoice={invoice}
      data={data}
      currency={currency}
    />
  );
});

export default InvoicePDF;
