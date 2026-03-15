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
  const clientName = client?.name || "Client";
  const clientAddress =
    client?.address ||
    [client?.address_line1, client?.city, client?.postal_code]
      .filter(Boolean)
      .join(", ") ||
    client?.email ||
    "";

  const items = (invoice?.items || []).map((item) => ({
    description:
      item.service_name || item.name || item.description || "Item",
    qty: Number(item.quantity ?? item.qty ?? 1),
    price: Number(item.unit_price ?? item.rate ?? item.price ?? 0).toFixed(2),
    total: Number(
      item.total_price ??
        item.total ??
        (Number(item.quantity ?? item.qty ?? 1) *
          Number(item.unit_price ?? item.rate ?? item.price ?? 0))
    ).toFixed(2),
  }));

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

  const dueDateRaw = invoice?.delivery_date || invoice?.due_date;
  const dueDateFormatted = dueDateRaw
    ? (() => {
        const d = typeof dueDateRaw === "string" ? parseISO(dueDateRaw) : new Date(dueDateRaw);
        return isValid(d) ? format(d, "MMMM d, yyyy") : "";
      })()
    : "";

  return {
    brand,
    address,
    number,
    client: {
      name: clientName,
      address: clientAddress,
      email: client?.email || "",
    },
    items,
    subtotal,
    total,
    currency,
    formattedTotal,
    due_date: dueDateRaw,
    dueDateFormatted,
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
