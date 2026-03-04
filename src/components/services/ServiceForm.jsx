import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { X, Save, Headset, DollarSign, Plus, Trash2, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { ITEM_TYPES } from "@/components/invoice/itemTypeHelpers";
import { getPriceLockStatus } from "@/services/ItemPermissionsService";
import { renderIcon } from "@/utils/renderIcon";

const predefinedCategories = [
    "Design & Creative",
    "Development & Programming", 
    "Marketing & Advertising",
    "Consulting & Strategy",
    "Writing & Content",
    "Business Services",
    "Legal & Compliance",
    "Finance & Accounting",
    "Project Management",
    "Training & Education",
    "Maintenance & Support",
    "Other"
];

// Pricing type options (how the item is typically priced)
const pricingTypes = [
    { value: "hourly", label: "Hourly Rate", unit: "per hour" },
    { value: "fixed", label: "Fixed Price", unit: "per project" },
    { value: "per_item", label: "Per Item/Unit", unit: "per item" },
    { value: "daily", label: "Daily Rate", unit: "per day" },
    { value: "weekly", label: "Weekly Rate", unit: "per week" },
    { value: "monthly", label: "Monthly Rate", unit: "per month" }
];

// Tax categories (standard across all items)
const taxCategories = [
    { value: "standard", label: "Standard Rate" },
    { value: "reduced", label: "Reduced Rate" },
    { value: "zero", label: "Zero Rated" },
    { value: "exempt", label: "Tax Exempt" }
];

// TYPE-SPECIFIC FIELDS CONFIGURATION
const typeSpecificConfig = {
    product: {
        label: "Product",
        fields: [
            { key: 'sku', label: 'SKU / Product Code', type: 'text', placeholder: 'e.g., PROD-001' },
            { key: 'unit', label: 'Unit', type: 'select', options: ['each', 'box', 'kg', 'litre', 'set', 'case', 'unit'], placeholder: 'Select unit' },
            { key: 'price', label: 'Default Price', type: 'currency' }
        ]
    },
    service: {
        label: "Service",
        fields: [
            { key: 'billing_unit', label: 'Billing Unit', type: 'select', options: ['hour', 'day', 'session', 'project', 'week', 'month'], placeholder: 'Select billing unit' },
            { key: 'rate', label: 'Default Rate', type: 'currency' }
        ]
    },
    labor: {
        label: "Labor",
        fields: [
            { key: 'role', label: 'Role / Skill Type', type: 'text', placeholder: 'e.g., Senior Developer, Electrician' },
            { key: 'hourly_rate', label: 'Hourly Rate', type: 'currency' }
        ]
    },
    material: {
        label: "Material",
        fields: [
            { key: 'unit_type', label: 'Unit Type', type: 'select', options: ['m²', 'kg', 'units', 'litres', 'meter', 'piece', 'sqmeter'], placeholder: 'Select unit type' },
            { key: 'cost_rate', label: 'Cost Rate', type: 'currency' }
        ]
    },
    expense: {
        label: "Expense",
        fields: [
            { key: 'cost_type', label: 'Cost Type', type: 'select', options: ['fixed', 'variable'], placeholder: 'Fixed or variable' },
            { key: 'default_cost', label: 'Default Cost', type: 'currency' }
        ]
    }
};

export default function ServiceForm({ service, onSave, onCancel, isSaving = false }) {
    // BASE FIELDS (Shared by all catalog items - Mandatory)
    const [formData, setFormData] = useState({
        // Base Fields
        name: service?.name || "",
        item_type: service?.item_type || "service",
        default_unit: service?.default_unit || service?.unit_of_measure || "unit",
        default_rate: service?.default_rate || service?.unit_price || 0,
        tax_category: service?.tax_category || "standard",
        is_active: service?.is_active !== undefined ? service.is_active : true,
        price_locked: service?.price_locked || false,
        
        // Type-Specific Fields (Product)
        sku: service?.sku || "",
        unit: service?.unit || "",
        price: service?.price || 0,
        
        // Type-Specific Fields (Service)
        billing_unit: service?.billing_unit || "hour",
        rate: service?.rate || 0,
        
        // Type-Specific Fields (Labor)
        role: service?.role || "",
        hourly_rate: service?.hourly_rate || 0,
        
        // Type-Specific Fields (Material)
        unit_type: service?.unit_type || "",
        cost_rate: service?.cost_rate || 0,
        
        // Type-Specific Fields (Expense)
        cost_type: service?.cost_type || "fixed",
        default_cost: service?.default_cost || 0,
        
        // Optional/Other Fields
        description: service?.description || "",
        category: service?.category || "",
        pricing_type: service?.pricing_type || service?.service_type || "fixed",
        min_quantity: service?.min_quantity || 1,
        tags: service?.tags || [],
        estimated_duration: service?.estimated_duration || "",
        requirements: service?.requirements || ""
    });

    const [newTag, setNewTag] = useState("");
    const [customCategory, setCustomCategory] = useState("");
    const [showCustomCategory, setShowCustomCategory] = useState(
        service?.category && !predefinedCategories.includes(service.category)
    );
    const [showOptionalFields, setShowOptionalFields] = useState(
        (service?.description || service?.requirements) ? true : false
    );

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleAddTag = () => {
        if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
            setFormData(prev => ({
                ...prev,
                tags: [...prev.tags, newTag.trim()]
            }));
            setNewTag("");
        }
    };

    const handleRemoveTag = (tagToRemove) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove)
        }));
    };

    const handleCategoryChange = (value) => {
        if (value === "custom") {
            setShowCustomCategory(true);
            setCustomCategory("");
        } else {
            setShowCustomCategory(false);
            handleInputChange('category', value);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Validate required fields
        if (!isValid) {
            return; // Button should be disabled, but double-check
        }
        
        // Ensure required fields are present and properly formatted
        const finalData = {
            name: formData.name.trim(),
            item_type: formData.item_type || 'service',
            default_unit: formData.default_unit.trim() || 'unit',
            default_rate: Number(formData.default_rate) || 0,
            tax_category: formData.tax_category || 'standard',
            is_active: formData.is_active !== false,
            
            // Backwards compatibility: map new base fields to old field names for API
            unit_price: Number(formData.default_rate) || 0,
            unit_of_measure: formData.default_unit.trim() || 'unit',
            service_type: formData.pricing_type || 'fixed',
            
            // Optional fields (only include if they have values)
            ...(formData.description && { description: formData.description }),
            ...(showCustomCategory && customCategory ? { category: customCategory } : formData.category ? { category: formData.category } : {}),
            ...(formData.pricing_type && { pricing_type: formData.pricing_type }),
            ...(formData.min_quantity && formData.min_quantity > 0 && { min_quantity: Number(formData.min_quantity) }),
            ...(formData.tags && formData.tags.length > 0 && { tags: formData.tags }),
            ...(formData.estimated_duration && { estimated_duration: formData.estimated_duration }),
            ...(formData.requirements && { requirements: formData.requirements }),
            
            // Type-specific fields
            ...(formData.item_type === 'product' && {
                ...(formData.sku && { sku: formData.sku }),
                ...(formData.unit && { unit: formData.unit }),
                ...(formData.price !== undefined && { price: Number(formData.price) || 0 })
            }),
            ...(formData.item_type === 'service' && {
                ...(formData.billing_unit && { billing_unit: formData.billing_unit }),
                ...(formData.rate !== undefined && { rate: Number(formData.rate) || 0 })
            }),
            ...(formData.item_type === 'labor' && {
                ...(formData.role && { role: formData.role }),
                ...(formData.hourly_rate !== undefined && { hourly_rate: Number(formData.hourly_rate) || 0 })
            }),
            ...(formData.item_type === 'material' && {
                ...(formData.unit_type && { unit_type: formData.unit_type }),
                ...(formData.cost_rate !== undefined && { cost_rate: Number(formData.cost_rate) || 0 })
            }),
            ...(formData.item_type === 'expense' && {
                ...(formData.cost_type && { cost_type: formData.cost_type }),
                ...(formData.default_cost !== undefined && { default_cost: Number(formData.default_cost) || 0 })
            }),
            
            // Pricing controls
            price_locked: formData.price_locked || false
        };
        
        // Remove any undefined/null values
        Object.keys(finalData).forEach(key => {
            if (finalData[key] === undefined || finalData[key] === null) {
                delete finalData[key];
            }
        });
        
        console.log('Submitting service data:', finalData);
        onSave(finalData);
    };

    const selectedPricingType = pricingTypes.find(type => type.value === formData.pricing_type);
    // BASE FIELDS VALIDATION: All must be present for save
    const hasName = formData.name.trim().length > 0;
    const hasItemType = formData.item_type && formData.item_type.length > 0;
    const hasDefaultUnit = formData.default_unit && formData.default_unit.trim().length > 0;
    const hasValidRate = formData.default_rate !== null && 
                        formData.default_rate !== undefined && 
                        !isNaN(formData.default_rate) && 
                        formData.default_rate >= 0;
    
    const isValid = hasName && hasItemType && hasDefaultUnit && hasValidRate;
    
    // Get validation errors for tooltip
    const validationErrors = [];
    if (!hasName) validationErrors.push("Name is required");
    if (!hasItemType) validationErrors.push("Item type is required");
    if (!hasDefaultUnit) validationErrors.push("Default unit is required");
    if (!hasValidRate) {
        if (formData.default_rate === null || formData.default_rate === undefined) {
            validationErrors.push("Default rate is required");
        } else if (isNaN(formData.default_rate)) {
            validationErrors.push("Default rate must be a number");
        } else if (formData.default_rate < 0) {
            validationErrors.push("Default rate must be 0 or greater");
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
        >
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-6">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <Headset className="w-5 h-5" />
                            {service ? "Edit Catalog Item" : "Add New Catalog Item"}
                        </CardTitle>
                        <Button variant="ghost" size="icon" onClick={onCancel} className="hover:bg-slate-100">
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </CardHeader>
                
                <CardContent className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* ====== BASE FIELDS SECTION (Required for all catalog items) ====== */}
                        <div className="border-l-4 border-primary pl-6 py-4">
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide mb-6">
                                Required Base Fields
                            </h3>

                            {/* 1. Catalog Item Type - MANDATORY */}
                            <div className="space-y-2 mb-6">
                                <Label htmlFor="item_type" className="text-sm font-semibold text-slate-700">
                                    Catalog Item Type <span className="text-red-500 font-bold">*</span>
                                </Label>
                                <Select value={formData.item_type} onValueChange={(value) => handleInputChange('item_type', value)}>
                                    <SelectTrigger className={`h-12 rounded-xl ${!formData.item_type ? 'border-red-300 border-2' : ''}`}>
                                        <SelectValue placeholder="Select catalog item type..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ITEM_TYPES.map(type => (
                                            <SelectItem key={type.value} value={type.value}>
                                                <span className="flex items-center gap-2">
                                                    {renderIcon(type.icon, { className: "w-4 h-4" })}
                                                    <span>{type.label}</span>
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500">Required - determines how this item appears in invoices</p>
                            </div>

                            {/* 2. Item Name - MANDATORY */}
                            <div className="space-y-2 mb-6">
                                <Label htmlFor="name" className="text-sm font-semibold text-slate-700">
                                    Item Name <span className="text-red-500 font-bold">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="e.g., Senior Developer, Copper Wire, Labor Code #5, etc."
                                    className="h-12 rounded-xl"
                                />
                            </div>

                            {/* 3. Description - BASE FIELD */}
                            <div className="space-y-2 mb-6">
                                <Label htmlFor="description" className="text-sm font-semibold text-slate-700">Description</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => handleInputChange('description', e.target.value)}
                                    placeholder="Clear description that will appear on invoices"
                                    className="min-h-20 rounded-xl resize-none"
                                />
                            </div>

                            {/* 4. Default Unit - MANDATORY */}
                            <div className="space-y-2 mb-6">
                                <Label htmlFor="default_unit" className="text-sm font-semibold text-slate-700">
                                    Default Unit <span className="text-red-500 font-bold">*</span>
                                </Label>
                                <Input
                                    id="default_unit"
                                    value={formData.default_unit || ''}
                                    onChange={(e) => handleInputChange('default_unit', e.target.value || 'unit')}
                                    placeholder="e.g., hour, piece, kg, day, unit, etc."
                                    className={`h-12 rounded-xl ${!hasDefaultUnit ? 'border-red-300 border-2' : ''}`}
                                    onBlur={(e) => {
                                        // Ensure default_unit is never empty
                                        if (!e.target.value.trim()) {
                                            handleInputChange('default_unit', 'unit');
                                        }
                                    }}
                                />
                                <p className="text-xs text-slate-500">How quantities are measured (hour, piece, kg, etc.)</p>
                            </div>

                            {/* 5. Default Rate/Price - MANDATORY */}
                            <div className="space-y-2 mb-6">
                                <Label htmlFor="default_rate" className="text-sm font-semibold text-slate-700">
                                    Default Rate / Price <span className="text-red-500 font-bold">*</span>
                                </Label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        id="default_rate"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.default_rate || ''}
                                        onChange={(e) => {
                                            const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                                            handleInputChange('default_rate', value);
                                        }}
                                        placeholder="0.00"
                                        className={`h-12 pl-10 rounded-xl ${!hasValidRate ? 'border-red-300 border-2' : ''}`}
                                    />
                                </div>
                                <p className="text-xs text-slate-500">Price per unit (synced to all invoices)</p>
                            </div>

                            {/* 6. Tax Category - BASE FIELD */}
                            <div className="space-y-2 mb-6">
                                <Label htmlFor="tax_category" className="text-sm font-semibold text-slate-700">Tax Category</Label>
                                <Select value={formData.tax_category} onValueChange={(value) => handleInputChange('tax_category', value)}>
                                    <SelectTrigger className="h-12 rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {taxCategories.map(cat => (
                                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500">Tax treatment for this item</p>
                            </div>

                            {/* 7. Active/Inactive Status - BASE FIELD */}
                            <div className="flex items-center space-x-3 mb-6">
                                <Switch
                                    id="is_active"
                                    checked={formData.is_active}
                                    onCheckedChange={(checked) => handleInputChange('is_active', checked)}
                                />
                                <Label htmlFor="is_active" className="text-sm font-semibold text-slate-700">
                                    Active / Available for Use
                                </Label>
                            </div>
                        </div>

                        {/* ====== TYPE-SPECIFIC FIELDS SECTION ====== */}
                        {formData.item_type && typeSpecificConfig[formData.item_type] && (
                            <div className="border-l-4 border-primary pl-6 py-4 bg-primary/10 rounded">
                                <h3 className="text-sm font-bold text-foreground uppercase tracking-wide mb-6">
                                    {typeSpecificConfig[formData.item_type].label} • Type-Specific Fields
                                </h3>

                                {/* PRODUCT FIELDS */}
                                {formData.item_type === 'product' && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="sku" className="text-sm font-semibold text-slate-700">SKU / Product Code</Label>
                                            <Input
                                                id="sku"
                                                value={formData.sku}
                                                onChange={(e) => handleInputChange('sku', e.target.value)}
                                                placeholder="e.g., PROD-001, ITEM-SKU-123"
                                                className="h-12 rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="unit" className="text-sm font-semibold text-slate-700">Unit</Label>
                                            <Select value={formData.unit} onValueChange={(value) => handleInputChange('unit', value)}>
                                                <SelectTrigger className="h-12 rounded-xl">
                                                    <SelectValue placeholder="Select unit" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {['each', 'box', 'kg', 'litre', 'set', 'case', 'unit'].map(u => (
                                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="price" className="text-sm font-semibold text-slate-700">Default Price</Label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <Input
                                                    id="price"
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.price}
                                                    onChange={(e) => handleInputChange('price', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                    className="h-12 pl-10 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* SERVICE FIELDS */}
                                {formData.item_type === 'service' && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="billing_unit" className="text-sm font-semibold text-slate-700">Billing Unit</Label>
                                            <Select value={formData.billing_unit} onValueChange={(value) => handleInputChange('billing_unit', value)}>
                                                <SelectTrigger className="h-12 rounded-xl">
                                                    <SelectValue placeholder="Select billing unit" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {['hour', 'day', 'session', 'project', 'week', 'month'].map(u => (
                                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="rate" className="text-sm font-semibold text-slate-700">Default Rate</Label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <Input
                                                    id="rate"
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.rate}
                                                    onChange={(e) => handleInputChange('rate', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                    className="h-12 pl-10 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* LABOR FIELDS */}
                                {formData.item_type === 'labor' && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="role" className="text-sm font-semibold text-slate-700">Role / Skill Type</Label>
                                            <Input
                                                id="role"
                                                value={formData.role}
                                                onChange={(e) => handleInputChange('role', e.target.value)}
                                                placeholder="e.g., Senior Developer, Electrician, Mechanic"
                                                className="h-12 rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="hourly_rate" className="text-sm font-semibold text-slate-700">Hourly Rate</Label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <Input
                                                    id="hourly_rate"
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.hourly_rate}
                                                    onChange={(e) => handleInputChange('hourly_rate', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                    className="h-12 pl-10 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* MATERIAL FIELDS */}
                                {formData.item_type === 'material' && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="unit_type" className="text-sm font-semibold text-slate-700">Unit Type</Label>
                                            <Select value={formData.unit_type} onValueChange={(value) => handleInputChange('unit_type', value)}>
                                                <SelectTrigger className="h-12 rounded-xl">
                                                    <SelectValue placeholder="Select unit type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {['m²', 'kg', 'units', 'litres', 'meter', 'piece', 'sqmeter'].map(u => (
                                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="cost_rate" className="text-sm font-semibold text-slate-700">Cost Rate</Label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <Input
                                                    id="cost_rate"
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.cost_rate}
                                                    onChange={(e) => handleInputChange('cost_rate', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                    className="h-12 pl-10 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* EXPENSE FIELDS */}
                                {formData.item_type === 'expense' && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="cost_type" className="text-sm font-semibold text-slate-700">Cost Type</Label>
                                            <Select value={formData.cost_type} onValueChange={(value) => handleInputChange('cost_type', value)}>
                                                <SelectTrigger className="h-12 rounded-xl">
                                                    <SelectValue placeholder="Select cost type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="fixed">Fixed</SelectItem>
                                                    <SelectItem value="variable">Variable</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="default_cost" className="text-sm font-semibold text-slate-700">Default Cost</Label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <Input
                                                    id="default_cost"
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.default_cost}
                                                    onChange={(e) => handleInputChange('default_cost', parseFloat(e.target.value) || 0)}
                                                    placeholder="0.00"
                                                    className="h-12 pl-10 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ====== OPTIONAL/ADVANCED FIELDS SECTION ====== */}
                        <div className="border-l-4 border-purple-300 pl-6 py-4 bg-purple-50 rounded">
                            <h3 className="text-sm font-bold text-purple-900 uppercase tracking-wide mb-6">
                                Optional / Advanced Fields
                            </h3>

                            {/* Pricing Type - Optional */}
                            <div className="grid md:grid-cols-2 gap-6 mb-6">
                                <div className="space-y-2">
                                    <Label htmlFor="pricing_type" className="text-sm font-semibold text-slate-700">
                                        Pricing Type (Optional)
                                    </Label>
                                    <Select value={formData.pricing_type} onValueChange={(value) => handleInputChange('pricing_type', value)}>
                                        <SelectTrigger className="h-12 rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {pricingTypes.map(type => (
                                                <SelectItem key={type.value} value={type.value}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500">{pricingTypes.find(t => t.value === formData.pricing_type)?.unit}</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="min_quantity" className="text-sm font-semibold text-slate-700">Minimum Quantity</Label>
                                    <Input
                                        id="min_quantity"
                                        type="number"
                                        min="1"
                                        value={formData.min_quantity}
                                        onChange={(e) => handleInputChange('min_quantity', parseInt(e.target.value) || 1)}
                                        className="h-12 rounded-xl"
                                    />
                                    <p className="text-xs text-slate-500">Smallest quantity allowed per invoice</p>
                                </div>
                            </div>

                            {/* Category - Optional */}
                            <div className="space-y-2 mb-6">
                                <Label htmlFor="category" className="text-sm font-semibold text-slate-700">Category (Optional)</Label>
                                {!showCustomCategory ? (
                                    <Select value={formData.category} onValueChange={handleCategoryChange}>
                                        <SelectTrigger className="h-12 rounded-xl">
                                            <SelectValue placeholder="Select or add category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {predefinedCategories.map(cat => (
                                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                            ))}
                                            <SelectItem value="custom">+ Add Custom Category</SelectItem>
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <div className="flex gap-2">
                                        <Input
                                            value={customCategory}
                                            onChange={(e) => setCustomCategory(e.target.value)}
                                            placeholder="Enter custom category"
                                            className="h-12 rounded-xl"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setShowCustomCategory(false)}
                                            className="h-12 px-3"
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Estimated Duration & Requirements */}
                            <div className="grid md:grid-cols-2 gap-6 mb-6">
                                <div className="space-y-2">
                                    <Label htmlFor="estimated_duration" className="text-sm font-semibold text-slate-700">Estimated Duration</Label>
                                    <Input
                                        id="estimated_duration"
                                        value={formData.estimated_duration}
                                        onChange={(e) => handleInputChange('estimated_duration', e.target.value)}
                                        placeholder="e.g., 2-3 days, 1 week"
                                        className="h-12 rounded-xl"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="requirements" className="text-sm font-semibold text-slate-700">Requirements/Prerequisites</Label>
                                    <Textarea
                                        id="requirements"
                                        value={formData.requirements}
                                        onChange={(e) => handleInputChange('requirements', e.target.value)}
                                        placeholder="Any special requirements or prerequisites..."
                                        className="min-h-16 rounded-xl resize-none"
                                    />
                                </div>
                            </div>

                            {/* Tags - Optional */}
                            <div className="space-y-2 mb-6">
                                <Label className="text-sm font-semibold text-slate-700">Tags</Label>
                                <div className="flex gap-2 mb-2">
                                    <Input
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        placeholder="Add a tag"
                                        className="h-10 rounded-lg flex-1"
                                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                    />
                                    <Button type="button" onClick={handleAddTag} size="sm" className="h-10">
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                                {formData.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {formData.tags.map((tag, index) => (
                                            <Badge key={index} variant="secondary" className="flex items-center gap-1">
                                                {tag}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveTag(tag)}
                                                    className="ml-1 hover:text-red-500"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Price Lock Control - Optional Security Feature */}
                            <div className="space-y-3 p-4 rounded-lg bg-orange-50 border border-orange-200 mb-6">
                                <div className="flex items-center space-x-3">
                                    <Switch
                                        id="price_locked"
                                        checked={formData.price_locked}
                                        onCheckedChange={(checked) => handleInputChange('price_locked', checked)}
                                    />
                                    <div className="flex-1">
                                        <Label htmlFor="price_locked" className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                                            <Lock className="w-4 h-4" />
                                            Lock Pricing
                                        </Label>
                                        <p className="text-xs text-slate-500 mt-1">
                                            When enabled, the default rate cannot be changed globally. Users can override on individual invoices only.
                                        </p>
                                    </div>
                                </div>
                                {formData.price_locked && (
                                    <div className="text-xs text-orange-700 bg-white rounded p-2 border-l-2 border-orange-400">
                                        🔒 Pricing is locked. Current rate: <span className="font-semibold">${formData.default_rate.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Submit Buttons */}
                        <div className="flex justify-end space-x-4 pt-6 border-t border-slate-200">
                            <Button type="button" variant="outline" onClick={onCancel} className="px-6 py-3 rounded-xl">
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={!isValid || isSaving} 
                                className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all" 
                                title={!isValid ? validationErrors.join(", ") : isSaving ? "Saving..." : ""}
                            >
                                <Save className={`w-4 h-4 mr-2 ${isSaving ? 'animate-spin' : ''}`} />
                                {isSaving ? "Saving..." : service ? "Update Item" : "Create Item"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </motion.div>
    );
}