import { forwardRef } from "react";
import { format, isValid, parseISO } from "date-fns";
import ClassicTemplate from "@/components/invoice/templates/ClassicTemplate";
import ModernTemplate from "@/components/invoice/templates/ModernTemplate";
import MinimalTemplate from "@/components/invoice/templates/MinimalTemplate";
import BoldTemplate from "@/components/invoice/templates/BoldTemplate";
import {
  mapInvoiceDataForTemplate,
  normalizeInvoiceTemplateKey,
} from "@/utils/invoiceTemplateData";
import { effectiveBankingDetail } from "@/utils/effectiveBankingDetail";
import InvoiceTemplateDocument from "./InvoiceTemplateDocument";

const TEMPLATES = {
  classic: ClassicTemplate,
  modern: ModernTemplate,
  minimal: MinimalTemplate,
  bold: BoldTemplate,
};

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

function normalizeClientForTemplate(client) {
  if (!client || typeof client !== "object") {
    return { name: "—", address: "", email: "" };
  }
  return {
    ...client,
    address: client.address || client.billing_address || "",
  };
}

/**
 * Props for Classic / Modern / Minimal / Bold — same resolution as preview and Invoice PDF page.
 */
export function buildInvoiceTemplatePdfCaptureProps(invoice, client, user, bankingDetail) {
  const templateKey =
    normalizeInvoiceTemplateKey(invoice?.invoice_template) ||
    normalizeInvoiceTemplateKey(user?.invoice_template) ||
    "classic";

  const resolvedUser = user
    ? {
        ...user,
        logo_url:
          invoice?.owner_logo_url ||
          user.logo_url ||
          user.company_logo_url ||
          invoice?.company?.logo_url ||
          null,
        company_name: invoice?.owner_company_name || user.company_name,
        company_address: invoice?.owner_company_address || user.company_address,
        currency: invoice?.currency || invoice?.owner_currency || user.currency || "ZAR",
        invoice_template: templateKey,
      }
    : {
        company_name: invoice?.owner_company_name || "Company",
        logo_url: invoice?.company?.logo_url || invoice?.owner_logo_url || null,
        company_address: invoice?.owner_company_address || "",
        currency: invoice?.currency || invoice?.owner_currency || "ZAR",
        invoice_template: templateKey,
        invoice_header: "",
      };

  const TemplateComponent = TEMPLATES[templateKey] || TEMPLATES.classic;
  const templateInvoice = mapInvoiceDataForTemplate(invoice);
  const userCurrency =
    resolvedUser?.currency || invoice?.currency || invoice?.owner_currency || "ZAR";
  const bankingForTemplate = effectiveBankingDetail(bankingDetail, resolvedUser);
  const clientForTemplate = normalizeClientForTemplate(client);

  return {
    TemplateComponent,
    templateInvoice,
    resolvedUser,
    userCurrency,
    bankingForTemplate,
    clientForTemplate,
    invoice,
  };
}

const InvoiceTemplatePdfCapture = forwardRef(function InvoiceTemplatePdfCapture(
  { invoice, client, user, bankingDetail },
  ref
) {
  const pack = buildInvoiceTemplatePdfCaptureProps(invoice, client, user, bankingDetail);

  return (
    <InvoiceTemplateDocument
      ref={ref}
      TemplateComponent={pack.TemplateComponent}
      invoice={pack.templateInvoice}
      client={pack.clientForTemplate || { name: pack.invoice?.client_name || "Client" }}
      user={pack.resolvedUser}
      bankingDetail={pack.bankingForTemplate}
      userCurrency={pack.userCurrency}
      safeFormatDate={safeFormatDate}
      embeddedChrome={false}
    />
  );
});

export default InvoiceTemplatePdfCapture;
