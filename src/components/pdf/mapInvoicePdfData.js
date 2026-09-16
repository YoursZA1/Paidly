import { format, parseISO, isValid } from "date-fns";
import { effectiveInvoiceTermsForDisplay } from "@/constants/invoiceTerms";
import { formatCurrency } from "@/components/CurrencySelector";
import { formatLineItemNameAndDescription } from "@/utils/invoiceTemplateData";
import { coerceDocumentLineRow, sanitizeDocumentDisplayText } from "@/utils/documentInvoiceDisplay";
import { getLogoUrl } from "@/lib/logoUrl";
import { resolveIssuerBrand } from "@/lib/documentIssuerBrand";
import { effectiveBankingDetail } from "@/utils/effectiveBankingDetail";
import { formatDocumentPreviewBankingRows } from "@/utils/formatDocumentPreviewBankingLines";
import {
  parseDocumentBrandHex,
  resolveDocumentBrandColors,
} from "@/utils/documentBrandColors";
import {
  invoiceStatusLabel,
  normalizeInvoiceStatus,
} from "@shared/commercial/documentStatuses.js";

function str(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function formatDisplayDate(raw) {
  if (!raw) return "";
  const d = typeof raw === "string" ? parseISO(raw) : new Date(raw);
  return isValid(d) ? format(d, "d MMMM yyyy") : "";
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Maps app invoice + client + user + banking into the premium PDF document shape.
 * Displays stored totals only — does not recalculate invoice math.
 *
 * @param {object} invoice
 * @param {object} client
 * @param {object|null} user
 * @param {object|null} bankingDetail
 */
export function mapInvoicePdfData(invoice, client, user = null, bankingDetail = null) {
  const issuerBrand = resolveIssuerBrand({
    document: invoice,
    company: invoice?.company,
    profile: user,
  });

  const brandPrimary =
    parseDocumentBrandHex(invoice?.document_brand_primary) ||
    parseDocumentBrandHex(user?.document_brand_primary) ||
    parseDocumentBrandHex(issuerBrand?.brandPrimary) ||
    resolveDocumentBrandColors(user).primary;

  const issuerName = str(issuerBrand.name || user?.company_name) || "Company";
  const issuerAddress =
    str(issuerBrand.address) ||
    str(invoice?.owner_company_address) ||
    str(user?.company_address);
  const issuerEmail =
    str(issuerBrand.email) || str(invoice?.owner_email) || str(user?.email);
  const issuerPhone =
    str(issuerBrand.phone) || str(invoice?.owner_phone) || str(user?.phone);
  const issuerWebsite = str(issuerBrand.website) || str(user?.website);
  const issuerVat =
    str(issuerBrand.vatNumber) ||
    str(invoice?.owner_vat_number) ||
    str(user?.vat_number);
  const registrationNumber =
    str(user?.company_registration) ||
    str(user?.registration_number) ||
    str(invoice?.owner_registration_number);

  const number =
    str(invoice?.invoice_number) || str(invoice?.reference_number) || "—";
  const logo_url = getLogoUrl(issuerBrand.logo) || "";
  const status = normalizeInvoiceStatus(invoice?.status || "draft");
  const statusLabel = invoiceStatusLabel(status);

  const clientObj = client && typeof client === "object" ? client : {};
  const clientName =
    str(clientObj.name) || str(invoice?.client_name) || "Client";
  const clientAddress =
    str(clientObj.address) ||
    str(clientObj.billing_address) ||
    [clientObj.address_line1, clientObj.city, clientObj.postal_code]
      .map(str)
      .filter(Boolean)
      .join(", ");
  const clientEmail = str(clientObj.email) || str(invoice?.client_email);
  const clientPhone = str(clientObj.phone) || str(clientObj.mobile);
  const clientVat = str(clientObj.vat_number) || str(clientObj.tax_number);
  const contactPerson =
    str(clientObj.contact_person) ||
    str(clientObj.contact_name) ||
    str(clientObj.primary_contact);

  const rawItems = Array.isArray(invoice?.items)
    ? invoice.items
    : Array.isArray(invoice?.line_items)
      ? invoice.line_items
      : [];

  const items = rawItems.map((item, index) => {
    const coerced = coerceDocumentLineRow(item);
    return {
      key: item?.id || `line-${index}`,
      description: formatLineItemNameAndDescription(item) || coerced.description,
      qty: coerced.quantity,
      price: coerced.unit_price,
      total: coerced.total,
      item_tax_rate: item?.item_tax_rate,
    };
  });

  const notes = sanitizeDocumentDisplayText(invoice?.notes);
  const paymentTerms = effectiveInvoiceTermsForDisplay(
    str(invoice?.terms_conditions) || str(invoice?.payment_terms)
  );

  const subtotal = toFiniteNumber(
    invoice?.subtotal ?? invoice?.total_amount ?? 0
  );
  const tax_rate = toFiniteNumber(invoice?.tax_rate ?? 0);
  const tax_amount = toFiniteNumber(invoice?.tax_amount ?? 0);
  const discount_amount = toFiniteNumber(
    invoice?.discount_amount ?? invoice?.discount ?? 0
  );
  const total = toFiniteNumber(
    invoice?.total_amount ?? invoice?.total ?? invoice?.subtotal ?? 0
  );
  const amount_paid = toFiniteNumber(
    invoice?.amount_paid ?? invoice?.paid_amount ?? 0
  );
  const balance_due =
    invoice?.balance_due != null || invoice?.balance != null
      ? toFiniteNumber(invoice?.balance_due ?? invoice?.balance)
      : amount_paid > 0
        ? Math.max(0, total - amount_paid)
        : undefined;

  const currency =
    str(invoice?.currency) ||
    str(invoice?.owner_currency) ||
    str(user?.currency) ||
    "ZAR";

  const issuedDateRaw =
    invoice?.invoice_date || invoice?.created_date || invoice?.created_at;
  const dueDateRaw = invoice?.delivery_date || invoice?.due_date;

  const banking = effectiveBankingDetail(bankingDetail, user);
  let bankingRows = formatDocumentPreviewBankingRows(banking);
  if (bankingRows && number && number !== "—") {
    const hasRef = bankingRows.some(
      (r) => String(r.label || "").toLowerCase().includes("reference")
    );
    if (!hasRef) {
      bankingRows = [
        ...bankingRows,
        { label: "Payment reference", value: number },
      ];
    }
  }

  // Legacy bankDetails shape for callers that still expect it
  const bankDetails = bankingRows
    ? {
        bank: banking?.bank_name || "",
        accountName: banking?.account_name || "",
        accountNumber: banking?.account_number || "",
        branchCode: banking?.routing_number || banking?.branch_code || "",
        swiftCode: banking?.swift_code || "",
        reference: number,
      }
    : null;

  return {
    issuerBrand,
    brandPrimary,
    brand: issuerName,
    address: issuerAddress,
    logo_url,
    number,
    status,
    statusLabel,
    issuer: {
      name: issuerName,
      address: issuerAddress,
      email: issuerEmail,
      phone: issuerPhone,
      website: issuerWebsite,
      vatNumber: issuerVat,
      registrationNumber,
    },
    client: {
      name: clientName,
      address: clientAddress,
      email: clientEmail,
      phone: clientPhone,
      vatNumber: clientVat,
      contactPerson,
    },
    items,
    notes,
    paymentTerms,
    subtotal,
    tax_rate,
    tax_amount,
    discount_amount,
    total,
    amount_paid,
    balance_due,
    currency,
    formattedTotal: formatCurrency(total, currency),
    issuedDateFormatted: formatDisplayDate(issuedDateRaw),
    due_date: dueDateRaw || "",
    dueDateFormatted: formatDisplayDate(dueDateRaw),
    bankingRows,
    bankDetails,
  };
}

/** @deprecated Prefer mapInvoicePdfData — kept as alias for existing imports. */
export function mapToInvoiceData(invoice, client, user, bankingDetail = null) {
  return mapInvoicePdfData(invoice, client, user, bankingDetail);
}
