import { useState, useEffect, useRef, lazy, Suspense } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { servicesToCsv, parseServiceCsv, csvRowToServicePayload } from "@/utils/serviceCsvMapping";
import { motion } from "framer-motion";
import { getIndustries, getTemplateItems, generateDefaultItems } from "@/services/IndustryPresetsService";
import { checkItemsDeletionSafety } from "@/services/ItemUsageService";

import ServiceForm from "@/components/services/ServiceForm";
import ConfirmationDialog from "@/components/shared/ConfirmationDialog";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/components/CurrencySelector";

const Inventory = lazy(() => import("./Inventory"));

export default function Services() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const userProfileFromStore = useAppStore((s) => s.userProfile);
    const { data: services = [], isLoading } = useServicesCatalogQuery();
    const [user, setUser] = useState(userProfileFromStore ?? null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedIndustry, setSelectedIndustry] = useState("custom");
    const [industries, setIndustries] = useState([]);
    const [isCreatingTemplates, setIsCreatingTemplates] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [createType, setCreateType] = useState("service"); // 'product' | 'service'
    const [activeView, setActiveView] = useState("catalog"); // 'catalog' | 'inventory'
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

    const handleSaveService = async (serviceData) => {
        // Validation
        if (!serviceData.name || !serviceData.name.trim()) {
            toast({
                title: "✗ Validation Error",
                description: "Item name is required.",
                variant: "destructive"
            });
            return;
        }

        if (!serviceData.item_type || !serviceData.item_type.trim()) {
            toast({
                title: "✗ Validation Error",
                description: "Item type is required.",
                variant: "destructive"
            });
            return;
        }

        if (!serviceData.default_unit || !serviceData.default_unit.trim()) {
            toast({
                title: "✗ Validation Error",
                description: "Default unit is required.",
                variant: "destructive"
            });
            return;
        }

        if (serviceData.default_rate === undefined || serviceData.default_rate === null || isNaN(serviceData.default_rate) || serviceData.default_rate < 0) {
            toast({
                title: "✗ Validation Error",
                description: "Default rate must be a number greater than or equal to 0.",
                variant: "destructive"
            });
            return;
        }

        setIsSaving(true);
        try {
            if (editingService) {
                await Service.update(editingService.id, serviceData);
                toast({
                    title: "✓ Item Updated",
                    description: `${serviceData.name} has been updated successfully.`,
                    variant: "success"
                });
            } else {
                await Service.create(serviceData);
                toast({
                    title: "✓ Item Created",
                    description: `${serviceData.name} has been added to your catalog.`,
                    variant: "success"
                });
            }
            setShowForm(false);
            setEditingService(null);
            await invalidateServicesCatalog(queryClient);
        } catch (error) {
            console.error("Error saving service:", error);
            const errorMessage = error.message || error.toString();
            toast({
                title: "✗ Error",
                description: errorMessage.includes('organization') 
                    ? "No organization found. Please contact support or try logging out and back in."
                    : errorMessage.includes('permission') || errorMessage.includes('RLS')
                    ? "Permission denied. Please check your account permissions."
                    : errorMessage.includes('column') || errorMessage.includes('does not exist')
                    ? "Database schema mismatch. In Supabase go to SQL Editor and run: scripts/ensure-services-schema.sql (or supabase/schema.postgres.sql if the services table is missing)."
                    : errorMessage.includes('duplicate') || errorMessage.includes('unique')
                    ? "An item with this name already exists."
                    : `Failed to save item: ${errorMessage}`,
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditService = (service) => {
        setEditingService(service);
        setShowForm(true);
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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900/50 p-4 sm:p-6 md:p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* 1. HEADER & SEARCH */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100">
                            Prod & Services
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
                            Manage your offerings and pricing strategy.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                onClick={() => setActiveView("catalog")}
                                className={`rounded-2xl font-bold px-4 py-2.5 ${
                                    activeView === "catalog"
                                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                                        : "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
                                }`}
                            >
                                Catalog
                            </Button>
                            <Button
                                type="button"
                                onClick={() => setActiveView("inventory")}
                                className={`rounded-2xl font-bold px-4 py-2.5 ${
                                    activeView === "inventory"
                                        ? "bg-orange-600 text-white shadow-orange-100 dark:shadow-orange-900/30"
                                        : "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
                                }`}
                            >
                                Inventory
                            </Button>
                        </div>

                        {activeView === "inventory" ? null : (
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-72">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                            <Input
                                placeholder="Search items..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 dark:focus:border-orange-500"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                data-testid="services-add-product"
                                onClick={() => {
                                    setCreateType("product");
                                    setEditingService(null);
                                    setShowForm(true);
                                }}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold shadow-sm whitespace-nowrap ${
                                    createType === "product"
                                        ? "bg-orange-600 text-white shadow-orange-100 dark:shadow-orange-900/30"
                                        : "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
                                }`}
                            >
                                <CubeIcon className="w-4 h-4" />
                                Create Product
                            </Button>
                            <Button
                                type="button"
                                data-testid="services-add"
                                onClick={() => {
                                    setCreateType("service");
                                    setEditingService(null);
                                    setShowForm(true);
                                }}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold shadow-sm whitespace-nowrap ${
                                    createType === "service"
                                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                                        : "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600"
                                }`}
                            >
                                <TagIcon className="w-4 h-4" />
                                Create Service
                            </Button>
                        </div>
                    </div>
                        )}
                    </div>
                </div>

                {activeView === "inventory" ? (
                    <Suspense
                        fallback={
                            <div className="flex min-h-[40vh] items-center justify-center" aria-label="Loading inventory">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                            </div>
                        }
                    >
                        <Inventory />
                    </Suspense>
                ) : (
                    <>
                        {/* 2. INVENTORY GRID */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {isLoading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <Card key={i} className="rounded-[32px] overflow-hidden bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700">
                                        <CardContent className="p-6">
                                            <div className="animate-pulse space-y-4">
                                                <div className="h-6 bg-slate-200 dark:bg-slate-600 rounded w-2/3" />
                                                <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
                                                <div className="h-16 bg-slate-100 dark:bg-slate-700 rounded" />
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
                                                className="group bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[32px] p-6 hover:shadow-xl hover:border-orange-100 dark:hover:border-orange-900/50 transition-all duration-300 relative overflow-hidden cursor-pointer"
                                                onClick={() => {
                                                    setEditingService(service);
                                                    setCreateType(service?.item_type === "product" ? "product" : "service");
                                                    setShowForm(true);
                                                }}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        setEditingService(service);
                                                        setCreateType(service?.item_type === "product" ? "product" : "service");
                                                        setShowForm(true);
                                                    }
                                                }}
                                            >
                                                <div className="flex justify-between items-start mb-6">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className={`p-3 rounded-2xl shrink-0 ${
                                                                isService ? "bg-blue-50 dark:bg-blue-950/50" : "bg-orange-50 dark:bg-orange-950/50"
                                                            }`}
                                                        >
                                                            {isService ? (
                                                                <TagIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                                            ) : (
                                                                <CubeIcon className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                                                            )}
                                                        </div>
                                                        <span
                                                            className={`text-[10px] font-black tracking-widest uppercase px-2 py-1 rounded-full ${
                                                                isProduct
                                                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                                    : "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600"
                                                            }`}
                                                        >
                                                            {isProduct ? "Product" : "Service"}
                                                        </span>
                                                    </div>
                                                    <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
                                                        {formatCurrency(price, userCurrency)}
                                                    </span>
                                                </div>

                                        <div className="mb-6">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors line-clamp-2">
                                                {service.name}
                                            </h3>
                                            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                                {service.category || (service.item_type || "Service")}
                                            </p>
                                            {isProduct ? (
                                                <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                                    {Number.isFinite(stock)
                                                        ? `Stock: ${stock} left`
                                                        : "Stock: not yet tracked"}
                                                </p>
                                            ) : (
                                                <p className="mt-2 text-xs font-medium text-slate-400 dark:text-slate-500">
                                                    No inventory tracking
                                                </p>
                                            )}
                                        </div>

                                        <div className="pt-6 border-t border-slate-50 dark:border-slate-700 flex justify-between items-center">
                                            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                                                <ChartBarIcon className="w-4 h-4 shrink-0" />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">
                                                    Billed {billed}x
                                                </span>
                                            </div>
                                            <span className="text-xs font-black text-orange-500 dark:text-orange-400 group-hover:text-orange-700 dark:group-hover:text-orange-300">
                                                EDIT DETAILS →
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })}

                            {/* Add shortcut card */}
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingService(null);
                                    setCreateType("service");
                                    setShowForm(true);
                                }}
                                className="border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-[32px] flex flex-col items-center justify-center p-12 text-slate-400 dark:text-slate-500 hover:border-orange-300 dark:hover:border-orange-600 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50/30 dark:hover:bg-orange-950/30 transition-all min-h-[240px]"
                            >
                                <PlusIcon className="w-10 h-10 mb-2" />
                                <span className="font-bold">Create New Offer</span>
                            </button>
                        </>
                    )}
                </div>

                {!isLoading && filteredServices.length === 0 && (
                    <Card className="rounded-[32px] border border-slate-100 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                        <CardContent className="p-12 text-center">
                            <p className="text-slate-500 dark:text-slate-400 font-medium">
                                {searchTerm
                                    ? "No items match your search."
                                    : "No products or services yet."}
                            </p>
                            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-6">
                                {searchTerm
                                    ? "Try a different search term."
                                    : "Add your first item to get started."}
                            </p>
                            {!searchTerm && (
                                <Button
                                    onClick={() => {
                                        setEditingService(null);
                                        setShowForm(true);
                                    }}
                                    className="bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-bold"
                                >
                                    <PlusIcon className="w-5 h-5 mr-2" />
                                    Add New
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                )}
                    </>
                )}
            </div>

            {/* Centered modal for create/edit */}
            <Dialog
                open={showForm}
                onOpenChange={(open) => {
                    setShowForm(open);
                    if (!open) setEditingService(null);
                }}
            >
                <DialogContent className="flex max-h-[min(92vh,880px)] w-[calc(100vw-1.5rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
                    <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-4 text-left dark:border-slate-700">
                        <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            {editingService
                                ? "Edit item"
                                : createType === "product"
                                  ? "New product"
                                  : "New service"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                        <ServiceForm
                            variant="dialog"
                            service={editingService}
                            defaultType={editingService?.item_type || createType}
                            onSave={async (data) => {
                                await handleSaveService(data);
                                setShowForm(false);
                                setEditingService(null);
                            }}
                            onCancel={() => {
                                setShowForm(false);
                                setEditingService(null);
                            }}
                            isSaving={isSaving}
                        />
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    );
}