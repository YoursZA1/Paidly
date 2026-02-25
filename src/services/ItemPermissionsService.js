import { Lock, Unlock } from 'lucide-react';

/**
 * Item Permissions Service
 * Handles pricing locks, permissions, and access controls for catalog items
 * 
 * Features:
 * - Price lock enforcement (prevent accidental rate changes)
 * - Deletion prevention (items used in invoices cannot be deleted)
 * - Archive functionality (soft delete for used items)
 * - Permission checks (plan-based access controls)
 * - Audit trail helpers (track who/when/why)
 */

// ========== PRICE LOCK FUNCTIONS ==========

/**
 * Check if an item's pricing is locked
 * @param {object} item - Catalog item
 * @returns {boolean} Whether pricing is locked
 */
export const isItemPriceLocked = (item) => {
    return item?.price_locked === true;
};

/**
 * Check who locked the item and when
 * @param {object} item - Catalog item
 * @returns {object} Lock metadata
 */
export const getPriceLockMetadata = (item) => {
    if (!isItemPriceLocked(item)) {
        return null;
    }
    
    return {
        isLocked: true,
        lockedAt: item.price_locked_at || null,
        lockedBy: item.price_locked_by || 'Unknown',
        reason: item.price_locked_reason || 'No reason provided',
        lockedDate: item.price_locked_at ? new Date(item.price_locked_at).toLocaleDateString() : 'Unknown'
    };
};

/**
 * Check if a rate change is allowed for an item
 * @param {object} item - Catalog item
 * @param {number} originalRate - Current rate on item
 * @param {number} newRate - Proposed new rate
 * @returns {object} { allowed: boolean, message: string, isLocked: boolean }
 */
export const validateRateChange = (item, originalRate, newRate) => {
    if (!item) {
        return { allowed: false, message: 'Item not found', isLocked: false };
    }
    
    // Validate new rate
    if (newRate === null || newRate === undefined) {
        return { allowed: false, message: 'New rate is required', isLocked: false };
    }
    
    if (newRate < 0) {
        return { allowed: false, message: 'Rate cannot be negative', isLocked: false };
    }
    
    // Check if price is locked
    if (isItemPriceLocked(item)) {
        // Allow if rate hasn't changed (editing other fields)
        if (newRate === originalRate) {
            return {
                allowed: true,
                message: 'No rate change detected',
                isLocked: true
            };
        }
        
        const metadata = getPriceLockMetadata(item);
        return {
            allowed: false,
            message: `Item pricing is locked${metadata?.reason ? ` (${metadata.reason})` : ''}. Cannot change rate from $${originalRate.toFixed(2)}.`,
            isLocked: true,
            lockMetadata: metadata
        };
    }
    
    // Rate change is allowed
    return {
        allowed: true,
        message: 'Rate change allowed',
        isLocked: false
    };
};

/**
 * Validate rate change with percentage limits
 * @param {object} item - Catalog item
 * @param {number} originalRate - Current rate
 * @param {number} newRate - Proposed new rate
 * @param {number} maxPercentChange - Maximum allowed percent change (e.g., 10 for 10%)
 * @returns {object} Validation result
 */
export const validateRateChangeWithLimit = (item, originalRate, newRate, maxPercentChange = 10) => {
    // First check basic validation and lock status
    const basicValidation = validateRateChange(item, originalRate, newRate);
    if (!basicValidation.allowed) {
        return basicValidation;
    }
    
    // Check percentage change
    if (originalRate > 0) {
        const percentChange = Math.abs((newRate - originalRate) / originalRate * 100);
        if (percentChange > maxPercentChange) {
            return {
                allowed: false,
                message: `Rate change of ${percentChange.toFixed(1)}% exceeds limit of ${maxPercentChange}%. Contact administrator.`,
                isLocked: false,
                percentChange
            };
        }
    }
    
    return {
        allowed: true,
        message: 'Rate change within allowed limits',
        isLocked: false
    };
};

// ========== DELETION & ARCHIVE FUNCTIONS ==========

/**
 * Check if an item can be deleted
 * @param {object} item - Catalog item
 * @param {number} usageCount - Number of times item was used (default from item.usage_count)
 * @returns {object} { allowed: boolean, message: string, usageCount: number, suggestion: string }
 */
export const canDeleteItem = (item, usageCount = null) => {
    if (!item) {
        return { 
            allowed: false, 
            message: 'Item not found', 
            usageCount: 0,
            suggestion: null
        };
    }
    
    // Use provided usageCount or fall back to item.usage_count
    const count = usageCount !== null ? usageCount : (item.usage_count || 0);
    
    // Check if item has been used
    if (count > 0) {
        const itemsWord = count === 1 ? 'invoice' : 'invoices';
        return {
            allowed: false,
            message: `Cannot delete: Item is used in ${count} ${itemsWord}.`,
            usageCount: count,
            suggestion: 'Archive this item instead to preserve invoice history.'
        };
    }
    
    // Safe to delete
    return {
        allowed: true,
        message: 'Item can be safely deleted',
        usageCount: 0,
        suggestion: null
    };
};

/**
 * Check if item is already archived
 * @param {object} item - Catalog item
 * @returns {boolean} True if archived
 */
export const isItemArchived = (item) => {
    return item?.is_active === false || item?.archived_at !== null;
};

/**
 * Get archive metadata
 * @param {object} item - Catalog item
 * @returns {object|null} Archive metadata or null if not archived
 */
export const getArchiveMetadata = (item) => {
    if (!isItemArchived(item)) {
        return null;
    }
    
    return {
        isArchived: true,
        archivedAt: item.archived_at || null,
        archivedBy: item.archived_by || 'Unknown',
        reason: item.archive_reason || 'No reason provided',
        archivedDate: item.archived_at ? new Date(item.archived_at).toLocaleDateString() : 'Unknown'
    };
};

/**
 * Filter items based on deletion eligibility
 * @param {Array} items - Array of catalog items with usage_count
 * @returns {object} { deletable: Array, locked: Array }
 */
export const filterItemsByDeletability = (items) => {
    const deletable = [];
    const locked = [];
    
    items.forEach(item => {
        const check = canDeleteItem(item);
        if (check.allowed) {
            deletable.push(item);
        } else {
            locked.push({
                ...item,
                deleteReason: check.message,
                suggestion: check.suggestion
            });
        }
    });
    
    return { deletable, locked };
};

// ========== UI DISPLAY HELPERS ==========

/**
 * Format pricing lock status for UI display
 * @param {object} item - Catalog item
 * @returns {object} { isLocked: boolean, label: string, shortLabel: string, icon: string, color: string, className: string }
 */
export const getPriceLockStatus = (item) => {
    const isLocked = isItemPriceLocked(item);
    return {
        isLocked,
        label: isLocked ? 'Pricing Locked' : 'Pricing Unlocked',
        shortLabel: isLocked ? 'Locked' : 'Unlocked',
        icon: isLocked ? Lock : Unlock,
        color: isLocked ? 'orange' : 'slate',
        className: isLocked 
            ? 'bg-orange-100 border-orange-300 text-orange-700' 
            : 'bg-slate-50 border-slate-200 text-slate-600'
    };
};

/**
 * Get comprehensive item status
 * @param {object} item - Catalog item
 * @returns {object} Complete status information
 */
export const getItemStatus = (item) => {
    const lockStatus = getPriceLockStatus(item);
    const archiveStatus = getArchiveMetadata(item);
    const deleteCheck = canDeleteItem(item);
    
    return {
        isActive: item?.is_active === true,
        isArchived: isItemArchived(item),
        isPriceLocked: lockStatus.isLocked,
        canDelete: deleteCheck.allowed,
        usageCount: item?.usage_count || 0,
        lockStatus,
        archiveStatus,
        deleteCheck
    };
};

// ========== ACTION FUNCTIONS ==========

/**
 * Toggle pricing lock on an item
 * @param {object} item - Catalog item
 * @param {string} userId - User performing the action (optional)
 * @param {string} reason - Reason for lock/unlock (optional)
 * @returns {object} Updated item with toggled price_locked
 */
export const togglePriceLock = (item, userId = null, reason = null) => {
    const willBeLocked = !item.price_locked;
    
    return {
        ...item,
        price_locked: willBeLocked,
        price_locked_at: willBeLocked ? new Date().toISOString() : null,
        price_locked_by: willBeLocked ? userId : null,
        price_locked_reason: willBeLocked ? (reason || 'Locked by user') : null
    };
};

/**
 * Lock item pricing
 * @param {object} item - Catalog item
 * @param {string} reason - Reason for locking
 * @param {string} userId - User ID performing action
 * @returns {object} Updated item with locked pricing
 */
export const lockItemPricing = (item, reason = 'Locked by administrator', userId = null) => {
    return {
        ...item,
        price_locked: true,
        price_locked_at: new Date().toISOString(),
        price_locked_by: userId,
        price_locked_reason: reason
    };
};

/**
 * Unlock item pricing
 * @param {object} item - Catalog item
 * @param {string} userId - User ID performing action
 * @returns {object} Updated item with unlocked pricing
 */
export const unlockItemPricing = (item, userId = null) => {
    return {
        ...item,
        price_locked: false,
        price_locked_at: null,
        price_locked_by: null,
        price_locked_reason: null,
        unlocked_at: new Date().toISOString(),
        unlocked_by: userId
    };
};

/**
 * Archive an item (soft delete)
 * @param {object} item - Catalog item
 * @param {string} reason - Reason for archiving
 * @param {string} userId - User ID performing action
 * @returns {object} Updated item marked as archived
 */
export const archiveItem = (item, reason = 'Archived by administrator', userId = null) => {
    return {
        ...item,
        is_active: false,
        archived_at: new Date().toISOString(),
        archived_by: userId,
        archive_reason: reason
    };
};

/**
 * Restore archived item
 * @param {object} item - Archived catalog item
 * @param {string} userId - User ID performing action
 * @returns {object} Updated item marked as active
 */
export const restoreArchivedItem = (item, userId = null) => {
    return {
        ...item,
        is_active: true,
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        restored_at: new Date().toISOString(),
        restored_by: userId
    };
};

// ========== PLAN-BASED PERMISSIONS ==========

/**
 * Check if user has permission for an action based on plan
 * @param {object} user - User object with plan info
 * @param {string} action - Action to check (e.g., 'lock_pricing', 'delete_items')
 * @returns {object} { allowed: boolean, message: string }
 */
export const checkPlanPermission = (user, action) => {
    // Default permissions by plan
    const planPermissions = {
        free: ['view_items', 'create_items', 'edit_items'],
        basic: ['view_items', 'create_items', 'edit_items', 'archive_items'],
        pro: ['view_items', 'create_items', 'edit_items', 'archive_items', 'lock_pricing', 'delete_items'],
        enterprise: ['view_items', 'create_items', 'edit_items', 'archive_items', 'lock_pricing', 'delete_items', 'bulk_operations', 'advanced_permissions']
    };
    
    const userPlan = user?.plan || 'free';
    const allowedActions = planPermissions[userPlan] || planPermissions.free;
    
    if (allowedActions.includes(action)) {
        return {
            allowed: true,
            message: `${action} is allowed on ${userPlan} plan`
        };
    }
    
    return {
        allowed: false,
        message: `${action} requires upgrade to Pro plan or higher`
    };
};

/**
 * Get allowed rate adjustment percentage by plan
 * @param {object} user - User object with plan info
 * @returns {number} Maximum allowed percent change (null = unlimited)
 */
export const getRateAdjustmentLimit = (user) => {
    const planLimits = {
        free: 0,        // Cannot adjust rates
        basic: 10,      // 10% adjustment
        pro: 50,        // 50% adjustment
        enterprise: null // Unlimited
    };
    
    const userPlan = user?.plan || 'free';
    return planLimits[userPlan] ?? 0;
};

export default {
    // Price lock functions
    isItemPriceLocked,
    getPriceLockMetadata,
    validateRateChange,
    validateRateChangeWithLimit,
    
    // Deletion & archive functions
    canDeleteItem,
    isItemArchived,
    getArchiveMetadata,
    filterItemsByDeletability,
    
    // UI display helpers
    getPriceLockStatus,
    getItemStatus,
    
    // Action functions
    togglePriceLock,
    lockItemPricing,
    unlockItemPricing,
    archiveItem,
    restoreArchivedItem,
    
    // Plan-based permissions
    checkPlanPermission,
    getRateAdjustmentLimit
};
