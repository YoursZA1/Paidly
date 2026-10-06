import { forwardRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { mergeLiveBrandingForDocuments } from "@/utils/documentPreviewData";
import { mapInvoicePdfData, mapQuotePdfData } from "@/components/pdf/mapInvoicePdfData";
import PaidlyCleanDocument from "@/components/documentPdf/PaidlyCleanDocument";
import "@/components/documentPdf/paidlyDocumentPages.css";

function normalizeDocType(doc, docTypeProp) {
  const t = (docTypeProp || doc?.type || "invoice").toString().toLowerCase();
  if (t === "quote" || t === "quotes") return "quote";
  return "invoice";
}

function recordForCleanDocument(doc, docType) {
  const items =
    Array.isArray(doc.items) && doc.items.length > 0
      ? doc.items
      : Array.isArray(doc.line_items)
        ? doc.line_items
        : [];
  const number = doc.invoice_number || doc.quote_number || doc.number || doc.reference_number || "";
  return {
    ...doc,
    items,
    invoice_number: docType === "quote" ? doc.invoice_number : number,
    quote_number: docType === "quote" ? number : doc.quote_number,
    invoice_date: doc.invoice_date || doc.issue_date || doc.created_at,
    created_at: doc.created_at || doc.issue_date || doc.invoice_date,
    delivery_date: docType === "quote" ? doc.valid_until || doc.due_date : doc.delivery_date || doc.due_date,
    valid_until: doc.valid_until || doc.due_date,
    due_date: doc.due_date || doc.valid_until || doc.delivery_date,
    total_amount: doc.total_amount ?? doc.total,
    subtotal: doc.subtotal,
    tax_amount: doc.tax_amount,
    tax_rate: doc.tax_rate,
    discount_amount: doc.discount_amount ?? doc.discount,
    owner_company_name: doc.owner_company_name || doc.company_name,
    owner_company_address: doc.owner_company_address || doc.company_address,
    owner_email: doc.owner_email || doc.company_email,
    owner_phone: doc.owner_phone || doc.company_phone,
    owner_vat_number: doc.owner_vat_number || doc.vat_number || doc.company_vat,
    owner_logo_url: doc.owner_logo_url || doc.document_logo_url || doc.logo_url,
    client_name: doc.client_name,
    client_email: doc.client_email,
    client_phone: doc.client_phone,
  };
}

/**
 * Paidly "Clean & professional" preview for invoices and quotes.
 * Same document as the PDF: bill to, line items, payment details, and terms.
 */
const DocumentPreview = forwardRef(function DocumentPreview(
  { doc, docType: docTypeProp, clients = [], user, bankingDetail = null, hideStatus = false },
  ref
) {
  const { user: authUser } = useAuth();
  const effectiveUser = useMemo(
    () => mergeLiveBrandingForDocuments(user, authUser),
    [user, authUser]
  );

  const data = useMemo(() => {
    if (!doc) return null;
    const docType = normalizeDocType(doc, docTypeProp);
    const clientFromList =
      doc.client_id && Array.isArray(clients) ? clients.find((c) => c.id === doc.client_id) : null;
    const client = {
      ...(clientFromList || {}),
      name: doc.client_name || clientFromList?.name || "",
      email: doc.client_email || clientFromList?.email || "",
      phone: doc.client_phone || clientFromList?.phone || clientFromList?.mobile || "",
      address: doc.client_address || clientFromList?.address || clientFromList?.billing_address || "",
      contact_person:
        doc.contact_person || clientFromList?.contact_person || clientFromList?.contact_name || "",
      vat_number: doc.client_vat || clientFromList?.vat_number || clientFromList?.tax_id || "",
      tax_id: doc.client_vat || clientFromList?.tax_id || clientFromList?.vat_number || "",
    };
    const record = recordForCleanDocument(doc, docType);
    const mapped =
      docType === "quote"
        ? mapQuotePdfData(record, client, effectiveUser, bankingDetail)
        : mapInvoicePdfData(record, client, effectiveUser, bankingDetail);
    return hideStatus ? { ...mapped, statusLabel: "" } : mapped;
  }, [doc, docTypeProp, clients, effectiveUser, bankingDetail, hideStatus]);

  if (!doc || !data) return null;

  return (
    <div
      ref={ref}
      className="document-preview-styled paidly-doc-sheet"
      data-paidly-doc-ready="true"
      data-invoice-pdf-capture="true"
    >
      <section className="paidly-doc-page">
        <PaidlyCleanDocument data={data} />
      </section>
    </div>
  );
});

DocumentPreview.displayName = "DocumentPreview";

export default DocumentPreview;
