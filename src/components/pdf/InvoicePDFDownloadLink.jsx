import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  downloadInvoicePdfBlob,
  generateInvoicePDF,
} from "./generateInvoicePDF";
import { mapInvoicePdfData, mapToInvoiceData } from "./mapInvoicePdfData";

export { mapInvoicePdfData, mapToInvoiceData };

/**
 * Download button for invoices — uses generateInvoicePDF
 * (premium @react-pdf for document template; html2pdf for legacy templates).
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
  const [loading, setLoading] = useState(false);

  const clientFallback = useMemo(
    () => client || { name: invoice?.client_name || "Client" },
    [client, invoice?.client_name]
  );

  if (!invoice) return null;

  const fileName = `invoice-${invoice.invoice_number || invoice.reference_number || "invoice"}.pdf`;

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const blob = await generateInvoicePDF({
        invoice,
        client: clientFallback,
        user,
        bankingDetail,
      });
      downloadInvoicePdfBlob(blob, fileName);
    } catch (e) {
      console.error("Invoice PDF download failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
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
  );
}
