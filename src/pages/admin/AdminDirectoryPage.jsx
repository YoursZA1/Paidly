import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminDirectory } from "@/api/fetchAdminDirectory";
import PageContainer from "@/components/admin/shell/PageContainer";
import AdminDataTable from "@/components/admin/ui/AdminDataTable";
import FilterBar from "@/components/admin/ui/FilterBar";

const KIND_META = {
  businesses: {
    title: "Businesses",
    description: "Organisations on Paidly.",
    columns: [
      { key: "business", label: "Business" },
      { key: "plan", label: "Plan" },
      { key: "status", label: "Status", type: "status" },
      { key: "users", label: "Users" },
      { key: "documents", label: "Documents" },
      { key: "revenue", label: "Revenue", type: "money" },
      { key: "date", label: "Created", type: "date" },
    ],
  },
  plans: {
    title: "Plans",
    description: "SaaS catalog from the plans table.",
    columns: [
      { key: "title", label: "Plan" },
      { key: "subtitle", label: "Slug" },
      { key: "status", label: "Status", type: "status" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "extra", label: "Cycle" },
    ],
  },
  affiliates: {
    title: "Affiliates",
    description: "Partners and applications.",
    columns: [
      { key: "title", label: "Affiliate" },
      { key: "subtitle", label: "Detail" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Type" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  invoices: {
    title: "Invoices",
    description: "Customer invoices across organisations.",
    columns: [
      { key: "title", label: "Invoice" },
      { key: "business", label: "Business" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  quotes: {
    title: "Quotes",
    description: "Customer quotes across organisations.",
    columns: [
      { key: "title", label: "Quote" },
      { key: "business", label: "Business" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  pos: {
    title: "POS",
    description: "Till sales from pos_sales_events.",
    columns: [
      { key: "title", label: "Sale" },
      { key: "business", label: "Business" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Method" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  payments: {
    title: "Payments",
    description: "Invoice settlement rows.",
    columns: [
      { key: "title", label: "Payment" },
      { key: "business", label: "Business" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Method" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  recurring: {
    title: "Recurring documents",
    description: "Recurring invoices across organisations.",
    columns: [
      { key: "title", label: "Document" },
      { key: "business", label: "Business" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  employees: {
    title: "Employees",
    description: "Workforce identity is memberships, not a separate employees table.",
    columns: [
      { key: "title", label: "Employee" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Role / dept" },
      { key: "date", label: "Added", type: "date" },
    ],
  },
  payroll: {
    title: "Payroll",
    description: "Payroll profiles across organisations.",
    columns: [
      { key: "title", label: "Employee" },
      { key: "subtitle", label: "Title" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  leave: {
    title: "Leave",
    description: "Leave requests across organisations.",
    columns: [
      { key: "title", label: "Request" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Dates" },
      { key: "date", label: "Submitted", type: "date" },
    ],
  },
  attendance: {
    title: "Attendance",
    description: "Attendance profiles.",
    columns: [
      { key: "title", label: "Profile" },
      { key: "business", label: "Business" },
      { key: "date", label: "Created", type: "date" },
    ],
  },
  payslips: {
    title: "Payslips",
    description: "Payslips across organisations.",
    columns: [
      { key: "title", label: "Payslip" },
      { key: "business", label: "Business" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  transactions: {
    title: "Transactions",
    description: "Subscription, invoice, and POS money movement.",
    columns: [
      { key: "title", label: "Transaction" },
      { key: "business", label: "Business" },
      { key: "type", label: "Type" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Method" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  "payment-intents": {
    title: "Payment intents",
    description: "Customer Payment Engine intents (not PayFast SaaS).",
    columns: [
      { key: "title", label: "Source" },
      { key: "business", label: "Business" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Provider" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  refunds: {
    title: "Refunds",
    description: "Refunded SaaS payment_history rows.",
    columns: [
      { key: "title", label: "Refund" },
      { key: "business", label: "Business" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Method" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  templates: {
    title: "Templates",
    description: "Org quote templates when the table is readable.",
    columns: [
      { key: "title", label: "Template" },
      { key: "business", label: "Business" },
      { key: "date", label: "Created", type: "date" },
    ],
  },
  integrations: {
    title: "Integrations",
    description: "POS connections.",
    columns: [
      { key: "title", label: "Integration" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Provider" },
      { key: "date", label: "Last event", type: "date" },
    ],
  },
};

export default function AdminDirectoryPage({ kind }) {
  const meta = KIND_META[kind] || { title: kind, description: "", columns: [{ key: "title", label: "Item" }] };
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-directory", kind],
    queryFn: () => fetchAdminDirectory(kind, 80),
    staleTime: 30000,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = data?.rows || [];
    if (!q) return all;
    return all.filter((row) =>
      [row.title, row.subtitle, row.business, row.status, row.extra, row.plan]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data?.rows, search]);

  return (
    <PageContainer
      title={meta.title}
      description={meta.description}
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
    >
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <div className="px-4 pt-4">
          <FilterBar search={search} onSearch={setSearch} placeholder={`Search ${meta.title.toLowerCase()}…`} />
        </div>
        <AdminDataTable
          columns={meta.columns}
          rows={rows}
          isLoading={isLoading}
          errorMessage={isError ? error?.message : null}
          unavailable={Boolean(data?.unavailable)}
          unavailableReason={data?.unavailableReason}
          emptyTitle={`No ${meta.title.toLowerCase()} yet`}
          onRetry={() => refetch()}
        />
      </div>
    </PageContainer>
  );
}
