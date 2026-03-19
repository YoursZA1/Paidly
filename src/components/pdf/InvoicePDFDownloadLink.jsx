import { format, parseISO, isValid } from "date-fns";
import { PDFDownloadLink } from "@react-pdf/renderer";
import InvoicePDF from "./InvoicePDF";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/**
 * Maps app invoice + client + user to the shape expected by InvoicePDF (React-PDF).
 * @param {{ invoice: object, client: object, user: object }} props
 */
function mapToInvoiceData(invoice, client, user) {
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
    description: item.service_name || item.name || item.description || "Item",
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
    .filter((item) => item.description)
    .map((item) => ({
      label: item.service_name || item.name || "Item",
      note: item.description,
    }));
  const notes = [
    invoice?.notes?.trim(),
    lineItemNotes.length > 0
      ? "Service / line item notes:\n" +
        lineItemNotes.map(({ label, note }) => `${label}: ${note}`).join("\n")
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

  const paymentInfo = invoice?.banking_detail_id
    ? "Bank details provided"
    : "Bank details not specified";

  const paymentTerms =
    invoice?.terms_conditions?.trim() ||
    invoice?.payment_terms?.trim() ||
    "Due within 15 days upon acceptance. Late payments may incur interest.";

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
    paymentInfo,
    paymentTerms,
  };
}

/**
 * Download button that generates a PDF via @react-pdf/renderer using InvoicePDF.
 * Use when you have full invoice, client, and user (e.g. on InvoicePDF page).
 */
export default function InvoicePDFDownloadLink({
  invoice,
  client,
  user,
  className = "",
  variant = "default",
  showIcon = true,
}) {
  if (!invoice) return null;

  const invoiceData = mapToInvoiceData(invoice, client, user);
  const fileName = `invoice-${invoiceData.number}.pdf`;
  const currency = invoiceData.currency || "ZAR";

  return (
    <PDFDownloadLink
      document={
        <InvoicePDF invoice={invoiceData} currency={currency} />
      }
      fileName={fileName}
    >
      {({ loading }) => (
        <Button
          type="button"
          variant={variant}
          disabled={loading}
          className={className}
        >
          {showIcon && <Download className="w-4 h-4 mr-2 shrink-0" />}
          {loading ? "Generating PDF..." : "Download Invoice"}
        </Button>
      )}
    </PDFDownloadLink>
  );
}

export { mapToInvoiceData };
