import { Sparkles, Star, BarChart3, MapPin, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';

/**
 * Item Usage Service
 * Tracks item usage across invoices and prevents deletion of used items
 * 
 * Features:
 * - Usage count tracking (how many times item appears in line items)
 * - Last used date tracking
 * - Deletion safety validation (prevent deleting used items)
 * - Usage statistics and analytics
 * - Batch operations for multiple items
 * - Usage badge generation for UI display
 * - Archive recommendations
 * 
 * Integration Points:
 * - Called when invoice line items are created/saved
 * - Used by deletion handlers to prevent data loss
 * - Powers usage analytics and reports
 */

// ========== DATABASE QUERY FUNCTIONS ==========
// TODO: Replace with actual database queries when backend is ready

/**
 * Get usage count for an item
 * Queries the database for count of invoice line items using this catalog item
 * @param {string} itemId - Catalog item ID
 * @returns {Promise<number>} Number of invoice line items using this item
 */
export const getItemUsageCount = async (itemId) => {
    if (!itemId) {
        console.warn('getItemUsageCount: No itemId provided');
        return 0;
    }
    
    // TODO: Implement actual database query
    // const query = 'SELECT COUNT(*) FROM invoice_items WHERE catalog_item_id = ?';
    // const result = await db.query(query, [itemId]);
    // return result.count;
    
    // Mock implementation - returns 0 for now
    return 0;
};

/**
 * Get all invoices that use a specific item
 * Returns detailed invoice information for items that reference this catalog item
 * @param {string} itemId - Catalog item ID
 * @returns {Promise<Array>} Array of invoices using this item
 */
export const getInvoicesUsingItem = async (itemId) => {
    if (!itemId) {
        console.warn('getInvoicesUsingItem: No itemId provided');
        return [];
    }
    
    // TODO: Implement actual database query
    // const query = `
    //   SELECT DISTINCT i.* 
    //   FROM invoices i
    //   JOIN invoice_items ii ON i.id = ii.invoice_id
    //   WHERE ii.catalog_item_id = ?
    //   ORDER BY i.created_at DESC
    // `;
    // const invoices = await db.query(query, [itemId]);
    // return invoices;
    
    // Mock implementation
    return [];
};

/**
 * Get usage count for multiple items efficiently
 * Batch query to get usage counts for multiple items at once
 * @param {Array<string>} itemIds - Array of catalog item IDs
 * @returns {Promise<Object>} Map of itemId to usage count
 */
export const getBatchUsageCounts = async (itemIds) => {
    if (!itemIds || itemIds.length === 0) {
        return {};
    }
    
    try {
        // TODO: Implement batch query
        // const query = `
        //   SELECT catalog_item_id, COUNT(*) as count
        //   FROM invoice_items
        //   WHERE catalog_item_id IN (?)
        //   GROUP BY catalog_item_id
        // `;
        // const results = await db.query(query, [itemIds]);
        // return results.reduce((map, row) => {
        //   map[row.catalog_item_id] = row.count;
        //   return map;
        // }, {});
        
        // Mock implementation
        return itemIds.reduce((map, id) => {
            map[id] = 0;
            return map;
        }, {});
    } catch (error) {
        console.error('Error getting batch usage counts:', error);
        return {};
    }
};

// ========== USAGE TRACKING FUNCTIONS ==========

/**
 * Track usage of an item (called when item is added to invoice line item)
 * Updates last_used_date and increments usage_count
 * @param {string} itemId - Catalog item ID
 * @param {string} invoiceId - Invoice ID where item was used (optional)
 * @returns {Promise<object>} Updated item or null if error
 */
export const recordItemUsage = async (itemId, invoiceId = null) => {
    if (!itemId) {
        console.warn('recordItemUsage: No itemId provided');
        return null;
    }
    
    try {
        // TODO: Implement actual database update
        // const query = `
        //   UPDATE catalog_items 
        //   SET last_used_date = NOW(), 
        //       usage_count = COALESCE(usage_count, 0) + 1
        //   WHERE id = ?
        //   RETURNING *
        // `;
        // const updatedItem = await db.query(query, [itemId]);
        // return updatedItem;
        
        // Mock implementation
        return {
            id: itemId,
            last_used_date: new Date().toISOString(),
            usage_count: 1,
            invoiceId
        };
    } catch (error) {
        console.error(`Error recording usage for item ${itemId}:`, error);
        return null;
    }
};

/**
 * Decrement usage count (called when line item is deleted)
 * @param {string} itemId - Catalog item ID
 * @returns {Promise<object>} Updated item or null if error
 */
export const decrementItemUsage = async (itemId) => {
    if (!itemId) {
        console.warn('decrementItemUsage: No itemId provided');
        return null;
    }
    
    try {
        // TODO: Implement actual database update
        // const query = `
        //   UPDATE catalog_items 
        //   SET usage_count = GREATEST(COALESCE(usage_count, 0) - 1, 0)
        //   WHERE id = ?
        //   RETURNING *
        // `;
        // const updatedItem = await db.query(query, [itemId]);
        // return updatedItem;
        
        // Mock implementation
        return {
            id: itemId,
            usage_count: 0
        };
    } catch (error) {
        console.error(`Error decrementing usage for item ${itemId}:`, error);
        return null;
    }
};

/**
 * Sync usage count from actual invoice items
 * Recalculates usage_count based on actual database records
 * @param {string} itemId - Catalog item ID
 * @returns {Promise<number>} Actual usage count
 */
export const syncUsageCount = async (itemId) => {
    if (!itemId) {
        return 0;
    }
    
    try {
        const actualCount = await getItemUsageCount(itemId);
        
        // TODO: Update catalog item with actual count
        // const query = `
        //   UPDATE catalog_items 
        //   SET usage_count = ?
        //   WHERE id = ?
        // `;
        // await db.query(query, [actualCount, itemId]);
        
        return actualCount;
    } catch (error) {
        console.error(`Error syncing usage count for item ${itemId}:`, error);
        return 0;
    }
};

// ========== STATISTICS & ANALYTICS FUNCTIONS ==========

/**
 * Get usage statistics for an item
 * @param {object} item - Catalog item with usage tracking fields
 * @returns {object} Comprehensive usage statistics
 */
export const getUsageStats = (item) => {
    const usageCount = item?.usage_count || 0;
    const lastUsedDate = item?.last_used_date ? new Date(item.last_used_date) : null;
    const createdDate = item?.created_at ? new Date(item.created_at) : null;
    
    // Calculate time-based metrics
    const daysSinceCreation = createdDate 
        ? Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
    
    const daysSinceLastUse = lastUsedDate
        ? Math.floor((Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;
    
    const avgUsagePerMonth = daysSinceCreation > 30
        ? (usageCount / daysSinceCreation) * 30
        : usageCount;
    
    // Format labels
    const lastUsedLabel = lastUsedDate 
        ? lastUsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Never';
    
    const relativeLastUsed = daysSinceLastUse !== null
        ? daysSinceLastUse === 0 ? 'Today'
        : daysSinceLastUse === 1 ? 'Yesterday'
        : daysSinceLastUse < 7 ? `${daysSinceLastUse} days ago`
        : daysSinceLastUse < 30 ? `${Math.floor(daysSinceLastUse / 7)} weeks ago`
        : `${Math.floor(daysSinceLastUse / 30)} months ago`
        : 'Never';
    
    return {
        count: usageCount,
        label: `Used ${usageCount} time${usageCount !== 1 ? 's' : ''}`,
        lastUsedLabel,
        relativeLastUsed,
        daysSinceLastUse,
        daysSinceCreation,
        avgUsagePerMonth: parseFloat(avgUsagePerMonth.toFixed(2)),
        
        // Boolean flags
        isUsed: usageCount > 0,
        isFresh: usageCount === 0,
        isPopular: usageCount >= 5,
        isFrequent: usageCount >= 10,
        isStale: daysSinceLastUse !== null && daysSinceLastUse > 90,
        isRecent: daysSinceLastUse !== null && daysSinceLastUse <= 7
    };
};

/**
 * Get formatted usage badge for UI display
 * @param {object} item - Catalog item
 * @returns {object} Badge configuration with styling
 */
export const getUsageBadge = (item) => {
    const stats = getUsageStats(item);
    
    // Not used yet
    if (stats.count === 0) {
        return {
            show: false,
            label: 'Unused',
            shortLabel: 'New',
            icon: Sparkles,
            color: 'blue',
            className: 'bg-primary/10 border-primary/20 text-primary'
        };
    }
    
    // Frequently used (10+ times)
    if (stats.isFrequent) {
        return {
            show: true,
            label: `${stats.count}x (Frequently Used)`,
            shortLabel: `${stats.count}x`,
            icon: Star,
            color: 'yellow',
            className: 'bg-yellow-50 border-yellow-200 text-yellow-700'
        };
    }
    
    // Popular (5+ times)
    if (stats.isPopular) {
        return {
            show: true,
            label: `${stats.count}x (Popular)`,
            shortLabel: `${stats.count}x`,
            icon: BarChart3,
            color: 'purple',
            className: 'bg-purple-50 border-purple-200 text-purple-700'
        };
    }
    
    // Used a few times
    return {
        show: true,
        label: `${stats.count}x`,
        shortLabel: `${stats.count}x`,
        icon: MapPin,
        color: 'slate',
        className: 'bg-slate-50 border-slate-200 text-slate-700'
    };
};

/**
 * Get usage trend indicator (increasing, stable, decreasing)
 * Compares recent usage vs historical average
 * @param {object} item - Catalog item
 * @param {number} recentDays - Number of recent days to analyze (default 30)
 * @returns {object} Trend information
 */
export const getUsageTrend = (item, recentDays = 30) => {
    const stats = getUsageStats(item);
    
    if (stats.isRecent && stats.avgUsagePerMonth > 2) {
        return {
            direction: 'up',
            label: 'Growing',
            icon: ArrowUp,
            color: 'green',
            change: stats.avgUsagePerMonth,
            message: `Used frequently (${stats.avgUsagePerMonth.toFixed(1)}/month)`,
            analysisWindow: recentDays
        };
    }
    
    if (stats.isStale) {
        return {
            direction: 'down',
            label: 'Declining',
            icon: ArrowDown,
            color: 'orange',
            change: -stats.avgUsagePerMonth,
            message: 'Not used recently',
            analysisWindow: recentDays
        };
    }
    
    return {
        direction: 'stable',
        label: 'Stable',
        icon: ArrowRight,
        color: 'slate',
        change: 0,
        message: 'Usage is stable',
        analysisWindow: recentDays
    };
};

/**
 * Get top used items
 * @param {Array} items - Array of catalog items
 * @param {number} limit - Number of top items to return (default 10)
 * @returns {Array} Top items sorted by usage count
 */
export const getTopUsedItems = (items, limit = 10) => {
    return items
        .filter(item => (item.usage_count || 0) > 0)
        .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
        .slice(0, limit)
        .map(item => ({
            ...item,
            stats: getUsageStats(item),
            badge: getUsageBadge(item)
        }));
};

/**
 * Get least used items (candidates for archiving)
 * @param {Array} items - Array of catalog items
 * @param {number} limit - Number of items to return (default 10)
 * @returns {Array} Least used items
 */
export const getLeastUsedItems = (items, limit = 10) => {
    return items
        .filter(item => item.is_active !== false) // Only active items
        .sort((a, b) => (a.usage_count || 0) - (b.usage_count || 0))
        .slice(0, limit)
        .map(item => ({
            ...item,
            stats: getUsageStats(item),
            shouldArchive: (item.usage_count || 0) === 0 && getUsageStats(item).daysSinceCreation > 90
        }));
};

/**
 * Get stale items (not used recently)
 * @param {Array} items - Array of catalog items
 * @param {number} daysSinceLastUse - Days threshold (default 90)
 * @returns {Array} Stale items
 */
export const getStaleItems = (items, daysSinceLastUse = 90) => {
    return items
        .filter(item => {
            const stats = getUsageStats(item);
            return stats.isUsed && stats.daysSinceLastUse !== null && stats.daysSinceLastUse >= daysSinceLastUse;
        })
        .map(item => ({
            ...item,
            stats: getUsageStats(item)
        }));
};

// ========== DELETION SAFETY FUNCTIONS ==========

/**
 * Check if item can be safely deleted based on usage
 * @param {object} item - Catalog item
 * @returns {object} Deletion safety information
 */
export const checkDeletionSafety = (item) => {
    const usageCount = item?.usage_count || 0;
    const stats = getUsageStats(item);
    
    if (usageCount === 0) {
        return {
            canDelete: true,
            reason: null,
            isDeletable: true,
            usageCount: 0,
            recommendation: 'Safe to delete - item has never been used'
        };
    }
    
    const itemsWord = usageCount === 1 ? 'invoice' : 'invoices';
    
    return {
        canDelete: false,
        reason: `Item has been used in ${usageCount} ${itemsWord}.`,
        isDeletable: false,
        usageCount,
        recommendation: stats.isStale 
            ? `Item hasn't been used in ${stats.daysSinceLastUse} days. Consider archiving.`
            : 'Archive instead of deleting to preserve invoice history.',
        lastUsed: stats.lastUsedLabel
    };
};

/**
 * Get deletion safety check for multiple items
 * @param {Array} items - Array of catalog items
 * @returns {object} { safe: Array, unsafe: Array, summary: object }
 */
export const checkItemsDeletionSafety = (items) => {
    const safe = [];
    const unsafe = [];
    
    items.forEach(item => {
        const check = checkDeletionSafety(item);
        if (check.canDelete) {
            safe.push(item);
        } else {
            unsafe.push({
                ...item,
                deletionReason: check.reason,
                recommendation: check.recommendation
            });
        }
    });
    
    return { 
        safe, 
        unsafe,
        summary: {
            total: items.length,
            canDelete: safe.length,
            cannotDelete: unsafe.length,
            percentSafe: items.length > 0 ? Math.round((safe.length / items.length) * 100) : 0
        }
    };
};

// ========== REPORTING FUNCTIONS ==========

/**
 * Generate usage report for an item
 * @param {object} item - Catalog item
 * @returns {object} Comprehensive usage report
 */
export const generateUsageReport = (item) => {
    const stats = getUsageStats(item);
    const badge = getUsageBadge(item);
    const deletionCheck = checkDeletionSafety(item);
    
    return {
        itemName: item?.name || 'Unknown',
        itemType: item?.item_type || 'unknown',
        usageCount: stats.count,
        lastUsed: stats.lastUsedLabel,
        relativeLastUsed: stats.relativeLastUsed,
        canDelete: deletionCheck.canDelete,
        recommendation: deletionCheck.recommendation,
        badge: badge.label,
        
        // Categorization
        category: stats.isFresh ? 'Unused'
                : stats.isFrequent ? 'Frequently Used'
                : stats.isPopular ? 'Popular'
                : stats.isStale ? 'Stale'
                : 'Active',
        
        // Detailed summary
        summary: stats.count === 0
            ? 'This item has never been used and can be safely deleted.'
            : `This item has been used ${stats.count} time${stats.count !== 1 ? 's' : ''}. ${stats.lastUsedLabel ? `Last used on ${stats.lastUsedLabel}.` : ''} ${deletionCheck.recommendation}`,
        
        // Usage metrics
        metrics: {
            totalUses: stats.count,
            avgUsagePerMonth: stats.avgUsagePerMonth,
            daysSinceCreation: stats.daysSinceCreation,
            daysSinceLastUse: stats.daysSinceLastUse,
            isActive: stats.isRecent,
            isStale: stats.isStale
        }
    };
};

/**
 * Generate usage summary for multiple items
 * @param {Array} items - Array of catalog items
 * @returns {object} Summary statistics
 */
export const generateUsageSummary = (items) => {
    const totalItems = items.length;
    const usedItems = items.filter(item => (item.usage_count || 0) > 0);
    const unusedItems = items.filter(item => (item.usage_count || 0) === 0);
    
    const totalUsageCount = items.reduce((sum, item) => sum + (item.usage_count || 0), 0);
    const avgUsagePerItem = totalItems > 0 ? totalUsageCount / totalItems : 0;
    
    // Get top and bottom performers
    const topUsed = getTopUsedItems(items, 5);
    const leastUsed = getLeastUsedItems(items, 5);
    const staleItems = getStaleItems(items, 90);
    
    return {
        overview: {
            totalItems,
            usedItems: usedItems.length,
            unusedItems: unusedItems.length,
            totalUsageCount,
            avgUsagePerItem: parseFloat(avgUsagePerItem.toFixed(2)),
            percentUsed: totalItems > 0 ? Math.round((usedItems.length / totalItems) * 100) : 0
        },
        insights: {
            topUsed: topUsed.length,
            leastUsed: leastUsed.length,
            staleItems: staleItems.length,
            candidatesForArchiving: unusedItems.filter(item => {
                const stats = getUsageStats(item);
                return stats.daysSinceCreation > 90;
            }).length
        },
        items: {
            mostUsed: topUsed,
            leastUsed,
            stale: staleItems,
            unused: unusedItems.map(item => ({
                ...item,
                stats: getUsageStats(item)
            }))
        }
    };
};

export default {
    // Database query functions
    getItemUsageCount,
    getInvoicesUsingItem,
    getBatchUsageCounts,
    
    // Usage tracking functions
    recordItemUsage,
    decrementItemUsage,
    syncUsageCount,
    
    // Statistics & analytics functions
    getUsageStats,
    getUsageBadge,
    getUsageTrend,
    getTopUsedItems,
    getLeastUsedItems,
    getStaleItems,
    
    // Deletion safety functions
    checkDeletionSafety,
    checkItemsDeletionSafety,
    
    // Reporting functions
    generateUsageReport,
    generateUsageSummary
};
