import PropTypes from "prop-types";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, DollarSign, Calendar, FileText, Plus, Trash2, Check, ChevronsUpDown, Save } from "lucide-react";
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
import { User, Service } from "@/api/entities";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ServiceForm from "../services/ServiceForm";
import { mapCatalogToLineItem, canEditLineItemRate, validateRateAdjustment } from "@/services/CatalogSyncService";

// Mock User object for demonstration purposes
const MockUser = {
    me: async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
            id: 'user123',
            name: 'John Doe',
            currency: 'USD',
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
                    <CommandEmpty>No service found.</CommandEmpty>
                    <CommandList>
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

export default function QuoteDetails({ 
    quoteData, 
    setQuoteData, 
    clients, 
    services,
    setServices, 
    onNext,
    isEditing = false,
    showNextButton = true
}) {
    const [user, setUser] = useState(null);
    const [expandedItems, setExpandedItems] = useState([]); // Track which items show optional fields
    const [isAddingService, setIsAddingService] = useState(false);
    const [currentServiceItemIndex, setCurrentServiceItemIndex] = useState(null);
    const [quickItemName, setQuickItemName] = useState('');
    const [quickItemQuantity, setQuickItemQuantity] = useState(1);
    const [quickItemRate, setQuickItemRate] = useState('');
    const quickItemInputRef = useRef(null);
    
    useEffect(() => {
        const loadUser = async () => {
            try {
                const userData = await User.me();
                setUser(userData);
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
            const editCheck = canEditLineItemRate(updatedItems[index], user);
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
    
    const userCurrency = user?.currency || 'USD';

    return (
        <>
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-6">
                    <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Quote Details
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">Enter quote details.</p>
                </CardHeader>
                
                <CardContent className="p-4 sm:p-8">
                    <div className="space-y-6">
                        {/* Basic Info */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="client" className="text-sm font-semibold text-slate-700">
                                    Select Client *
                                </Label>
                                <Select 
                                    value={quoteData.client_id} 
                                    onValueChange={(value) => handleInputChange('client_id', value)}
                                >
                                    <SelectTrigger className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20">
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
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="project_title" className="text-sm font-semibold text-slate-700">
                                    Project Title *
                                </Label>
                                <Input
                                    id="project_title"
                                    value={quoteData.project_title}
                                    onChange={(e) => handleInputChange('project_title', e.target.value)}
                                    placeholder="Enter project title"
                                    className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20"
                                />
                            </div>
                        </div>

                        {/* Services/Items Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-lg font-semibold text-foreground">Services & Items</Label>
                                <Button
                                    type="button"
                                    onClick={addItem}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Item
                                </Button>
                            </div>

                            <div className="bg-white border border-border rounded-xl p-4">
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
                                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4"
                                        >
                                            Add
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {items.length === 0 && (
                                <div className="text-center py-8 bg-slate-50 rounded-xl">
                                    <p className="text-slate-600">No items added yet. Add an item to get started.</p>
                                </div>
                            )}

                            {items.map((item, index) => (
                                <div key={index} className="bg-slate-50 p-4 sm:p-6 rounded-xl space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h4 className="font-semibold text-foreground">Item #{index + 1}</h4>
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

                                    <div className="grid md:grid-cols-2 gap-4">
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
                                                    className="text-primary hover:text-primary/90 text-sm font-medium"
                                                >
                                                    + Add Description
                                                </Button>
                                            </div>
                                        )}

                                        {/* Description - Optional */}
                                        {expandedItems.includes(index) && (
                                            <div className="space-y-2 md:col-span-2">
                                                <Label className="text-sm font-semibold text-slate-700">Description (Optional)</Label>
                                                <Input
                                                    value={item.description}
                                                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                                    placeholder="Brief description of service"
                                                    className="h-10 rounded-lg"
                                                />
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold text-slate-700">Quantity *</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                value={item.quantity}
                                                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                                className="h-10 rounded-lg"
                                            />
                                        </div>

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
                                    </div>

                                    <div className="flex justify-end">
                                        <div className="text-right">
                                            <p className="text-sm text-slate-600">Total Price</p>
                                            <p className="text-xl font-bold text-foreground">
                                                {formatCurrency(item.total_price || 0, userCurrency)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Tax and Totals */}
                        {(quoteData.items || []).length > 0 && (
                            <div className="bg-primary/10 p-4 sm:p-6 rounded-xl space-y-4">
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-slate-700">Tax Rate (%)</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            value={quoteData.tax_rate || 0}
                                            onChange={(e) => handleTaxRateChange(e.target.value)}
                                            placeholder="0"
                                            className="h-10 rounded-lg"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-slate-700">Valid Until *</Label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                type="date"
                                                value={quoteData.valid_until}
                                                onChange={(e) => handleInputChange('valid_until', e.target.value)}
                                                className="h-10 pl-10 rounded-lg"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-border pt-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Subtotal:</span>
                                            <span className="font-semibold">{formatCurrency(quoteData.subtotal || 0, userCurrency)}</span>
                                        </div>
                                        {(quoteData.tax_rate || 0) > 0 && (
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">Tax ({quoteData.tax_rate}%):</span>
                                                <span className="font-semibold">{formatCurrency(quoteData.tax_amount || 0, userCurrency)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-lg font-bold border-t border-border pt-2">
                                            <span>Total:</span>
                                            <span>{formatCurrency(quoteData.total_amount || 0, userCurrency)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Additional Fields */}
                        <div className="grid md:grid-cols-1 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="project_description" className="text-sm font-semibold text-slate-700">
                                    Project Description
                                </Label>
                                <Textarea
                                    id="project_description"
                                    value={quoteData.project_description}
                                    onChange={(e) => handleInputChange('project_description', e.target.value)}
                                    placeholder="Describe the project in detail..."
                                    className="min-h-24 rounded-xl border-border focus:border-primary focus:ring-primary/20 resize-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="notes" className="text-sm font-semibold text-slate-700">
                                    Additional Notes
                                </Label>
                                <Textarea
                                    id="notes"
                                    value={quoteData.notes}
                                    onChange={(e) => handleInputChange('notes', e.target.value)}
                                    placeholder="Any additional notes..."
                                    className="min-h-24 rounded-xl border-border focus:border-primary focus:ring-primary/20 resize-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="terms_conditions" className="text-sm font-semibold text-slate-700">
                                    Terms & Conditions
                                </Label>
                                <Textarea
                                    id="terms_conditions"
                                    value={quoteData.terms_conditions}
                                    onChange={(e) => handleInputChange('terms_conditions', e.target.value)}
                                    placeholder="Enter terms and conditions..."
                                    className="min-h-24 rounded-xl border-border focus:border-primary focus:ring-primary/20 resize-none"
                                />
                            </div>
                        </div>

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
                    </div>
                </CardContent>
            </Card>
        </motion.div>
        
        <Dialog open={isAddingService} onOpenChange={setIsAddingService}>
            <DialogContent>
                <ServiceForm 
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
    setServices: PropTypes.func.isRequired,
    onNext: PropTypes.func,
    isEditing: PropTypes.bool,
    showNextButton: PropTypes.bool
};