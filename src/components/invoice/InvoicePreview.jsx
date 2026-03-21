import PropTypes from "prop-types";
import React, { memo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, FileText, Download, Send } from "lucide-react";
import { motion } from "framer-motion";
import { format, isValid, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { getBackendBaseUrl } from "@/api/backendClient";
import { createPageUrl } from "@/utils";
import { generateInvoicePDF } from "@/components/pdf/generateInvoicePDF";
import {
  mapToInvoiceData,
  effectiveBankingDetail,
} from "@/components/pdf/InvoicePDFDownloadLink";
import ClassicTemplate from "@/components/invoice/templates/ClassicTemplate";
import ModernTemplate from "@/components/invoice/templates/ModernTemplate";
import MinimalTemplate from "@/components/invoice/templates/MinimalTemplate";
import BoldTemplate from "@/components/invoice/templates/BoldTemplate";

const TEMPLATES = {
  classic: ClassicTemplate,
  modern: ModernTemplate,
  minimal: MinimalTemplate,
  bold: BoldTemplate,
};

const DRAFT_STORAGE_KEY = "invoiceDraft";

function safeFormatDate(dateStr) {
  if (!dateStr) return "N/A";
  const date =
    typeof dateStr === "string"
      ? parseISO(dateStr)
      : dateStr instanceof Date
        ? dateStr
        : new Date(dateStr);
  return isValid(date) ? format(date, "MMMM d, yyyy") : "N/A";
}

/** Same shape as `InvoicePDF` draft mapping so preview matches PDF/download page. */
function mapFormInvoiceToTemplateInvoice(invoiceData) {
  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];
  return {
    invoice_number: invoiceData.invoice_number || invoiceData.reference_number || "Draft",
    delivery_date: invoiceData.delivery_date,
    created_date: invoiceData.invoice_date || invoiceData.delivery_date,
    status: invoiceData.status || "draft",
    items: items.map((item) => ({
      service_name: item.name || item.service_name || "Item",
      name: item.name || item.service_name,
      description: item.description ?? "",
      quantity: Number(item.quantity ?? item.qty ?? 1),
      unit_price: Number(item.unit_price ?? item.rate ?? item.price ?? 0),
      total_price: Number(
        item.total_price ?? item.total ?? Number(item.quantity ?? item.qty ?? 1) * Number(item.unit_price ?? item.rate ?? item.price ?? 0)
      ),
    })),
    subtotal: Number(invoiceData.subtotal ?? 0),
    tax_rate: Number(invoiceData.tax_rate ?? 0),
    tax_amount: Number(invoiceData.tax_amount ?? 0),
    total_amount: Number(invoiceData.total_amount ?? 0),
    discount_amount: Number(invoiceData.discount_amount ?? 0),
    discount_type: invoiceData.discount_type,
    discount_value: invoiceData.discount_value,
    notes: invoiceData.notes || "",
    terms_conditions: invoiceData.terms_conditions || "",
    project_title: invoiceData.project_title || "",
    project_description: invoiceData.project_description || "",
  };
}

function normalizeClientForTemplate(client) {
  if (!client || typeof client !== "object") {
    return { name: "—", address: "", email: "" };
  }
  return {
    ...client,
    address: client.address || client.billing_address || "",
  };
}

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
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);

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
  const clientResolved = clientList.find((c) => c.id === invoiceData?.client_id) ?? null;
  const client = normalizeClientForTemplate(clientProp ?? clientResolved);

  const templateKey = user?.invoice_template || "classic";
  const TemplateComponent = TEMPLATES[templateKey] || TEMPLATES.classic;
  const templateInvoice = mapFormInvoiceToTemplateInvoice(invoiceData);
  const bankingForTemplate = effectiveBankingDetail(bankingDetail, user);
  const userCurrency =
    (invoiceData?.currency || user?.currency || "ZAR").toString().trim() || "ZAR";

  const handleDownloadPDF = () => {
    try {
      sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          invoiceData: {
            ...invoiceData,
            invoice_number: invoiceData.invoice_number || invoiceData.reference_number || "Draft",
          },
          client: clientProp ?? clientResolved ?? {},
          user: user || {},
          bankingDetail: bankingDetail || null,
        })
      );
      window.open(`${createPageUrl("InvoicePDF")}?draft=1`, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Failed to open invoice PDF:", e);
      toast({
        title: "Download failed",
        description: "Could not open the PDF page. Try again.",
        variant: "destructive",
      });
    }
  };

  const blobToDataURI = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const handleSendEmail = async () => {
    const clientEmail = client?.email?.trim();
    if (!clientEmail) {
      toast({
        title: "No client email",
        description: "Add an email to the client to send the invoice.",
        variant: "destructive",
      });
      return;
    }
    setIsSending(true);
    try {
      const bank = effectiveBankingDetail(bankingDetail, user);
      const pdfPayload = mapToInvoiceData(invoiceData, clientProp ?? clientResolved ?? {}, user, bank);
      const blob = await generateInvoicePDF(pdfPayload);
      const base64PDF = await blobToDataURI(blob);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast({ title: "Not signed in", description: "Please sign in to send the invoice.", variant: "destructive" });
        return;
      }
      const invoiceNum = invoiceData?.invoice_number || invoiceData?.reference_number || "Draft";
      const currency = user?.currency || invoiceData?.owner_currency || "ZAR";
      const amountDue = new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(
        Number(invoiceData?.total_amount ?? invoiceData?.total ?? 0)
      );
      const dueDateRaw = invoiceData?.delivery_date || invoiceData?.due_date;
      const dueDate = dueDateRaw
        ? (() => {
            try {
              const d = typeof dueDateRaw === "string" ? new Date(dueDateRaw) : dueDateRaw;
              return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
            } catch {
              return "";
            }
          })()
        : "";
      const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
      const res = await fetch(`${apiBase}/api/send-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          base64PDF,
          clientEmail,
          invoiceNum,
          fromName: user?.company_name || "Paidly",
          clientName: client?.name?.trim() || undefined,
          amountDue: amountDue || undefined,
          dueDate: dueDate || undefined,
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
      const isNetworkError = error?.message === "Failed to fetch" || error?.name === "TypeError";
      const description = isNetworkError
        ? "Could not reach the server. If you use app.paidly.co.za or www.app.paidly.co.za, ensure VITE_SERVER_URL points to your backend (e.g. https://api.paidly.co.za)."
        : error?.message || "Could not send email";
      toast({ title: "Send failed", description, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div style={{ opacity: 1 }}>
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl overflow-x-auto overflow-y-visible rounded-fintech text-card-foreground min-w-0">
        <CardHeader className="border-b border-border pb-4 sm:pb-6 px-4 sm:px-6">
          {user?.logo_url && (
            <div className="mb-3 sm:mb-4 flex justify-center">
              <img
                src={user.logo_url}
                alt="Company Logo"
                className="w-auto max-w-[200px] sm:max-w-xs rounded shadow"
                style={{ height: "60px", maxWidth: "300px", objectFit: "contain" }}
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
                disabled={isSending}
                className="w-full sm:w-auto rounded-xl border-border bg-card text-foreground hover:bg-muted disabled:opacity-70"
              >
                <Download className="w-4 h-4 mr-2 shrink-0" />
                Download PDF
              </Button>
              {client?.email && (
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={isSending}
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

        <CardContent className="p-4 sm:p-6 lg:p-8 pt-4">
          <div className="w-full min-w-0 max-w-[210mm] mx-auto rounded-lg border border-border bg-white shadow-sm overflow-x-auto print-container">
            <div className="pdf-content invoice-container min-w-0 p-4 sm:p-6 md:p-8">
              <TemplateComponent
                invoice={templateInvoice}
                client={client}
                user={user}
                bankingDetail={bankingForTemplate}
                userCurrency={userCurrency}
                safeFormatDate={safeFormatDate}
              />
            </div>
          </div>

          <section
            className={`flex flex-col-reverse sm:flex-row mt-6 sm:mt-8 gap-3 ${
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
        </CardContent>
      </Card>
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
