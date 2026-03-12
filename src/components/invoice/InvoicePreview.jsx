import PropTypes from "prop-types";
import React, { memo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, FileText, Download, Send } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { formatCurrencyInvoice } from "../CurrencySelector";
import LogoImage from "@/components/shared/LogoImage";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { getBackendBaseUrl } from "@/api/backendClient";

/* Executive Canvas: A4-style document with 48px padding, logo left / INVOICE right header,
   left-edge brand bar, status watermark, slate-900 footer with Bank Details left / Grand Total right. */

function InvoicePreview({
  invoiceData,
  clients,
  client: clientProp,
  onPrevious,
  onCreate,
  onClose,
  showBack = true,
  user,
  loading = false,
  previewOnly = false,
  bankingDetail = null,
}) {
  if (!invoiceData) {
    return (
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
        <CardContent className="p-4 sm:p-8">
          <p className="text-destructive text-sm sm:text-base">Error: Invoice data is missing</p>
        </CardContent>
      </Card>
    );
  }

  const clientList = Array.isArray(clients) ? clients : [];
  const clientResolved = clientList.find(c => c.id === invoiceData?.client_id) ?? null;
  const client = clientProp ?? clientResolved;
  const currency = (invoiceData?.currency || user?.currency || "ZAR").toString().trim() || "ZAR";
  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];
  const projectTitle = invoiceData?.project_title ?? "";
  const projectDescription = invoiceData?.project_description ?? "";
  const deliveryDate = invoiceData?.delivery_date ? new Date(invoiceData.delivery_date) : null;
  const invoiceDate = invoiceData?.invoice_date ? new Date(invoiceData.invoice_date) : null;
  const subtotal = Number(invoiceData?.subtotal ?? 0);
  const taxRate = Number(invoiceData?.tax_rate ?? 0);
  const taxAmount = Number(invoiceData?.tax_amount ?? 0);
  const totalAmount = Number(invoiceData?.total_amount ?? 0);
  const showTax = taxAmount > 0;
  const discountAmount = Number(invoiceData?.discount_amount ?? 0);
  const showDiscount = discountAmount > 0;
  const status = (invoiceData?.status || "draft").toUpperCase();
  const isPaid = status === "PAID" || status === "PARTIAL_PAID";

  const previewRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  /** Build PDF from preview ref; returns jsPDF instance or null. */
  const buildPdf = async () => {
    if (!previewRef.current) return null;
    const element = previewRef.current;
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    // Document is fixed A4 size so image fits one page
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    return pdf;
  };

  const handleDownloadPDF = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);
    try {
      const pdf = await buildPdf();
      if (!pdf) return;
      const fileName = `Invoice_${invoiceData?.invoice_number || invoiceData?.reference_number || "Draft"}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error("PDF export failed:", error);
      toast({ title: "Download failed", description: error?.message || "Could not generate PDF", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendEmail = async () => {
    const clientEmail = client?.email?.trim();
    if (!clientEmail) {
      toast({ title: "No client email", description: "Add an email to the client to send the invoice.", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      const pdf = await buildPdf();
      if (!pdf) {
        toast({ title: "PDF failed", description: "Could not generate PDF.", variant: "destructive" });
        return;
      }
      const base64PDF = pdf.output("datauristring");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast({ title: "Not signed in", description: "Please sign in to send the invoice.", variant: "destructive" });
        return;
      }
      const invoiceNum = invoiceData?.invoice_number || invoiceData?.reference_number || "Draft";
      const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
      const res = await fetch(`${apiBase}/api/send-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          base64PDF,
          clientEmail,
          invoiceNum,
          fromName: user?.company_name || "Paidly",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Send failed",
          description: json?.error || res.statusText || "Could not send email",
          variant: "destructive",
        });
        return;
      }
      if (!json.success) {
        toast({ title: "Send failed", description: json?.error || "Server error", variant: "destructive" });
        return;
      }
      toast({ title: "Invoice sent", description: `Invoice ${invoiceNum} was sent to ${clientEmail}.` });
    } catch (error) {
      console.error("Send invoice error:", error);
      toast({ title: "Send failed", description: error?.message || "Could not send email", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      style={{ opacity: 1 }}
    >
      <div className="bg-white/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden rounded-fintech text-card-foreground">
        <CardHeader className="border-b border-border pb-4 sm:pb-6 px-4 sm:px-6">
          {user?.logo_url && (
            <div className="mb-3 sm:mb-4 flex justify-center">
              <LogoImage
                src={user.logo_url}
                alt="Company Logo"
                className="h-12 sm:h-16 w-auto max-w-[200px] sm:max-w-xs object-contain rounded shadow"
                style={{ maxHeight: "48px" }}
              />
            </div>
          )}
          <CardTitle className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 shrink-0" />
            {previewOnly ? "Invoice" : "Invoice Preview"}
          </CardTitle>
          {!previewOnly && (
            <p className="text-muted-foreground mt-1 sm:mt-2 text-sm">
              Review all details before creating your professional invoice
            </p>
          )}
          {previewOnly && (
            <div className="mt-3 flex flex-col gap-2 min-[480px]:flex-row min-[480px]:flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                disabled={isExporting || isSending}
                className="w-full sm:w-auto rounded-xl border-border bg-card text-foreground hover:bg-muted disabled:opacity-70"
              >
                {isExporting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin shrink-0" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2 shrink-0" />
                    Download PDF
                  </>
                )}
              </Button>
              {client?.email && (
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={isExporting || isSending}
                  className="w-full sm:w-auto rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
                >
                  {isSending ? (
                    <>
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin shrink-0" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2 shrink-0" />
                      Send to Client
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <div className="p-0 overflow-x-hidden">
          <div className="w-full overflow-x-auto overflow-y-hidden" style={{ minHeight: "320px" }}>
          <div
            ref={previewRef}
            className="invoice-document relative mx-auto bg-white border border-slate-100 shadow-2xl flex flex-col rounded-sm overflow-hidden shrink-0"
            style={{ width: "210mm", minHeight: "297mm" }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 sm:w-1.5 bg-primary rounded-r" aria-hidden />

            {/* Status overlay: diagonal low-opacity stamp behind content */}
            <div
              className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden"
              aria-hidden
            >
              <span
                className={`font-black tracking-tighter select-none transform -rotate-[-18deg] text-5xl sm:text-8xl ${
                  isPaid ? "text-emerald-400/15" : "text-slate-300/20"
                }`}
              >
                {isPaid ? "PAID" : "DRAFT"}
              </span>
            </div>

            {/* Inner content: 48px padding for A4 page feel */}
            <div className="relative z-10 flex flex-col flex-1 p-[48px]">
              {/* 1. BRANDING HEADER — Logo left, INVOICE + metadata right (Z-pattern) */}
              <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 sm:gap-8 pb-6 sm:pb-10 border-b border-slate-100">
                <div className="space-y-2 sm:space-y-3 min-w-0">
                  {user?.logo_url ? (
                    <LogoImage
                      src={user.logo_url}
                      alt=""
                      className="h-10 sm:h-14 w-auto max-w-[140px] sm:max-w-[180px] object-contain"
                      style={{ maxHeight: "40px" }}
                    />
                  ) : (
                    <div className="w-10 h-10 sm:w-14 sm:h-14 bg-primary rounded-lg sm:rounded-xl flex items-center justify-center text-white text-lg sm:text-xl font-black">
                      {(user?.company_name || "P").charAt(0)}
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">{user?.company_name || "Your Company"}</h3>
                    {user?.company_address && (
                      <p className="text-[10px] text-slate-500 font-medium leading-relaxed max-w-full sm:max-w-[220px] line-clamp-2">
                        {user.company_address}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-left sm:text-right space-y-1 sm:space-y-2 shrink-0">
                  <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase">
                    Invoice
                  </h1>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Invoice Number</p>
                    <p className="text-xs sm:text-sm font-black text-slate-900 tabular-nums break-all">
                      {invoiceData?.invoice_number || invoiceData?.reference_number || "Draft"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-4 sm:gap-6 mt-2">
                    <div className="text-left sm:text-right space-y-0.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Issued</p>
                      <p className="text-xs font-bold text-slate-900 tabular-nums">
                        {invoiceDate ? format(invoiceDate, "dd MMM yyyy") : deliveryDate ? format(deliveryDate, "dd MMM yyyy") : "—"}
                      </p>
                    </div>
                    <div className="text-left sm:text-right space-y-0.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Due Date</p>
                      <p className="text-xs font-bold text-primary tabular-nums">
                        {deliveryDate ? format(deliveryDate, "dd MMM yyyy") : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </header>

              {/* 2. CLIENT & DATES row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 py-4 sm:py-8">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bill To</p>
                  <h4 className="text-base font-black text-slate-900">{client?.name || "—"}</h4>
                  {client?.contact_person && <p className="text-xs text-slate-500">Attn: {client.contact_person}</p>}
                  {(client?.address || client?.billing_address) && (
                    <p className="text-xs text-slate-500 leading-relaxed">{client?.address || client?.billing_address}</p>
                  )}
                  {client?.email && <p className="text-xs text-slate-500">{client.email}</p>}
                  {client?.phone && <p className="text-xs text-slate-500 tabular-nums">{client.phone}</p>}
                </div>
                {projectTitle && (
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project</p>
                    <p className="text-sm font-bold text-slate-900">{projectTitle}</p>
                  </div>
                )}
              </div>

              {projectDescription && (
                <div className="mb-6">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description</h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{projectDescription}</p>
                </div>
              )}

              {/* 3. ITEMS TABLE — tabular-nums, right-aligned Price & Total */}
              <div className="flex-1 overflow-x-auto rounded-lg border border-slate-200 mb-4 sm:mb-8">
                <table className="w-full text-sm text-left min-w-[320px]">
                  <thead>
                    <tr className="border-b-2 border-slate-900 text-[10px] font-black uppercase tracking-widest text-slate-900">
                      <th className="px-2 py-2 sm:px-4 sm:py-4 text-left">Description</th>
                      <th className="py-2 sm:py-4 text-center w-16 tabular-nums">Qty</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-4 text-right w-28 tabular-nums">Price</th>
                      <th className="px-2 py-2 sm:px-4 sm:py-4 text-right w-32 tabular-nums">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-8 sm:px-4 sm:py-10 text-center text-slate-500 text-xs sm:text-sm">No items added</td>
                      </tr>
                    ) : (
                      items.map((item, index) => {
                        const qty = Number(item.quantity ?? item.qty ?? 1);
                        const unitPrice = Number(item.unit_price ?? item.rate ?? item.price ?? 0);
                        const lineTotal = Number(item.total_price ?? item.total ?? qty * unitPrice);
                        const name = item.service_name || item.name || "Item";
                        const description = item.description ?? "";
                        return (
                          <tr key={index} className="border-b border-slate-100 text-sm">
                            <td className="px-2 py-4 sm:px-4 sm:py-6 text-slate-900 min-w-[120px]">
                              <p className="font-bold text-slate-900 text-xs sm:text-sm">{name}</p>
                              {description && <p className="text-[10px] text-slate-400 mt-1 uppercase">{description}</p>}
                            </td>
                            <td className="py-4 sm:py-6 text-center w-16 tabular-nums text-slate-600 font-medium">
                              {qty}
                            </td>
                            <td className="px-2 py-4 sm:px-4 sm:py-6 text-right tabular-nums text-slate-600 whitespace-nowrap">
                              {formatCurrencyInvoice(unitPrice, currency)}
                            </td>
                            <td className="px-2 py-4 sm:px-4 sm:py-6 text-right tabular-nums font-black text-slate-900 whitespace-nowrap">
                              {formatCurrencyInvoice(lineTotal, currency)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              {invoiceData?.notes?.trim() && (
                <div className="mb-4 sm:mb-8">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-2">Notes</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                    {invoiceData.notes.trim()}
                  </p>
                </div>
              )}
            </div>

            {/* 4. TOTALS FOOTER — Master-Detail: Bank Details left, Grand Total right; Slate-900 theme */}
            <div className="relative z-10 p-[48px] bg-slate-900 text-white">
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-6 sm:gap-8">
                {/* Left: Bank Details (Payment Info) */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Info</p>
                    {bankingDetail ? (
                      <>
                        <p className="text-sm font-bold text-white">
                          {bankingDetail.bank_name || bankingDetail.account_name || "Bank"}
                        </p>
                        {bankingDetail.account_number && (
                          <p className="text-xs text-slate-400 tabular-nums">Acc: {bankingDetail.account_number}</p>
                        )}
                        {(bankingDetail.routing_number || bankingDetail.swift_code) && (
                          <p className="text-[10px] text-slate-500 tabular-nums">
                            {[bankingDetail.routing_number, bankingDetail.swift_code].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">Bank details not specified</p>
                    )}
                  </div>
                  {invoiceData?.terms_conditions?.trim() ? (
                    <div className="pt-2 border-t border-slate-700">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Payment Terms</p>
                      <p className="text-[11px] text-slate-400 max-w-[280px] leading-relaxed">
                        {invoiceData.terms_conditions.trim()}
                      </p>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-700">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Payment Terms</p>
                      <p className="text-[11px] text-slate-400 max-w-[280px] leading-relaxed">
                        Due within 15 days upon acceptance. Late payments may incur interest.
                      </p>
                    </div>
                  )}
                </div>

                {/* Right: Subtotal / Discount / Tax + Amount Due (Grand Total) */}
                <div className="text-left sm:text-right space-y-2 min-w-0">
                  <div className="space-y-0.5">
                    <div className="flex justify-between sm:justify-end gap-4 items-center text-sm">
                      <span className="text-slate-400">Sub Total</span>
                      <span className="tabular-nums text-right">{formatCurrencyInvoice(subtotal, currency)}</span>
                    </div>
                    {showDiscount && (
                      <div className="flex justify-between sm:justify-end gap-4 items-center text-sm">
                        <span className="text-slate-400">Discount</span>
                        <span className="tabular-nums text-right">-{formatCurrencyInvoice(discountAmount, currency)}</span>
                      </div>
                    )}
                    {showTax && (
                      <div className="flex justify-between sm:justify-end gap-4 items-center text-sm">
                        <span className="text-slate-400">Tax ({taxRate}%)</span>
                        <span className="tabular-nums text-right">{formatCurrencyInvoice(taxAmount, currency)}</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-slate-600 mt-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Amount Due</p>
                    <h2 className="text-4xl sm:text-5xl font-black tabular-nums tracking-tighter text-white">
                      {formatCurrencyInvoice(totalAmount, currency)}
                    </h2>
                  </div>
                </div>
            </div>
          </div>
          </div>

          {/* Action buttons below document */}
          <section
            className={`flex flex-col-reverse sm:flex-row mt-4 sm:mt-8 gap-3 px-4 pb-4 sm:pb-4 ${
              showBack && !previewOnly ? "sm:justify-between" : "sm:justify-end"
            }`}
          >
            {showBack && !previewOnly && (
              <Button
                variant="outline"
                onClick={onPrevious}
                className="w-full sm:w-auto rounded-xl border-slate-200 hover:bg-slate-50 py-3"
              >
                <ArrowLeft className="w-4 h-4 mr-2 shrink-0" />
                Back
              </Button>
            )}
            {previewOnly && onClose && (
              <Button
                variant="outline"
                onClick={onClose}
                className="w-full sm:w-auto rounded-xl border-slate-200 hover:bg-slate-50 py-3"
              >
                Close Preview
              </Button>
            )}
            {!previewOnly && (
              <Button
                onClick={onCreate}
                disabled={loading}
                className="w-full sm:w-auto bg-gradient-to-r from-[#f24e00] to-[#ff7c00] hover:from-[#e04500] hover:to-[#e66d00] text-white px-6 sm:px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
          </section>
          </div>
        </div>
      </div>
    </div>
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

export default memo(InvoicePreview);
