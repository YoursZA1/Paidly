/**
 * Catalog Sync Service
 * Handles syncing catalog items to invoice line items
 * Maps base fields, type-specific fields, and manages tax categories
 * 
 * Key Features:
 * - Maps catalog items to invoice line items with all base fields
 * - Converts tax categories to numeric rates
 * - Enforces price lock restrictions
 * - Supports invoice-level rate overrides (when not locked)
 * - Backwards compatible with legacy field names
 * - Batch operations for multiple items
 * - Comprehensive validation and error handling
 * - Metadata tracking for audit trails
 * - Integration with ItemPermissionsService and ItemUsageService
 * - Support for discounts and promotions
 * - Smart defaults based on item type
 * 
 * Integration Points:
 * - ItemPermissionsService: Price lock validation, deletion checks
 * - ItemUsageService: Usage tracking, stats recording
 * - Tax/VAT system: Customizable tax categories
 */

/**
 * Map catalog tax categories to tax rates
 * These are default mappings - can be customized per user/company
 */
const TAX_CATEGORY_RATES = {
    'standard': 10,    // Standard rate
    'reduced': 5,      // Reduced rate
    'zero': 0,         // Zero rated
    'exempt': 0,       // Tax exempt
    'vat_standard': 20, // VAT standard (for EU/UK)
    'vat_reduced': 5,   // VAT reduced
    'gst': 15,          // GST (for countries using GST)
    'custom': 0         // Custom rate - use default_tax_rate field
};

/**
 * Default tax rates by country/region
 * Can be used for automatic tax setup
 */
const REGIONAL_TAX_RATES = {
    'US': { standard: 10, reduced: 5, exempt: 0 },
    'UK': { vat_standard: 20, vat_reduced: 5, zero: 0 },
    'EU': { vat_standard: 20, vat_reduced: 5, zero: 0 },
    'CA': { gst: 5, pst: 7, hst: 13, exempt: 0 },
    'AU': { gst: 10, exempt: 0 },
    'NZ': { gst: 15, exempt: 0 }
};

/**
 * Get tax rate for a given tax category
 * @param {string} taxCategory - Tax category (standard, reduced, zero, exempt)
 * @param {number} defaultRate - Fallback rate if category not found
 * @param {object} customRates - Optional custom tax rates object
 * @returns {number} Tax rate (0-100)
 */
export const getTaxRateFromCategory = (taxCategory, defaultRate = 0, customRates = null) => {
    if (!taxCategory) return defaultRate;
    
    // Use custom rates if provided
    if (customRates && customRates[taxCategory]) {
        return customRates[taxCategory];
    }
    
    // Use default category rates
    return TAX_CATEGORY_RATES[taxCategory.toLowerCase()] ?? defaultRate;
};

/**
 * Get regional tax configuration
 * @param {string} region - Region code (US, UK, EU, CA, AU, NZ)
 * @returns {object} Tax configuration for region
 */
export const getRegionalTaxRates = (region) => {
    return REGIONAL_TAX_RATES[region.toUpperCase()] || REGIONAL_TAX_RATES['US'];
};

/**
 * Validate tax rate
 * @param {number} taxRate - Tax rate to validate
 * @returns {object} Validation result
 */
export const validateTaxRate = (taxRate) => {
    if (taxRate === null || taxRate === undefined) {
        return { valid: false, error: 'Tax rate is required' };
    }
    
    if (typeof taxRate !== 'number') {
        return { valid: false, error: 'Tax rate must be a number' };
    }
    
    if (taxRate < 0 || taxRate > 100) {
        return { valid: false, error: 'Tax rate must be between 0 and 100' };
    }
    
    return { valid: true, rate: parseFloat(taxRate.toFixed(2)) };
};

/**
 * Validate catalog item object
 * @param {object} catalogItem - Catalog item to validate
 * @returns {object} Validation result
 */
export const validateCatalogItem = (catalogItem) => {
    if (!catalogItem) {
        return { valid: false, error: 'Catalog item is required' };
    }
    
    if (!catalogItem.id) {
        return { valid: false, error: 'Catalog item must have an ID' };
    }
    
    if (!catalogItem.name) {
        return { valid: false, error: 'Catalog item must have a name' };
    }
    
    if (!catalogItem.item_type) {
        return { valid: false, error: 'Catalog item must have an item_type' };
    }
    
    const validTypes = ['service', 'product', 'labor', 'material', 'expense'];
    if (!validTypes.includes(catalogItem.item_type)) {
        return { 
            valid: false, 
            error: `Invalid item_type. Must be one of: ${validTypes.join(', ')}` 
        };
    }
    
    const rate = catalogItem.default_rate ?? catalogItem.unit_price;
    if (rate === undefined || rate === null) {
        return { valid: false, error: 'Catalog item must have a default_rate or unit_price' };
    }
    
    if (rate < 0) {
        return { valid: false, error: 'Rate cannot be negative' };
    }
    
    return { valid: true, item: catalogItem };
};

/**
 * Check if catalog item is price locked
 * @param {object} catalogItem - Catalog item to check
 * @returns {boolean} True if price is locked
 */
export const isItemPriceLocked = (catalogItem) => {
    return catalogItem?.price_locked === true;
};

/**
 * Get price lock information for display
 * @param {object} catalogItem - Catalog item
 * @returns {object} Lock status info
 */
export const getPriceLockInfo = (catalogItem) => {
    const isLocked = isItemPriceLocked(catalogItem);
    return {
        isLocked,
        message: isLocked 
            ? '🔒 Pricing is locked. Rate cannot be changed from catalog default.'
            : '🔓 Rate can be customized on this invoice.',
        canOverride: !isLocked
    };
};

/**
 * Map catalog item fields to invoice line item fields
 * Handles new catalog base fields with backwards compatibility
 * 
 * @param {object} catalogItem - Item from unified catalog (product/service/labor/material/expense)
 * @param {number} quantity - Line item quantity (optional, defaults to 1)
 * @param {object} options - Additional options for mapping
 * @returns {object} Mapped line item object or error
 */
export const mapCatalogToLineItem = (catalogItem, quantity = 1, options = {}) => {
    // Validate catalog item first
    const validation = validateCatalogItem(catalogItem);
    if (!validation.valid) {
        console.error('Invalid catalog item:', validation.error);
        return { error: validation.error };
    }
    
    // Extract options with defaults
    const {
        existingTaxRate = 0,
        applyDiscount = false,
        discountPercent = 0,
        discountAmount = 0,
        customRate = null,
        customTaxRates = null,
        preserveMetadata = true,
        invoiceId = null,
        userId = null
    } = options;
    // ===== FIELD MAPPING STRATEGY =====
    // 1. PRIMARY: Use new catalog base fields (default_rate, default_unit, tax_category)
    // 2. FALLBACK: Use legacy fields (unit_price, unit_of_measure, service_type)
    // 3. COMPATIBILITY: Preserve both for round-trip updates
    
    // Get rate (custom > new field > legacy field > 0)
    let rate = customRate !== null ? customRate : (
        catalogItem.default_rate !== undefined 
            ? catalogItem.default_rate 
            : (catalogItem.unit_price || 0)
    );
    
    // Apply discount if specified
    let originalRate = rate;
    let appliedDiscount = 0;
    if (applyDiscount) {
        if (discountPercent > 0) {
            appliedDiscount = rate * (discountPercent / 100);
            rate = rate - appliedDiscount;
        } else if (discountAmount > 0) {
            appliedDiscount = Math.min(discountAmount, rate);
            rate = rate - appliedDiscount;
        }
    }
    
    // Get unit (new field > legacy field > 'unit')
    const unit = catalogItem.default_unit 
        ? catalogItem.default_unit.toLowerCase()
        : (catalogItem.unit_of_measure ? catalogItem.unit_of_measure.toLowerCase() : 'unit');
    
    // Get tax rate from category (new field) or use existing, or calculate from legacy field
    let itemTaxRate = existingTaxRate;
    if (catalogItem.tax_category) {
        itemTaxRate = getTaxRateFromCategory(
            catalogItem.tax_category, 
            existingTaxRate,
            customTaxRates
        );
    } else if (catalogItem.default_tax_rate !== undefined) {
        itemTaxRate = catalogItem.default_tax_rate;
    }
    // Note: Legacy service_type unit mapping is handled in ProjectDetails component
    
    // Calculate totals
    const qty = Math.max(quantity, catalogItem.min_quantity || 1);
    const totalPrice = qty * rate;
    const itemTaxAmount = totalPrice * (itemTaxRate / 100);
    
    // Build line item
    const lineItem = {
        // Required fields
        service_name: catalogItem.name,
        description: catalogItem.description || '',
        quantity: qty,
        unit_price: rate,
        unit_type: unit,
        item_type: catalogItem.item_type || 'service',
        total_price: totalPrice,
        item_tax_rate: itemTaxRate,
        item_tax_amount: itemTaxAmount,
        
        // Reference to catalog item for future syncing
        catalog_item_id: catalogItem.id,
        
        // Discount tracking
        ...(applyDiscount && appliedDiscount > 0 && {
            has_discount: true,
            discount_amount: parseFloat(appliedDiscount.toFixed(2)),
            discount_percent: discountPercent || parseFloat(((appliedDiscount / originalRate) * 100).toFixed(2)),
            original_rate: originalRate,
            discounted_rate: rate
        }),
        
        // Metadata for tracking
        ...(preserveMetadata && {
            sync_timestamp: new Date().toISOString(),
            ...(invoiceId && { invoice_id: invoiceId }),
            ...(userId && { created_by: userId })
        }),
        
        // Price lock status and notes
        ...(catalogItem.price_locked && { 
            price_locked: true,
            price_lock_note: 'This item has pricing locked in the catalog. Rate cannot be changed from the default.'
        }),
        
        // Optional fields
        ...(catalogItem.sku && { sku: catalogItem.sku }),
        ...(catalogItem.min_quantity && { min_quantity: catalogItem.min_quantity }),
        
        // Type-specific fields (preserved for reference)
        // Product
        ...(catalogItem.item_type === 'product' && {
            ...(catalogItem.sku && { product_sku: catalogItem.sku }),
            ...(catalogItem.unit && { product_unit: catalogItem.unit }),
            ...(catalogItem.price && { product_price: catalogItem.price })
        }),
        
        // Service
        ...(catalogItem.item_type === 'service' && {
            ...(catalogItem.billing_unit && { billing_unit: catalogItem.billing_unit }),
            ...(catalogItem.rate && { service_rate: catalogItem.rate })
        }),
        
        // Labor
        ...(catalogItem.item_type === 'labor' && {
            ...(catalogItem.role && { labor_role: catalogItem.role }),
            ...(catalogItem.hourly_rate && { labor_hourly_rate: catalogItem.hourly_rate })
        }),
        
        // Material
        ...(catalogItem.item_type === 'material' && {
            ...(catalogItem.unit_type && { material_unit: catalogItem.unit_type }),
            ...(catalogItem.cost_rate && { material_cost: catalogItem.cost_rate })
        }),
        
        // Expense
        ...(catalogItem.item_type === 'expense' && {
            ...(catalogItem.cost_type && { expense_cost_type: catalogItem.cost_type }),
            ...(catalogItem.default_cost && { expense_amount: catalogItem.default_cost })
        })
    };
    
    return { success: true, lineItem };
};

/**
 * Batch map multiple catalog items to line items
 * @param {array} catalogItems - Array of catalog items
 * @param {object} options - Mapping options
 * @returns {object} Results with successful and failed mappings
 */
export const batchMapCatalogToLineItems = (catalogItems, options = {}) => {
    if (!Array.isArray(catalogItems)) {
        return { 
            success: false, 
            error: 'catalogItems must be an array',
            successful: [],
            failed: []
        };
    }
    
    const results = {
        successful: [],
        failed: [],
        summary: {
            total: catalogItems.length,
            successCount: 0,
            failCount: 0
        }
    };
    
    catalogItems.forEach((item, index) => {
        const itemOptions = {
            ...options,
            ...(options.quantities && options.quantities[index] && {
                quantity: options.quantities[index]
            })
        };
        
        const quantity = itemOptions.quantity || 1;
        const result = mapCatalogToLineItem(item, quantity, itemOptions);
        
        if (result.success) {
            results.successful.push({
                catalogItemId: item.id,
                lineItem: result.lineItem
            });
            results.summary.successCount++;
        } else {
            results.failed.push({
                catalogItemId: item.id,
                catalogItemName: item.name,
                error: result.error
            });
            results.summary.failCount++;
        }
    });
    
    results.success = results.failed.length === 0;
    return results;
};

/**
 * Get plan-based rate adjustment limit
 * @param {string} plan - User's subscription plan
 * @returns {number|null} Max percent change allowed (null = unlimited)
 */
export const getPlanRateLimit = (plan) => {
    const limits = {
        'free': 0,        // Cannot edit rates
        'basic': 10,      // 10% adjustment
        'pro': 50,        // 50% adjustment
        'premium': 100,   // 100% adjustment
        'enterprise': null // Unlimited
    };
    
    return limits[plan?.toLowerCase()] ?? limits['free'];
};

/**
 * Check if a user can edit the rate/price on a line item
 * Depends on subscription plan and item price lock status
 * 
 * @param {object} catalogItem - Catalog item being used
 * @param {object} user - User object with plan info
 * @returns {object} { canEdit: boolean, reason: string, maxChange: number|null }
 */
export const canEditLineItemRate = (catalogItem, user) => {
    // Validate inputs
    if (!catalogItem) {
        return {
            canEdit: false,
            reason: 'Invalid catalog item',
            maxChange: 0
        };
    }
    
    // Check price lock first
    if (isItemPriceLocked(catalogItem)) {
        return {
            canEdit: false,
            reason: 'Price is locked on this catalog item',
            maxChange: 0,
            isLocked: true
        };
    }
    
    // Get plan-based limit
    const userPlan = user?.subscription_plan || user?.plan || 'free';
    const maxChange = getPlanRateLimit(userPlan);
    
    if (maxChange === 0) {
        return {
            canEdit: false,
            reason: `${userPlan} plan does not allow rate adjustments. Upgrade to Basic or higher.`,
            maxChange: 0,
            planRestriction: true
        };
    }
    
    return {
        canEdit: true,
        reason: maxChange === null 
            ? 'Rate can be customized without limits'
            : `Rate can be adjusted up to ${maxChange}% from catalog price`,
        maxChange,
        planRestriction: false
    };
};

/**
 * Validate that rate adjustment is within allowed limits
 * Enforces price lock and plan-based restrictions
 * 
 * @param {object} catalogItem - Item from catalog with potential price lock
 * @param {number} originalRate - Original rate from catalog
 * @param {number} newRate - Proposed new rate
 * @param {object} user - User object with plan info (optional)
 * @returns {object} Detailed validation result
 */
export const validateRateAdjustment = (catalogItem, originalRate, newRate, user = null) => {
    // Basic validation
    if (newRate === null || newRate === undefined) {
        return { 
            allowed: false, 
            message: 'Rate is required',
            code: 'RATE_REQUIRED',
            isLocked: false 
        };
    }
    
    if (typeof newRate !== 'number' || isNaN(newRate)) {
        return { 
            allowed: false, 
            message: 'Rate must be a valid number',
            code: 'INVALID_RATE',
            isLocked: false 
        };
    }
    
    if (newRate < 0) {
        return { 
            allowed: false, 
            message: 'Rate cannot be negative',
            code: 'NEGATIVE_RATE',
            isLocked: false 
        };
    }
    
    if (originalRate === null || originalRate === undefined) {
        return { 
            allowed: false, 
            message: 'Original rate is required for comparison',
            code: 'MISSING_ORIGINAL_RATE',
            isLocked: false 
        };
    }
    
    // Check if item has price locked
    if (isItemPriceLocked(catalogItem)) {
        // Allow if rate hasn't changed from original
        if (Math.abs(newRate - originalRate) < 0.01) { // Allow for float precision
            return { 
                allowed: true, 
                message: 'Rate matches locked catalog rate',
                code: 'LOCKED_RATE_UNCHANGED',
                isLocked: true,
                percentChange: 0
            };
        }
        
        return {
            allowed: false, 
            message: 'Catalog item pricing is locked. The rate cannot be changed from the default.',
            code: 'PRICE_LOCKED',
            isLocked: true,
            lockMetadata: {
                lockedBy: catalogItem.price_locked_by,
                lockedAt: catalogItem.price_locked_at,
                reason: catalogItem.price_locked_reason
            }
        };
    }
    
    // Plan-based validation
    if (user) {
        const editCheck = canEditLineItemRate(catalogItem, user);
        
        if (!editCheck.canEdit) {
            return {
                allowed: false,
                message: editCheck.reason,
                code: editCheck.planRestriction ? 'PLAN_RESTRICTION' : 'CANNOT_EDIT',
                isLocked: editCheck.isLocked || false,
                planRestriction: true,
                userPlan: user?.subscription_plan || user?.plan || 'free'
            };
        }
        
        // Check if within plan limits
        if (editCheck.maxChange !== null && originalRate !== 0) {
            const percentChange = Math.abs((newRate - originalRate) / originalRate * 100);
            
            if (percentChange > editCheck.maxChange) {
                return {
                    allowed: false,
                    message: `Rate adjustment exceeds plan limit. ${user?.plan || 'Your plan'} allows up to ${editCheck.maxChange}% change.`,
                    code: 'EXCEEDS_PLAN_LIMIT',
                    isLocked: false,
                    percentChange: parseFloat(percentChange.toFixed(2)),
                    maxAllowed: editCheck.maxChange,
                    planRestriction: true
                };
            }
        }
    }
    
    // Calculate change details
    const absoluteChange = newRate - originalRate;
    const percentChange = originalRate !== 0 
        ? (absoluteChange / originalRate * 100)
        : 0;
    
    return { 
        allowed: true, 
        message: 'Rate adjustment allowed',
        code: 'ALLOWED',
        isLocked: false,
        originalRate,
        newRate,
        absoluteChange: parseFloat(absoluteChange.toFixed(2)),
        percentChange: parseFloat(percentChange.toFixed(2))
    };
};

/**
 * Calculate line item totals with tax
 * @param {number} quantity - Item quantity
 * @param {number} unitPrice - Price per unit
 * @param {number} taxRate - Tax rate (0-100)
 * @returns {object} Calculated totals
 */
export const calculateLineItemTotals = (quantity, unitPrice, taxRate = 0) => {
    const subtotal = quantity * unitPrice;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    
    return {
        quantity,
        unitPrice,
        subtotal: parseFloat(subtotal.toFixed(2)),
        taxRate,
        taxAmount: parseFloat(taxAmount.toFixed(2)),
        total: parseFloat(total.toFixed(2))
    };
};

/**
 * Create an invoice-level rate override
 * Allows custom rate on individual invoices when price is not locked
 * 
 * @param {object} lineItem - Original line item from catalog
 * @param {number} customRate - Custom rate for this invoice
 * @param {object} options - Override options
 * @returns {object} Result with updated line item or error
 */
export const createRateOverride = (lineItem, customRate, options = {}) => {
    const { reason = '', userId = null, validateOnly = false } = options;
    
    // Validate inputs
    if (!lineItem) {
        return { success: false, error: 'Line item is required' };
    }
    
    if (customRate === null || customRate === undefined) {
        return { success: false, error: 'Custom rate is required' };
    }
    
    if (customRate < 0) {
        return { success: false, error: 'Custom rate cannot be negative' };
    }
    
    // Check if original rate exists
    const originalRate = lineItem.unit_price;
    if (originalRate === null || originalRate === undefined) {
        return { success: false, error: 'Line item must have a unit_price' };
    }
    
    // Validate against price lock if catalog item is available
    if (lineItem.catalog_item_id && lineItem.price_locked) {
        return {
            success: false,
            error: 'Cannot override rate - item pricing is locked',
            isLocked: true
        };
    }
    
    // Return validation only if requested
    if (validateOnly) {
        const percentChange = originalRate !== 0
            ? Math.abs((customRate - originalRate) / originalRate * 100)
            : 0;
        
        return {
            success: true,
            valid: true,
            originalRate,
            customRate,
            percentChange: parseFloat(percentChange.toFixed(2))
        };
    }
    
    // Calculate new totals
    const totals = calculateLineItemTotals(
        lineItem.quantity,
        customRate,
        lineItem.item_tax_rate
    );
    
    // Create override
    const updatedLineItem = {
        ...lineItem,
        unit_price: customRate,
        total_price: totals.total,
        item_tax_amount: totals.taxAmount,
        rate_override: true,
        original_rate: originalRate,
        override_reason: reason,
        override_timestamp: new Date().toISOString(),
        ...(userId && { override_by: userId })
    };
    
    return {
        success: true,
        lineItem: updatedLineItem,
        override: {
            originalRate,
            customRate,
            difference: parseFloat((customRate - originalRate).toFixed(2)),
            percentChange: originalRate !== 0
                ? parseFloat(((customRate - originalRate) / originalRate * 100).toFixed(2))
                : 0
        }
    };
};

/**
 * Sync catalog item changes to existing line items
 * Updates line items when catalog item is modified
 * 
 * @param {object} catalogItem - Updated catalog item
 * @param {array} existingLineItems - Array of line items using this catalog item
 * @param {object} options - Sync options
 * @returns {array} Updated line items
 */
export const syncCatalogChangesToLineItems = (catalogItem, existingLineItems, options = {}) => {
    const {
        updateRates = false,        // Whether to update rates
        updateDescriptions = true,  // Whether to update descriptions
        preserveOverrides = true    // Whether to keep custom rates
    } = options;
    
    return existingLineItems.map(lineItem => {
        // Skip if not from this catalog item
        if (lineItem.catalog_item_id !== catalogItem.id) {
            return lineItem;
        }
        
        // Preserve rate overrides if requested
        if (preserveOverrides && lineItem.rate_override) {
            return {
                ...lineItem,
                service_name: catalogItem.name,
                description: updateDescriptions ? catalogItem.description : lineItem.description,
                item_type: catalogItem.item_type
            };
        }
        
        // Update rate if allowed
        const newRate = updateRates ? catalogItem.default_rate : lineItem.unit_price;
        const totals = calculateLineItemTotals(
            lineItem.quantity,
            newRate,
            lineItem.item_tax_rate
        );
        
        return {
            ...lineItem,
            service_name: catalogItem.name,
            description: updateDescriptions ? catalogItem.description : lineItem.description,
            item_type: catalogItem.item_type,
            unit_price: newRate,
            total_price: totals.total,
            item_tax_amount: totals.taxAmount
        };
    });
};

/**
 * Get smart defaults for a catalog item based on type
 * @param {string} itemType - Item type
 * @returns {object} Default values
 */
export const getItemTypeDefaults = (itemType) => {
    const defaults = {
        service: {
            unit: 'hour',
            minQuantity: 1,
            taxCategory: 'standard',
            description: 'Professional service'
        },
        product: {
            unit: 'unit',
            minQuantity: 1,
            taxCategory: 'standard',
            description: 'Product item'
        },
        labor: {
            unit: 'hour',
            minQuantity: 1,
            taxCategory: 'standard',
            description: 'Labor hours'
        },
        material: {
            unit: 'unit',
            minQuantity: 1,
            taxCategory: 'standard',
            description: 'Material item'
        },
        expense: {
            unit: 'unit',
            minQuantity: 1,
            taxCategory: 'zero',
            description: 'Expense reimbursement'
        }
    };
    
    return defaults[itemType] || defaults.service;
};

/**
 * Calculate summary statistics for line items
 * @param {array} lineItems - Array of line items
 * @returns {object} Summary statistics
 */
export const calculateLineItemsSummary = (lineItems) => {
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return {
            totalItems: 0,
            subtotal: 0,
            totalTax: 0,
            grandTotal: 0,
            avgItemPrice: 0,
            itemTypes: {},
            lockedItems: 0,
            overriddenItems: 0
        };
    }
    
    const summary = {
        totalItems: lineItems.length,
        subtotal: 0,
        totalTax: 0,
        grandTotal: 0,
        avgItemPrice: 0,
        itemTypes: {},
        lockedItems: 0,
        overriddenItems: 0,
        discountedItems: 0,
        totalDiscount: 0
    };
    
    lineItems.forEach(item => {
        const itemTotal = item.total_price || (item.quantity * item.unit_price);
        const itemTax = item.item_tax_amount || 0;
        
        summary.subtotal += (itemTotal - itemTax);
        summary.totalTax += itemTax;
        summary.grandTotal += itemTotal;
        
        // Count by type
        const type = item.item_type || 'service';
        summary.itemTypes[type] = (summary.itemTypes[type] || 0) + 1;
        
        // Count locked/overridden items
        if (item.price_locked) summary.lockedItems++;
        if (item.rate_override) summary.overriddenItems++;
        if (item.has_discount) {
            summary.discountedItems++;
            summary.totalDiscount += (item.discount_amount || 0);
        }
    });
    
    summary.avgItemPrice = summary.totalItems > 0
        ? summary.grandTotal / summary.totalItems
        : 0;
    
    // Round all monetary values
    summary.subtotal = parseFloat(summary.subtotal.toFixed(2));
    summary.totalTax = parseFloat(summary.totalTax.toFixed(2));
    summary.grandTotal = parseFloat(summary.grandTotal.toFixed(2));
    summary.avgItemPrice = parseFloat(summary.avgItemPrice.toFixed(2));
    summary.totalDiscount = parseFloat(summary.totalDiscount.toFixed(2));
    
    return summary;
};

export default {
    // Tax functions (5)
    getTaxRateFromCategory,
    getRegionalTaxRates,
    validateTaxRate,
    TAX_CATEGORY_RATES,
    REGIONAL_TAX_RATES,
    
    // Validation functions (3)
    validateCatalogItem,
    isItemPriceLocked,
    getPriceLockInfo,
    
    // Mapping functions (3)
    mapCatalogToLineItem,
    batchMapCatalogToLineItems,
    getItemTypeDefaults,
    
    // Rate editing functions (4)
    canEditLineItemRate,
    getPlanRateLimit,
    validateRateAdjustment,
    createRateOverride,
    
    // Calculation functions (2)
    calculateLineItemTotals,
    calculateLineItemsSummary,
    
    // Sync functions (1)
    syncCatalogChangesToLineItems
};
