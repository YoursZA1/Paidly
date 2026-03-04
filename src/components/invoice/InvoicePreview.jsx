import PropTypes from "prop-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, FileText, Download } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import LogoImage from "@/components/shared/LogoImage";
import { createPageUrl } from "@/utils";

/* Agency-style layout: INVOICE title left, company in logo-aligned tint box right, Payable To | Bank Details, 4-col table, Notes, Totals. Colours match app/logo (primary). */

const CARD_ACCENT_BG = "bg-primary/10";
const CARD_ACCENT_BORDER = "border-primary/20";

export default function InvoicePreview({
  invoiceData,
  clients,
  client: clientProp, // Optional: pass resolved client directly (overrides lookup from clients + client_id)
  onPrevious,
  onCreate,
  onClose,
  showBack = true,
  user, // Pass user/company object with logo_url, currency if available
  loading = false,
  previewOnly = false,
  bankingDetail = null, // Optional: for Payable To | Bank Details layout
}) {
  // Ensure invoiceData exists and has required structure
  if (!invoiceData) {
    return (
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
        <CardContent className="p-8">
          <p className="text-destructive">Error: Invoice data is missing</p>
        </CardContent>
      </Card>
    );
  }

  const clientList = Array.isArray(clients) ? clients : [];
  const clientResolved = clientList.find(c => c.id === invoiceData?.client_id) ?? null;
  const client = clientProp ?? clientResolved;
  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];
  const projectTitle = invoiceData?.project_title ?? "";
  const projectDescription = invoiceData?.project_description ?? "";
  const deliveryDate = invoiceData?.delivery_date ? new Date(invoiceData.delivery_date) : null;
  const invoiceDate = invoiceData?.invoice_date ? new Date(invoiceData.invoice_date) : null;
  const currency = invoiceData?.currency || user?.currency || "USD";
  const subtotal = Number(invoiceData?.subtotal ?? 0);
  const taxRate = Number(invoiceData?.tax_rate ?? 0);
  const taxAmount = Number(invoiceData?.tax_amount ?? 0);
  const totalAmount = Number(invoiceData?.total_amount ?? 0);
  const showTax = taxAmount > 0;
  const discountAmount = Number(invoiceData?.discount_amount ?? 0);
  const showDiscount = discountAmount > 0;

  const handleDownloadPDF = () => {
    try {
      sessionStorage.setItem(
        "invoiceDraft",
        JSON.stringify({
          invoiceData: {
            ...invoiceData,
            invoice_number: invoiceData.invoice_number || invoiceData.reference_number || "Draft",
            project_title: invoiceData.project_title,
            project_description: invoiceData.project_description,
            items: items,
          },
          client: client || {},
          user: user || {},
          bankingDetail: bankingDetail || null,
        })
      );
      // Open PDF preview and trigger auto-download
      window.open(createPageUrl("InvoicePDF") + "?draft=1&download=true", "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Failed to open PDF preview:", e);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="border-b border-border pb-6">
          {/* Logo Display */}
          {user?.logo_url && (
            <div className="mb-4 flex justify-center">
              <LogoImage
                src={user.logo_url}
                alt="Company Logo"
                className="h-16 w-auto max-w-xs object-contain rounded shadow"
                style={{ maxHeight: '64px' }}
              />
            </div>
          )}
          <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {previewOnly ? "Invoice" : "Invoice Preview"}
          </CardTitle>
          {!previewOnly && (
            <p className="text-muted-foreground mt-2">
              Review all details before creating your professional invoice
            </p>
          )}
          {previewOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPDF}
              className="mt-3 rounded-xl border-border bg-card text-foreground hover:bg-muted"
            >
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-8">
          <div className="bg-card rounded-lg text-foreground">
            {/* Header: INVOICE left, Company in beige box right + Invoice No, Date */}
            <div className="flex flex-wrap justify-between items-start gap-6 mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground uppercase tracking-tight">Invoice</h1>
              <div className="text-right">
                <div className={`inline-block rounded-lg px-4 py-3 ${CARD_ACCENT_BG} border ${CARD_ACCENT_BORDER}`}>
                  {user?.logo_url ? (
                    <div className="flex items-center gap-3">
                      <LogoImage src={user.logo_url} alt="" className="h-10 w-auto" style={{ maxHeight: "40px" }} />
                      <span className="font-semibold text-foreground">{user?.company_name || "Your Company"}</span>
                    </div>
                  ) : (
                    <span className="font-semibold text-foreground">{user?.company_name || "Your Company"}</span>
                  )}
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  <p>Invoice No: {invoiceData?.invoice_number || invoiceData?.reference_number || "Draft"}</p>
                  <p>Date: {invoiceDate ? format(invoiceDate, "dd/MM/yyyy") : deliveryDate ? format(deliveryDate, "dd/MM/yyyy") : "—"}</p>
                  {projectTitle && <p className="mt-1 font-medium text-foreground">Project: {projectTitle}</p>}
                </div>
              </div>
            </div>

            {/* Payable To (client) | Bank Details — linked to invoiceData.client_id and optional bankingDetail */}
            {projectDescription && (
              <div className="mb-6">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Project</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{projectDescription}</p>
              </div>
            )}

            {/* Payable To | Bank Details */}
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Payable To</h3>
                <p className="font-medium text-foreground">{client?.name || "—"}</p>
                {client?.contact_person && <p className="text-sm text-muted-foreground">Attn: {client.contact_person}</p>}
                {client?.address && <p className="text-sm text-muted-foreground mt-0.5">{client.address}</p>}
                {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
                {client?.phone && <p className="text-sm text-muted-foreground">{client.phone}</p>}
              </div>
              <div className="text-right md:text-right">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Bank Details</h3>
                {bankingDetail ? (
                  <>
                    <p className="font-medium text-foreground">{bankingDetail.account_name || bankingDetail.bank_name}</p>
                    {bankingDetail.account_number && <p className="text-sm text-muted-foreground">{bankingDetail.account_number}</p>}
                    {bankingDetail.bank_name && <p className="text-sm text-muted-foreground">{bankingDetail.bank_name}</p>}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
            </div>

            {/* Itemized table: beige header, 4 columns only */}
            <div className="overflow-x-auto rounded-t-lg overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${CARD_ACCENT_BG} border ${CARD_ACCENT_BORDER}`}>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-foreground uppercase tracking-wider">Item Description</th>
                    <th className="px-4 py-3.5 text-right text-xs font-bold text-foreground uppercase tracking-wider w-20">Qty</th>
                    <th className="px-4 py-3.5 text-right text-xs font-bold text-foreground uppercase tracking-wider w-28">Price</th>
                    <th className="px-4 py-3.5 text-right text-xs font-bold text-foreground uppercase tracking-wider w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No items added</td>
                    </tr>
                  ) : (
                    items.map((item, index) => {
                      const qty = Number(item.quantity ?? item.qty ?? 1);
                      const unitPrice = Number(item.unit_price ?? item.rate ?? item.price ?? 0);
                      const lineTotal = Number(item.total_price ?? item.total ?? qty * unitPrice);
                      const name = item.service_name || item.name || "Item";
                      const description = item.description ?? "";
                      return (
                        <tr key={index} className="border-b border-border">
                          <td className="px-4 py-4 text-foreground">
                            <span className="font-medium">{name}</span>
                            {description && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{description}</p>}
                          </td>
                          <td className="px-4 py-4 text-right text-foreground tabular-nums">{qty}</td>
                          <td className="px-4 py-4 text-right text-foreground tabular-nums">{formatCurrency(unitPrice, currency)}</td>
                          <td className="px-4 py-4 text-right font-medium text-foreground tabular-nums">{formatCurrency(lineTotal, currency)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Notes */}
            {(invoiceData?.notes || invoiceData?.terms_conditions) && (
              <div className="mb-8">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {[invoiceData?.notes, invoiceData?.terms_conditions].filter(Boolean).join("\n\n")}
                </p>
              </div>
            )}

            {/* Totals: right-aligned beige box */}
            <div className="flex justify-end">
              <div className={`w-full max-w-xs rounded-lg border ${CARD_ACCENT_BORDER} ${CARD_ACCENT_BG} px-5 py-4`}>
                <div className="flex justify-between py-2 text-sm text-foreground">
                  <span>Sub Total</span>
                  <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
                </div>
                {showDiscount && (
                  <div className="flex justify-between py-2 text-sm text-destructive">
                    <span>Discount</span>
                    <span className="tabular-nums">-{formatCurrency(discountAmount, currency)}</span>
                  </div>
                )}
                {showTax && (
                  <div className="flex justify-between py-2 text-sm text-foreground">
                    <span>Tax ({taxRate}%)</span>
                    <span className="tabular-nums">{formatCurrency(taxAmount, currency)}</span>
                  </div>
                )}
                <div className="border-t border-border mt-2 pt-3 flex justify-between text-base font-bold text-foreground">
                  <span>Grand Total</span>
                  <span className="tabular-nums">{formatCurrency(totalAmount, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={`flex ${showBack && !previewOnly ? "justify-between" : "justify-end"} mt-8 gap-3`}>
            {showBack && !previewOnly && (
              <Button
                onClick={onPrevious}
                variant="outline"
                className="px-8 py-3 rounded-xl border-slate-200 hover:bg-slate-50"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
            {previewOnly && onClose && (
              <Button
                onClick={onClose}
                variant="outline"
                className="px-8 py-3 rounded-xl border-slate-200 hover:bg-slate-50"
              >
                Close Preview
              </Button>
            )}
            {!previewOnly && (
              <Button
                onClick={onCreate}
                disabled={loading}
                className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] hover:from-[#e04500] hover:to-[#e66d00] text-white px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <motion.div
                      className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full inline-block"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Create Invoice
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

InvoicePreview.propTypes = {
  invoiceData: PropTypes.object.isRequired,
  clients: PropTypes.array,
  client: PropTypes.object,
  onPrevious: PropTypes.func,
  onCreate: PropTypes.func,
  onClose: PropTypes.func,
  showBack: PropTypes.bool,
  user: PropTypes.object,
  loading: PropTypes.bool,
  previewOnly: PropTypes.bool,
  bankingDetail: PropTypes.object,
};