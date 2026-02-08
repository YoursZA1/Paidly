/**
 * Industry Presets Service
 * Provides industry-specific configurations for catalog setup
 * Includes item types, units, naming conventions, and template items
 */

/**
 * Industry Presets Configuration
 * Defines default settings for different business types
 */
export const INDUSTRY_PRESETS_CONFIG = {
    automotive: {
        code: 'automotive',
        name: '🚗 Automotive',
        description: 'Auto repair, mechanic shops, and service centers',
        icon: '🚗',
        color: 'blue',
        
        // Recommended item types to use
        recommendedItemTypes: ['labor', 'product', 'material', 'expense'],
        
        // Default unit for each item type
        defaultUnits: {
            service: 'hour',
            product: 'each',
            labor: 'hour',
            material: 'hour',
            expense: 'job'
        },
        
        // Naming conventions and terminology
        terminology: {
            labor: 'Labor',
            product: 'Parts',
            material: 'Materials',
            service: 'Services',
            expense: 'Shop Expenses'
        },
        
        // Template items to auto-create
        templateItems: [
            {
                name: 'Diagnostic',
                item_type: 'labor',
                default_unit: 'hour',
                default_rate: 75,
                description: 'Vehicle diagnostic and inspection',
                tax_category: 'standard'
            },
            {
                name: 'Oil Change',
                item_type: 'service',
                default_unit: 'each',
                default_rate: 45,
                description: 'Oil and filter change service',
                tax_category: 'standard'
            },
            {
                name: 'Mechanical Labor',
                item_type: 'labor',
                default_unit: 'hour',
                default_rate: 95,
                description: 'Technician labor',
                tax_category: 'standard'
            },
            {
                name: 'Parts/Supplies',
                item_type: 'product',
                default_unit: 'each',
                default_rate: 0,
                description: 'Auto parts and supplies',
                tax_category: 'standard'
            }
        ]
    },
    
    construction: {
        code: 'construction',
        name: '🏗️ Construction',
        description: 'Construction, contracting, and building services',
        icon: '🏗️',
        color: 'orange',
        
        recommendedItemTypes: ['labor', 'material', 'product', 'expense'],
        
        defaultUnits: {
            service: 'day',
            product: 'unit',
            labor: 'hour',
            material: 'unit',
            expense: 'job'
        },
        
        terminology: {
            labor: 'Labor',
            product: 'Materials',
            material: 'Materials',
            service: 'Services',
            expense: 'Site Expenses'
        },
        
        templateItems: [
            {
                name: 'Skilled Labor',
                item_type: 'labor',
                default_unit: 'hour',
                default_rate: 65,
                description: 'Skilled worker labor',
                tax_category: 'standard'
            },
            {
                name: 'Unskilled Labor',
                item_type: 'labor',
                default_unit: 'hour',
                default_rate: 40,
                description: 'General laborer',
                tax_category: 'standard'
            },
            {
                name: 'Building Materials',
                item_type: 'material',
                default_unit: 'unit',
                default_rate: 0,
                description: 'Construction materials and supplies',
                tax_category: 'standard'
            },
            {
                name: 'Equipment Rental',
                item_type: 'product',
                default_unit: 'day',
                default_rate: 150,
                description: 'Rented equipment and machinery',
                tax_category: 'standard'
            },
            {
                name: 'Site Cleanup',
                item_type: 'service',
                default_unit: 'day',
                default_rate: 200,
                description: 'Site preparation and cleanup',
                tax_category: 'standard'
            }
        ]
    },
    
    retail: {
        code: 'retail',
        name: '🛍️ Retail',
        description: 'Retail stores, e-commerce, and product sales',
        icon: '🛍️',
        color: 'red',
        
        recommendedItemTypes: ['product'],
        
        defaultUnits: {
            service: 'each',
            product: 'each',
            labor: 'hour',
            material: 'unit',
            expense: 'month'
        },
        
        terminology: {
            labor: 'Services',
            product: 'Products',
            material: 'Inventory',
            service: 'Services',
            expense: 'Operating Expenses'
        },
        
        templateItems: [
            {
                name: 'Product',
                item_type: 'product',
                default_unit: 'each',
                default_rate: 0,
                description: 'Retail product',
                tax_category: 'standard'
            },
            {
                name: 'Custom Service',
                item_type: 'service',
                default_unit: 'hour',
                default_rate: 50,
                description: 'Custom service or consultation',
                tax_category: 'standard'
            },
            {
                name: 'Shipping',
                item_type: 'expense',
                default_unit: 'each',
                default_rate: 0,
                description: 'Shipping cost',
                tax_category: 'zero'
            }
        ]
    },
    
    professional_services: {
        code: 'professional_services',
        name: '💼 Professional Services',
        description: 'Consulting, agencies, and professional firms',
        icon: '💼',
        color: 'purple',
        
        recommendedItemTypes: ['service', 'labor'],
        
        defaultUnits: {
            service: 'hour',
            product: 'unit',
            labor: 'hour',
            material: 'unit',
            expense: 'project'
        },
        
        terminology: {
            labor: 'Staff Time',
            product: 'Deliverables',
            material: 'Materials',
            service: 'Services',
            expense: 'Project Expenses'
        },
        
        templateItems: [
            {
                name: 'Consulting',
                item_type: 'service',
                default_unit: 'hour',
                default_rate: 150,
                description: 'Professional consulting services',
                tax_category: 'standard'
            },
            {
                name: 'Development',
                item_type: 'labor',
                default_unit: 'hour',
                default_rate: 100,
                description: 'Development work',
                tax_category: 'standard'
            },
            {
                name: 'Design',
                item_type: 'service',
                default_unit: 'day',
                default_rate: 800,
                description: 'Design services',
                tax_category: 'standard'
            },
            {
                name: 'Project Management',
                item_type: 'labor',
                default_unit: 'hour',
                default_rate: 120,
                description: 'Project management oversight',
                tax_category: 'standard'
            },
            {
                name: 'Third-party Expenses',
                item_type: 'expense',
                default_unit: 'each',
                default_rate: 0,
                description: 'External costs and expenses',
                tax_category: 'standard'
            }
        ]
    },
    
    manufacturing: {
        code: 'manufacturing',
        name: '🏭 Manufacturing',
        description: 'Manufacturing, production, and distribution',
        icon: '🏭',
        color: 'gray',
        
        recommendedItemTypes: ['product', 'material', 'labor', 'expense'],
        
        defaultUnits: {
            service: 'unit',
            product: 'unit',
            labor: 'hour',
            material: 'kg',
            expense: 'month'
        },
        
        terminology: {
            labor: 'Labor',
            product: 'Products',
            material: 'Raw Materials',
            service: 'Services',
            expense: 'Manufacturing Expenses'
        },
        
        templateItems: [
            {
                name: 'Raw Material',
                item_type: 'material',
                default_unit: 'kg',
                default_rate: 0,
                description: 'Raw materials and components',
                tax_category: 'standard'
            },
            {
                name: 'Finished Product',
                item_type: 'product',
                default_unit: 'unit',
                default_rate: 0,
                description: 'Finished goods',
                tax_category: 'standard'
            },
            {
                name: 'Production Labor',
                item_type: 'labor',
                default_unit: 'hour',
                default_rate: 35,
                description: 'Factory worker labor',
                tax_category: 'standard'
            },
            {
                name: 'Quality Control',
                item_type: 'service',
                default_unit: 'unit',
                default_rate: 5,
                description: 'Quality control and testing per unit',
                tax_category: 'standard'
            },
            {
                name: 'Packaging',
                item_type: 'material',
                default_unit: 'unit',
                default_rate: 2,
                description: 'Packaging materials',
                tax_category: 'standard'
            }
        ]
    },
    
    custom: {
        code: 'custom',
        name: '⚙️ Custom Setup',
        description: 'Set up your own items manually',
        icon: '⚙️',
        color: 'slate',
        
        recommendedItemTypes: ['service', 'product', 'labor', 'material', 'expense'],
        
        defaultUnits: {
            service: 'unit',
            product: 'unit',
            labor: 'hour',
            material: 'unit',
            expense: 'item'
        },
        
        terminology: {
            labor: 'Labor',
            product: 'Products',
            material: 'Materials',
            service: 'Services',
            expense: 'Expenses'
        },
        
        templateItems: []
    }
};

/**
 * Get all available industries
 * @returns {Array} List of industries
 */
export const getIndustries = () => {
    return Object.values(INDUSTRY_PRESETS_CONFIG).map(industry => ({
        code: industry.code,
        name: industry.name,
        description: industry.description,
        icon: industry.icon
    }));
};

/**
 * Get preset configuration for a specific industry
 * @param {string} industryCode - Industry code
 * @returns {object|null} Industry preset configuration
 */
export const getIndustryPreset = (industryCode) => {
    return INDUSTRY_PRESETS_CONFIG[industryCode] || null;
};

/**
 * Get recommended item types for an industry
 * @param {string} industryCode - Industry code
 * @returns {Array} Recommended item types
 */
export const getRecommendedItemTypes = (industryCode) => {
    const preset = INDUSTRY_PRESETS_CONFIG[industryCode];
    return preset ? preset.recommendedItemTypes : ['service', 'product'];
};

/**
 * Get default unit for a specific item type in an industry
 * @param {string} industryCode - Industry code
 * @param {string} itemType - Item type (service/product/labor/material/expense)
 * @returns {string} Default unit of measure
 */
export const getDefaultUnit = (industryCode, itemType) => {
    const preset = INDUSTRY_PRESETS_CONFIG[industryCode];
    if (!preset) return 'unit';
    return preset.defaultUnits[itemType] || 'unit';
};

/**
 * Get terminology for an item type in an industry
 * @param {string} industryCode - Industry code
 * @param {string} itemType - Item type
 * @returns {string} Terminology label
 */
export const getTerminology = (industryCode, itemType) => {
    const preset = INDUSTRY_PRESETS_CONFIG[industryCode];
    if (!preset) return itemType.charAt(0).toUpperCase() + itemType.slice(1);
    return preset.terminology[itemType] || itemType.charAt(0).toUpperCase() + itemType.slice(1);
};

/**
 * Get template items for an industry
 * @param {string} industryCode - Industry code
 * @returns {Array} Template items that can be created
 */
export const getTemplateItems = (industryCode) => {
    const preset = INDUSTRY_PRESETS_CONFIG[industryCode];
    return preset ? preset.templateItems : [];
};

/**
 * Create default items for an industry
 * Adds ID and other necessary fields for database storage
 * @param {string} industryCode - Industry code
 * @param {string} userId - User ID (optional for reference)
 * @returns {Array} Ready-to-save template items
 */
export const generateDefaultItems = (industryCode, userId = null) => {
    const templates = getTemplateItems(industryCode);
    
    return templates.map((template, index) => ({
        ...template,
        id: `template_${Date.now()}_${index}`,
        is_active: true,
        created_at: new Date().toISOString(),
        created_by: userId,
        is_template: true,
        industry: industryCode,
        // Add type-specific fields
        ...(template.item_type === 'product' && {
            sku: '',
            unit: template.default_unit,
            price: template.default_rate
        }),
        ...(template.item_type === 'service' && {
            billing_unit: template.default_unit,
            rate: template.default_rate
        }),
        ...(template.item_type === 'labor' && {
            role: template.name,
            hourly_rate: template.default_rate
        }),
        ...(template.item_type === 'material' && {
            unit_type: template.default_unit,
            cost_rate: template.default_rate
        }),
        ...(template.item_type === 'expense' && {
            cost_type: 'fixed',
            default_cost: template.default_rate
        })
    }));
};

/**
 * Get suggested items based on invoice context
 * Returns relevant templates based on what's being invoiced
 * @param {string} industryCode - Industry code
 * @param {string} itemType - Current item type being added (optional)
 * @returns {Array} Filtered template suggestions
 */
export const getSuggestedItems = (industryCode, itemType = null) => {
    const templates = getTemplateItems(industryCode);
    
    if (!itemType) {
        return templates.slice(0, 3); // Return first 3 as suggestions
    }
    
    // Filter by item type
    return templates.filter(item => item.item_type === itemType);
};

/**
 * Format industry name with icon
 * @param {string} industryCode - Industry code
 * @returns {string} Formatted industry name
 */
export const getFormattedIndustryName = (industryCode) => {
    const preset = INDUSTRY_PRESETS_CONFIG[industryCode];
    return preset ? preset.name : 'Custom';
};

export default {
    INDUSTRY_PRESETS_CONFIG,
    getIndustries,
    getIndustryPreset,
    getRecommendedItemTypes,
    getDefaultUnit,
    getTerminology,
    getTemplateItems,
    generateDefaultItems,
    getSuggestedItems,
    getFormattedIndustryName
};
