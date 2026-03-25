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
        {/* A4 inner margins for preview + html2pdf capture. Print margins are handled by @page in CSS. */}
        <div
          className="pdf-content invoice-container min-w-0"
          style={{ padding: "40px 48px" }}
        >
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
