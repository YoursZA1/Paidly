import { useState, useEffect, useRef } from "react";
import { Service } from "@/api/entities";
import { User } from "@/api/entities";
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
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { servicesToCsv, parseServiceCsv, csvRowToServicePayload } from "@/utils/serviceCsvMapping";
import { motion } from "framer-motion";
import { getIndustries, getTemplateItems, generateDefaultItems } from "@/services/IndustryPresetsService";
import { checkItemsDeletionSafety } from "@/services/ItemUsageService";

import ServiceForm from "@/components/services/ServiceForm";
import ConfirmationDialog from "@/components/shared/ConfirmationDialog";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/components/CurrencySelector";

export default function Services() {
    const { toast } = useToast();
    const [services, setServices] = useState([]);
    const [user, setUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedIndustry, setSelectedIndustry] = useState("custom");
    const [industries, setIndustries] = useState([]);
    const [isCreatingTemplates, setIsCreatingTemplates] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const serviceFileInputRef = useRef(null);

    useEffect(() => {
        loadServices();
        loadUser();
        setIndustries(getIndustries());
    }, []);

    const loadServices = async () => {
        setIsLoading(true);
        try {
            const servicesData = await Service.list("-created_date");
            setServices(servicesData || []);
        } catch (error) {
            console.error("Error loading services:", error);
            toast({
                title: "✗ Error",
                description: "Failed to load services. Please refresh the page.",
                variant: "destructive"
            });
            setServices([]);
        } finally {
            setIsLoading(false);
        }
    };

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
            await loadServices();
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
            
            // Reload services list
            await loadServices();
            
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
            await loadServices();
            toast({
                title: "Import complete",
                description: `${created} item(s) imported${skipped ? `, ${skipped} skipped.` : "."}`,
                variant: "default",
            });
        } catch (error) {
            console.error("Import services error:", error);
            toast({ title: "Import failed", description: error?.message || "Could not parse CSV.", variant: "destructive" });
        }
        setIsImporting(false);
    };

    const isServiceType = (itemType) =>
        ["service", "labor"].includes(itemType || "service");

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* 1. HEADER & SEARCH */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900">
                            Products & Services
                        </h1>
                        <p className="text-slate-500 mt-1 font-medium">
                            Manage your offerings and pricing strategy.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-72">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            <Input
                                placeholder="Search items..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300"
                            />
                        </div>
                        <Button
                            onClick={() => {
                                setEditingService(null);
                                setShowForm(true);
                            }}
                            className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 text-white rounded-2xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-700 transition-all whitespace-nowrap"
                        >
                            <PlusIcon className="w-5 h-5" /> Add New
                        </Button>
                    </div>
                </div>

                {/* 2. INVENTORY GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <Card key={i} className="rounded-[32px] overflow-hidden">
                                <CardContent className="p-6">
                                    <div className="animate-pulse space-y-4">
                                        <div className="h-6 bg-slate-200 rounded w-2/3" />
                                        <div className="h-4 bg-slate-100 rounded w-1/2" />
                                        <div className="h-16 bg-slate-100 rounded" />
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
                                return (
                                    <motion.div
                                        key={service.id}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="group bg-white border border-slate-100 rounded-[32px] p-6 hover:shadow-xl hover:border-orange-100 transition-all duration-300 relative overflow-hidden cursor-pointer"
                                        onClick={() => {
                                            setEditingService(service);
                                            setShowForm(true);
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setEditingService(service);
                                                setShowForm(true);
                                            }
                                        }}
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            <div
                                                className={`p-3 rounded-2xl shrink-0 ${
                                                    isService ? "bg-blue-50" : "bg-orange-50"
                                                }`}
                                            >
                                                {isService ? (
                                                    <TagIcon className="w-6 h-6 text-blue-600" />
                                                ) : (
                                                    <CubeIcon className="w-6 h-6 text-orange-600" />
                                                )}
                                            </div>
                                            <span className="text-2xl font-black text-slate-900 tabular-nums">
                                                {formatCurrency(price, userCurrency)}
                                            </span>
                                        </div>

                                        <div className="mb-8">
                                            <h3 className="text-lg font-bold text-slate-900 mb-1 group-hover:text-orange-600 transition-colors line-clamp-2">
                                                {service.name}
                                            </h3>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                                {service.category || (service.item_type || "Service")}
                                            </p>
                                        </div>

                                        <div className="pt-6 border-t border-slate-50 flex justify-between items-center">
                                            <div className="flex items-center gap-2 text-slate-400">
                                                <ChartBarIcon className="w-4 h-4 shrink-0" />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">
                                                    Billed {billed}x
                                                </span>
                                            </div>
                                            <span className="text-xs font-black text-orange-500 group-hover:text-orange-700">
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
                                    setShowForm(true);
                                }}
                                className="border-2 border-dashed border-slate-200 rounded-[32px] flex flex-col items-center justify-center p-12 text-slate-400 hover:border-orange-300 hover:text-orange-500 hover:bg-orange-50/30 transition-all min-h-[240px]"
                            >
                                <PlusIcon className="w-10 h-10 mb-2" />
                                <span className="font-bold">Create New Offer</span>
                            </button>
                        </>
                    )}
                </div>

                {!isLoading && filteredServices.length === 0 && (
                    <Card className="rounded-[32px] border border-slate-100 overflow-hidden">
                        <CardContent className="p-12 text-center">
                            <p className="text-slate-500 font-medium">
                                {searchTerm
                                    ? "No items match your search."
                                    : "No products or services yet."}
                            </p>
                            <p className="text-sm text-slate-400 mt-1 mb-6">
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
            </div>

            {/* Slide-over panel for create/edit */}
            <Sheet open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setEditingService(null); }}>
                <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
                    <div className="py-2">
                        <h2 className="text-xl font-bold text-slate-900 mb-6">
                            {editingService ? "Edit item" : "New item"}
                        </h2>
                        <ServiceForm
                            service={editingService}
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
                </SheetContent>
            </Sheet>

        </div>
    );
}