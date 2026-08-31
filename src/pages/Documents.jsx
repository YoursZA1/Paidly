import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import TablePagination from "@/components/ui/TablePagination";
import NewDocumentMenu from "@/components/documents/NewDocumentMenu";
import DocumentHubTable from "@/components/documents/DocumentHubTable";
import DocumentTemplatesDialog from "@/components/documents/DocumentTemplatesDialog";
import { DocumentService } from "@/services/DocumentService";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { createPageUrl } from "@/utils";
import {
  DOCUMENT_CATEGORIES,
  HUB_DOCUMENT_TYPE_DEFS,
  typeLabel,
  isFinancialType,
  getDedicatedCreatePath,
  isCommercialDocumentType,
  specialisedComposeUrl,
} from "@/document-engine";
import {
  Files,
  FilePen,
  Clock,
  Send,
  PenTool,
  Archive,
  Search,
  X,
  LayoutTemplate,
  Upload,
} from "lucide-react";

const PAGE_SIZE = 25;

const KPI_DEFS = [
  { key: "all", label: "Total Documents", field: "total", icon: Files, accent: "text-foreground" },
  { key: "draft", label: "Drafts", field: "drafts", icon: FilePen, accent: "text-muted-foreground" },
  { key: "pending", label: "Pending Approval", field: "pending", icon: Clock, accent: "text-amber-600" },
  { key: "sent", label: "Sent", field: "sent", icon: Send, accent: "text-blue-600" },
  { key: "signed", label: "Signed", field: "signed", icon: PenTool, accent: "text-emerald-600" },
  { key: "archived", label: "Archived", field: "archived", icon: Archive, accent: "text-muted-foreground" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "updated", label: "Recently updated" },
  { value: "value", label: "Highest value" },
  { value: "alpha", label: "Alphabetical" },
];

const INITIAL_FILTERS = {
  search: "",
  category: "all",
  type: "all",
  status: "all",
  assignedUserId: "all",
  sort: "newest",
};

function filtersFromSearchParams(searchParams) {
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const search = searchParams.get("search");
  const category = searchParams.get("category");
  if (!status && !type && !search && !category) return INITIAL_FILTERS;
  return {
    ...INITIAL_FILTERS,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(search ? { search } : {}),
    ...(category ? { category } : {}),
  };
}

export default function DocumentsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { dataScope, hasPermission, canCreateDocumentType, loading: companyLoading } =
    useCompanyContext();
  const isEmployeeScope = !companyLoading && dataScope.scope === "self";
  const canManageCompanyDocuments = hasPermission(PERMISSIONS.MANAGE_COMPANY_DOCUMENTS);

  const [filters, setFilters] = useState(() => filtersFromSearchParams(searchParams));
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [hubCaps, setHubCaps] = useState(null);

  useEffect(() => {
    setFilters((current) => {
      const next = filtersFromSearchParams(searchParams);
      if (
        current.status === next.status &&
        current.type === next.type &&
        current.search === next.search &&
        current.category === next.category
      ) {
        return current;
      }
      return {
        ...current,
        status: next.status,
        type: next.type,
        search: next.search,
        category: next.category,
      };
    });
    setSearchInput((prev) => {
      const nextSearch = searchParams.get("search") || "";
      return prev === nextSearch ? prev : nextSearch;
    });
    setPage(0);
  }, [searchParams]);

  useEffect(() => {
    DocumentService.listOrgMembers()
      .then((rows) => setMembers(Array.isArray(rows) ? rows : []))
      .catch(() => setMembers([]));
    DocumentService.getHubCapabilities()
      .then(setHubCaps)
      .catch(() => setHubCaps({ templates: false, archive: false, assignees: false, newTypes: false }));
  }, []);

  // Debounce the search box into the active filter set.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput }));
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const kpisQuery = useQuery({
    queryKey: ["documents", "kpis"],
    queryFn: () => DocumentService.getKpis(),
    staleTime: 30_000,
  });

  const listQuery = useQuery({
    queryKey: ["documents", "hub", filters, page],
    queryFn: () =>
      DocumentService.listPage({
        ...filters,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    staleTime: 15_000,
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const typeOptions = useMemo(() => {
    if (filters.category === "all") return HUB_DOCUMENT_TYPE_DEFS;
    return HUB_DOCUMENT_TYPE_DEFS.filter((t) => t.category === filters.category);
  }, [filters.category]);

  const filtersActive =
    filters.search ||
    filters.category !== "all" ||
    filters.type !== "all" ||
    filters.status !== "all" ||
    filters.assignedUserId !== "all" ||
    filters.sort !== "newest";

  const hubIncomplete = hubCaps && (!hubCaps.templates || !hubCaps.archive || !hubCaps.newTypes);

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  }, [queryClient]);

  const setFilter = useCallback((key, value) => {
    setSelectedIds(new Set());
    setPage(0);
    setFilters((f) => {
      const next = { ...f, [key]: value };
      // Changing category resets a now-incompatible type selection.
      if (key === "category" && value !== "all" && f.type !== "all") {
        const stillValid = HUB_DOCUMENT_TYPE_DEFS.some((t) => t.key === f.type && t.category === value);
        if (!stillValid) next.type = "all";
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setSearchInput("");
    setSelectedIds(new Set());
    setPage(0);
  }, []);

  const handleCreate = useCallback(
    async (type) => {
      if (isCommercialDocumentType(type)) {
        const dedicatedPath = getDedicatedCreatePath(type);
        navigate(dedicatedPath || createPageUrl("Invoices"), {
          state: { returnTo: createPageUrl("Documents") },
        });
        return;
      }

      const dedicatedPath = getDedicatedCreatePath(type);
      if (dedicatedPath) {
        navigate(dedicatedPath, { state: { returnTo: createPageUrl("Documents") } });
        return;
      }

      setCreating(true);
      try {
        const defaultTpl = await DocumentService.getDefaultTemplateForType(type);
        let doc;
        if (defaultTpl?.id) {
          doc = await DocumentService.createFromTemplate(defaultTpl.id);
        } else {
          const financial = isFinancialType(type);
          doc = await DocumentService.create({
            type,
            title: `New ${typeLabel(type)}`,
            currency: "ZAR",
            base_currency: "ZAR",
            ...(financial ? { items: [{ description: "Line item", quantity: 1, unit_price: 0 }] } : {}),
          });
        }
        refreshAll();
        if (doc?.id) {
          navigate(`${createPageUrl("Documents")}/${encodeURIComponent(doc.id)}`);
        }
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Could not create document",
          description: e?.message || String(e),
        });
      } finally {
        setCreating(false);
      }
    },
    [navigate, refreshAll, toast]
  );

  const openDocument = useCallback(
    (row) => {
      navigate(`${createPageUrl("Documents")}/${encodeURIComponent(row.id)}`);
    },
    [navigate]
  );

  const handleAction = useCallback(
    async (action, row) => {
      try {
        if (action === "delete") {
          setPendingDelete(row);
          return;
        }
        if (action === "duplicate") {
          const copy = await DocumentService.duplicate(row.id);
          toast({ title: "Document duplicated", description: "A draft copy was created." });
          refreshAll();
          if (copy?.id) navigate(`${createPageUrl("Documents")}/${encodeURIComponent(copy.id)}`);
          return;
        }
        if (action === "convert") {
          const targetType = row._convertTarget;
          if (!targetType) return;
          const specialisedUrl = specialisedComposeUrl(targetType, row.id);
          if (specialisedUrl) {
            navigate(specialisedUrl, { state: { returnTo: createPageUrl("Documents") } });
            return;
          }
          const result = await DocumentService.convertDocument(row.id, targetType);
          const target = result?.target || result?.invoice;
          toast({
            title: "Conversion complete",
            description: `Opening ${typeLabel(target?.type || targetType)}.`,
          });
          refreshAll();
          if (target?.id) navigate(`${createPageUrl("Documents")}/${encodeURIComponent(target.id)}`);
          return;
        }
        if (action === "archive") {
          await DocumentService.archive(row.id);
          toast({ title: "Document archived" });
          refreshAll();
          return;
        }
        if (action === "unarchive") {
          await DocumentService.unarchive(row.id);
          toast({ title: "Document restored" });
          refreshAll();
          return;
        }
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Action failed",
          description: e?.message || String(e),
        });
      }
    },
    [navigate, refreshAll, toast]
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await DocumentService.remove(pendingDelete.id);
      toast({ title: "Document deleted" });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(pendingDelete.id);
        return next;
      });
      refreshAll();
    } catch (e) {
      toast({ variant: "destructive", title: "Could not delete", description: e?.message || String(e) });
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, refreshAll, toast]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelectedIds(checked ? new Set(rows.map((r) => r.id)) : new Set());
    },
    [rows]
  );

  const runBulk = useCallback(
    async (action) => {
      const ids = Array.from(selectedIds);
      if (!ids.length) return;
      setBulkBusy(true);
      try {
        await Promise.all(
          ids.map((id) => (action === "archive" ? DocumentService.archive(id) : DocumentService.remove(id)))
        );
        toast({
          title: action === "archive" ? "Documents archived" : "Documents deleted",
          description: `${ids.length} document${ids.length === 1 ? "" : "s"} updated.`,
        });
        setSelectedIds(new Set());
        refreshAll();
      } catch (e) {
        toast({ variant: "destructive", title: "Bulk action failed", description: e?.message || String(e) });
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedIds, refreshAll, toast]
  );

  const comingSoon = (feature) =>
    toast({ title: `${feature} coming soon`, description: "This is part of the next Documents phase." });

  const kpis = kpisQuery.data;
  const selectionCount = selectedIds.size;

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            title={isEmployeeScope ? "My Documents" : "Documents"}
            description={
              isEmployeeScope
                ? "Your leave requests, expense claims, and personal company documents."
                : canManageCompanyDocuments
                  ? "Generic business documents — leave, expenses, contracts, and more. Invoices, quotes, and payslips stay on their own pages."
                  : "Company documents you can view and act on for your role."
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <NewDocumentMenu
              onSelect={handleCreate}
              creating={creating}
              canCreateType={canCreateDocumentType}
            />
            {canManageCompanyDocuments ? (
              <>
                <Button variant="outline" className="gap-2" onClick={() => setTemplatesOpen(true)}>
                  <LayoutTemplate className="h-4 w-4" /> Templates
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => comingSoon("Import")}>
                  <Upload className="h-4 w-4" /> Import
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </PageTemplate.Header>

      <PageTemplate.Body>

        {/* KPI cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {KPI_DEFS.map((kpi) => {
            const Icon = kpi.icon;
            const active = filters.status === kpi.key;
            const value = kpis ? kpis[kpi.field] ?? 0 : null;
            return (
              <button
                key={kpi.key}
                type="button"
                onClick={() => setFilter("status", kpi.key)}
                className="text-left"
              >
                <Card
                  className={`h-full p-4 transition-all hover:shadow-md ${
                    active ? "border-primary ring-1 ring-primary/40" : "hover:border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
                    <Icon className={`h-4 w-4 ${kpi.accent}`} aria-hidden />
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums">
                    {value == null ? <span className="text-muted-foreground">—</span> : value}
                  </div>
                </Card>
              </button>
            );
          })}
        </div>

        {/* Toolbar: search + filters + sort */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by number or title…"
              className="pl-9"
              aria-label="Search documents"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filters.category} onValueChange={(v) => setFilter("category", v)}>
              <SelectTrigger className="w-[160px]" aria-label="Filter by category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.type} onValueChange={(v) => setFilter("type", v)}>
              <SelectTrigger className="w-[160px]" aria-label="Filter by type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all">All types</SelectItem>
                {typeOptions.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hubCaps?.assignees && members.length ? (
              <Select value={filters.assignedUserId} onValueChange={(v) => setFilter("assignedUserId", v)}>
                <SelectTrigger className="w-[160px]" aria-label="Filter by assignee">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select value={filters.sort} onValueChange={(v) => setFilter("sort", v)}>
              <SelectTrigger className="w-[170px]" aria-label="Sort documents">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtersActive ? (
              <Button variant="ghost" className="gap-1" onClick={clearFilters}>
                <X className="h-4 w-4" /> Clear
              </Button>
            ) : null}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectionCount > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
            <span className="text-sm font-medium">{selectionCount} selected</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulk("archive")}>
                Archive
              </Button>
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulk("delete")}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </Button>
            </div>
          </div>
        ) : null}

        {listQuery.isError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
            Could not load documents: {listQuery.error?.message || "Unknown error"}. If the documents tables
            were just added, refresh the Supabase schema cache and try again.
          </div>
        ) : (
          <>
            <DocumentHubTable
              rows={rows}
              loading={listQuery.isLoading}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onOpen={openDocument}
              onAction={handleAction}
            />
            <TablePagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={total}
              itemLabel="documents"
              className="mt-1"
            />
          </>
        )}
      </PageTemplate.Body>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{pendingDelete?.title || pendingDelete?.document_number || "this document"}”
              and its line items, activity, attachments and comments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onCreated={(doc) => {
          refreshAll();
          if (doc?.id) navigate(`${createPageUrl("Documents")}/${encodeURIComponent(doc.id)}`);
        }}
      />
    </PageTemplate>
  );
}
