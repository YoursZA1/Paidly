
import PropTypes from "prop-types";
import { useState, Fragment, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, DollarSign, Calendar, FileText, Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { motion } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatCurrency } from "../CurrencySelector";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ClientForm from "../clients/ClientForm";
import BankingForm from "../banking/BankingForm";
import ServiceForm from "../services/ServiceForm";
import { ItemTypeSelector, UnitTypeSelector } from "../invoice/ItemTypeSelector";
import { getItemTypeIcon, getUnitLabel } from "../invoice/itemTypeHelpers";
import TaxService from "@/services/TaxService";
import { mapCatalogToLineItem, canEditLineItemRate, validateRateAdjustment } from "@/services/CatalogSyncService";
// Mock entities for demonstration. In a real app, these would be from an API or ORM.
// The outline implies these are imported from "@/api/entities", but for a self-contained, runnable file,
// we'll provide simple mocks similar to the User mock.
const Client = {
    _clients: [],
    async create(data) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const newClient = { id: `client_${Date.now()}`, ...data };
        this._clients.push(newClient);
        return newClient;
    },
    async list(sort) {
        await new Promise(resolve => setTimeout(resolve, 100));
        let sortedClients = [...this._clients];
        if (sort === "-created_date") {
            sortedClients.sort((a, b) => b.id.localeCompare(a.id)); // Assuming ID is creation-time based for simplicity
        }
        return sortedClients;
    }
};

const BankingDetail = {
    _details: [],
    async create(data) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const newDetail = { id: `banking_${Date.now()}`, ...data };
        this._details.push(newDetail);
        return newDetail;
    },
    async list(sort) {
        await new Promise(resolve => setTimeout(resolve, 100));
        let sortedDetails = [...this._details];
        if (sort === "-created_date") {
            sortedDetails.sort((a, b) => b.id.localeCompare(a.id));
        }
        return sortedDetails;
    }
};

const Service = {
    _services: [],
    async create(data) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const newService = { id: `service_${Date.now()}`, ...data };
        this._services.push(newService);
        return newService;
    },
    async list(sort) {
        await new Promise(resolve => setTimeout(resolve, 100));
        let sortedServices = [...this._services];
        if (sort === "-created_date") {
            sortedServices.sort((a, b) => b.id.localeCompare(a.id));
        }
        return sortedServices;
    }
};

// Mock User object for demonstration purposes. In a real application, this would likely be an API call or context.
const User = {
    me: async () => {
        // Simulate an API call delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
            id: 'user123',
            name: 'John Doe',
            currency: 'USD', // Example currency, could be 'EUR', 'GBP', etc.
            location: 'USA'
        };
    }
};

const ServiceCombobox = ({ services, value, onSelect, onAddNew }) => {
    const [open, setOpen] = useState(false)
    const selectedService = services.find(s => s.name.toLowerCase() === value?.toLowerCase());

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-10 rounded-lg font-normal"
                >
                    {value
                        ? services.find((s) => s.name.toLowerCase() === value.toLowerCase())?.name
                        : "Select a service..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Search service..." />
                    <CommandList>
                        <CommandEmpty>No service found.</CommandEmpty>
                        <CommandGroup>
                            {services.map((service) => (
                                <CommandItem
                                    key={service.id}
                                    value={service.name}
                                    onSelect={(currentValue) => {
                                        const selected = services.find(s => s.name.toLowerCase() === currentValue.toLowerCase());
                                        onSelect(selected);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === service.name ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {service.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandGroup>
                             <CommandItem
                                onSelect={() => {
                                    onAddNew();
                                    setOpen(false);
                                }}
                                className="cursor-pointer"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                <span>Add new service</span>
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

export default function ProjectDetails({ 
    invoiceData, 
    setInvoiceData, 
    clients, 
    setClients,
    bankingDetails,
    setBankingDetails,
    services, 
    setServices,
    onNext,
    isRecurring = false,
    showNextButton = true
}) {
    const [user, setUser] = useState(null);
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [isAddingBankingDetail, setIsAddingBankingDetail] = useState(false);
    const [isAddingService, setIsAddingService] = useState(false);
    const [currentServiceItemIndex, setCurrentServiceItemIndex] = useState(null);
    const [groups, setGroups] = useState([]);
    const [newGroupName, setNewGroupName] = useState('');
    const [showGroupManager, setShowGroupManager] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState('none');
    const [expandedItems, setExpandedItems] = useState([]); // Track which items show optional fields
    const [quickItemName, setQuickItemName] = useState('');
    const [quickItemQuantity, setQuickItemQuantity] = useState(1);
    const [quickItemRate, setQuickItemRate] = useState('');
    const quickItemInputRef = useRef(null);

    // Industry Preset Configurations
    const INDUSTRY_PRESETS = {
        automotive: {
            name: '🚗 Automotive',
            defaultItemType: 'labor',
            defaultUnitType: 'hour',
            suggestedGroups: ['Parts', 'Labor', 'Sublet'],
            itemTypes: ['labor', 'product', 'material'],
            description: 'Optimized for auto repair shops and mechanics'
        },
        construction: {
            name: '🏗️ Construction',
            defaultItemType: 'labor',
            defaultUnitType: 'hour',
            suggestedGroups: ['Phase 1', 'Phase 2', 'Materials'],
            itemTypes: ['labor', 'material', 'equipment'],
            description: 'Built for contractors and construction projects'
        },
        retail: {
            name: '🛍️ Retail',
            defaultItemType: 'product',
            defaultUnitType: 'piece',
            suggestedGroups: [],
            itemTypes: ['product'],
            description: 'Perfect for product sales and inventory'
        },
        professional_services: {
            name: '💼 Professional Services',
            defaultItemType: 'service',
            defaultUnitType: 'hour',
            suggestedGroups: ['Consulting', 'Development', 'Support'],
            itemTypes: ['service'],
            description: 'Ideal for consultants and agencies'
        },
        manufacturing: {
            name: '🏭 Manufacturing',
            defaultItemType: 'material',
            defaultUnitType: 'kg',
            suggestedGroups: ['Raw Materials', 'Components', 'Finished Goods'],
            itemTypes: ['material', 'product', 'equipment'],
            description: 'Designed for manufacturers and suppliers'
        }
    };
    
    useEffect(() => {
        const loadUser = async () => {
            try {
                const userData = await User.me();
                setUser(userData);
                
                // Load default tax rate from user settings
                if (userData?.default_tax_rate && !invoiceData.tax_rate) {
                    setInvoiceData(prev => ({
                        ...prev,
                        tax_rate: userData.default_tax_rate
                    }));
                }
            } catch (error) {
                console.error("Error loading user:", error);
            }
        };
        loadUser();
    }, []);

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

        if (matchedService?.rate !== undefined && matchedService?.rate !== null) {
            setQuickItemRate(String(matchedService.rate));
        }
    }, [quickItemName, quickItemRate, services]);

    const handleSaveNewClient = async (clientData) => {
        try {
            const newClient = await Client.create(clientData);
            const updatedClients = await Client.list("-created_date");
            setClients(updatedClients);
            handleInputChange('client_id', newClient.id);
            setIsAddingClient(false);
        } catch (error) {
            console.error("Error creating new client:", error);
            alert("Failed to create client.");
        }
    };

    const handleSaveNewBankingDetail = async (detailData) => {
        try {
            const newDetail = await BankingDetail.create(detailData);
            const updatedDetails = await BankingDetail.list("-created_date");
            setBankingDetails(updatedDetails);
            handleInputChange('banking_detail_id', newDetail.id);
            setIsAddingBankingDetail(false);
        } catch (error) {
            console.error("Error creating new payment method:", error);
            alert("Failed to create payment method.");
        }
    };
    
    const handleSaveNewService = async (serviceData) => {
        try {
            const newService = await Service.create(serviceData);
            const updatedServices = await Service.list("-created_date");
            setServices(updatedServices);
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

    const handleInputChange = (field, value) => {
        setInvoiceData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const updateTotals = (items) => {
        const subtotal = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
        
        // Calculate discount
        let discountAmount = 0;
        const discountType = invoiceData.discount_type || 'fixed';
        const discountValue = invoiceData.discount_value || 0;
        
        if (discountValue > 0) {
            if (discountType === 'percentage') {
                discountAmount = subtotal * (discountValue / 100);
            } else {
                discountAmount = discountValue;
            }
        }
        
        // Subtotal after discount
        const subtotalAfterDiscount = subtotal - discountAmount;
        
        // Calculate per-item tax amounts
        const itemTaxes = items.reduce((sum, item) => {
            const itemTax = item.item_tax_amount || 0;
            return sum + itemTax;
        }, 0);
        
        // Calculate global tax (applied to subtotal after discount)
        const globalTaxRate = invoiceData.tax_rate || 0;
        const globalTaxAmount = subtotalAfterDiscount * (globalTaxRate / 100);
        
        // Total tax is the sum of item-specific and global taxes
        const totalTaxAmount = itemTaxes + globalTaxAmount;
        const totalAmount = subtotalAfterDiscount + totalTaxAmount;

        setInvoiceData(prev => ({
            ...prev,
            items: items,
            subtotal,
            discount_amount: discountAmount,
            tax_amount: totalTaxAmount,
            item_taxes: itemTaxes,
            total_amount: totalAmount
        }));
    };

    const handleItemChange = (index, field, value) => {
        const updatedItems = [...(invoiceData.items || [])];
        
        // ===== RATE ADJUSTMENT VALIDATION =====
        // Check if user can edit the rate based on their plan
        if (field === 'unit_price') {
            const editCheck = canEditLineItemRate(updatedItems[index], user);
            if (!editCheck.canEdit) {
                alert(editCheck.reason || 'Your plan does not allow editing rates. Please upgrade to modify line item prices.');
                return;
            }
            
            // Validate rate adjustment
            const originalRate = parseFloat(updatedItems[index].unit_price || 0) || 0;
            const newRate = parseFloat(value) || 0;
            const validation = validateRateAdjustment(
                updatedItems[index],
                originalRate,
                newRate,
                user
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

        // Recalculate prices for quantity or unit_price changes
        if (field === 'quantity' || field === 'unit_price') {
            const quantity = parseFloat(field === 'quantity' ? value : updatedItems[index].quantity) || 0;
            const unitPrice = parseFloat(field === 'unit_price' ? value : updatedItems[index].unit_price) || 0;
            updatedItems[index].total_price = quantity * unitPrice;
        }

        // Recalculate item tax if item_tax_rate or total_price changes
        if (field === 'item_tax_rate' || field === 'quantity' || field === 'unit_price') {
            const itemTaxRate = parseFloat(updatedItems[index].item_tax_rate || 0) || 0;
            const totalPrice = updatedItems[index].total_price || 0;
            updatedItems[index].item_tax_amount = totalPrice * (itemTaxRate / 100);
        }
        
        updateTotals(updatedItems);
    };

    const handleServiceSelect = (index, service) => {
        const updatedItems = [...(invoiceData.items || [])];
        const currentItem = updatedItems[index];
        
        // Use CatalogSyncService to map catalog item to line item
        const mappedResult = mapCatalogToLineItem(
            service,
            currentItem.quantity || 1,
            {
                existingTaxRate: currentItem.item_tax_rate || 0,
                userId: user?.id || null
            }
        );
        
        if (!mappedResult?.success) {
            console.error('Error mapping catalog item:', mappedResult?.error);
            alert(mappedResult?.error || 'Unable to select this item. Please try again.');
            return;
        }
        
        // Auto-expand description if service has one
        if (service.description && !expandedItems.includes(index)) {
            setExpandedItems([...expandedItems, index]);
        }
        
        // Merge mapped fields with existing item (preserves any user-set values)
        updatedItems[index] = {
            ...currentItem,
            ...mappedResult.lineItem
        };
        
        updateTotals(updatedItems);
    };

    const applyPreset = (presetKey) => {
        if (presetKey === 'none') {
            setSelectedPreset('none');
            return;
        }

        const preset = INDUSTRY_PRESETS[presetKey];
        if (!preset) return;

        setSelectedPreset(presetKey);

        // Apply suggested groups
        if (preset.suggestedGroups && preset.suggestedGroups.length > 0 && groups.length === 0) {
            const newGroups = preset.suggestedGroups.map((name, idx) => ({
                id: `group_${Date.now()}_${idx}`,
                name: name,
                type: 'phase'
            }));
            setGroups(newGroups);
        }
    };

    const addItem = () => {
        const preset = selectedPreset !== 'none' ? INDUSTRY_PRESETS[selectedPreset] : null;
        
        const newItem = {
            service_name: "",
            description: "",
            quantity: 1,
            unit_price: 0,
            total_price: 0,
            item_type: preset ? preset.defaultItemType : "service",
            unit_type: preset ? preset.defaultUnitType : "unit",
            part_number: "",
            sku: "",
            details: "",
            group_id: null
        };
        
        setInvoiceData(prev => ({
            ...prev,
            items: [...(prev.items || []), newItem]
        }));
    };

    const addQuickItem = () => {
        const name = quickItemName.trim();
        if (!name) return;

        const quantity = Number(quickItemQuantity) > 0 ? Number(quickItemQuantity) : 1;
        const rateValue = quickItemRate === '' ? null : Number(quickItemRate);
        const preset = selectedPreset !== 'none' ? INDUSTRY_PRESETS[selectedPreset] : null;

        const matchedService = services.find(
            (service) => service.name?.toLowerCase() === name.toLowerCase()
        );

        let nextItem = null;

        if (matchedService) {
            const mappedResult = mapCatalogToLineItem(matchedService, quantity, {
                existingTaxRate: 0,
                userId: user?.id || null
            });

            if (mappedResult?.success) {
                nextItem = { ...mappedResult.lineItem };
            }
        }

        if (!nextItem) {
            nextItem = {
                service_name: name,
                description: "",
                quantity,
                unit_price: 0,
                total_price: 0,
                item_type: preset ? preset.defaultItemType : "service",
                unit_type: preset ? preset.defaultUnitType : "unit",
                part_number: "",
                sku: "",
                details: "",
                group_id: null
            };
        }

        if (rateValue !== null && Number.isFinite(rateValue)) {
            nextItem.unit_price = rateValue;
        }

        nextItem.total_price = (Number(nextItem.quantity) || 0) * (Number(nextItem.unit_price) || 0);
        nextItem.item_tax_rate = nextItem.item_tax_rate || 0;
        nextItem.item_tax_amount = nextItem.total_price * (nextItem.item_tax_rate / 100);

        const nextIndex = (invoiceData.items || []).length;
        const updatedItems = [...(invoiceData.items || []), nextItem];
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

    useEffect(() => {
        if (!invoiceData.items || invoiceData.items.length === 0) {
            addItem();
        }
    }, [invoiceData.items?.length]);

    const addGroup = () => {
        if (!newGroupName.trim()) return;
        const newGroup = {
            id: `group_${Date.now()}`,
            name: newGroupName.trim(),
            type: 'phase' // default type, could be 'phase', 'job_type', or 'department'
        };
        setGroups(prev => [...prev, newGroup]);
        setNewGroupName('');
    };

    const removeGroup = (groupId) => {
        // Remove group and unassign items from this group
        setGroups(prev => prev.filter(g => g.id !== groupId));
        const updatedItems = invoiceData.items?.map(item => 
            item.group_id === groupId ? { ...item, group_id: null } : item
        );
        if (updatedItems) {
            updateTotals(updatedItems);
        }
    };

    const getGroupedItems = () => {
        const items = invoiceData.items || [];
        const grouped = { ungrouped: [] };
        
        items.forEach(item => {
            if (item.group_id) {
                if (!grouped[item.group_id]) {
                    grouped[item.group_id] = [];
                }
                grouped[item.group_id].push(item);
            } else {
                grouped.ungrouped.push(item);
            }
        });
        
        return grouped;
    };

    const getGroupSubtotal = (groupItems) => {
        return groupItems.reduce((sum, item) => {
            const subtotal = item.total_price || 0;
            const tax = item.item_tax_amount || 0;
            return sum + subtotal + tax;
        }, 0);
    };

    const removeItem = (index) => {
        const updatedItems = invoiceData.items.filter((_, i) => i !== index);
        updateTotals(updatedItems);
    };

    const handleTaxRateChange = (value) => {
        const taxRate = parseFloat(value) || 0;
        updateTotals(invoiceData.items || []);

        setInvoiceData(prev => ({
            ...prev,
            tax_rate: taxRate
        }));
    };

    const handleDiscountChange = (type, value) => {
        setInvoiceData(prev => ({
            ...prev,
            discount_type: type,
            discount_value: parseFloat(value) || 0
        }));
        updateTotals(invoiceData.items || []);
    };

    const items = invoiceData.items || [];
    // Modify validation based on whether it's a recurring profile or a regular invoice
    const isValid = isRecurring
        ? invoiceData.project_title && items.length > 0 && items.every(item => item.service_name && item.quantity > 0 && item.unit_price >= 0)
        : invoiceData.client_id && invoiceData.project_title && items.length > 0 && items.every(item => item.service_name && item.quantity > 0 && item.unit_price >= 0) && invoiceData.invoice_date && invoiceData.delivery_date;
    
    const userCurrency = user?.currency || 'USD';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-6">
                    <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        {isRecurring ? 'Invoice Template Details' : 'Project Details'}
                    </CardTitle>
                </CardHeader>
                
                <CardContent className="p-4 sm:p-8">
                    <div className="space-y-6">
                        {/* Invoice Header - Core Fields */}
                        <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 sm:p-6 rounded-xl border border-primary/20">
                            <h3 className="text-sm font-semibold text-slate-900 mb-4">Invoice Information</h3>
                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Client Selection */}
                                {!isRecurring && (
                                    <div className="space-y-2">
                                        <Label htmlFor="client" className="text-sm font-semibold text-slate-700">
                                            Customer / Company *
                                        </Label>
                                        <div className="flex items-center gap-2">
                                            <Select 
                                                value={invoiceData.client_id} 
                                                onValueChange={(value) => handleInputChange('client_id', value)}
                                                className="flex-grow"
                                            >
                                                <SelectTrigger className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20">
                                                    <SelectValue placeholder="Choose a client" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {clients.map(client => (
                                                        <SelectItem key={client.id} value={client.id}>
                                                            {client.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button type="button" variant="outline" size="icon" onClick={() => setIsAddingClient(true)} aria-label="Add new client">
                                                <Plus className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Project/Job Name */}
                                <div className={`space-y-2 ${isRecurring ? 'md:col-span-2' : ''}`}>
                                    <Label htmlFor="project_title" className="text-sm font-semibold text-slate-700">
                                        Project / Job Name *
                                    </Label>
                                    <Input
                                        id="project_title"
                                        value={invoiceData.project_title}
                                        onChange={(e) => handleInputChange('project_title', e.target.value)}
                                        placeholder="e.g., Monthly Marketing Services"
                                        className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                    />
                                </div>

                                {/* Reference / PO Number */}
                                <div className="space-y-2">
                                    <Label htmlFor="reference_number" className="text-sm font-semibold text-slate-700">
                                        Reference / PO Number
                                    </Label>
                                    <Input
                                        id="reference_number"
                                        value={invoiceData.reference_number || ''}
                                        onChange={(e) => handleInputChange('reference_number', e.target.value)}
                                        placeholder="e.g., PO-2024-001 or REF-ABC123"
                                        className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                    />
                                </div>

                                {/* Issue Date */}
                                {!isRecurring && (
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-slate-700">Issue Date *</Label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                type="date"
                                                value={invoiceData.invoice_date}
                                                onChange={(e) => handleInputChange('invoice_date', e.target.value)}
                                                className="h-12 pl-10 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Due Date */}
                                {!isRecurring && (
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-slate-700">Due Date *</Label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                type="date"
                                                value={invoiceData.delivery_date}
                                                onChange={(e) => handleInputChange('delivery_date', e.target.value)}
                                                className="h-12 pl-10 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Industry Preset Selector */}
                        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-6 mb-6">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-2xl">⚡</span>
                                <Label className="text-lg font-semibold text-purple-900">Invoice Preset (Power Feature)</Label>
                            </div>
                            <Select value={selectedPreset} onValueChange={applyPreset}>
                                <SelectTrigger className="h-12 bg-white border-purple-200 focus:border-purple-500 focus:ring-purple-500/20">
                                    <SelectValue placeholder="Choose an industry preset to auto-configure your invoice" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">
                                        <div className="flex flex-col">
                                            <span className="font-medium">None (Default)</span>
                                            <span className="text-xs text-slate-500">Standard invoice form without presets</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="automotive">
                                        <div className="flex flex-col">
                                            <span className="font-medium">🚗 Automotive</span>
                                            <span className="text-xs text-slate-500">Optimized for auto repair shops and mechanics</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="construction">
                                        <div className="flex flex-col">
                                            <span className="font-medium">🏗️ Construction</span>
                                            <span className="text-xs text-slate-500">Built for contractors and construction projects</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="retail">
                                        <div className="flex flex-col">
                                            <span className="font-medium">🛍️ Retail</span>
                                            <span className="text-xs text-slate-500">Perfect for retail stores and product sales</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="professional_services">
                                        <div className="flex flex-col">
                                            <span className="font-medium">💼 Professional Services</span>
                                            <span className="text-xs text-slate-500">Ideal for consultants and hourly billing</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="manufacturing">
                                        <div className="flex flex-col">
                                            <span className="font-medium">🏭 Manufacturing</span>
                                            <span className="text-xs text-slate-500">Designed for material-based production</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            {selectedPreset !== 'none' && INDUSTRY_PRESETS[selectedPreset] && (
                                <div className="mt-4 bg-white rounded-lg p-4 border border-purple-100">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5">
                                            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-purple-900 mb-2">Active Configuration:</p>
                                            <ul className="space-y-1 text-xs text-slate-600">
                                                <li>• Default item type: <span className="font-semibold text-slate-900">{INDUSTRY_PRESETS[selectedPreset].defaultItemType}</span></li>
                                                <li>• Default unit: <span className="font-semibold text-slate-900">{INDUSTRY_PRESETS[selectedPreset].defaultUnitType}</span></li>
                                                {INDUSTRY_PRESETS[selectedPreset].suggestedGroups.length > 0 && (
                                                    <li>• Suggested groups: <span className="font-semibold text-slate-900">{INDUSTRY_PRESETS[selectedPreset].suggestedGroups.join(', ')}</span></li>
                                                )}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Services/Items Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-lg font-semibold text-slate-900">Services & Items</Label>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowGroupManager(!showGroupManager)}
                                        className="px-4 py-2 rounded-lg"
                                    >
                                        {showGroupManager ? 'Hide' : 'Manage'} Groups
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={addItem}
                                        className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg"
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Custom Item
                                    </Button>
                                </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-xl p-4">
                                <p className="text-sm font-semibold text-slate-800 mb-3">Quick Add</p>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <Input
                                        ref={quickItemInputRef}
                                        value={quickItemName}
                                        onChange={(e) => setQuickItemName(e.target.value)}
                                        placeholder="Item name"
                                        className="h-10 rounded-lg md:col-span-2"
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
                                        className="h-10 rounded-lg"
                                    />
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={quickItemRate}
                                                onChange={(e) => setQuickItemRate(e.target.value)}
                                                placeholder="Rate"
                                                className="h-10 pl-10 rounded-lg"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={addQuickItem}
                                            className="bg-slate-900 hover:bg-slate-800 text-white px-4"
                                        >
                                            Add
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Group Management Section */}
                            {showGroupManager && (
                                <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-slate-900">Smart Grouping</h3>
                                        <span className="text-xs text-slate-600 bg-white px-2 py-1 rounded">For Construction, Automotive, Manufacturing</span>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <Input
                                            value={newGroupName}
                                            onChange={(e) => setNewGroupName(e.target.value)}
                                            placeholder="Group name (e.g., Phase 1, Parts, Installation)"
                                            className="flex-1 h-10 rounded-lg"
                                            onKeyPress={(e) => e.key === 'Enter' && addGroup()}
                                        />
                                        <Button
                                            type="button"
                                            onClick={addGroup}
                                            className="bg-primary hover:bg-primary/90 text-white"
                                        >
                                            <Plus className="w-4 h-4 mr-1" />
                                            Add Group
                                        </Button>
                                    </div>

                                    {groups.length > 0 && (
                                        <div className="space-y-2">
                                            <Label className="text-sm text-slate-600">Active Groups:</Label>
                                            <div className="flex flex-wrap gap-2">
                                                {groups.map(group => (
                                                    <div key={group.id} className="flex items-center gap-1 bg-white border border-primary/20 rounded-lg px-3 py-1.5">
                                                        <span className="text-sm font-medium text-slate-700">{group.name}</span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removeGroup(group.id)}
                                                            className="h-5 w-5 p-0 text-slate-400 hover:text-red-600"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {groups.length === 0 && (
                                        <div className="text-center py-3">
                                            <p className="text-sm text-slate-500">No groups created yet. Add groups to organize items by Phase, Job Type, or Department.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {items.length === 0 && (
                                <div className="text-center py-8 bg-slate-50 rounded-xl">
                                    <p className="text-slate-600">No items added yet. Add an item to get started.</p>
                                </div>
                            )}

                            {/* Render items with optional smart grouping */}
                            {groups.length === 0 ? (
                                // No groups - render items normally
                                items.map((item, index) => {
                                const itemType = item.item_type || 'service';
                                const isProduct = itemType === 'product';
                                const isService = itemType === 'service';
                                const isLabor = itemType === 'labor';
                                const isMaterial = itemType === 'material';
                                const isExpense = itemType === 'expense';
                                
                                return (
                                <div key={index} className="bg-slate-50 p-4 sm:p-6 rounded-xl space-y-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-semibold text-slate-900">Item #{index + 1}</h4>
                                        {items.length > 0 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeItem(index)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>

                                    {/* Item Type Selector - Featured at top */}
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <ItemTypeSelector 
                                                value={itemType} 
                                                onChange={(value) => {
                                                    const newItems = [...items];
                                                    newItems[index] = {
                                                        ...newItems[index],
                                                        item_type: value,
                                                        unit_type: value === 'service' ? 'hour' : value === 'labor' ? 'hour' : 'unit'
                                                    };
                                                    updateTotals(newItems);
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Group Selector - Only shown if groups exist */}
                                    {groups.length > 0 && (
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                    Assign to Group
                                                    <span className="text-xs text-slate-500 font-normal">(Optional)</span>
                                                </Label>
                                                <Select
                                                    value={item.group_id || 'none'}
                                                    onValueChange={(value) => handleItemChange(index, 'group_id', value === 'none' ? null : value)}
                                                >
                                                    <SelectTrigger className="h-10 rounded-lg">
                                                        <SelectValue placeholder="No group" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">No group</SelectItem>
                                                        {groups.map(group => (
                                                            <SelectItem key={group.id} value={group.id}>
                                                                {group.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-slate-500">Organize items by Phase, Job Type, or Department</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Service Specific Layout */}
                                    {isService && (
                                        <div className="bg-primary/15 border border-primary/20 rounded-lg p-4 -mx-4 -my-2 mx-2 my-2">
                                            <div className="grid md:grid-cols-2 gap-4">
                                                {/* Service Name */}
                                                <div className="space-y-2 md:col-span-2">
                                                    <Label className="text-sm font-semibold text-slate-700">Service Name *</Label>
                                                    <ServiceCombobox
                                                        services={services}
                                                        value={item.service_name}
                                                        onSelect={(service) => handleServiceSelect(index, service)}
                                                        onAddNew={() => {
                                                            setCurrentServiceItemIndex(index);
                                                            setIsAddingService(true);
                                                        }}
                                                    />
                                                </div>

                                                {/* Show Details Toggle */}
                                                {!expandedItems.includes(index) && (
                                                    <div className="md:col-span-2">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            onClick={() => setExpandedItems([...expandedItems, index])}
                                                            className="text-primary hover:text-primary/80 text-sm font-medium"
                                                        >
                                                            + Add Description & Tax Rate
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* Description - Optional */}
                                                {expandedItems.includes(index) && (
                                                    <div className="space-y-2 md:col-span-2">
                                                        <Label className="text-sm font-semibold text-slate-700">Description (Optional)</Label>
                                                        <Textarea
                                                            value={item.description}
                                                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                                            placeholder="e.g., Design consultation meeting, 3-hour session for logo design and branding strategy"
                                                            className="h-20 rounded-lg"
                                                        />
                                                    </div>
                                                )}

                                                {/* Unit Type - Service Hours/Days/Sessions */}
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-semibold text-slate-700">Billing Unit</Label>
                                                    <UnitTypeSelector 
                                                        itemType="service"
                                                        value={item.unit_type || 'hour'} 
                                                        onChange={(value) => handleItemChange(index, 'unit_type', value)}
                                                        label="Billing Unit"
                                                    />
                                                </div>

                                                {/* Quantity (Hours/Days/Sessions) */}
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-semibold text-slate-700">Quantity ({getUnitLabel('service', item.unit_type || 'hour')}) *</Label>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.25"
                                                        value={item.quantity}
                                                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                        placeholder="e.g., 3 hours, 2 days, 4 sessions"
                                                        className="h-10 rounded-lg"
                                                    />
                                                </div>

                                                {/* Service Rate */}
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-semibold text-slate-700">Service Rate ({getUnitLabel('service', item.unit_type || 'hour')}) *</Label>
                                                    <div className="relative">
                                                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={item.unit_price}
                                                            onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                                            placeholder="e.g., 150 per hour"
                                                            className="h-10 pl-10 rounded-lg"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Tax Rate - Optional */}
                                                {expandedItems.includes(index) && (
                                                    <div className="space-y-2">
                                                        <Label className="text-sm font-semibold text-slate-700">Tax Rate (%) (Optional)</Label>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            step="0.01"
                                                            value={item.item_tax_rate || 0}
                                                            onChange={(e) => handleItemChange(index, 'item_tax_rate', e.target.value)}
                                                            placeholder="0"
                                                            className="h-10 rounded-lg"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Product Specific Layout */}
                                    {isProduct && (
                                        <div className="grid md:grid-cols-2 gap-4">
                                            {/* Product Name */}
                                            <div className="space-y-2 md:col-span-2">
                                                <Label className="text-sm font-semibold text-slate-700">Product Name *</Label>
                                                <ServiceCombobox
                                                    services={services}
                                                    value={item.service_name}
                                                    onSelect={(service) => handleServiceSelect(index, service)}
                                                    onAddNew={() => {
                                                        setCurrentServiceItemIndex(index);
                                                        setIsAddingService(true);
                                                    }}
                                                />
                                            </div>

                                            {/* SKU / Part Number - Prominent for Products */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold text-slate-700">SKU / Product Code</Label>
                                                <Input
                                                    value={item.part_number || ''}
                                                    onChange={(e) => handleItemChange(index, 'part_number', e.target.value)}
                                                    placeholder="e.g., SKU-001 or PROD-ABC"
                                                    className="h-10 rounded-lg"
                                                />
                                            </div>

                                            {/* Show Details Toggle */}
                                            {!expandedItems.includes(index) && (
                                                <div className="md:col-span-2">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        onClick={() => setExpandedItems([...expandedItems, index])}
                                                        className="text-primary hover:text-primary/80 text-sm font-medium"
                                                    >
                                                        + Add Description & Tax Rate
                                                    </Button>
                                                </div>
                                            )}

                                            {/* Description - Optional */}
                                            {expandedItems.includes(index) && (
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-semibold text-slate-700">Description (Optional)</Label>
                                                    <Input
                                                        value={item.description}
                                                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                                        placeholder="e.g., Software License, Premium"
                                                        className="h-10 rounded-lg"
                                                    />
                                                </div>
                                            )}

                                            {/* Unit Type Selector */}
                                            <div className="space-y-2">
                                                <UnitTypeSelector 
                                                    itemType={itemType}
                                                    value={item.unit_type || 'unit'} 
                                                    onChange={(value) => handleItemChange(index, 'unit_type', value)}
                                                />
                                            </div>

                                            {/* Quantity */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold text-slate-700">Quantity *</Label>
                                                <div className="flex gap-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.quantity}
                                                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                        placeholder="0.00"
                                                        className="h-10 rounded-lg flex-1"
                                                    />
                                                    <div className="flex items-center px-3 bg-slate-100 rounded-lg text-xs text-slate-700 font-medium whitespace-nowrap">
                                                        {getUnitLabel(itemType, item.unit_type || 'unit')}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Unit Price */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold text-slate-700">Unit Price *</Label>
                                                <div className="relative">
                                                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.unit_price}
                                                        onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                                        placeholder="0.00"
                                                        className="h-10 pl-10 rounded-lg"
                                                    />
                                                </div>
                                            </div>

                                            {/* Tax Rate - Optional */}
                                            {expandedItems.includes(index) && (
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-semibold text-slate-700">Tax Rate (%) (Optional)</Label>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        step="0.01"
                                                        value={item.item_tax_rate || 0}
                                                        onChange={(e) => handleItemChange(index, 'item_tax_rate', e.target.value)}
                                                        placeholder="0"
                                                        className="h-10 rounded-lg"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Labor Specific Layout (Automotive, Construction, Repairs) */}
                                    {isLabor && (
                                        <div className="bg-orange-100/30 border border-orange-200 rounded-lg p-4 -mx-4 -my-2 mx-2 my-2">
                                            <div className="grid md:grid-cols-2 gap-4">
                                                {/* Role / Labor Type */}
                                                <div className="space-y-2 md:col-span-2">
                                                    <Label className="text-sm font-semibold text-slate-700">Role / Labor Type *</Label>
                                                    <ServiceCombobox
                                                        services={services}
                                                        value={item.service_name}
                                                        onSelect={(service) => handleServiceSelect(index, service)}
                                                        onAddNew={() => {
                                                            setCurrentServiceItemIndex(index);
                                                            setIsAddingService(true);
                                                        }}
                                                    />
                                                    <p className="text-xs text-slate-500">e.g., Technician, Electrician, Plumber, Mechanic</p>
                                                </div>

                                                {/* Show Details Toggle */}
                                                {!expandedItems.includes(index) && (
                                                    <div className="md:col-span-2">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            onClick={() => setExpandedItems([...expandedItems, index])}
                                                            className="text-orange-600 hover:text-orange-700 text-sm font-medium"
                                                        >
                                                            + Add Job Description & Tax Rate
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* Description / Job Details - Optional */}
                                                {expandedItems.includes(index) && (
                                                    <div className="space-y-2 md:col-span-2">
                                                        <Label className="text-sm font-semibold text-slate-700">Job Description (Optional)</Label>
                                                        <Textarea
                                                            value={item.description}
                                                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                                            placeholder="e.g., Engine diagnostic and repair, rewiring electrical panel, fixing plumbing leak"
                                                            className="h-20 rounded-lg"
                                                        />
                                                    </div>
                                                )}

                                                {/* Hours Worked */}
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-semibold text-slate-700">Hours Worked *</Label>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.25"
                                                        value={item.quantity}
                                                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                        placeholder="e.g., 8.5 hours"
                                                        className="h-10 rounded-lg"
                                                    />
                                                    <p className="text-xs text-slate-500">Billable hours for this labor</p>
                                                </div>

                                                {/* Hourly Rate */}
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-semibold text-slate-700">Hourly Rate *</Label>
                                                    <div className="relative">
                                                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={item.unit_price}
                                                            onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                                            placeholder="e.g., 85 per hour"
                                                            className="h-10 pl-10 rounded-lg"
                                                        />
                                                    </div>
                                                    <p className="text-xs text-slate-500">Rate charged per hour of labor</p>
                                                </div>

                                                {/* Tax Rate - Optional */}
                                                {expandedItems.includes(index) && (
                                                    <div className="space-y-2">
                                                        <Label className="text-sm font-semibold text-slate-700">Tax Rate (%) (Optional)</Label>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            step="0.01"
                                                            value={item.item_tax_rate || 0}
                                                            onChange={(e) => handleItemChange(index, 'item_tax_rate', e.target.value)}
                                                            placeholder="0"
                                                            className="h-10 rounded-lg"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Material Specific Layout (Construction, Manufacturing, Industrial) */}
                                    {isMaterial && (
                                        <div className="bg-green-100/30 border border-green-200 rounded-lg p-4 -mx-4 -my-2 mx-2 my-2">
                                            <div className="grid md:grid-cols-2 gap-4">
                                                {/* Material Name */}
                                                <div className="space-y-2 md:col-span-2">
                                                    <Label>Material Name *</Label>
                                                    <ServiceCombobox
                                                        services={services}
                                                        value={item.service_name}
                                                        onSelect={(service) => handleServiceSelect(index, service)}
                                                        onAddNew={() => {
                                                            setCurrentServiceItemIndex(index);
                                                            setIsAddingService(true);
                                                        }}
                                                    />
                                                    <p className="text-xs text-slate-600">e.g., Concrete Mix, Steel Rebar, Lumber, Paint, Piping</p>
                                                </div>

                                                {/* Show Details Toggle */}
                                                {!expandedItems.includes(index) && (
                                                    <div className="md:col-span-2">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            onClick={() => setExpandedItems([...expandedItems, index])}
                                                            className="text-green-600 hover:text-green-700 text-sm font-medium"
                                                        >
                                                            + Add Specification & Tax Rate
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* Description - Optional */}
                                                {expandedItems.includes(index) && (
                                                    <div className="space-y-2 md:col-span-2">
                                                        <Label>Specification / Description (Optional)</Label>
                                                        <Input
                                                            value={item.description}
                                                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                                            placeholder="e.g., Grade 60 rebar, 2x4x8 pressure-treated lumber"
                                                            className="h-10 rounded-lg"
                                                        />
                                                        <p className="text-xs text-slate-600">Material specifications, grade, or dimensions</p>
                                                    </div>
                                                )}

                                                {/* Unit Type Selector */}
                                                <div className="space-y-2">
                                                    <Label>Unit of Measure *</Label>
                                                    <UnitTypeSelector 
                                                        itemType={itemType}
                                                        value={item.unit_type || 'unit'} 
                                                        onChange={(value) => handleItemChange(index, 'unit_type', value)}
                                                    />
                                                    <p className="text-xs text-slate-600">kg, m², litres, units, etc.</p>
                                                </div>

                                                {/* Quantity */}
                                                <div className="space-y-2">
                                                    <Label>Quantity *</Label>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={item.quantity}
                                                            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                            placeholder="0.00"
                                                            className="h-10 rounded-lg flex-1"
                                                        />
                                                        <div className="flex items-center px-3 bg-green-100 rounded-lg text-xs text-slate-700 font-medium whitespace-nowrap">
                                                            {getUnitLabel(itemType, item.unit_type || 'unit')}
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-slate-600">Amount of material required</p>
                                                </div>

                                                {/* Unit Cost */}
                                                <div className="space-y-2">
                                                    <Label>Unit Cost *</Label>
                                                    <div className="relative">
                                                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={item.unit_price}
                                                            onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                                            placeholder="0.00"
                                                            className="h-10 pl-10 rounded-lg"
                                                        />
                                                    </div>
                                                    <p className="text-xs text-slate-600">Cost per unit of measure</p>
                                                </div>

                                                {/* Tax Rate - Optional */}
                                                {expandedItems.includes(index) && (
                                                    <div className="space-y-2">
                                                        <Label>Tax Rate (%) (Optional)</Label>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            step="0.01"
                                                            value={item.item_tax_rate || 0}
                                                            onChange={(e) => handleItemChange(index, 'item_tax_rate', e.target.value)}
                                                            placeholder="0"
                                                            className="h-10 rounded-lg"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Expense Specific Layout (Travel, Equipment Hire, Pass-Through Costs) */}
                                    {isExpense && (
                                        <div className="bg-purple-100/30 border border-purple-200 rounded-lg p-4 -mx-4 -my-2 mx-2 my-2">
                                            <div className="grid md:grid-cols-2 gap-4">
                                                {/* Expense Name */}
                                                <div className="space-y-2 md:col-span-2">
                                                    <Label>Expense Name *</Label>
                                                    <ServiceCombobox
                                                        services={services}
                                                        value={item.service_name}
                                                        onSelect={(service) => handleServiceSelect(index, service)}
                                                        onAddNew={() => {
                                                            setCurrentServiceItemIndex(index);
                                                            setIsAddingService(true);
                                                        }}
                                                    />
                                                    <p className="text-xs text-slate-600">e.g., Airfare, Hotel Accommodation, Equipment Rental, Subcontractor Fee</p>
                                                </div>

                                                {/* Show Details Toggle */}
                                                {!expandedItems.includes(index) && (
                                                    <div className="md:col-span-2">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            onClick={() => setExpandedItems([...expandedItems, index])}
                                                            className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                                                        >
                                                            + Add Description & Tax
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* Description - Optional */}
                                                {expandedItems.includes(index) && (
                                                    <div className="space-y-2 md:col-span-2">
                                                        <Label>Description / Details (Optional)</Label>
                                                        <Input
                                                            value={item.description}
                                                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                                            placeholder="e.g., Round-trip flight from NYC to LA, 3 nights hotel stay"
                                                            className="h-10 rounded-lg"
                                                        />
                                                        <p className="text-xs text-slate-600">Details about the expense for client transparency</p>
                                                    </div>
                                                )}

                                                {/* Cost */}
                                                <div className="space-y-2">
                                                    <Label>Cost *</Label>
                                                    <div className="relative">
                                                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={item.unit_price}
                                                            onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                                            placeholder="0.00"
                                                            className="h-10 pl-10 rounded-lg"
                                                        />
                                                    </div>
                                                    <p className="text-xs text-slate-600">Total cost of the expense</p>
                                                </div>

                                                {/* Tax Rate - Optional */}
                                                {expandedItems.includes(index) && (
                                                    <div className="space-y-2">
                                                        <Label>Tax (if applicable) (%) (Optional)</Label>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            step="0.01"
                                                            value={item.item_tax_rate || 0}
                                                            onChange={(e) => handleItemChange(index, 'item_tax_rate', e.target.value)}
                                                            placeholder="0"
                                                            className="h-10 rounded-lg"
                                                        />
                                                        <p className="text-xs text-slate-600">Leave at 0 if no tax applies</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Other Types (Part, Equipment, etc.) */}
                                    {!isProduct && !isService && !isLabor && !isMaterial && !isExpense && (
                                        <div className="grid md:grid-cols-2 gap-4">
                                            {/* Item Name */}
                                            <div className="space-y-2 md:col-span-2">
                                                <Label className="text-sm font-semibold text-slate-700">Item Name *</Label>
                                                <ServiceCombobox
                                                    services={services}
                                                    value={item.service_name}
                                                    onSelect={(service) => handleServiceSelect(index, service)}
                                                    onAddNew={() => {
                                                        setCurrentServiceItemIndex(index);
                                                        setIsAddingService(true);
                                                    }}
                                                />
                                            </div>

                                            {/* Description */}
                                            <div className="space-y-2 md:col-span-2">
                                                <Label className="text-sm font-semibold text-slate-700">Description</Label>
                                                <Input
                                                    value={item.description}
                                                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                                    placeholder="Brief description"
                                                    className="h-10 rounded-lg"
                                                />
                                            </div>

                                            {/* Unit Type Selector */}
                                            <div className="space-y-2">
                                                <UnitTypeSelector 
                                                    itemType={itemType}
                                                    value={item.unit_type || 'unit'} 
                                                    onChange={(value) => handleItemChange(index, 'unit_type', value)}
                                                />
                                            </div>

                                            {/* Quantity */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold text-slate-700">Quantity *</Label>
                                                <div className="flex gap-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.quantity}
                                                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                        placeholder="0.00"
                                                        className="h-10 rounded-lg flex-1"
                                                    />
                                                    <div className="flex items-center px-3 bg-slate-100 rounded-lg text-xs text-slate-700 font-medium whitespace-nowrap">
                                                        {getUnitLabel(itemType, item.unit_type || 'unit')}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Unit Price */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold text-slate-700">Unit Price *</Label>
                                                <div className="relative">
                                                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.unit_price}
                                                        onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                                        placeholder="0.00"
                                                        className="h-10 pl-10 rounded-lg"
                                                    />
                                                </div>
                                            </div>

                                            {/* Tax Rate */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold text-slate-700">Tax Rate (%)</Label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.01"
                                                    value={item.item_tax_rate || 0}
                                                    onChange={(e) => handleItemChange(index, 'item_tax_rate', e.target.value)}
                                                    placeholder="0"
                                                    className="h-10 rounded-lg"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-end gap-4">
                                        <div>
                                            <p className="text-sm text-slate-600 mb-2">Line Item Summary</p>
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-600">Subtotal:</span>
                                                    <span className="font-medium tabular-nums">{formatCurrency(item.total_price || 0, userCurrency)}</span>
                                                </div>
                                                {item.item_tax_rate > 0 && (
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-slate-600">Tax ({item.item_tax_rate}%):</span>
                                                        <span className="font-medium text-orange-600 tabular-nums">{formatCurrency(item.item_tax_amount || 0, userCurrency)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-slate-600">Line Total</p>
                                            <p className="text-xl font-bold text-slate-900 tabular-nums">
                                                {formatCurrency((item.total_price || 0) + (item.item_tax_amount || 0), userCurrency)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                            })) : (
                                // With groups - render grouped items
                                (() => {
                                    const groupedItems = getGroupedItems();
                                    const result = [];
                                    
                                    // Render each group
                                    groups.forEach(group => {
                                        const groupItems = groupedItems[group.id] || [];
                                        if (groupItems.length === 0) return;
                                        
                                        // Group header
                                        result.push(
                                            <div key={`group-header-${group.id}`} className="bg-gradient-to-r from-primary to-[#ff7c00] text-white px-6 py-3 rounded-lg mt-4">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="font-bold text-lg">{group.name}</h3>
                                                    <span className="text-sm opacity-90">{groupItems.length} {groupItems.length === 1 ? 'item' : 'items'}</span>
                                                </div>
                                            </div>
                                        );
                                        
                                        // Group items
                                        groupItems.forEach((item) => {
                                            const index = items.indexOf(item);
                                            const itemType = item.item_type || 'service';
                                            const isProduct = itemType === 'product';
                                            const isService = itemType === 'service';
                                            const isLabor = itemType === 'labor';
                                            const isMaterial = itemType === 'material';
                                            const isExpense = itemType === 'expense';
                                            
                                            result.push(
                                                <div key={`item-${group.id}-${index}`} className="bg-slate-50 p-4 sm:p-6 rounded-xl space-y-4 ml-4">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <h4 className="font-semibold text-slate-900">Item #{index + 1}</h4>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removeItem(index)}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                    {/* Item Type & Group Selector would go here, but rendered inline below */}
                                                    <div className="text-sm text-slate-600 italic">
                                                        {item.service_name || 'Untitled'} • {itemType}
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm text-slate-600">Line Total</p>
                                                        <p className="text-xl font-bold text-slate-900 tabular-nums">
                                                            {formatCurrency((item.total_price || 0) + (item.item_tax_amount || 0), userCurrency)}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        });
                                        
                                        // Group subtotal
                                        const groupSubtotal = getGroupSubtotal(groupItems);
                                        result.push(
                                            <div key={`group-subtotal-${group.id}`} className="bg-primary/15 border border-primary/30 px-6 py-3 rounded-lg ml-4 mb-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-semibold text-foreground">{group.name} Subtotal:</span>
                                                    <span className="text-xl font-bold text-foreground tabular-nums">{formatCurrency(groupSubtotal, userCurrency)}</span>
                                                </div>
                                            </div>
                                        );
                                    });
                                    
                                    // Render ungrouped items
                                    if (groupedItems.ungrouped.length > 0) {
                                        result.push(
                                            <div key="ungrouped-header" className="bg-slate-300 text-slate-700 px-6 py-3 rounded-lg mt-4">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="font-bold text-lg">Other Items</h3>
                                                    <span className="text-sm">{groupedItems.ungrouped.length} {groupedItems.ungrouped.length === 1 ? 'item' : 'items'}</span>
                                                </div>
                                            </div>
                                        );
                                        
                                        groupedItems.ungrouped.forEach((item) => {
                                            const index = items.indexOf(item);
                                            const itemType = item.item_type || 'service';
                                            
                                            result.push(
                                                <div key={`item-ungrouped-${index}`} className="bg-slate-50 p-4 sm:p-6 rounded-xl space-y-4">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <h4 className="font-semibold text-slate-900">Item #{index + 1}</h4>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removeItem(index)}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                    <div className="text-sm text-slate-600 italic">
                                                        {item.service_name || 'Untitled'} • {itemType}
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm text-slate-600">Line Total</p>
                                                        <p className="text-xl font-bold text-slate-900 tabular-nums">
                                                            {formatCurrency((item.total_price || 0) + (item.item_tax_amount || 0), userCurrency)}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    }
                                    
                                    return result;
                                })()
                            )}
                        </div>

                        {/* Totals & Summary Section - Always Visible */}
                        {(invoiceData.items || []).length > 0 && (
                            <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20 rounded-2xl p-6 shadow-lg space-y-6">
                                <div className="flex items-center justify-between border-b border-primary/20 pb-3">
                                    <h3 className="text-lg font-bold text-slate-900">Invoice Summary</h3>
                                    <span className="text-sm text-slate-600 bg-white px-3 py-1 rounded-full">{(invoiceData.items || []).length} {(invoiceData.items || []).length === 1 ? 'item' : 'items'}</span>
                                </div>

                                {/* Tax & Discount Controls */}
                                <div className="grid md:grid-cols-2 gap-4 bg-white/60 rounded-xl p-4">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                            <span>💰</span> Global Tax Rate (%)
                                        </Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={invoiceData.tax_rate || 0}
                                            onChange={(e) => handleTaxRateChange(e.target.value)}
                                            placeholder="0"
                                            className="h-11 rounded-lg border-2 focus:border-primary"
                                        />
                                        <p className="text-xs text-slate-500">Applied to subtotal after discounts</p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                            <span>🏷️</span> Discount Type
                                        </Label>
                                        <Select 
                                            value={invoiceData.discount_type || 'fixed'}
                                            onValueChange={(value) => handleDiscountChange(value, invoiceData.discount_value || 0)}
                                        >
                                            <SelectTrigger className="h-11 rounded-lg border-2 focus:border-primary">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="fixed">Fixed Amount</SelectItem>
                                                <SelectItem value="percentage">Percentage (%)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2 md:col-span-2">
                                        <Label className="text-sm font-semibold text-slate-700">
                                            {invoiceData.discount_type === 'percentage' ? 'Discount (%)' : 'Discount Amount'}
                                        </Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            step={invoiceData.discount_type === 'percentage' ? '0.1' : '0.01'}
                                            value={invoiceData.discount_value || 0}
                                            onChange={(e) => handleDiscountChange(invoiceData.discount_type || 'fixed', e.target.value)}
                                            placeholder="0"
                                            className="h-11 rounded-lg border-2 focus:border-primary"
                                        />
                                    </div>
                                </div>

                                {/* Calculation Breakdown */}
                                <div className="bg-white rounded-xl p-5 space-y-3 shadow-sm">
                                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Calculation Breakdown</h4>
                                    
                                    {/* Subtotal */}
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-slate-700 font-medium">Subtotal</span>
                                        <span className="text-lg font-bold text-slate-900 tabular-nums">{formatCurrency(invoiceData.subtotal || 0, userCurrency)}</span>
                                    </div>

                                    {/* Discount */}
                                    {(invoiceData.discount_value || 0) > 0 && (
                                        <div className="flex justify-between items-center py-2 bg-red-50 -mx-2 px-2 rounded-lg">
                                            <span className="text-red-700 font-medium flex items-center gap-2">
                                                <span>🏷️</span>
                                                Discount {invoiceData.discount_type === 'percentage' ? `(${invoiceData.discount_value}%)` : ''}
                                            </span>
                                            <span className="text-lg font-bold text-red-600 tabular-nums">-{formatCurrency(invoiceData.discount_amount || 0, userCurrency)}</span>
                                        </div>
                                    )}

                                    {/* Tax Breakdown */}
                                    {((invoiceData.item_taxes || 0) > 0 || (invoiceData.tax_rate || 0) > 0) && (
                                        <div className="border-t border-slate-200 pt-3 space-y-2">
                                            {(invoiceData.item_taxes || 0) > 0 && (
                                                <div className="flex justify-between items-center py-1">
                                                    <span className="text-sm text-orange-700 flex items-center gap-2">
                                                        <span>📊</span> Item-Level Taxes
                                                    </span>
                                                    <span className="font-semibold text-orange-600 tabular-nums">{formatCurrency(invoiceData.item_taxes || 0, userCurrency)}</span>
                                                </div>
                                            )}
                                            {(invoiceData.tax_rate || 0) > 0 && (
                                                <div className="flex justify-between items-center py-1">
                                                    <span className="text-sm text-orange-700 flex items-center gap-2">
                                                        <span>💰</span> Global Tax ({invoiceData.tax_rate}%)
                                                    </span>
                                                    <span className="font-semibold text-orange-600 tabular-nums">{formatCurrency((invoiceData.tax_amount || 0) - (invoiceData.item_taxes || 0), userCurrency)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center py-2 bg-orange-50 -mx-2 px-2 rounded-lg">
                                                <span className="font-bold text-orange-800">Total Tax</span>
                                                <span className="text-lg font-bold text-orange-700 tabular-nums">{formatCurrency(invoiceData.tax_amount || 0, userCurrency)}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Grand Total: tabular-nums, fluid scale, symbol + amount on one line */}
                                    <div className="border-t-2 border-slate-300 pt-4 mt-3">
                                        <div className="flex justify-between items-center bg-gradient-to-r from-primary to-[#ff7c00] text-white rounded-xl py-4 px-5 shadow-md">
                                            <span className="text-xl font-bold">Grand Total</span>
                                            <span
                                                className="font-black tabular-nums tracking-tighter whitespace-nowrap min-w-0"
                                                style={{ fontSize: 'clamp(1.25rem, 4vw + 1rem, 2.25rem)' }}
                                            >
                                                {formatCurrency(invoiceData.total_amount || 0, userCurrency)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Rest of form */}
                        <div className="grid md:grid-cols-1 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="banking_detail" className="text-sm font-semibold text-slate-700">
                                    Payment Method (Optional)
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Select 
                                        value={invoiceData.banking_detail_id || "none"} 
                                        onValueChange={(value) => handleInputChange('banking_detail_id', value === "none" ? "" : value)}
                                        className="flex-grow"
                                    >
                                        <SelectTrigger className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20">
                                            <SelectValue placeholder="Select payment method (optional)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {bankingDetails.map(detail => (
                                                <SelectItem key={detail.id} value={detail.id}>
                                                    {detail.bank_name} - {detail.payment_method.replace('_', ' ')}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button type="button" variant="outline" size="icon" onClick={() => setIsAddingBankingDetail(true)} aria-label="Add new payment method">
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">Add payment method details to display on the invoice, or leave empty to exclude</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="project_description" className="text-sm font-semibold text-slate-700">
                                    Project Description
                                </Label>
                                <Textarea
                                    id="project_description"
                                    value={invoiceData.project_description}
                                    onChange={(e) => handleInputChange('project_description', e.target.value)}
                                    placeholder="Describe the project in detail..."
                                    className="min-h-24 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20 resize-none"
                                />
                            </div>

                            {!isRecurring && (
                                <div className="space-y-2">
                                    <Label htmlFor="delivery_address" className="text-sm font-semibold text-slate-700">
                                        Delivery/Shipping Address (Optional)
                                    </Label>
                                    <Textarea
                                        id="delivery_address"
                                        value={invoiceData.delivery_address || ""}
                                        onChange={(e) => handleInputChange('delivery_address', e.target.value)}
                                        placeholder="Enter a delivery or shipping address if applicable"
                                        className="min-h-24 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20 resize-none"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Notes & Legal Text Section */}
                        <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200 rounded-2xl p-6 space-y-6">
                            <div className="flex items-center gap-2 border-b border-slate-300 pb-3">
                                <FileText className="w-5 h-5 text-slate-700" />
                                <h3 className="text-lg font-bold text-slate-900">Notes & Legal Text</h3>
                            </div>

                            <div className="grid md:grid-cols-1 gap-6">
                                {/* Customer-Facing Notes */}
                                <div className="space-y-2">
                                    <Label htmlFor="notes" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <span>💬</span> Customer Notes
                                    </Label>
                                    <Textarea
                                        id="notes"
                                        value={invoiceData.notes || ""}
                                        onChange={(e) => handleInputChange('notes', e.target.value)}
                                        placeholder="e.g., Thank you for your business! Please review the items above and contact us with any questions."
                                        className="min-h-28 rounded-xl border-slate-300 focus:border-primary focus:ring-primary/20 resize-none"
                                    />
                                    <p className="text-xs text-slate-600">Friendly message or instructions for your customer</p>
                                </div>

                                {/* Payment Terms */}
                                <div className="space-y-2">
                                    <Label htmlFor="payment_terms" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <span>💳</span> Payment Terms
                                    </Label>
                                    <Textarea
                                        id="payment_terms"
                                        value={invoiceData.payment_terms || ""}
                                        onChange={(e) => handleInputChange('payment_terms', e.target.value)}
                                        placeholder="e.g., Net 30 days. Payment due within 30 days of invoice date. Late payments subject to 1.5% monthly interest."
                                        className="min-h-28 rounded-xl border-slate-300 focus:border-primary focus:ring-primary/20 resize-none"
                                    />
                                    <p className="text-xs text-slate-600">Due dates, late fees, accepted payment methods</p>
                                </div>

                                {/* Warranty/Service Notes */}
                                <div className="space-y-2">
                                    <Label htmlFor="warranty_notes" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <span>🛡️</span> Warranty / Service Notes
                                    </Label>
                                    <Textarea
                                        id="warranty_notes"
                                        value={invoiceData.warranty_notes || ""}
                                        onChange={(e) => handleInputChange('warranty_notes', e.target.value)}
                                        placeholder="e.g., All parts covered by 1-year manufacturer warranty. Labor warranty: 90 days from service date. Does not cover misuse or neglect."
                                        className="min-h-28 rounded-xl border-slate-300 focus:border-primary focus:ring-primary/20 resize-none"
                                    />
                                    <p className="text-xs text-slate-600">Warranty coverage, service guarantees, limitations</p>
                                </div>

                                {/* Terms & Conditions */}
                                <div className="space-y-2">
                                    <Label htmlFor="terms_conditions" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <span>📋</span> Terms &amp; Conditions
                                    </Label>
                                    <Textarea
                                        id="terms_conditions"
                                        value={invoiceData.terms_conditions || ""}
                                        onChange={(e) => handleInputChange('terms_conditions', e.target.value)}
                                        placeholder="e.g., By accepting this invoice, customer agrees to all terms. Work must be inspected within 7 days. Claims after this period may not be honored..."
                                        className="min-h-32 rounded-xl border-slate-300 focus:border-primary focus:ring-primary/20 resize-none"
                                    />
                                    <p className="text-xs text-slate-600">General legal terms, liability limitations, dispute resolution</p>
                                </div>
                            </div>
                        </div>

                        {/* Rest of form */}
                        <div className="grid md:grid-cols-1 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="banking_detail" className="text-sm font-semibold text-slate-700">
                                    Payment Method (Optional)
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Select 
                                        value={invoiceData.banking_detail_id || "none"} 
                                        onValueChange={(value) => handleInputChange('banking_detail_id', value === "none" ? "" : value)}
                                        className="flex-grow"
                                    >
                                        <SelectTrigger className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20">
                                            <SelectValue placeholder="Select payment method (optional)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {bankingDetails.map(detail => (
                                                <SelectItem key={detail.id} value={detail.id}>
                                                    {detail.bank_name} - {detail.payment_method.replace('_', ' ')}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button type="button" variant="outline" size="icon" onClick={() => setIsAddingBankingDetail(true)} aria-label="Add new payment method">
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">Add payment method details to display on the invoice, or leave empty to exclude</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="project_description" className="text-sm font-semibold text-slate-700">
                                    Project Description
                                </Label>
                                <Textarea
                                    id="project_description"
                                    value={invoiceData.project_description}
                                    onChange={(e) => handleInputChange('project_description', e.target.value)}
                                    placeholder="Describe the project in detail..."
                                    className="min-h-24 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20 resize-none"
                                />
                            </div>
                        </div>

                        {!isRecurring && showNextButton && (
                            <div className="flex justify-end">
                                <Button
                                    onClick={onNext}
                                    disabled={!isValid}
                                    className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Continue to Payment Breakdown
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isAddingClient} onOpenChange={setIsAddingClient}>
                <DialogContent aria-describedby={undefined}>
                    <DialogTitle className="sr-only">Add new client</DialogTitle>
                    <ClientForm 
                        onSave={handleSaveNewClient}
                        onCancel={() => setIsAddingClient(false)}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={isAddingBankingDetail} onOpenChange={setIsAddingBankingDetail}>
                <DialogContent aria-describedby={undefined}>
                    <DialogTitle className="sr-only">Add banking detail</DialogTitle>
                    <BankingForm 
                        onSave={handleSaveNewBankingDetail}
                        onCancel={() => setIsAddingBankingDetail(false)}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={isAddingService} onOpenChange={setIsAddingService}>
                <DialogContent aria-describedby={undefined}>
                    <DialogTitle className="sr-only">Add service</DialogTitle>
                    <ServiceForm 
                        onSave={handleSaveNewService}
                        onCancel={() => setIsAddingService(false)}
                    />
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}

ProjectDetails.propTypes = {
    invoiceData: PropTypes.shape({
        client_id: PropTypes.string,
        project_title: PropTypes.string,
        project_description: PropTypes.string,
        reference_number: PropTypes.string,
        items: PropTypes.arrayOf(PropTypes.shape({
            service_name: PropTypes.string,
            description: PropTypes.string,
            quantity: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
            unit_price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
            total_price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
            item_tax_rate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
            item_tax_amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
            item_type: PropTypes.string,
            unit_type: PropTypes.string,
            group_id: PropTypes.string
        })),
        subtotal: PropTypes.number,
        tax_rate: PropTypes.number,
        tax_amount: PropTypes.number,
        total_amount: PropTypes.number,
        invoice_date: PropTypes.string,
        delivery_date: PropTypes.string,
        delivery_address: PropTypes.string,
        banking_detail_id: PropTypes.string,
        notes: PropTypes.string,
        terms_conditions: PropTypes.string,
        discount_type: PropTypes.string,
        discount_value: PropTypes.number,
        discount_amount: PropTypes.number,
        item_taxes: PropTypes.number
    }).isRequired,
    setInvoiceData: PropTypes.func.isRequired,
    clients: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        email: PropTypes.string
    })).isRequired,
    setClients: PropTypes.func.isRequired,
    bankingDetails: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        bank_name: PropTypes.string,
        payment_method: PropTypes.string
    })).isRequired,
    setBankingDetails: PropTypes.func.isRequired,
    services: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        description: PropTypes.string,
        rate: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    })).isRequired,
    setServices: PropTypes.func.isRequired,
    onNext: PropTypes.func,
    isRecurring: PropTypes.bool,
    showNextButton: PropTypes.bool
};
