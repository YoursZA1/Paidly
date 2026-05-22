import { forwardRef, Fragment } from "react";
import invoiceTemplateDocumentCss from "./invoiceTemplateDocument.css?raw";

/**
 * Shared shell for on-screen preview, print, and html2pdf capture so layout matches everywhere.
 * @param {{ embeddedChrome?: boolean }} props — when true, omit outer card (parent already provides chrome).
 */
const InvoiceTemplateDocument = forwardRef(function InvoiceTemplateDocument(
  {
    TemplateComponent,
    invoice,
    client,
    user,
    bankingDetail,
    userCurrency,
    safeFormatDate,
    embeddedChrome = false,
  },
  ref
) {
  const outerClass = embeddedChrome
    ? "invoice-template-doc invoice-a4-root w-full min-w-0 text-card-foreground"
    : "invoice-template-doc invoice-a4-root w-full min-w-0 max-w-[210mm] mx-auto rounded-lg border border-border bg-white shadow-sm overflow-x-auto print-container";

  return (
    <Fragment>
      <style>{invoiceTemplateDocumentCss}</style>
      <div
        ref={ref}
        data-invoice-pdf-capture="true"
        className={outerClass}
        style={embeddedChrome ? undefined : { maxWidth: "210mm" }}
      >
        {/*
          No padding here: UnifiedInvoiceTemplate renders its own `.page` blocks
          which already apply A4 margins (40px 48px) via invoiceTemplateDocument.css.
          Adding padding here too would double-inset content and overflow A4 width.
        */}
        <div className="pdf-content invoice-container min-w-0">
          <TemplateComponent
            invoice={invoice}
            client={client}
            user={user}
            bankingDetail={bankingDetail}
            userCurrency={userCurrency}
            safeFormatDate={safeFormatDate}
          />
        </div>
      </div>
    </Fragment>
  );
});

export default InvoiceTemplateDocument;
