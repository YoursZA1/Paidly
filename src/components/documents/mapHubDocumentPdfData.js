import { format, parseISO, isValid } from "date-fns";
import { getLogoUrl } from "@/lib/logoUrl";
import { resolveIssuerBrand } from "@/lib/documentIssuerBrand";
import { parseDocumentBrandHex, resolveDocumentBrandColors } from "@/utils/documentBrandColors";
import { coerceDocumentLineRow } from "@/utils/documentInvoiceDisplay";
import { formatLineItemNameAndDescription } from "@/utils/invoiceTemplateData";
import { isFinancialType, typeLabel } from "@/document-engine";
import { resolveFormState } from "@/document-engine/documentFormProfiles";
import { parseChecklistField, parseRatingMatrixField } from "@/document-engine/documentFormRichFields";

function str(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function formatDisplayDate(raw) {
  if (!raw) return "";
  const d = typeof raw === "string" ? parseISO(raw.includes("T") ? raw : `${raw}T12:00:00`) : new Date(raw);
  return isValid(d) ? format(d, "d MMMM yyyy") : "";
}

function fieldText(field, raw) {
  if (raw == null || raw === "") return "";
  if (field.type === "checklist") {
    const items = parseChecklistField(raw);
    return items
      .map((item) => `${item.checked ? "☑" : "☐"} ${item.label}${item.note ? ` — ${item.note}` : ""}`)
      .join("\n");
  }
  if (field.type === "rating_matrix") {
    const matrix = parseRatingMatrixField(raw);
    return (field.competencies || [])
      .map((item) => {
        const score = str(matrix[item.key]);
        return score ? `${item.label}: ${score}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (field.type === "select") {
    const match = (field.options || []).find((option) => option.value === raw);
    return str(match?.label || raw);
  }
  if (field.type === "date") return formatDisplayDate(raw) || str(raw);
  return str(raw);
}

function statusLabel(status) {
  const text = str(status).replace(/_/g, " ");
  return text ? text.toUpperCase() : "";
}

/**
 * Hub documents (contracts, briefs, reports, and the rest) use the same
 * Clean & professional sheet as invoices and quotes.
 */
export function mapHubDocumentPdfData(doc, client = null, user = null) {
  if (!doc) return null;
  const issuerBrand = resolveIssuerBrand({ document: doc, profile: user });
  const brandPrimary =
    parseDocumentBrandHex(doc?.document_brand_primary) ||
    parseDocumentBrandHex(user?.document_brand_primary) ||
    parseDocumentBrandHex(issuerBrand?.brandPrimary) ||
    resolveDocumentBrandColors(user).primary;

  const issuerName = str(issuerBrand.name || user?.company_name) || "Company";
  const { profile, values } = resolveFormState(doc.type, doc.metadata);
  const financial = isFinancialType(doc.type);
  const label = typeLabel(doc.type) || "Document";
  const number = str(doc.document_number) || str(doc.reference_number);

  const clientObj = client && typeof client === "object" ? client : {};
  const clientName = str(doc.client_name) || str(clientObj.name) || str(values.client_name) || str(values.counterparty);
  const clientEmail = str(doc.client_email) || str(clientObj.email);
  const clientPhone = str(doc.client_phone) || str(clientObj.phone) || str(clientObj.mobile);
  const clientAddress =
    str(doc.client_address) ||
    str(clientObj.address) ||
    str(clientObj.billing_address) ||
    [clientObj.address, clientObj.city, clientObj.country].map(str).filter(Boolean).join(", ");

  const issuedRaw =
    doc.issue_date ||
    values.effective_date ||
    values.start_date ||
    values.period_start ||
    doc.created_at;
  const dueRaw =
    doc.due_date ||
    doc.valid_until ||
    values.expiry_date ||
    values.end_date ||
    values.period_end ||
    values.valid_until ||
    values.due_date;
  const dueLabel = values.expiry_date
    ? "Expires"
    : values.valid_until
      ? "Valid until"
      : values.period_end || values.end_date
        ? "End"
        : "Due";

  const body = str(doc.body);
  const sections = [];
  for (const field of profile?.fields || []) {
    if (field.type === "date") continue;
    const text = fieldText(field, values[field.key]);
    if (!text) continue;
    if (field.key === "counterparty" && text === clientName) continue;
    if (field.key === "client_name" && text === clientName) continue;
    if (body && text === body) continue;
    sections.push({ title: field.label, body: text });
  }
  if (body && !sections.some((section) => section.body === body)) {
    sections.push({ title: sections.length ? "Details" : "", body });
  }

  const rawItems = Array.isArray(doc.document_items) ? doc.document_items : Array.isArray(doc.items) ? doc.items : [];
  const items = rawItems.map((item, index) => {
    const coerced = coerceDocumentLineRow(item);
    return {
      key: item?.id || `line-${index}`,
      description: formatLineItemNameAndDescription(item) || coerced.description,
      qty: coerced.quantity,
      price: coerced.unit_price,
      total: coerced.total,
    };
  });

  return {
    brandPrimary,
    logo_url: getLogoUrl(issuerBrand.logo) || "",
    documentTitle: label.toUpperCase(),
    number: number || "—",
    statusLabel: statusLabel(doc.status),
    headline: str(doc.title),
    showFinancials: financial,
    partyLabel: "Bill to",
    sections,
    issuer: {
      name: issuerName,
      address: str(issuerBrand.address) || str(user?.company_address),
      email: str(issuerBrand.email) || str(user?.email),
      phone: str(issuerBrand.phone) || str(user?.phone),
      website: str(issuerBrand.website) || str(user?.website),
      vatNumber: str(issuerBrand.vatNumber) || str(user?.vat_number),
      registrationNumber: str(user?.company_registration) || str(user?.registration_number),
    },
    client: {
      name: clientName,
      address: clientAddress,
      email: clientEmail,
      phone: clientPhone,
      vatNumber: str(clientObj.vat_number) || str(clientObj.tax_id),
      contactPerson: str(clientObj.contact_person) || str(clientObj.contact_name),
    },
    items,
    subtotal: Number(doc.subtotal) || 0,
    tax_rate: Number(doc.tax_rate) || 0,
    tax_amount: Number(doc.tax_amount) || 0,
    discount_amount: Number(doc.discount_amount) || 0,
    total: Number(doc.total_amount) || 0,
    currency: str(doc.currency) || str(user?.currency) || "ZAR",
    totalLabel: "Total",
    issuedDateFormatted: formatDisplayDate(issuedRaw),
    dueDateFormatted: formatDisplayDate(dueRaw),
    dueLabel,
    footerLabel: [issuerName, number ? `${label} ${number}` : label].filter(Boolean).join(" · "),
    bankingRows: [],
  };
}
