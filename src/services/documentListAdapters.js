import { applyInvoiceFilters } from "@/components/filters/InvoiceFilters";

function searchValue(value) {
  return String(value || "").toLowerCase();
}

function sortByCreatedDate(a, b, direction = "desc") {
  const aTime = new Date(a?.created_date || 0).getTime();
  const bTime = new Date(b?.created_date || 0).getTime();
  return direction === "asc" ? aTime - bTime : bTime - aTime;
}

function buildStatusMeta(status, dictionary) {
  const key = String(status || "unknown").toLowerCase();
  return dictionary[key] || dictionary.default;
}

const invoiceStatusDictionary = {
  paid: { tone: "success", label: "Paid" },
  overdue: { tone: "danger", label: "Overdue" },
  sent: { tone: "info", label: "Sent" },
  draft: { tone: "muted", label: "Draft" },
  pending: { tone: "warning", label: "Pending" },
  default: { tone: "muted", label: "Unknown" },
};

const quoteStatusDictionary = {
  accepted: { tone: "success", label: "Accepted" },
  rejected: { tone: "danger", label: "Rejected" },
  expired: { tone: "warning", label: "Expired" },
  sent: { tone: "info", label: "Sent" },
  draft: { tone: "muted", label: "Draft" },
  default: { tone: "muted", label: "Unknown" },
};

const payslipStatusDictionary = {
  paid: { tone: "success", label: "Paid" },
  processed: { tone: "info", label: "Processed" },
  draft: { tone: "muted", label: "Draft" },
  default: { tone: "muted", label: "Unknown" },
};

export const invoiceListAdapter = {
  process(invoices, context) {
    const { filters = {}, clientMap = new Map() } = context;
    return applyInvoiceFilters(invoices, filters, clientMap).map((invoice) => ({
      ...invoice,
      _documentType: "invoice",
      _statusMeta: buildStatusMeta(invoice?.status, invoiceStatusDictionary),
    }));
  },
};

export const quoteListAdapter = {
  process(quotes, context) {
    const { searchTerm = "", sortBy = "date_newest", clientMap = new Map() } = context;
    const term = searchValue(searchTerm);
    const filtered = quotes.filter((quote) => {
      if (!term) return true;
      const title = searchValue(quote?.project_title);
      const number = searchValue(quote?.quote_number);
      const clientName = searchValue(clientMap.get(quote?.client_id)?.name);
      return title.includes(term) || number.includes(term) || clientName.includes(term);
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "date_oldest":
          return sortByCreatedDate(a, b, "asc");
        case "amount_highest":
          return Number(b?.total_amount || 0) - Number(a?.total_amount || 0);
        case "amount_lowest":
          return Number(a?.total_amount || 0) - Number(b?.total_amount || 0);
        case "date_newest":
        default:
          return sortByCreatedDate(a, b, "desc");
      }
    }).map((quote) => ({
      ...quote,
      _documentType: "quote",
      _statusMeta: buildStatusMeta(quote?.status, quoteStatusDictionary),
    }));
  },
};

export const payslipListAdapter = {
  process(payslips, context) {
    const term = searchValue(context?.searchTerm);
    return payslips.filter((payslip) => {
      if (!term) return true;
      return (
        searchValue(payslip?.employee_name).includes(term) ||
        searchValue(payslip?.payslip_number).includes(term) ||
        searchValue(payslip?.position).includes(term)
      );
    }).map((payslip) => ({
      ...payslip,
      _documentType: "payslip",
      _statusMeta: buildStatusMeta(payslip?.status, payslipStatusDictionary),
    }));
  },
};

