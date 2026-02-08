import * as XLSX from 'xlsx';

/**
 * ExcelUserService - Manages user data persistence to Excel files
 * Stores user accounts created in the system to an Excel workbook
 */

const USERS_STORAGE_KEY = 'breakapi_users_data';
const USERS_FILE_NAME = 'users.xlsx';

class ExcelUserService {
  constructor() {
    this.users = this.loadFromStorage();
  }

  /**
   * Load users from localStorage (Excel-like data structure)
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(USERS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading users from storage:', error);
      return [];
    }
  }

  /**
   * Save users to localStorage
   */
  saveToStorage() {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(this.users));
    } catch (error) {
      console.error('Error saving users to storage:', error);
    }
  }

  /**
   * Create a new user account
   * @param {Object} userData - User data object
   * @returns {Object} Created user with ID and timestamps
   */
  createUser(userData) {
    const now = new Date().toISOString();
    const user = {
      id: `user_${Date.now()}`,
      email: userData.email,
      full_name: userData.full_name,
      display_name: userData.display_name || userData.full_name,
      company_name: userData.company_name || '',
      company_address: userData.company_address || '',
      role: userData.role || 'user',
      status: userData.status || 'active',
      plan: userData.plan || 'free',
      currency: userData.currency || 'ZAR',
      timezone: userData.timezone || 'UTC',
      phone: userData.phone || '',
      trial_started_at: userData.trial_started_at || null,
      trial_ends_at: userData.trial_ends_at || null,
      created_at: now,
      updated_at: now,
      subscription_amount: userData.subscription_amount || 0,
      plan_history: [userData.plan || 'free'],
      previously_trial: false,
      suspension_reason: null
    };

    // Check for duplicate email
    if (this.users.some(u => u.email === user.email)) {
      throw new Error('User with this email already exists');
    }

    this.users.push(user);
    this.saveToStorage();

    return user;
  }

  /**
   * Import users from Excel rows
   * @param {Array} rows - Excel rows
   * @param {Object} options - import options
   * @param {boolean} options.overwrite - replace existing users
   * @returns {number} count of imported users
   */
  importUsersFromExcel(rows = [], { overwrite = false } = {}) {
    const normalized = rows
      .filter(row => row && row.email)
      .map(row => ({
        id: row.id || `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        email: row.email,
        full_name: row.full_name || row.name || '',
        display_name: row.display_name || row.full_name || row.name || '',
        company_name: row.company_name || '',
        company_address: row.company_address || '',
        role: row.role || 'user',
        status: row.status || 'active',
        plan: row.plan || 'free',
        currency: row.currency || 'ZAR',
        timezone: row.timezone || 'UTC',
        phone: row.phone || '',
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        last_login: row.last_login || row.updated_at || row.created_at || new Date().toISOString(),
        subscription_amount: row.subscription_amount || 0,
        plan_history: row.plan_history || [row.plan || 'free'],
        previously_trial: row.previously_trial || false,
        suspension_reason: row.suspension_reason || null
      }));

    if (overwrite) {
      this.users = normalized;
      this.saveToStorage();
      return normalized.length;
    }

    const existingEmails = new Set(this.users.map(u => u.email));
    const toAdd = normalized.filter(u => !existingEmails.has(u.email));
    if (toAdd.length > 0) {
      this.users = [...this.users, ...toAdd];
      this.saveToStorage();
    }
    return toAdd.length;
  }

  /**
   * Get all users
   * @returns {Array} Array of all users
   */
  getAllUsers() {
    return [...this.users];
  }

  /**
   * Get user by ID
   * @param {String} userId - User ID
   * @returns {Object|null} User object or null
   */
  getUserById(userId) {
    return this.users.find(u => u.id === userId) || null;
  }

  /**
   * Get user by email
   * @param {String} email - User email
   * @returns {Object|null} User object or null
   */
  getUserByEmail(email) {
    return this.users.find(u => u.email === email) || null;
  }

  /**
   * Update user
   * @param {String} userId - User ID
   * @param {Object} updates - Updates to apply
   * @returns {Object} Updated user
   */
  updateUser(userId, updates) {
    const index = this.users.findIndex(u => u.id === userId);
    if (index === -1) {
      throw new Error('User not found');
    }

    this.users[index] = {
      ...this.users[index],
      ...updates,
      updated_at: new Date().toISOString()
    };

    this.saveToStorage();
    return this.users[index];
  }

  /**
   * Delete user
   * @param {String} userId - User ID
   * @returns {Boolean} Success
   */
  deleteUser(userId) {
    const index = this.users.findIndex(u => u.id === userId);
    if (index === -1) {
      throw new Error('User not found');
    }

    this.users.splice(index, 1);
    this.saveToStorage();
    return true;
  }

  /**
   * Export users to Excel file
   * @returns {Blob} Excel file blob
   */
  exportToExcel() {
    const worksheet = XLSX.utils.json_to_sheet(this.users);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // id
      { wch: 25 }, // email
      { wch: 20 }, // full_name
      { wch: 20 }, // display_name
      { wch: 20 }, // company_name
      { wch: 30 }, // company_address
      { wch: 10 }, // role
      { wch: 12 }, // status
      { wch: 12 }, // plan
      { wch: 8 },  // currency
      { wch: 12 }, // timezone
      { wch: 15 }, // phone
      { wch: 25 }, // created_at
      { wch: 25 }, // updated_at
      { wch: 12 }, // subscription_amount
    ];

    return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  }

  /**
   * Download Excel file
   */
  downloadExcel() {
    const excelData = this.exportToExcel();
    const blob = new Blob([excelData], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${USERS_FILE_NAME}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import users from Excel file
   * @param {File} file - Excel file
   * @returns {Array} Imported users
   */
  async importFromExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          // Add imported users to existing users
          jsonData.forEach(userData => {
            const existingUser = this.users.find(u => u.email === userData.email);
            if (!existingUser) {
              this.users.push({
                ...userData,
                created_at: userData.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            }
          });

          this.saveToStorage();
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Get user statistics
   * @returns {Object} User statistics
   */
  getStats() {
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      totalUsers: this.users.length,
      activeUsers: this.users.filter(u => u.status === 'active').length,
      suspendedUsers: this.users.filter(u => u.status === 'suspended').length,
      trialUsers: this.users.filter(u => u.plan === 'trial' || u.plan === 'free').length,
      paidUsers: this.users.filter(u => u.plan !== 'free' && u.plan !== 'trial').length,
      newUsersThisMonth: this.users.filter(u => {
        const createdDate = new Date(u.created_at);
        return createdDate >= oneMonthAgo && createdDate <= now;
      }).length,
      usersByPlan: this.users.reduce((acc, u) => {
        acc[u.plan] = (acc[u.plan] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

// Export singleton instance
export const userService = new ExcelUserService();

// Also export the class for testing
export default ExcelUserService;
