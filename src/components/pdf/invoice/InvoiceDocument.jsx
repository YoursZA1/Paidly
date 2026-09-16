import React from "react";
import { Document, Page } from "@react-pdf/renderer";
import { formatCurrency } from "@/components/CurrencySelector";
import { formatDocumentLineQuantity } from "@/utils/documentInvoiceDisplay";
import { createDocumentTheme } from "./documentTheme";
import { createInvoiceStyles } from "./invoiceStyles";
import { DocumentHeader } from "./DocumentHeader";
import { BillTo } from "./BillTo";
import { ItemsTable } from "./ItemsTable";
import { Totals } from "./Totals";
import { PaymentDetails } from "./PaymentDetails";
import { NotesAndTerms } from "./NotesAndTerms";
import { DocumentFooter } from "./DocumentFooter";

/**
 * Premium Paidly invoice PDF document (A4, multi-page safe).
 * Expects the mapped shape from mapInvoicePdfData / mapToInvoiceData.
 */
const InvoiceDocument = React.memo(function InvoiceDocument({
  invoice,
  data,
  currency,
}) {
  const inv = invoice ?? data ?? null;
  if (!inv) {
    return (
      <Document>
        <Page size="A4" />
      </Document>
    );
  }

  const currencyCode = currency || inv.currency || "ZAR";
  const theme = createDocumentTheme(inv.brandPrimary);
  const styles = createInvoiceStyles(theme);
  const formatMoney = (value) => formatCurrency(Number(value) || 0, currencyCode);

  return (
    <Document
      title={`Invoice ${inv.number || ""}`.trim()}
      author={inv.issuer?.name || "Paidly"}
      creator="Paidly"
    >
      <Page size="A4" style={styles.page} wrap>
        <DocumentHeader data={inv} styles={styles} />
        <BillTo data={inv} styles={styles} />
        <ItemsTable
          data={inv}
          styles={styles}
          formatMoney={formatMoney}
          formatQty={formatDocumentLineQuantity}
        />
        <Totals data={inv} styles={styles} formatMoney={formatMoney} />
        <PaymentDetails data={inv} styles={styles} />
        <NotesAndTerms data={inv} styles={styles} />
        <DocumentFooter data={inv} styles={styles} />
      </Page>
    </Document>
  );
});

export default InvoiceDocument;
