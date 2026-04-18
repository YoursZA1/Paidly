import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Service } from "@/api/entities";
import { User } from "@/api/entities";
import { useAppStore } from "@/stores/useAppStore";
import { useServicesCatalogQuery, invalidateServicesCatalog } from "@/hooks/useServicesCatalogQuery";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  TagIcon,
  CubeIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";
import { servicesToCsv, parseServiceCsv, csvRowToServicePayload } from "@/utils/serviceCsvMapping";
import { motion } from "framer-motion";
import { LayoutGrid, List } from "lucide-react";
import { getIndustries, getTemplateItems, generateDefaultItems } from "@/services/IndustryPresetsService";
import { checkItemsDeletionSafety } from "@/services/ItemUsageService";

import ConfirmationDialog from "@/components/shared/ConfirmationDialog";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/components/CurrencySelector";
import { cn } from "@/lib/utils";
import { createPageUrl } from "@/utils";

const Inventory = lazy(() => import("./Inventory"));

export default function Services() {
    const { toast } = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const userProfileFromStore = useAppStore((s) => s.userProfile);
    const { data: services = [], isLoading } = useServicesCatalogQuery();
    const [user, setUser] = useState(userProfileFromStore ?? null);
    const qFromUrl = searchParams.get("q") ?? "";
    const [searchTerm, setSearchTerm] = useState(qFromUrl);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedIndustry, setSelectedIndustry] = useState("custom");
    const [industries, setIndustries] = useState([]);
    const [isCreatingTemplates, setIsCreatingTemplates] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [createType, setCreateType] = useState("service"); // 'product' | 'service'
    const [activeView, setActiveView] = useState("catalog"); // 'catalog' | 'inventory'
    const [catalogLayout, setCatalogLayout] = useState("grid"); // 'grid' | 'list'
    const serviceFileInputRef = useRef(null);

    useEffect(() => {
        setIndustries(getIndustries());
        // Avoid hitting auth.me when we already have cached profile data.
        if (userProfileFromStore) {
            setUser(userProfileFromStore);
        } else {
            loadUser();
        }
    }, []);

    useEffect(() => {
        const q = searchParams.get("q");
        if (q != null && q !== "") {
            setSearchTerm(q);
        }
    }, [searchParams]);

    useEffect(() => {
        if (userProfileFromStore != null && user === null) setUser(userProfileFromStore);
    }, [userProfileFromStore, user]);

    const loadUser = async () => {
        try {
            const userData = await User.me();
            setUser(userData);
        } catch (error) {
            console.error("Error loading user:", error);
        }
    };

    const goEditCatalogItem = (service) => {
        navigate(`${createPageUrl("EditCatalogItem")}?id=${encodeURIComponent(service.id)}`);
    };

    const goNewCatalogItem = (type) => {
        const t = type === "product" ? "product" : "service";
        navigate(`${createPageUrl("EditCatalogItem")}?new=1&type=${t}`);
    };

    const handleCreateTemplateItems = async () => {
        try {
            setIsCreatingTemplates(true);
            const templateItems = generateDefaultItems(selectedIndustry, user?.id);
            
            if (!templateItems || templateItems.length === 0) {
                toast({
                    title: "⚠️ No Templates",
                    description: "No template items available for this industry.",
                    variant: "destructive"
                });
                return;
            }
            
            // Create each template item
            const promises = templateItems.map(item => Service.create(item));
            await Promise.all(promises);

            await invalidateServicesCatalog(queryClient);
            
            // Show success message
            toast({
                title: "✓ Templates Created",
                description: `Successfully created ${templateItems.length} item(s) for ${selectedIndustry.replace(/_/g, ' ')}.`,
                variant: "success"
            });
        } catch (error) {
            console.error("Error creating template items:", error);
            const errorMessage = error.message || error.toString();
            toast({
                title: "✗ Error",
                description: `Failed to create template items: ${errorMessage}`,
                variant: "destructive"
            });
        } finally {
            setIsCreatingTemplates(false);
        }
    };

    const userCurrency = user?.currency || "ZAR";

    const filteredServices = services.filter((service) => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        return (
            service.name?.toLowerCase().includes(term) ||
            (service.description && service.description.toLowerCase().includes(term)) ||
            (service.category && service.category.toLowerCase().includes(term)) ||
            (service.tags && service.tags.some((tag) => tag.toLowerCase().includes(term)))
        );
    });

    const handleExportServices = () => {
        try {
            const csvContent = servicesToCsv(filteredServices);
            const blob = new Blob([csvContent], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `Service_export_${Date.now()}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: "Export complete", description: `${filteredServices.length} item(s) exported.`, variant: "default" });
        } catch (error) {
            console.error("Export services error:", error);
            toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" });
        }
    };

    const handleImportServices = () => serviceFileInputRef.current?.click();

    const handleImportServicesFile = async (e) => {
        const file = e.target?.files?.[0];
        e.target.value = "";
        if (!file) return;
        setIsImporting(true);
        try {
            const text = await file.text();
            const { headers, rows } = parseServiceCsv(text);
            let created = 0;
            let skipped = 0;
            for (const row of rows) {
                const payload = csvRowToServicePayload(headers, row);
                if (!payload) {
                    skipped++;
                    continue;
                }
                try {
                    await Service.create(payload);
                    created++;
                } catch (err) {
                    console.warn("Import service row failed:", payload.name, err);
                    skipped++;
                }
            }
            await invalidateServicesCatalog(queryClient);
            toast({
                title: "Import complete",
                description: `${created} item(s) imported${skipped ? `, ${skipped} skipped.` : "."}`,
                variant: "default",
            });
        } catch (error) {
            console.error("Import services error:", error);
            toast({ title: "Import failed", description: error?.message || "Could not parse CSV.", variant: "destructive" });
        } finally {
            setIsImporting(false);
        }
    };

    const isServiceType = (itemType) =>
        ["service", "labor"].includes(itemType || "service");

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
                {/* 1. HEADER & SEARCH */}
                <div className="responsive-page-header">
                    <div>
                        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                            Products & services
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Catalog items feed invoices and quotes — open an item to edit details on a full page.
                        </p>
                    </div>

                    <div className="responsive-page-header-actions gap-2.5">
                        <div className="flex w-full min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                            <div className="flex h-10 w-full shrink-0 items-center rounded-xl border border-border bg-muted/50 p-1 shadow-sm sm:w-auto">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setActiveView("catalog")}
                                    className={cn(
                                        "h-8 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors sm:flex-none",
                                        activeView === "catalog"
                                            ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Catalog
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setActiveView("inventory")}
                                    className={cn(
                                        "h-8 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors sm:flex-none",
                                        activeView === "inventory"
                                            ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Inventory
                                </Button>
                            </div>

                            {activeView === "inventory" ? null : (
                                <>
                                    <div className="flex h-10 shrink-0 items-center rounded-xl border border-border bg-muted/50 p-1 shadow-sm">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setCatalogLayout("grid")}
                                            className={cn(
                                                "h-8 w-8 min-h-8 min-w-8 max-h-8 max-w-8 shrink-0 rounded-lg p-0 transition-colors",
                                                catalogLayout === "grid"
                                                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                            aria-label="Grid layout"
                                        >
                                            <LayoutGrid className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setCatalogLayout("list")}
                                            className={cn(
                                                "h-8 w-8 min-h-8 min-w-8 max-h-8 max-w-8 shrink-0 rounded-lg p-0 transition-colors",
                                                catalogLayout === "list"
                                                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                            aria-label="List layout"
                                        >
                                            <List className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="relative min-w-0 flex-1 basis-full sm:basis-[min(100%,18rem)] md:max-w-md">
                                        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Search items..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-9 w-full rounded-xl border border-input bg-background py-0 pl-10 pr-3 text-sm shadow-sm md:h-10"
                                        />
                                    </div>

                                    <div className="flex w-full min-w-0 shrink-0 flex-wrap items-stretch gap-2 sm:w-auto sm:items-center">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            data-testid="services-add-product"
                                            onClick={() => {
                                                setCreateType("product");
                                                goNewCatalogItem("product");
                                            }}
                                            className={cn(
                                                "responsive-btn inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border-border bg-background/80 px-3.5 font-medium shadow-sm backdrop-blur-sm transition-all hover:-translate-y-[1px] hover:shadow-md sm:flex-none",
                                                createType === "product" &&
                                                    "border-primary bg-primary/10 text-primary hover:bg-primary/15"
                                            )}
                                        >
                                            <CubeIcon className="size-4 shrink-0" />
                                            <span className="sm:hidden">Product</span>
                                            <span className="hidden sm:inline">Create product</span>
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            data-testid="services-add"
                                            onClick={() => {
                                                setCreateType("service");
                                                goNewCatalogItem("service");
                                            }}
                                            className={cn(
                                                "responsive-btn inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border-border bg-background/80 px-3.5 font-medium shadow-sm backdrop-blur-sm transition-all hover:-translate-y-[1px] hover:shadow-md sm:flex-none",
                                                createType === "service" &&
                                                    "border-primary bg-primary/10 text-primary hover:bg-primary/15"
                                            )}
                                        >
                                            <TagIcon className="size-4 shrink-0" />
                                            <span className="sm:hidden">Service</span>
                                            <span className="hidden sm:inline">Create service</span>
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {activeView === "inventory" ? (
                    <Suspense
                        fallback={
                            <div className="flex min-h-[40vh] items-center justify-center" aria-label="Loading inventory">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            </div>
                        }
                    >
                        <Inventory />
                    </Suspense>
                ) : (
                    <>
                        {/* 2. INVENTORY GRID */}
                        {catalogLayout === "grid" ? (
                        <div className="responsive-grid">
                            {isLoading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <Card key={i} className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm">
                                        <CardContent className="p-6">
                                            <div className="animate-pulse space-y-4">
                                                <div className="h-6 w-2/3 rounded-md bg-muted" />
                                                <div className="h-4 w-1/2 rounded-md bg-muted/80" />
                                                <div className="h-16 rounded-md bg-muted/80" />
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <>
                                    {filteredServices.map((service) => {
                                        const price = service.default_rate ?? service.unit_price ?? 0;
                                        const billed = service.usage_count ?? 0;
                                        const isService = isServiceType(service.item_type);
                                        const isProduct = service.item_type === "product";
                                        const stock = typeof service.stock_quantity === "number" ? service.stock_quantity : null;
                                        return (
                                            <motion.div
                                                key={service.id}
                                                initial={{ opacity: 0, y: 12 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.25 }}
                                                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-6 shadow-sm transition-all duration-200 hover:border-primary/25 hover:bg-card/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                                onClick={() => goEditCatalogItem(service)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        goEditCatalogItem(service);
                                                    }
                                                }}
                                            >
                                                <div className="flex justify-between items-start mb-6">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className={`shrink-0 rounded-2xl p-3 ${
                                                                isService ? "bg-muted/80 text-primary" : "bg-primary/10 text-primary"
                                                            }`}
                                                        >
                                                            {isService ? (
                                                                <TagIcon className="h-6 w-6" />
                                                            ) : (
                                                                <CubeIcon className="h-6 w-6" />
                                                            )}
                                                        </div>
                                                        <span
                                                            className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${
                                                                isProduct
                                                                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                                                                    : "border-border bg-muted/50 text-muted-foreground"
                                                            }`}
                                                        >
                                                            {isProduct ? "Product" : "Service"}
                                                        </span>
                                                    </div>
                                                    <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                                                        {formatCurrency(price, userCurrency)}
                                                    </span>
                                                </div>

                                        <div className="mb-6">
                                            <h3 className="mb-1 line-clamp-2 text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                                                {service.name}
                                            </h3>
                                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                {service.category || (service.item_type || "Service")}
                                            </p>
                                            {isProduct ? (
                                                <p className="mt-2 text-xs font-medium text-muted-foreground">
                                                    {Number.isFinite(stock)
                                                        ? `Stock: ${stock} left`
                                                        : "Stock: not yet tracked"}
                                                </p>
                                            ) : (
                                                <p className="mt-2 text-xs font-medium text-muted-foreground">
                                                    No inventory tracking
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between border-t border-border/50 pt-6">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <ChartBarIcon className="h-4 w-4 shrink-0" />
                                                <span className="text-[10px] font-semibold uppercase tracking-widest">
                                                    Billed {billed}x
                                                </span>
                                            </div>
                                            <span className="text-xs font-semibold text-primary opacity-90 transition-opacity group-hover:opacity-100">
                                                Edit details →
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })}

                            {/* Add shortcut card */}
                            <button
                                type="button"
                                onClick={() => {
                                    setCreateType("service");
                                    goNewCatalogItem("service");
                                }}
                                className="flex min-h-[200px] touch-manipulation flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/70 bg-muted/10 p-8 text-muted-foreground transition-all hover:border-primary/35 hover:bg-muted/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-[240px] sm:p-12"
                            >
                                <PlusIcon className="mb-2 size-9 sm:size-10" />
                                <span className="text-center text-sm font-bold sm:text-base">
                                    Create New Offer
                                </span>
                            </button>
                        </>
                    )}
                </div>
                        ) : (
                            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm">
                                <div className="hidden grid-cols-[minmax(0,2.2fr)_120px_140px_140px] items-center gap-3 border-b border-border/50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                                    <span>Item</span>
                                    <span className="text-right">Rate</span>
                                    <span className="text-center">Type</span>
                                    <span className="text-right">Actions</span>
                                </div>
                                <div className="divide-y divide-border/50">
                                    {isLoading
                                        ? Array.from({ length: 6 }).map((_, i) => (
                                              <div key={i} className="grid grid-cols-1 gap-2 px-4 py-4 md:grid-cols-[minmax(0,2.2fr)_120px_140px_140px] md:items-center md:gap-3">
                                                  <div className="h-4 w-44 animate-pulse rounded-md bg-muted" />
                                                  <div className="h-4 w-20 animate-pulse rounded-md bg-muted md:ml-auto" />
                                                  <div className="h-6 w-20 animate-pulse rounded-full bg-muted md:mx-auto" />
                                                  <div className="h-8 w-24 animate-pulse rounded-md bg-muted md:ml-auto" />
                                              </div>
                                          ))
                                        : filteredServices.map((service) => {
                                              const price = service.default_rate ?? service.unit_price ?? 0;
                                              const isProduct = service.item_type === "product";
                                              return (
                                                  <div key={service.id} className="grid grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,2.2fr)_120px_140px_140px] md:items-center md:gap-3">
                                                      <div className="min-w-0">
                                                          <p className="truncate text-sm font-semibold text-foreground">{service.name}</p>
                                                          <p className="truncate text-xs text-muted-foreground">{service.description || service.category || "No description"}</p>
                                                      </div>
                                                      <div className="text-left text-sm font-semibold tabular-nums text-foreground md:text-right">
                                                          {formatCurrency(price, userCurrency)}
                                                      </div>
                                                      <div className="md:text-center">
                                                          <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                                              isProduct
                                                                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                                                                  : "border-border bg-muted/50 text-muted-foreground"
                                                          }`}>
                                                              {isProduct ? "Product" : "Service"}
                                                          </span>
                                                      </div>
                                                      <div className="md:text-right">
                                                          <Button
                                                              type="button"
                                                              variant="outline"
                                                              className="responsive-btn rounded-lg"
                                                              onClick={() => goEditCatalogItem(service)}
                                                          >
                                                              Edit
                                                          </Button>
                                                      </div>
                                                  </div>
                                              );
                                          })}
                                </div>
                            </div>
                        )}

                {!isLoading && filteredServices.length === 0 && (
                    <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm">
                        <CardContent className="p-12 text-center">
                            <p className="font-medium text-muted-foreground">
                                {searchTerm
                                    ? "No items match your search."
                                    : "No products or services yet."}
                            </p>
                            <p className="mt-1 mb-6 text-sm text-muted-foreground/90">
                                {searchTerm
                                    ? "Try a different search term."
                                    : "Add your first item to get started."}
                            </p>
                            {!searchTerm && (
                                <Button
                                    onClick={() => goNewCatalogItem("service")}
                                    className="mx-auto min-h-12 w-full max-w-xs rounded-2xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto sm:max-w-none"
                                >
                                    <PlusIcon className="mr-2 size-5" />
                                    Add New
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                )}
                    </>
                )}
            </div>

        </div>
    );
}