import { useRef, useState, useMemo } from "react";
import { format, parseISO, isValid } from "date-fns";
import { effectiveInvoiceTermsForDisplay } from "@/constants/invoiceTerms";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import generatePdfFromElement from "@/utils/generatePdfFromElement";
import DocumentPreview from "@/components/DocumentPreview";
import { recordToStyledPreviewDoc } from "@/utils/documentPreviewData";
import { buildInvoiceTemplatePdfCaptureProps } from "./InvoiceTemplatePdfCapture";
import { formatLineItemNameAndDescription } from "@/utils/invoiceTemplateData";

function bankBlockFromBankingRow(bankingDetail, refNumber) {
  if (!bankingDetail) return null;
  const hasRow =
    bankingDetail.bank_name ||
    bankingDetail.account_name ||
    bankingDetail.account_number ||
    bankingDetail.routing_number ||
    bankingDetail.branch_code ||
    bankingDetail.swift_code;
  if (!hasRow) return null;
  return {
    bank: bankingDetail.bank_name || "",
    accountName: bankingDetail.account_name || "",
    accountNumber: bankingDetail.account_number || "",
    branchCode: bankingDetail.routing_number || bankingDetail.branch_code || "",
    swiftCode: bankingDetail.swift_code || "",
    reference: refNumber,
  };
}

/** Profile default: `user.business` with bank_name, account_name, account_number, branch_code. */
function bankBlockFromUserBusiness(business, refNumber) {
  if (!business || typeof business !== "object") return null;
  const has =
    business.bank_name ||
    business.account_name ||
    business.account_number ||
    business.branch_code ||
    business.routing_number ||
    business.swift_code;
  if (!has) return null;
  return {
    bank: business.bank_name || "",
    accountName: business.account_name || "",
    accountNumber: business.account_number || "",
    branchCode: business.branch_code || business.routing_number || "",
    swiftCode: business.swift_code || "",
    reference: refNumber,
  };
}

/**
 * Maps app invoice + client + user to a compact shape for email copy, server PDFs, and legacy tooling.
 * @param {object|null} bankingDetail — optional row from BankingDetail.get (bank_name, account_name, etc.)
 */
export function mapToInvoiceData(invoice, client, user, bankingDetail = null) {
  const brand = user?.company_name || invoice?.owner_company_name || "Company";
  const address = user?.company_address || invoice?.owner_company_address || "";
  const number = invoice?.invoice_number || invoice?.reference_number || "—";
  const logo_url =
    user?.logo_url ||
    user?.company_logo_url ||
    invoice?.owner_logo_url ||
    invoice?.owner_company_logo_url ||
    invoice?.logo_url ||
    invoice?.company?.logo_url ||
    null;
  const status = (invoice?.status || "draft").toString();
  const clientName = client?.name || "Client";
  const clientAddress =
    client?.address ||
    [client?.address_line1, client?.city, client?.postal_code]
      .filter(Boolean)
      .join(", ") ||
    client?.email ||
    "";

  const rawItems = invoice?.items || [];
  const items = rawItems.map((item) => ({
    description: formatLineItemNameAndDescription(item),
    qty: Number(item.quantity ?? item.qty ?? 1),
    price: Number(item.unit_price ?? item.rate ?? item.price ?? 0).toFixed(2),
    total: Number(
      item.total_price ??
        item.total ??
        (Number(item.quantity ?? item.qty ?? 1) *
          Number(item.unit_price ?? item.rate ?? item.price ?? 0))
    ).toFixed(2),
  }));
  const lineItemNotes = rawItems
    .filter((item) => String(item.description || "").trim())
    .map((item) => formatLineItemNameAndDescription(item));
  const notes = [
    invoice?.notes?.trim(),
    lineItemNotes.length > 0
      ? "Service / line item notes:\n" + lineItemNotes.join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const subtotal = Number(
    invoice?.subtotal ?? invoice?.total_amount ?? 0
  ).toFixed(2);
  const total = Number(
    invoice?.total_amount ?? invoice?.total ?? invoice?.subtotal ?? 0
  ).toFixed(2);

  const currency =
    user?.currency || invoice?.owner_currency || "ZAR";

  const totalNum = Number(invoice?.total_amount ?? invoice?.total ?? invoice?.subtotal ?? 0);
  const formattedTotal = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
  }).format(totalNum);

  const issuedDateRaw = invoice?.created_date || invoice?.invoice_date || invoice?.created_at;
  const issuedDateFormatted = issuedDateRaw
    ? (() => {
        const d =
          typeof issuedDateRaw === "string" ? parseISO(issuedDateRaw) : new Date(issuedDateRaw);
        return isValid(d) ? format(d, "d MMM yyyy") : "";
      })()
    : "";

  const dueDateRaw = invoice?.delivery_date || invoice?.due_date;
  const dueDateFormatted = dueDateRaw
    ? (() => {
        const d = typeof dueDateRaw === "string" ? parseISO(dueDateRaw) : new Date(dueDateRaw);
        return isValid(d) ? format(d, "d MMM yyyy") : "";
      })()
    : "";

  const paymentTerms = effectiveInvoiceTermsForDisplay(
    invoice?.terms_conditions?.trim() || invoice?.payment_terms?.trim() || ""
  );

  const refNumber =
    String(invoice?.invoice_number || invoice?.reference_number || number || "—").trim() || "—";

  const bankDetails =
    bankBlockFromBankingRow(bankingDetail, refNumber) ??
    bankBlockFromUserBusiness(user?.business, refNumber);

  return {
    brand,
    address,
    logo_url,
    number,
    status,
    client: {
      name: clientName,
      address: clientAddress,
      email: client?.email || "",
    },
    items,
    notes,
    subtotal,
    total,
    currency,
    formattedTotal,
    issuedDateFormatted,
    due_date: dueDateRaw,
    dueDateFormatted,
    paymentTerms,
    bankDetails,
  };
}

/**
 * Download button: DocumentPreview layout (same as Create / View invoice) via html2pdf.
 * Use when you have invoice, client, and user (e.g. on InvoicePDF page).
 */
export default function InvoicePDFDownloadLink({
  invoice,
  client,
  user,
  bankingDetail = null,
  className = "",
  variant = "default",
  showIcon = true,
}) {
  const captureRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const clientFallback = useMemo(
    () => client || { name: invoice?.client_name || "Client" },
    [client, invoice?.client_name]
  );

  const pack = useMemo(
    () =>
      invoice
        ? buildInvoiceTemplatePdfCaptureProps(invoice, clientFallback, user, bankingDetail)
        : null,
    [invoice, clientFallback, user, bankingDetail]
  );

  const previewDoc = useMemo(
    () =>
      invoice && pack
        ? recordToStyledPreviewDoc(invoice, pack.clientForTemplate, "invoice", pack.resolvedUser)
        : null,
    [invoice, pack]
  );

  const clientsForPreview = useMemo(() => {
    if (!pack?.clientForTemplate || typeof pack.clientForTemplate !== "object") return [];
    const c = pack.clientForTemplate;
    const withId = c.id ? c : { ...c, id: invoice.client_id };
    return [withId];
  }, [pack?.clientForTemplate, invoice?.client_id]);

  if (!invoice) return null;

  const fileName = `invoice-${invoice.invoice_number || invoice.reference_number || "invoice"}.pdf`;

  const handleClick = async () => {
    const el = captureRef.current;
    if (!el || loading) return;
    setLoading(true);
    try {
      await generatePdfFromElement(el, fileName);
    } catch (e) {
      console.error("Invoice PDF download failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none"
        style={{
          position: "fixed",
          left: -12000,
          top: 0,
          width: "210mm",
          maxWidth: "210mm",
          zIndex: -1,
        }}
      >
        {previewDoc && pack ? (
          <DocumentPreview
            ref={captureRef}
            doc={previewDoc}
            docType="invoice"
            clients={clientsForPreview}
            user={pack.resolvedUser}
            bankingDetail={bankingDetail}
            hideStatus
          />
        ) : (
          <div ref={captureRef} />
        )}
      </div>
      <Button
        type="button"
        variant={variant}
        disabled={loading}
        className={className}
        onClick={handleClick}
      >
        {showIcon && <Download className="w-4 h-4 mr-2 shrink-0" />}
        {loading ? "Generating PDF..." : "Download Invoice"}
      </Button>
    </>
  );
}
