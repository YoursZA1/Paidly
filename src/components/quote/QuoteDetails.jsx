import PropTypes from "prop-types";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, DollarSign, Calendar, Plus, Trash2, Save, Calculator, Package } from "lucide-react";
import { motion } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency } from "../CurrencySelector";
import { Service } from "@/api/entities";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ServiceForm from "../services/ServiceForm";
import { mapCatalogToLineItem, canEditLineItemRate, validateRateAdjustment } from "@/services/CatalogSyncService";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeCatalogItemForMap, getCatalogItemRate } from "@/utils/catalogLineItemMap";
import { SavedCatalogCommand, CatalogCombobox } from "@/components/catalog/DocumentCatalogPicker";
import { invalidateServicesCatalog } from "@/hooks/useServicesCatalogQuery";

export default function QuoteDetails({ 
    quoteData, 
    setQuoteData, 
    clients, 
    services,
    onNext,
    isEditing = false,
    showNextButton = true,
    taxRateInputRef,
    onRefreshCatalog,
}) {
    const queryClient = useQueryClient();
    const { user: authUser } = useAuth();
    const [expandedItems, setExpandedItems] = useState([]); // Track which items show optional fields
    const [isAddingService, setIsAddingService] = useState(false);
    const [currentServiceItemIndex, setCurrentServiceItemIndex] = useState(null);
    const [quickItemName, setQuickItemName] = useState('');
    const [quickItemQuantity, setQuickItemQuantity] = useState(1);
    const [quickItemRate, setQuickItemRate] = useState('');
    const [quickAddLine, setQuickAddLine] = useState('');
    const quickItemInputRef = useRef(null);
    const [quickSavedOpen, setQuickSavedOpen] = useState(false);

    /** Parse single-line input like "3x Graphic Design R500" or "Logo Design 100" */
    const parseQuickAddLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        let qty = 1;
        let rest = trimmed;
        const qtyMatch = trimmed.match(/^(\d+)\s*x\s*(.+)$/i);
        if (qtyMatch) {
            qty = Math.max(1, parseInt(qtyMatch[1], 10) || 1);
            rest = qtyMatch[2].trim();
        }
        const priceMatch = rest.match(/(.+?)\s+(?:R|R\s*|\$|€)?\s*([\d,.]+)\s*$/i);
        let name = rest;
        let price = 0;
        if (priceMatch) {
            name = priceMatch[1].trim();
            price = parseFloat(String(priceMatch[2]).replace(/,/g, "")) || 0;
        }
        if (!name) return null;
        return { name, quantity: qty, unit_price: price };
    };
    
    useEffect(() => {
        if (authUser?.default_tax_rate && !quoteData.tax_rate) {
            setQuoteData((prev) => ({ ...prev, tax_rate: authUser.default_tax_rate }));
        }
    }, [authUser?.default_tax_rate, authUser?.id, quoteData.tax_rate, setQuoteData]);

    useEffect(() => {
        if (quickItemInputRef.current) {
            quickItemInputRef.current.focus();
        }
    }, []);

    useEffect(() => {
        const name = quickItemName.trim().toLowerCase();
        if (!name || quickItemRate !== '') return;

        const matchedService = services.find(
            (service) => service.name?.toLowerCase() === name
        );

        const autoRate = getCatalogItemRate(matchedService);
        if (autoRate > 0 && quickItemRate === "") {
            setQuickItemRate(String(autoRate));
        }
    }, [quickItemName, quickItemRate, services]);


    const handleInputChange = (field, value) => {
        setQuoteData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const updateTotals = (items) => {
        const subtotal = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
        const taxRate = quoteData.tax_rate || 0;
        const taxAmount = subtotal * (taxRate / 100);
        const totalAmount = subtotal + taxAmount;

        setQuoteData(prev => ({
            ...prev,
            items: items,
            subtotal,
            tax_amount: taxAmount,
            total_amount: totalAmount
        }));
    };

    const handleItemChange = (index, field, value) => {
        const updatedItems = [...(quoteData.items || [])];
        
        // ===== RATE ADJUSTMENT VALIDATION =====
        if (field === 'unit_price') {
            const editCheck = canEditLineItemRate(updatedItems[index], authUser);
            if (!editCheck.canEdit) {
                alert(editCheck.reason || 'Your plan does not allow editing rates. Please upgrade to modify line item prices.');
                return;
            }
            
            const originalRate = parseFloat(updatedItems[index].unit_price || 0) || 0;
            const newRate = parseFloat(value) || 0;
            const validation = validateRateAdjustment(
                updatedItems[index],
                originalRate,
                newRate,
                authUser
            );
            
            if (!validation.allowed) {
                alert(validation.message);
                return;
            }
        }
        
        updatedItems[index] = {
            ...updatedItems[index],
            [field]: value
        };

        if (field === 'quantity' || field === 'unit_price') {
            const quantity = parseFloat(field === 'quantity' ? value : updatedItems[index].quantity) || 0;
            const unitPrice = parseFloat(field === 'unit_price' ? value : updatedItems[index].unit_price) || 0;
            updatedItems[index].total_price = quantity * unitPrice;
        }
        
        updateTotals(updatedItems);
    };

    const handleServiceSelect = (index, service) => {
        const updatedItems = [...(quoteData.items || [])];
        const currentItem = updatedItems[index];
        const normalized = normalizeCatalogItemForMap(service);
        if (!normalized) return;

        const qty = Math.max(1, Number(currentItem.quantity) || 1);
        const mappedResult = mapCatalogToLineItem(normalized, qty, {
            existingTaxRate: parseFloat(currentItem.item_tax_rate) || 0,
            userId: authUser?.id || null,
        });

        if (mappedResult?.success) {
            updatedItems[index] = {
                ...currentItem,
                ...mappedResult.lineItem,
            };
        } else {
            const rate = getCatalogItemRate(normalized);
            const itemTaxRate = parseFloat(currentItem.item_tax_rate) || 0;
            const totalPrice = qty * rate;
            updatedItems[index] = {
                ...currentItem,
                service_name: normalized.name,
                description: normalized.description || currentItem.description || "",
                quantity: qty,
                unit_price: rate,
                total_price: totalPrice,
                item_type: normalized.item_type || currentItem.item_type,
                catalog_item_id: normalized.id,
                item_tax_rate: itemTaxRate,
                item_tax_amount: totalPrice * (itemTaxRate / 100),
            };
        }

        if (service.description && !expandedItems.includes(index)) {
            setExpandedItems([...expandedItems, index]);
        }

        updateTotals(updatedItems);
    };
    
    const handleSaveNewService = async (serviceData) => {
        try {
            const newService = await Service.create(serviceData);
            await invalidateServicesCatalog(queryClient);
            if (currentServiceItemIndex !== null) {
                handleServiceSelect(currentServiceItemIndex, newService);
            }
            setIsAddingService(false);
            setCurrentServiceItemIndex(null);
        } catch (error) {
            console.error("Error creating new service:", error);
            alert("Failed to create service.");
        }
    };

    const addItem = () => {
        const newItem = {
            service_name: "",
            description: "",
            quantity: 1,
            unit_price: 0,
            total_price: 0
        };
        
        setQuoteData(prev => ({
            ...prev,
            items: [...(prev.items || []), newItem]
        }));
    };

    const addQuickItem = () => {
        const name = quickItemName.trim();
        if (!name) return;

        const quantity = Number(quickItemQuantity) > 0 ? Number(quickItemQuantity) : 1;
        const rateValue = quickItemRate === '' ? null : Number(quickItemRate);

        const matchedService = services.find(
            (service) => service.name?.toLowerCase() === name.toLowerCase()
        );

        let nextItem = null;

        if (matchedService) {
            const normalized = normalizeCatalogItemForMap(matchedService);
            if (normalized) {
                const mappedResult = mapCatalogToLineItem(normalized, quantity, {
                    existingTaxRate: 0,
                    userId: authUser?.id || null,
                });
                if (mappedResult?.success) {
                    nextItem = { ...mappedResult.lineItem };
                }
            }
        }

        if (!nextItem) {
            nextItem = {
                service_name: name,
                description: "",
                quantity,
                unit_price: 0,
                total_price: 0
            };
        }

        if (rateValue !== null && Number.isFinite(rateValue)) {
            nextItem.unit_price = rateValue;
        }

        nextItem.total_price = (Number(nextItem.quantity) || 0) * (Number(nextItem.unit_price) || 0);

        const nextIndex = (quoteData.items || []).length;
        const updatedItems = [...(quoteData.items || []), nextItem];
        updateTotals(updatedItems);

        if (matchedService) {
            setExpandedItems((prev) => (
                prev.includes(nextIndex) ? prev : [...prev, nextIndex]
            ));
        }

        setQuickItemName('');
        setQuickItemQuantity(1);
        setQuickItemRate('');

        if (quickItemInputRef.current) {
            quickItemInputRef.current.focus();
        }
    };

    const addFromQuickAddLine = () => {
        const parsed = parseQuickAddLine(quickAddLine);
        if (!parsed) return;
        const matchedService = services.find((s) => s.name?.toLowerCase() === parsed.name.toLowerCase());
        let nextItem;
        if (matchedService) {
            const mapped = mapCatalogToLineItem(matchedService, parsed.quantity, {
                existingTaxRate: 0,
                userId: user?.id || null,
            });
            nextItem = mapped?.success ? { ...mapped.lineItem } : null;
        }
        if (!nextItem) {
            nextItem = {
                service_name: parsed.name,
                description: "",
                quantity: parsed.quantity,
                unit_price: parsed.unit_price,
                total_price: parsed.quantity * parsed.unit_price,
            };
        } else if (parsed.unit_price > 0) {
            nextItem.unit_price = parsed.unit_price;
            nextItem.total_price = parsed.quantity * parsed.unit_price;
        }
        const updatedItems = [...(quoteData.items || []), nextItem];
        updateTotals(updatedItems);
        setQuickAddLine("");
    };

    useEffect(() => {
        if (!quoteData.items || quoteData.items.length === 0) {
            addItem();
        }
    }, [quoteData.items?.length]);

    const removeItem = (index) => {
        const updatedItems = quoteData.items.filter((_, i) => i !== index);
        updateTotals(updatedItems);
    };

    const handleTaxRateChange = (value) => {
        const taxRate = parseFloat(value) || 0;
        const subtotal = quoteData.subtotal || 0;
        const taxAmount = subtotal * (taxRate / 100);
        const totalAmount = subtotal + taxAmount;

        setQuoteData(prev => ({
            ...prev,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            total_amount: totalAmount
        }));
    };

    const items = quoteData.items || [];
    const isValid = quoteData.client_id && 
                   quoteData.project_title && 
                   items.length > 0 &&
                   items.every(item => item.service_name && item.quantity > 0 && item.unit_price >= 0) &&
                   quoteData.valid_until;
    
    const userCurrency = quoteData?.currency || authUser?.currency || "USD";

    const appendLineFromSavedCatalog = (catalogItem) => {
        const normalized = normalizeCatalogItemForMap(catalogItem);
        if (!normalized) return;
        const quantity = Math.max(1, Number(quickItemQuantity) > 0 ? Number(quickItemQuantity) : 1);
        const mappedResult = mapCatalogToLineItem(normalized, quantity, {
            existingTaxRate: 0,
            userId: authUser?.id || null,
        });

        let nextItem;
        if (mappedResult?.success) {
            nextItem = { ...mappedResult.lineItem };
        } else {
            const rate = getCatalogItemRate(normalized);
            nextItem = {
                service_name: normalized.name,
                description: normalized.description || "",
                quantity,
                unit_price: rate,
                total_price: quantity * rate,
                item_tax_rate: 0,
                item_tax_amount: 0,
            };
        }

        nextItem.total_price = (Number(nextItem.quantity) || 0) * (Number(nextItem.unit_price) || 0);
        nextItem.item_tax_rate = nextItem.item_tax_rate || 0;
        nextItem.item_tax_amount = nextItem.total_price * (Number(nextItem.item_tax_rate) / 100);

        const updatedItems = [...(quoteData.items || []), nextItem];
        updateTotals(updatedItems);

        if (normalized.description) {
            const nextIndex = updatedItems.length - 1;
            setExpandedItems((prev) => (prev.includes(nextIndex) ? prev : [...prev, nextIndex]));
        }
        setQuickSavedOpen(false);
        if (typeof onRefreshCatalog === "function") void onRefreshCatalog();
    };

    return (
        <>
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
        >
            {/* Quote Details */}
            <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                    <div className="w-2 h-6 bg-orange-500 rounded-full" />
                    Quote Details
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Client</Label>
                        <Select
                            value={quoteData.client_id}
                            onValueChange={(value) => handleInputChange('client_id', value)}
                        >
                            <SelectTrigger className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-orange-500/20 h-auto">
                                <SelectValue placeholder="Select a client..." />
                            </SelectTrigger>
                            <SelectContent>
                                {clients.map((client) => (
                                    <SelectItem key={client.id} value={client.id}>
                                        {client.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Project Title</Label>
                        <Input
                            value={quoteData.project_title}
                            onChange={(e) => handleInputChange('project_title', e.target.value)}
                            placeholder="e.g. Logo Design"
                            className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-orange-500/20 h-auto"
                        />
                    </div>
                </div>
            </section>

            {/* Services & Items - Dynamic list */}
            <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-black text-slate-900">Services & Items</h2>
                    <Button
                        type="button"
                        onClick={addItem}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 rounded-xl text-xs font-bold hover:bg-orange-100 transition-all"
                    >
                        <Plus className="w-4 h-4" /> Add Item
                    </Button>
                </div>

                {/* Quick Add - Single line parser */}
                <div className="bg-slate-50 rounded-2xl p-4 mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                        <p className="text-xs font-bold uppercase text-slate-400">Quick Add</p>
                        <Popover
                            open={quickSavedOpen}
                            onOpenChange={(open) => {
                                if (open && typeof onRefreshCatalog === "function") void onRefreshCatalog();
                                setQuickSavedOpen(open);
                            }}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 text-xs rounded-xl shrink-0"
                                >
                                    <Package className="w-3.5 h-3.5 mr-1.5" />
                                    From saved catalog
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[min(100vw-2rem,24rem)] p-0" align="end">
                                <SavedCatalogCommand
                                    catalog={services}
                                    currencyCode={userCurrency}
                                    onPick={appendLineFromSavedCatalog}
                                    onAddNew={() => {
                                        setQuickSavedOpen(false);
                                        setIsAddingService(true);
                                    }}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="flex gap-2 mb-3">
                        <Input
                            value={quickAddLine}
                            onChange={(e) => setQuickAddLine(e.target.value)}
                            placeholder="e.g. 3x Graphic Design R500 or Logo Design 100"
                            className="h-10 rounded-xl bg-white border-slate-100 flex-1"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addFromQuickAddLine();
                                }
                            }}
                        />
                        <Button
                            type="button"
                            onClick={addFromQuickAddLine}
                            disabled={!quickAddLine.trim()}
                            className="h-10 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold shrink-0"
                        >
                            Add
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Input
                            ref={quickItemInputRef}
                            value={quickItemName}
                            onChange={(e) => setQuickItemName(e.target.value)}
                            placeholder="Item name"
                            className="h-10 rounded-xl bg-white border-slate-100 flex-1 min-w-[120px]"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addQuickItem();
                                }
                            }}
                        />
                        <Input
                            type="number"
                            min="1"
                            value={quickItemQuantity}
                            onChange={(e) => setQuickItemQuantity(e.target.value)}
                            className="h-10 w-16 rounded-xl bg-white border-slate-100 text-center"
                        />
                        <div className="relative flex-1 min-w-[100px]">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={quickItemRate}
                                onChange={(e) => setQuickItemRate(e.target.value)}
                                placeholder="Rate"
                                className="h-10 pl-10 rounded-xl bg-white border-slate-100"
                            />
                        </div>
                        <Button
                            type="button"
                            onClick={addQuickItem}
                            className="h-10 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold"
                        >
                            Add
                        </Button>
                    </div>
                </div>

                <div className="space-y-4">
                    {items.length === 0 && (
                        <div className="text-center py-8 bg-slate-50 rounded-2xl">
                            <p className="text-slate-500 text-sm">No items yet. Add an item to get started.</p>
                        </div>
                    )}
                    {items.map((item, index) => (
                        <div
                            key={index}
                            className="group flex flex-wrap items-center gap-3 sm:gap-4 bg-slate-50 p-4 rounded-2xl transition-all hover:bg-white hover:ring-1 hover:ring-slate-200"
                        >
                            <span className="text-slate-300 font-bold text-xs w-6">#{index + 1}</span>
                            <div className="flex-1 min-w-[140px]">
                                <CatalogCombobox
                                    catalog={services}
                                    value={item.service_name}
                                    onSelect={(svc) => handleServiceSelect(index, svc)}
                                    onAddNew={() => {
                                        setCurrentServiceItemIndex(index);
                                        setIsAddingService(true);
                                    }}
                                    currencyCode={userCurrency}
                                    onRefreshCatalog={onRefreshCatalog}
                                    placeholder="Choose saved product or service…"
                                />
                            </div>
                            <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                className="w-16 h-10 bg-white border border-slate-100 rounded-xl p-2 text-center text-xs"
                            />
                            <div className="relative">
                                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.unit_price}
                                    onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                    placeholder="0.00"
                                    className="w-28 h-10 pl-8 bg-white border border-slate-100 rounded-xl text-right text-xs font-bold"
                                />
                            </div>
                            <span className="text-xs font-bold text-slate-600 w-16 text-right">
                                {formatCurrency(item.total_price || 0, userCurrency)}
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(index)}
                                className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all h-10 w-10"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                            {expandedItems.includes(index) && (
                                <div className="w-full mt-2 pl-10">
                                    <Input
                                        value={item.description}
                                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                        placeholder="Description (optional)"
                                        className="h-9 rounded-xl bg-white border-slate-100 text-sm"
                                    />
                                </div>
                            )}
                            {!expandedItems.includes(index) && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpandedItems([...expandedItems, index])}
                                    className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 text-xs font-medium -ml-2"
                                >
                                    + Add Description
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* Totals & Tax - Dark card */}
            <section className="bg-slate-900 rounded-[32px] p-8 text-white">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-orange-500" />
                            <span className="text-sm font-bold text-slate-400">Total Calculation</span>
                        </div>
                        <p className="text-xs text-slate-500 max-w-[220px]">
                            Tax rates are applied automatically to the grand total.
                        </p>
                        <div className="grid grid-cols-2 gap-4 sm:w-48">
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Tax Rate (%)</Label>
                                <Input
                                    ref={taxRateInputRef}
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={quoteData.tax_rate ?? 0}
                                    onChange={(e) => handleTaxRateChange(e.target.value)}
                                    className="h-10 bg-slate-800 border-slate-700 text-white rounded-xl text-sm font-bold"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Valid Until</Label>
                                <Input
                                    type="date"
                                    value={quoteData.valid_until}
                                    onChange={(e) => handleInputChange('valid_until', e.target.value)}
                                    className="h-10 bg-slate-800 border-slate-700 text-white rounded-xl text-sm"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="text-right sm:text-right">
                        <div className="space-y-1 mb-2">
                            <p className="text-sm text-slate-400">Subtotal</p>
                            <p className="text-lg font-bold">{formatCurrency(quoteData.subtotal || 0, userCurrency)}</p>
                        </div>
                        {(quoteData.tax_rate || 0) > 0 && (
                            <div className="space-y-1 mb-2">
                                <p className="text-sm text-slate-400">Tax ({quoteData.tax_rate}%)</p>
                                <p className="text-lg font-bold">{formatCurrency(quoteData.tax_amount || 0, userCurrency)}</p>
                            </div>
                        )}
                        <p className="text-sm text-slate-400 mt-4">Grand Total</p>
                        <h2 className="text-4xl font-black text-white">
                            {formatCurrency(quoteData.total_amount || 0, userCurrency)}
                        </h2>
                    </div>
                </div>
            </section>

            {/* Additional Fields */}
            <section className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                    <div className="w-2 h-6 bg-slate-300 rounded-full" />
                    Additional Details
                </h2>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Project Description</Label>
                        <Textarea
                            value={quoteData.project_description}
                            onChange={(e) => handleInputChange('project_description', e.target.value)}
                            placeholder="Describe the project in detail..."
                            className="min-h-24 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-orange-500/20 resize-none"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Additional Notes</Label>
                        <Textarea
                            value={quoteData.notes}
                            onChange={(e) => handleInputChange('notes', e.target.value)}
                            placeholder="Any additional notes..."
                            className="min-h-24 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-orange-500/20 resize-none"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Terms & Conditions</Label>
                        <Textarea
                            value={quoteData.terms_conditions}
                            onChange={(e) => handleInputChange('terms_conditions', e.target.value)}
                            placeholder="Enter terms and conditions..."
                            className="min-h-24 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-orange-500/20 resize-none"
                        />
                    </div>
                </div>
            </section>

            {showNextButton && (
                <div className="flex justify-end">
                    <Button
                        onClick={onNext}
                        disabled={!isValid}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isEditing ? (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Save Changes
                            </>
                        ) : (
                            <>
                                Continue to Preview
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            )}
        </motion.div>
        
        <Dialog open={isAddingService} onOpenChange={setIsAddingService}>
            <DialogContent aria-describedby={undefined}>
                <DialogTitle className="sr-only">Add service</DialogTitle>
                <ServiceForm
                    variant="dialog"
                    onSave={handleSaveNewService}
                    onCancel={() => setIsAddingService(false)}
                />
            </DialogContent>
        </Dialog>
        </>
    );
}

QuoteDetails.propTypes = {
    quoteData: PropTypes.shape({
        client_id: PropTypes.string,
        project_title: PropTypes.string,
        project_description: PropTypes.string,
        items: PropTypes.arrayOf(PropTypes.shape({
            service_name: PropTypes.string,
            description: PropTypes.string,
            quantity: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
            unit_price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
            total_price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
            item_tax_rate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
            item_tax_amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
        })),
        subtotal: PropTypes.number,
        tax_rate: PropTypes.number,
        tax_amount: PropTypes.number,
        total_amount: PropTypes.number,
        valid_until: PropTypes.string,
        notes: PropTypes.string,
        terms_conditions: PropTypes.string
    }).isRequired,
    setQuoteData: PropTypes.func.isRequired,
    clients: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        email: PropTypes.string
    })).isRequired,
    services: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        description: PropTypes.string,
        rate: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    })).isRequired,
    onNext: PropTypes.func,
    isEditing: PropTypes.bool,
    showNextButton: PropTypes.bool,
    taxRateInputRef: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
    onRefreshCatalog: PropTypes.func,
};