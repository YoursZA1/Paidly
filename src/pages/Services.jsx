import React, { useState, useEffect, useRef } from "react";
import { Service } from "@/api/entities";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Headset, Filter, Archive, CheckCircle, Trash2, LayoutGrid, List, Zap, Download, Upload } from "lucide-react";
import { servicesToCsv, parseServiceCsv, csvRowToServicePayload } from "@/utils/serviceCsvMapping";
import { motion } from "framer-motion";
import { ITEM_TYPES } from "@/components/invoice/itemTypeHelpers";
import { getIndustries, getTemplateItems, generateDefaultItems } from "@/services/IndustryPresetsService";
import { checkItemsDeletionSafety } from "@/services/ItemUsageService";

import ServiceCard from "@/components/services/ServiceCard";
import ServiceList from "@/components/services/ServiceList";
import ServiceForm from "@/components/services/ServiceForm";
import ConfirmationDialog from "@/components/shared/ConfirmationDialog";
import { useToast } from "@/components/ui/use-toast";

import { renderIcon } from "@/utils/renderIcon";

export default function Services() {
    const { toast } = useToast();
    const [services, setServices] = useState([]);
    const [user, setUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [itemTypeFilter, setItemTypeFilter] = useState("all");
    const [pricingTypeFilter, setPricingTypeFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [selectedServices, setSelectedServices] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showBulkActions, setShowBulkActions] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [viewMode, setViewMode] = useState('grid');
    const [selectedIndustry, setSelectedIndustry] = useState('custom');
    const [industries, setIndustries] = useState([]);
    const [isCreatingTemplates, setIsCreatingTemplates] = useState(false);
    const [unsafeDeletions, setUnsafeDeletions] = useState([]);
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

    const handleToggleActive = async (serviceId, isActive) => {
        try {
            await Service.update(serviceId, { is_active: !isActive });
            await loadServices();
            toast({
                title: "✓ Status Updated",
                description: `Item has been ${!isActive ? 'activated' : 'deactivated'}.`,
                variant: "success"
            });
        } catch (error) {
            console.error("Error toggling service status:", error);
            toast({
                title: "✗ Error",
                description: "Failed to update item status. Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleBulkToggleActive = async (activate = true) => {
        try {
            const promises = selectedServices.map(serviceId =>
                Service.update(serviceId, { is_active: activate })
            );
            await Promise.all(promises);
            setSelectedServices([]);
            setShowBulkActions(false);
            await loadServices();
            toast({
                title: "✓ Bulk Update Complete",
                description: `${selectedServices.length} item(s) have been ${activate ? 'activated' : 'deactivated'}.`,
                variant: "success"
            });
        } catch (error) {
            console.error("Error bulk updating services:", error);
            toast({
                title: "✗ Error",
                description: "Failed to update items. Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleBulkDelete = async () => {
        try {
            // Get services to be deleted
            const servicesToDelete = services.filter(s => selectedServices.includes(s.id));
            
            // Check deletion safety for all selected items
            const { safe, unsafe } = checkItemsDeletionSafety(servicesToDelete);
            
            if (unsafe.length > 0) {
                // Store unsafe items and show warning
                setUnsafeDeletions(unsafe);
                toast({
                    title: "⚠️ Cannot Delete",
                    description: `${unsafe.length} item(s) cannot be deleted because they are used in invoices. Archive them instead by deactivating.`,
                    variant: "destructive"
                });
                return;
            }
            
            if (safe.length === 0) {
                toast({
                    title: "⚠️ No Items to Delete",
                    description: "All selected items are used in invoices and cannot be deleted.",
                    variant: "destructive"
                });
                return;
            }
            
            // Safe to delete all selected items
            const promises = safe.map(item => Service.delete(item.id));
            await Promise.all(promises);
            
            setSelectedServices([]);
            setShowBulkActions(false);
            setShowDeleteConfirm(false);
            await loadServices();
            toast({
                title: "✓ Items Deleted",
                description: `${safe.length} item(s) have been deleted successfully.`,
                variant: "success"
            });
        } catch (error) {
            console.error("Error bulk deleting services:", error);
            toast({
                title: "✗ Error",
                description: "Failed to delete items. Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleServiceSelection = (serviceId, checked) => {
        if (checked) {
            setSelectedServices(prev => [...prev, serviceId]);
        } else {
            setSelectedServices(prev => prev.filter(id => id !== serviceId));
        }
    };

    const handleSelectAll = (checked) => {
        if (checked) {
            setSelectedServices(filteredServices.map(service => service.id));
        } else {
            setSelectedServices([]);
        }
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

    // Get unique categories and item types for filters
    const categories = [...new Set(services.map(s => s.category).filter(Boolean))];
    const itemTypes = [...new Set(services.map(s => s.item_type || 'service').filter(Boolean))];
    const pricingTypes = [...new Set(services.map(s => s.service_type).filter(Boolean))];

    const filteredServices = services.filter(service => {
        const matchesSearch = service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             (service.description && service.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
                             (service.tags && service.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())));
        
        const matchesCategory = categoryFilter === "all" || service.category === categoryFilter;
        const matchesItemType = itemTypeFilter === "all" || (service.item_type || 'service') === itemTypeFilter;
        const matchesPricingType = pricingTypeFilter === "all" || service.service_type === pricingTypeFilter;
        const matchesStatus = statusFilter === "all" || 
                             (statusFilter === "active" && service.is_active) ||
                             (statusFilter === "inactive" && !service.is_active);

        return matchesSearch && matchesCategory && matchesItemType && matchesPricingType && matchesStatus;
    });

    useEffect(() => {
        setShowBulkActions(selectedServices.length > 0);
    }, [selectedServices]);

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

    return (
        <div className="min-h-screen bg-slate-100 p-6">
            <div className="max-w-6xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6"
                >
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-2 font-display">
                            Services & products
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Manage your catalog. Each item has a type (Service, Product, Labor, Material, or Expense) that determines how it appears in invoices. {services.length} total items.
                        </p>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="file"
                            ref={serviceFileInputRef}
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportServicesFile}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleImportServices}
                            disabled={isImporting}
                            className="rounded-xl"
                        >
                            <Upload className={`w-4 h-4 mr-2 ${isImporting ? "animate-pulse" : ""}`} />
                            {isImporting ? "Importing…" : "Import CSV"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportServices}
                            disabled={filteredServices.length === 0}
                            className="rounded-xl"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                        </Button>
                        <Button
                            onClick={() => setShowForm(true)}
                            className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add catalog item
                        </Button>
                    </div>
                </motion.div>

                {/* Bulk Actions Bar */}
                {showBulkActions && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-blue-700 font-medium">
                                {selectedServices.length} item{selectedServices.length !== 1 ? 's' : ''} selected
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleBulkToggleActive(true)}
                                    className="text-green-600 border-green-300"
                                >
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Activate
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleBulkToggleActive(false)}
                                    className="text-orange-600 border-orange-300"
                                >
                                    <Archive className="w-4 h-4 mr-1" />
                                    Deactivate
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        // Check deletion safety before showing confirmation
                                        const servicesToDelete = services.filter(s => selectedServices.includes(s.id));
                                        const { safe, unsafe } = checkItemsDeletionSafety(servicesToDelete);
                                        
                                        if (unsafe.length > 0) {
                                            alert(`⚠️ Cannot delete ${unsafe.length} item(s) because they are used in invoices.\n\nItems cannot be deleted:\n${unsafe.map(u => `• ${u.name}`).join('\n')}\n\nSuggestion: Archive these items instead by deactivating them.`);
                                        } else {
                                            setShowDeleteConfirm(true);
                                        }
                                    }}
                                    className="text-red-600 border-red-300"
                                >
                                    <Trash2 className="w-4 h-4 mr-1" />
                                    Delete
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setSelectedServices([])}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Item Type System Explanation */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="mb-8 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg"
                >
                    <p className="text-sm font-semibold text-slate-900 mb-3">
                        📋 Required: Each catalog item must have a type
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {ITEM_TYPES.map(type => (
                            <div key={type.value} className="text-sm">
                                <span className="text-lg mr-2 inline-flex items-center">
                                    {renderIcon(type.icon, { className: "w-5 h-5" })}
                                </span>
                                <span className="font-semibold text-slate-700">{type.label}</span>
                                <p className="text-xs text-slate-500">{type.description}</p>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Industry Presets Setup */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                    className="mb-8 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-300 rounded-lg"
                >
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-green-600" />
                                Quick Setup: Select your industry
                            </p>
                            <p className="text-xs text-slate-600">
                                Auto-create suggested items for your business type (defaults for types, units, and naming)
                            </p>
                        </div>
                        <div className="flex gap-3 items-center">
                            <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                                <SelectTrigger className="w-56 h-10 rounded-lg">
                                    <SelectValue placeholder="Select industry" />
                                </SelectTrigger>
                                <SelectContent>
                                    {industries.map(industry => (
                                        <SelectItem key={industry.code} value={industry.code}>
                                            {industry.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                onClick={handleCreateTemplateItems}
                                disabled={selectedIndustry === 'custom' || isCreatingTemplates}
                                className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                                size="sm"
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                {isCreatingTemplates ? 'Creating...' : 'Create Items'}
                            </Button>
                        </div>
                    </div>
                    
                    {selectedIndustry !== 'custom' && (
                        <div className="mt-4 pt-4 border-t border-green-200">
                            <p className="text-xs font-semibold text-slate-700 mb-2">📦 Will create:</p>
                            <div className="flex flex-wrap gap-2">
                                {getTemplateItems(selectedIndustry).map((item, idx) => (
                                    <span key={idx} className="text-xs px-2 py-1 bg-white border border-green-200 rounded-full">
                                        {item.name} ({item.item_type})
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Filters and Search */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="mb-8 space-y-4"
                >
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by name, description, or tags..."
                                className="pl-10 h-12 rounded-xl"
                            />
                        </div>
                        
                        <div className="flex gap-4 flex-wrap">
                            <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
                                <SelectTrigger className="w-48 h-12 rounded-xl">
                                    <SelectValue placeholder="All Item Types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Item Types</SelectItem>
                                    {ITEM_TYPES.map(type => (
                                        <SelectItem key={type.value} value={type.value}>
                                            <span className="inline-flex items-center gap-2">
                                                {renderIcon(type.icon, {style: {width: 16, height: 16}, className: "inline-block align-middle"})}
                                                <span>{type.label}</span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="w-48 h-12 rounded-xl">
                                    <SelectValue placeholder="All Categories" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {categories.map(category => (
                                        <SelectItem key={category} value={category}>{category}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={pricingTypeFilter} onValueChange={setPricingTypeFilter}>
                                <SelectTrigger className="w-40 h-12 rounded-xl">
                                    <SelectValue placeholder="All Pricing" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Pricing</SelectItem>
                                    <SelectItem value="hourly">Hourly</SelectItem>
                                    <SelectItem value="fixed">Fixed Price</SelectItem>
                                    <SelectItem value="per_item">Per Item</SelectItem>
                                    <SelectItem value="daily">Daily</SelectItem>
                                    <SelectItem value="weekly">Weekly</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-32 h-12 rounded-xl">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Select All Checkbox and View Mode Toggle */}
                    <div className="flex items-center justify-between">
                        {filteredServices.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="select-all"
                                    checked={selectedServices.length === filteredServices.length && filteredServices.length > 0}
                                    onCheckedChange={handleSelectAll}
                                />
                                <label htmlFor="select-all" className="text-sm text-slate-600">
                                    Select all {filteredServices.length} item{filteredServices.length !== 1 ? 's' : ''}
                                </label>
                            </div>
                        )}
                        
                        {/* View Mode Toggle */}
                        <div className="flex bg-white p-1 rounded-lg border shadow-sm h-10">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('grid')}
                                className={`h-8 w-8 rounded-md ${viewMode === 'grid' ? 'bg-slate-100 text-blue-600' : 'text-slate-400'}`}
                                title="Grid View"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('list')}
                                className={`h-8 w-8 rounded-md ${viewMode === 'list' ? 'bg-slate-100 text-blue-600' : 'text-slate-400'}`}
                                title="List View"
                            >
                                <List className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </motion.div>

                {showForm && (
                    <ServiceForm
                        service={editingService}
                        onSave={handleSaveService}
                        onCancel={() => {
                            setShowForm(false);
                            setEditingService(null);
                        }}
                        isSaving={isSaving}
                    />
                )}

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                >
                    {isLoading ? (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {Array(6).fill(0).map((_, i) => (
                                <Card key={i}><CardContent className="p-6"><div className="animate-pulse space-y-4"><div className="h-4 bg-slate-200 rounded w-3/4"></div><div className="h-3 bg-slate-200 rounded w-1/2"></div><div className="h-3 bg-slate-200 rounded w-2/3"></div></div></CardContent></Card>
                            ))}
                        </div>
                    ) : filteredServices.length === 0 ? (
                        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                            <CardContent className="p-12 text-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Headset className="w-8 h-8 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                    {searchTerm || categoryFilter !== "all" || itemTypeFilter !== "all" || statusFilter !== "all"
                                        ? "No services match your filters"
                                        : "No services defined"}
                                </h3>
                                <p className="text-slate-600 mb-6">
                                    {searchTerm || categoryFilter !== "all" || itemTypeFilter !== "all" || statusFilter !== "all"
                                        ? "Try adjusting your search or filter criteria"
                                        : "Add a service to quickly add it to invoices."}
                                </p>
                                {(!searchTerm && categoryFilter === "all" && itemTypeFilter === "all" && statusFilter === "all") && (
                                    <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Your First Service
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        viewMode === 'grid' ? (
                            <div className="space-y-6">
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredServices.map((service, index) => (
                                        <div key={service.id} className="relative">
                                            {/* Selection Checkbox */}
                                            <div className="absolute top-2 left-2 z-10">
                                                <Checkbox
                                                    checked={selectedServices.includes(service.id)}
                                                    onCheckedChange={(checked) => handleServiceSelection(service.id, checked)}
                                                    className="bg-white border-2 shadow-sm"
                                                />
                                            </div>
                                            
                                            <ServiceCard
                                                service={service}
                                                onEdit={handleEditService}
                                                onToggleActive={handleToggleActive}
                                                delay={index * 0.1}
                                                userCurrency={user?.currency || 'USD'}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <ServiceList
                                services={filteredServices}
                                onEdit={handleEditService}
                                selectedServices={selectedServices}
                                onSelectService={handleServiceSelection}
                                userCurrency={user?.currency || 'USD'}
                            />
                        )
                    )}
                </motion.div>
            </div>

            <ConfirmationDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleBulkDelete}
                title="Delete Selected Services?"
                description={`This will permanently delete ${selectedServices.length} service${selectedServices.length !== 1 ? 's' : ''}. This action cannot be undone. (Only items not used in invoices can be deleted.)`}
                confirmText="Delete Services"
                isConfirming={false}
            />
        </div>
    );
}