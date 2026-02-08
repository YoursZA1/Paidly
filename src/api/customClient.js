/**
 * Custom API Client - BreakInvoice Backend
 * Provides a flexible API for managing business entities and integrations
 */

class EntityManager {
  constructor(entityName = '', userId = null) {
    this.entityName = entityName;
    this.userId = userId;
    this.updateStorageKey();
    this.data = this.loadFromStorage();
    this.subscriptions = [];
  }

  updateStorageKey() {
    // Create user-specific storage key
    if (this.userId) {
      this.storageKey = `breakapi_${this.userId}_${this.entityName}`;
    } else {
      this.storageKey = `breakapi_guest_${this.entityName}`;
    }
  }

  setUserId(userId) {
    this.userId = userId;
    this.updateStorageKey();
    this.data = this.loadFromStorage();
    console.log(`📂 ${this.entityName} loaded from: ${this.storageKey}`);
    this.notifySubscribers();
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch {
      console.warn(`Failed to save ${this.entityName} to localStorage`);
    }
  }

  notifySubscribers() {
    this.subscriptions.forEach(cb => cb(Object.values(this.data)));
  }

  async find(query = {}) {
    // Simulated find method
    void query; // Acknowledge parameter
    return Object.values(this.data);
  }

  async findOne(id) {
    // Simulated findOne method
    return this.data[id] || null;
  }

  async get(id) {
    // Alias for findOne - fetches a single record by ID
    const record = this.data[id];
    if (!record) {
      throw new Error(`${this.entityName} with id ${id} not found`);
    }
    return record;
  }

  async list(sortBy = '') {
    // List all records, optionally sorted
    let records = Object.values(this.data);
    
    if (sortBy) {
      const field = sortBy.replace(/^-/, '');
      const isDescending = sortBy.startsWith('-');
      
      records.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        
        if (aVal < bVal) return isDescending ? 1 : -1;
        if (aVal > bVal) return isDescending ? -1 : 1;
        return 0;
      });
    }
    
    return records;
  }

  async create(data) {
    // Simulated create method with persistence
    const id = Date.now().toString();
    const record = {
      id,
      ...data,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
      is_pinned: false
    };
    
    this.data[id] = record;
    this.saveToStorage();
    this.notifySubscribers();
    return record;
  }

  async update(id, data) {
    // Simulated update method with persistence
    if (!this.data[id]) {
      throw new Error(`${this.entityName} with id ${id} not found`);
    }
    
    const record = {
      ...this.data[id],
      ...data,
      updated_date: new Date().toISOString()
    };
    
    this.data[id] = record;
    this.saveToStorage();
    this.notifySubscribers();
    return record;
  }

  async delete(id) {
    // Simulated delete method with persistence
    if (this.data[id]) {
      delete this.data[id];
      this.saveToStorage();
      this.notifySubscribers();
    }
    return { success: true };
  }

  subscribe(callback) {
    this.subscriptions.push(callback);
    return () => {
      this.subscriptions = this.subscriptions.filter(cb => cb !== callback);
    };
  }
}

class AuthManager {
  constructor() {
    this.user = null;
    this.isAuthenticated = false;
    this.loadUserFromStorage();
  }

  loadUserFromStorage() {
    try {
      const stored = localStorage.getItem('breakapi_user');
      if (stored) {
        this.user = JSON.parse(stored);
        this.isAuthenticated = !!this.user;
      }
    } catch {
      // Failed to load user from storage
    }
  }

  saveUserToStorage() {
    try {
      if (this.user) {
        localStorage.setItem('breakapi_user', JSON.stringify(this.user));
      }
    } catch {
      console.warn('Failed to save user to localStorage');
    }
  }

  generateUserId(email) {
    // Generate a consistent user ID from email
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `user_${Math.abs(hash).toString(36)}`;
  }

  async login(credentials) {
    // Simulated login method
    const email = (credentials.email || '').trim().toLowerCase();
    const adminAllowlist = ['admin@invoicebreek.com'];
    const isAdminEmail = adminAllowlist.includes(email);

    if (credentials.role === 'admin' && !isAdminEmail) {
      throw new Error('Admin access is restricted to approved accounts.');
    }

    const userId = this.generateUserId(email);
    console.log(`👤 User login: ${email} → Database ID: ${userId}`);

    this.isAuthenticated = true;
    this.user = {
      id: userId,
      email,
      role: isAdminEmail ? 'admin' : 'user',
      full_name: credentials.full_name || credentials.email?.split('@')[0] || 'User',
      company_name: credentials.company_name || 'Company Name',
      company_address: credentials.company_address || '',
      currency: credentials.currency || 'ZAR',
      timezone: credentials.timezone || 'UTC',
      logo_url: '',
      plan: credentials.plan || 'free' // Default to free plan
    };
    this.saveUserToStorage();
    return this.user;
  }

  async logout() {
    this.isAuthenticated = false;
    this.user = null;
    localStorage.removeItem('breakapi_user');
  }

  async me() {
    // Return current user if authenticated
    if (this.user && this.isAuthenticated) {
      return this.user;
    }
    throw new Error('Not authenticated');
  }

  async getCurrentUser() {
    return this.user;
  }

  async updateMyUserData(data) {
    // Update current user data
    if (!this.user) {
      this.user = {};
    }
    this.user = {
      ...this.user,
      ...data,
      id: this.user.id || '1'
    };
    this.saveUserToStorage();
    return this.user;
  }

  isAuth() {
    return this.isAuthenticated;
  }
}

class IntegrationManager {
  constructor() {
    this.Core = {
      InvokeLLM: async (prompt) => {
        void prompt; // Acknowledge parameter
        console.warn('InvokeLLM not implemented in custom client');
        return null;
      },
      SendEmail: async (emailConfig) => {
        void emailConfig; // Acknowledge parameter
        console.warn('SendEmail not implemented in custom client');
        return { success: true };
      },
      UploadFile: async ({ file }) => {
        console.log('UploadFile called with file:', file?.name);
        if (!file) {
          throw new Error('No file provided');
        }
        // Create a blob URL for preview
        const file_url = URL.createObjectURL(file);
        console.log('Generated file_url:', file_url);
        return { file_url };
      },
      GenerateImage: async (prompt) => {
        void prompt; // Acknowledge parameter
        console.warn('GenerateImage not implemented in custom client');
        return null;
      },
      ExtractDataFromUploadedFile: async (file) => {
        void file; // Acknowledge parameter
        console.warn('ExtractDataFromUploadedFile not implemented in custom client');
        return null;
      },
      CreateFileSignedUrl: async (fileId) => {
        void fileId; // Acknowledge parameter
        console.warn('CreateFileSignedUrl not implemented in custom client');
        return null;
      },
      UploadPrivateFile: async ({ file }) => {
        console.log('UploadPrivateFile called with file:', file?.name);
        if (!file) {
          throw new Error('No file provided');
        }
        const file_url = URL.createObjectURL(file);
        return { file_url };
      }
    };
  }
}

class CustomAPIClient {
  constructor(config = {}) {
    this.config = config;
    this.auth = new AuthManager();
    this.integrations = new IntegrationManager();
    this.entities = this.createEntities();
    this.setupAuthListener();
  }

  setupAuthListener() {
    // Listen for user changes and update entity managers
    const originalLogin = this.auth.login.bind(this.auth);
    const originalLogout = this.auth.logout.bind(this.auth);

    this.auth.login = async (credentials) => {
      const user = await originalLogin(credentials);
      this.updateEntitiesForUser(user.id);
      return user;
    };

    this.auth.logout = async () => {
      await originalLogout();
      this.updateEntitiesForUser(null);
    };

    // Update entities if user already logged in
    if (this.auth.user) {
      this.updateEntitiesForUser(this.auth.user.id);
    }
  }

  updateEntitiesForUser(userId) {
    // Update all entity managers with new user ID
    console.log(`🔄 Switching to ${userId ? `user database: ${userId}` : 'guest mode'}`);
    Object.values(this.entities).forEach(entity => {
      if (entity && typeof entity.setUserId === 'function') {
        entity.setUserId(userId);
      }
    });
  }

  createEntities() {
    const entityNames = [
      'Client',
      'BankingDetail',
      'Invoice',
      'Note',
      'Service',
      'Quote',
      'PaymentReminder',
      'RecurringInvoice',
      'Package',
      'InvoiceView',
      'Payslip',
      'Notification',
      'Expense',
      'Payroll',
      'Task',
      'Message',
      'TaskAssignmentRule',
      'QuoteTemplate',
      'QuoteReminder',
      'Vendor',
      'Budget',
      'Payment'
    ];

    const userId = this.auth.user ? this.auth.user.id : null;
    const entities = {};
    entityNames.forEach(name => {
      entities[name] = new EntityManager(name, userId);
    });
    return entities;
  }

  setAuth(token) {
    // Method to set authentication token
    this.token = token;
  }

  isReady() {
    return true;
  }
}

export const createClient = (config) => {
  return new CustomAPIClient(config);
};

export const customClient = createClient({
  appId: "6887a9d49af4acc63ae9062f",
  requiresAuth: true
});
