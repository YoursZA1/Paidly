import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminDirectory } from "@/api/fetchAdminDirectory";
import PageContainer from "@/components/admin/shell/PageContainer";
import AdminDataTable from "@/components/admin/ui/AdminDataTable";
import FilterBar from "@/components/admin/ui/FilterBar";
import MetricCard from "@/components/admin/ui/MetricCard";

const KIND_META = {
  businesses: {
    title: "Businesses",
    description: "Who is using Paidly. Customer revenue is not shown — that belongs to the tenant.",
    columns: [
      { key: "business", label: "Business" },
      { key: "plan", label: "Plan" },
      { key: "status", label: "Status", type: "status" },
      { key: "users", label: "Users" },
      { key: "documents", label: "Documents" },
      { key: "featureUsage", label: "Feature usage" },
      { key: "lastActive", label: "Last active", type: "date" },
      { key: "extra", label: "Flag" },
      { key: "date", label: "Created", type: "date" },
    ],
  },
  plans: {
    title: "Plans",
    description: "Current SaaS catalog. Legacy Individual/SME/Corporate rows stay in the database for historical subscriptions.",
    columns: [
      { key: "title", label: "Plan" },
      { key: "amount", label: "Price", type: "money" },
      { key: "users", label: "Active subscribers" },
      { key: "extra", label: "Trial users" },
      { key: "mrr", label: "Monthly revenue", type: "money" },
      { key: "status", label: "Status", type: "status" },
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
    title: "Invoice usage",
    description: "How many invoices Paidly businesses create. Support rows omit customer amounts.",
    columns: [
      { key: "title", label: "Invoice" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  quotes: {
    title: "Quote usage",
    description: "How many quotes Paidly businesses create. Support rows omit customer amounts.",
    columns: [
      { key: "title", label: "Quote" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  pos: {
    title: "POS usage",
    description: "How much Paidly POS is used. Customer till totals are not Paidly revenue.",
    columns: [
      { key: "title", label: "Sale" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Method" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  payments: {
    title: "Paidly payments",
    description: "Subscription payments from payment_history. Customer invoice settlements are tenant books.",
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
    title: "Recurring usage",
    description: "Recurring document creation across organisations.",
    columns: [
      { key: "title", label: "Document" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  employees: {
    title: "Workforce usage",
    description: "Employees managed on Paidly (memberships). Not Admin’s own company roster.",
    columns: [
      { key: "title", label: "Employee" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Role / dept" },
      { key: "date", label: "Added", type: "date" },
    ],
  },
  payroll: {
    title: "Payroll usage",
    description: "Payroll profiles created on Paidly. Employee pay figures are not shown.",
    columns: [
      { key: "title", label: "Employee" },
      { key: "subtitle", label: "Title" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  leave: {
    title: "Leave usage",
    description: "Leave requests created on Paidly.",
    columns: [
      { key: "title", label: "Request" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "extra", label: "Dates" },
      { key: "date", label: "Submitted", type: "date" },
    ],
  },
  attendance: {
    title: "Attendance usage",
    description: "Attendance profiles created on Paidly.",
    columns: [
      { key: "title", label: "Profile" },
      { key: "business", label: "Business" },
      { key: "date", label: "Created", type: "date" },
    ],
  },
  payslips: {
    title: "Payslip usage",
    description: "Payslips generated on Paidly. Amounts stay with the tenant.",
    columns: [
      { key: "title", label: "Payslip" },
      { key: "business", label: "Business" },
      { key: "status", label: "Status", type: "status" },
      { key: "date", label: "Date", type: "date" },
    ],
  },
  transactions: {
    title: "Paidly transactions",
    description: "Paidly’s own ledger: subscription payments and refunds from payment_history.",
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
    description: "Customer Payment Engine monitoring (Ozow / cash / card). Not PayFast SaaS billing.",
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
    description: "Customer quote templates (support inspection). There is no separate Paidly platform template catalog yet.",
    columns: [
      { key: "title", label: "Template" },
      { key: "business", label: "Business" },
      { key: "date", label: "Created", type: "date" },
    ],
  },
  integrations: {
    title: "Integrations",
    description: "POS connections across businesses. Platform rails (PayFast, Ozow, email) are on System Health.",
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
      {data?.usage ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.usage.total != null ? <MetricCard title="Total" value={data.usage.total} /> : null}
          {data.usage.today != null ? <MetricCard title="Today" value={data.usage.today} /> : null}
          {data.usage.thisMonth != null ? <MetricCard title="This month" value={data.usage.thisMonth} /> : null}
          {data.usage.successful != null ? <MetricCard title="Successful" value={data.usage.successful} /> : null}
          {data.usage.failed != null ? <MetricCard title="Failed" value={data.usage.failed} /> : null}
          {data.usage.pending != null ? <MetricCard title="Pending" value={data.usage.pending} /> : null}
          {data.usage.successRate != null ? <MetricCard title="Success rate" value={data.usage.successRate} /> : null}
          {data.usage.enabledBusinesses != null ? <MetricCard title="POS-enabled businesses" value={data.usage.enabledBusinesses} /> : null}
          {data.usage.connections != null ? <MetricCard title="POS connections" value={data.usage.connections} /> : null}
        </div>
      ) : null}
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
