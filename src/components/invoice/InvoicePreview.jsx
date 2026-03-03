import PropTypes from "prop-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, FileText, Download } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import LogoImage from "@/components/shared/LogoImage";
import { createPageUrl } from "@/utils";
import { getUnitLabel, getItemTypeLabel } from "./itemTypeHelpers";

export default function InvoicePreview({
  invoiceData,
  clients,
  onPrevious,
  onCreate,
  onClose,
  showBack = true,
  user, // Pass user/company object with logo_url, currency if available
  loading = false,
  previewOnly = false,
}) {
  // Ensure invoiceData exists and has required structure
  if (!invoiceData) {
    return (
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
        <CardContent className="p-8">
          <p className="text-red-600">Error: Invoice data is missing</p>
        </CardContent>
      </Card>
    );
  }

  const clientList = Array.isArray(clients) ? clients : [];
  const client = clientList.find(c => c.id === invoiceData?.client_id) ?? null;
  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];
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
  const hasItemTax = items.some(
    (item) => (Number(item.item_tax_rate) || 0) > 0 || (Number(item.item_tax_amount) || 0) > 0
  );

  const handleDownloadPDF = () => {
    try {
      sessionStorage.setItem(
        "invoiceDraft",
        JSON.stringify({
          invoiceData: {
            ...invoiceData,
            invoice_number: invoiceData.invoice_number || invoiceData.reference_number || "Draft",
          },
          client: client || {},
          user: user || {},
        })
      );
      window.open(createPageUrl("InvoicePDF") + "?draft=1", "_blank", "noopener,noreferrer");
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
        <CardHeader className="border-b border-slate-100 pb-6">
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
          <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {previewOnly ? "Invoice" : "Invoice Preview"}
          </CardTitle>
          {!previewOnly && (
            <p className="text-slate-600 mt-2">
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
          <div className="space-y-8">
            {/* Billed by / Billed to - full details */}
            <div className="grid md:grid-cols-2 gap-6 border-b border-slate-200 pb-6">
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Billed by</h3>
                <div className="space-y-1">
                  {user?.logo_url && (
                    <LogoImage src={user.logo_url} alt="" className="h-10 w-auto mb-2" style={{ maxHeight: "40px" }} />
                  )}
                  <p className="font-semibold text-slate-900">{user?.company_name || "Your Company"}</p>
                  {user?.company_address && (
                    <p className="text-sm text-slate-600 whitespace-pre-line">{user.company_address}</p>
                  )}
                  {user?.email && (
                    <p className="text-sm text-slate-600">{user.email}</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Billed to</h3>
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">{client?.name || "—"}</p>
                  {client?.contact_person && <p className="text-sm text-slate-600">Attn: {client.contact_person}</p>}
                  {client?.address && <p className="text-sm text-slate-600 whitespace-pre-line">{client.address}</p>}
                  {client?.email && <p className="text-sm text-slate-600">{client.email}</p>}
                  {client?.phone && <p className="text-sm text-slate-600">{client.phone}</p>}
                  {client?.tax_id && <p className="text-sm text-slate-600">Tax ID: {client.tax_id}</p>}
                </div>
              </div>
            </div>

            {/* Invoice Information - all details */}
            <div className="bg-slate-50 rounded-2xl p-6">
              <h3 className="font-bold text-slate-900 mb-4">Invoice Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600">Client</p>
                  <p className="font-semibold text-slate-900">{client?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Project Title</p>
                  <p className="font-semibold text-slate-900">{invoiceData?.project_title || "—"}</p>
                </div>
                {invoiceData?.invoice_number && (
                  <div>
                    <p className="text-sm text-slate-600">Invoice Number</p>
                    <p className="font-semibold text-slate-900">{invoiceData.invoice_number}</p>
                  </div>
                )}
                {(invoiceData?.reference_number ?? "") !== "" && (
                  <div>
                    <p className="text-sm text-slate-600">Reference Number</p>
                    <p className="font-medium text-slate-900">{invoiceData.reference_number}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-slate-600">Currency</p>
                  <p className="font-medium text-slate-900">{currency}</p>
                </div>
                {invoiceDate && (
                  <div>
                    <p className="text-sm text-slate-600">Invoice Date</p>
                    <p className="font-semibold text-slate-900">{format(invoiceDate, "MMMM d, yyyy")}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-slate-600">Due Date</p>
                  <p className="font-semibold text-slate-900">
                    {deliveryDate ? format(deliveryDate, "MMMM d, yyyy") : "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Total Amount</p>
                  <p className="font-bold text-slate-900 text-xl">
                    {formatCurrency(totalAmount, currency)}
                  </p>
                </div>
              </div>
              {invoiceData?.project_description && (
                <div className="mt-4">
                  <p className="text-sm text-slate-600">Project Description</p>
                  <p className="text-slate-800 whitespace-pre-wrap">{invoiceData.project_description}</p>
                </div>
              )}
              {invoiceData?.delivery_address && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-sm text-slate-600">Delivery / Billing Address</p>
                  <p className="text-slate-800 whitespace-pre-wrap">{invoiceData.delivery_address}</p>
                </div>
              )}
            </div>
            {/* Products & Services - full details */}
            <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10">
              <h3 className="font-bold text-slate-900 mb-2">Products &amp; Services</h3>
              <p className="text-sm text-slate-600 mb-4">Line items with full product/service details.</p>
              {items.length === 0 ? (
                <p className="text-slate-500 text-center py-6">No items added</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-2 pr-4 text-xs font-semibold text-slate-600 uppercase">Product / Service</th>
                          <th className="py-2 px-2 text-xs font-semibold text-slate-600 uppercase text-center w-14">Qty</th>
                          <th className="py-2 px-2 text-xs font-semibold text-slate-600 uppercase w-24">Unit</th>
                          <th className="py-2 px-2 text-xs font-semibold text-slate-600 uppercase text-right">Rate</th>
                          {hasItemTax && (
                            <>
                              <th className="py-2 px-2 text-xs font-semibold text-slate-600 uppercase text-right w-16">Tax %</th>
                              <th className="py-2 px-2 text-xs font-semibold text-slate-600 uppercase text-right">Item Tax</th>
                            </>
                          )}
                          <th className="py-2 pl-2 text-xs font-semibold text-slate-600 uppercase text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => {
                          const qty = Number(item.quantity ?? item.qty ?? 1);
                          const unitPrice = Number(item.unit_price ?? item.rate ?? item.price ?? 0);
                          const lineTotal = Number(item.total_price ?? item.total ?? qty * unitPrice);
                          const itemTaxRate = Number(item.item_tax_rate ?? 0);
                          const itemTaxAmt = Number(item.item_tax_amount ?? 0);
                          const totalWithTax = lineTotal + itemTaxAmt;
                          const name = item.service_name || item.name || "Item";
                          const itemType = item.item_type || "service";
                          const unitType = item.unit_type || "unit";
                          const unitLabel = getUnitLabel(itemType, unitType);
                          const typeLabel = getItemTypeLabel(itemType);
                          return (
                            <tr key={index} className="border-b border-slate-100 align-top">
                              <td className="py-3 pr-4">
                                <p className="font-medium text-slate-900">{name}</p>
                                {(item.sku || item.part_number) && (
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {item.sku && <span>SKU: {item.sku}</span>}
                                    {item.sku && item.part_number && " · "}
                                    {item.part_number && <span>Part #: {item.part_number}</span>}
                                  </p>
                                )}
                                {item.description && (
                                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{item.description}</p>
                                )}
                                {item.details && (
                                  <p className="text-xs text-slate-500 mt-1 italic">{item.details}</p>
                                )}
                                <p className="text-xs text-slate-500 mt-1">
                                  Type: {typeLabel} · Unit: {unitLabel}
                                </p>
                              </td>
                              <td className="py-3 px-2 text-center text-slate-700">{qty}</td>
                              <td className="py-3 px-2 text-slate-700 text-sm">{unitLabel}</td>
                              <td className="py-3 px-2 text-right text-slate-700">{formatCurrency(unitPrice, currency)}</td>
                              {hasItemTax && (
                                <>
                                  <td className="py-3 px-2 text-right text-slate-600">{itemTaxRate ? `${itemTaxRate}%` : "—"}</td>
                                  <td className="py-3 px-2 text-right text-slate-700">{formatCurrency(itemTaxAmt, currency)}</td>
                                </>
                              )}
                              <td className="py-3 pl-2 text-right font-medium text-slate-900">
                                {formatCurrency(hasItemTax ? totalWithTax : lineTotal, currency)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-200 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal ({currency}):</span>
                      <span>{formatCurrency(subtotal, currency)}</span>
                    </div>
                    {showDiscount && (
                      <div className="flex justify-between text-sm text-red-600">
                        <span>
                          Discount
                          {invoiceData?.discount_type === "percentage" && invoiceData?.discount_value != null
                            ? ` (${invoiceData.discount_value}%)`
                            : ""}
                          :
                        </span>
                        <span>-{formatCurrency(discountAmount, currency)}</span>
                      </div>
                    )}
                    {showTax && (
                      <div className="flex justify-between text-sm">
                        <span>Tax ({taxRate}%):</span>
                        <span>{formatCurrency(taxAmount, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-slate-200">
                      <span>Total ({currency}):</span>
                      <span>{formatCurrency(totalAmount, currency)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Notes & Terms */}
            {(invoiceData?.notes || invoiceData?.terms_conditions) && (
              <div className="grid md:grid-cols-2 gap-6">
                {invoiceData?.notes && (
                  <div className="bg-amber-50 rounded-2xl p-6">
                    <h3 className="font-bold text-slate-900 mb-4">Additional Notes</h3>
                    <p className="text-slate-800 whitespace-pre-wrap">{invoiceData.notes}</p>
                  </div>
                )}
                {invoiceData?.terms_conditions && (
                  <div className="bg-purple-50 rounded-2xl p-6">
                    <h3 className="font-bold text-slate-900 mb-4">Terms & Conditions</h3>
                    <p className="text-slate-800 whitespace-pre-wrap">{invoiceData.terms_conditions}</p>
                  </div>
                )}
              </div>
            )}
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
  onPrevious: PropTypes.func,
  onCreate: PropTypes.func,
  onClose: PropTypes.func,
  showBack: PropTypes.bool,
  user: PropTypes.object,
  loading: PropTypes.bool,
  previewOnly: PropTypes.bool,
};