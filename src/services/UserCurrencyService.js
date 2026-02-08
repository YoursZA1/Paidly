/**
 * User Currency Management Service
 * Handles user currency preferences - stored locally per user
 */

const STORAGE_KEY = 'breakapi_user_currencies';

class UserCurrencyService {
  /**
   * Get user's preferred currency (defaults to ZAR)
   * @param {string} userId - User ID
   * @returns {string} Currency code
   */
  static getUserCurrency(userId) {
    if (!userId) return 'ZAR';

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const currencies = stored ? JSON.parse(stored) : {};
      return currencies[userId] || 'ZAR';
    } catch (error) {
      console.error('Error getting user currency:', error);
      return 'ZAR';
    }
  }

  /**
   * Set user's preferred currency
   * System admins are always set to ZAR
   * @param {string} userId - User ID
   * @param {string} currencyCode - Currency code (e.g., 'ZAR', 'USD')
   */
  static setUserCurrency(userId, currencyCode) {
    if (!userId) return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const currencies = stored ? JSON.parse(stored) : {};
      // Force ZAR for system admins regardless of input
      currencies[userId] = currencyCode === 'ZAR' || currencyCode ? currencyCode : 'ZAR';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currencies));
    } catch (error) {
      console.error('Error setting user currency:', error);
    }
  }

  /**
   * Get admin's currency for calculations (always ZAR for admin users)
   * @returns {string} ZAR (admin base currency)
   */
  static getAdminBaseCurrency() {
    // Always ZAR for system operations
    return 'ZAR';
  }

  /**
   * Get currency for a specific user
   * System admins always get ZAR
   * @param {object} user - User object
   * @returns {string} User's currency
   */
  static getUserDisplayCurrency(user) {
    if (!user) return 'ZAR';
    // System admins always use ZAR
    if (user.isSystemAdmin || user.role === 'admin') return 'ZAR';
    return this.getUserCurrency(user.id || user.email);
  }

  /**
   * Get all user currencies
   * @returns {object} Map of userId to currency
   */
  static getAllUserCurrencies() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Error getting all user currencies:', error);
      return {};
    }
  }

  /**
   * Reset user currency to default (ZAR)
   * @param {string} userId - User ID
   */
  static resetUserCurrency(userId) {
    this.setUserCurrency(userId, 'ZAR');
  }

  /**
   * Migrate user currency from one ID to another
   * @param {string} oldUserId - Old user ID
   * @param {string} newUserId - New user ID
   */
  static migrateUserCurrency(oldUserId, newUserId) {
    const currency = this.getUserCurrency(oldUserId);
    this.setUserCurrency(newUserId, currency);
  }
}

export default UserCurrencyService;
