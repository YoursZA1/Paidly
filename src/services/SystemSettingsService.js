/**
 * System Settings Service
 * Manages platform-wide configuration and settings for system admins
 *
 * Security: persisted data lives in localStorage. The `integrations` section includes fields
 * named like secretKey / clientSecret — these are for local/demo UI only. Do not put production
 * API secrets here; use server environment variables or a secrets manager instead.
 */

const STORAGE_KEY = 'breakapi_system_settings';

/** Field names that must never be persisted to localStorage in production builds. */
const INTEGRATION_SECRET_FIELDS = ['secretKey', 'webhookSecret', 'clientSecret', 'apiKey'];

function isProductionBuild() {
  return typeof import.meta !== 'undefined' && import.meta.env?.PROD === true;
}

/**
 * Clears sensitive integration values (Stripe secret, PayPal secret, Mailgun key, etc.).
 * In production, secrets must live in server env or a secrets manager — not the browser.
 */
function stripIntegrationSecrets(integrations) {
  if (!integrations || typeof integrations !== 'object') return integrations;
  const out = { ...integrations };
  for (const provider of Object.keys(out)) {
    const block = out[provider];
    if (!block || typeof block !== 'object') continue;
    const next = { ...block };
    for (const field of INTEGRATION_SECRET_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(next, field) && next[field]) {
        next[field] = '';
      }
    }
    out[provider] = next;
  }
  return out;
}

// Default system settings
const DEFAULT_SETTINGS = {
  // General System Settings
  system: {
    siteName: 'Paidly',
    siteDescription: 'Professional Invoice Management Platform',
    adminEmail: 'Accounts@paidly.co.za',
    supportEmail: 'support@paidly.co.za',
    maintenanceMode: false,
    maintenanceMessage: 'We are currently performing scheduled maintenance. We\'ll be back shortly.',
    allowUserRegistration: true,
    requireEmailVerification: false,
    sessionTimeout: 30, // minutes
    maxLoginAttempts: 5,
    timeZone: 'Africa/Johannesburg',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h'
  },

  // Email Templates
  emailTemplates: {
    welcome: {
      subject: 'Welcome to {{siteName}}!',
      body: 'Hi {{userName}},\n\nWelcome to {{siteName}}! We\'re excited to have you on board.\n\nGet started by creating your first invoice or exploring our features.\n\nBest regards,\nThe {{siteName}} Team'
    },
    invoiceCreated: {
      subject: 'New Invoice #{{invoiceNumber}}',
      body: 'Hi {{clientName}},\n\nA new invoice has been created for you.\n\nInvoice Number: {{invoiceNumber}}\nAmount: {{amount}}\nDue Date: {{dueDate}}\n\nView your invoice: {{invoiceLink}}\n\nBest regards,\n{{companyName}}'
    },
    invoiceReminder: {
      subject: 'Payment Reminder - Invoice #{{invoiceNumber}}',
      body: 'Hi {{clientName}},\n\nThis is a friendly reminder that invoice #{{invoiceNumber}} is due on {{dueDate}}.\n\nAmount Due: {{amount}}\n\nPlease make payment at your earliest convenience.\n\nView invoice: {{invoiceLink}}\n\nThank you,\n{{companyName}}'
    },
    invoiceOverdue: {
      subject: 'Overdue Invoice #{{invoiceNumber}}',
      body: 'Hi {{clientName}},\n\nInvoice #{{invoiceNumber}} is now overdue.\n\nOriginal Due Date: {{dueDate}}\nAmount Due: {{amount}}\n\nPlease arrange payment as soon as possible.\n\nView invoice: {{invoiceLink}}\n\nThank you,\n{{companyName}}'
    },
    paymentReceived: {
      subject: 'Payment Received - Invoice #{{invoiceNumber}}',
      body: 'Hi {{clientName}},\n\nThank you! We have received your payment for invoice #{{invoiceNumber}}.\n\nAmount Paid: {{amount}}\nPayment Date: {{paymentDate}}\n\nView receipt: {{invoiceLink}}\n\nThank you for your business,\n{{companyName}}'
    },
    passwordReset: {
      subject: 'Reset Your Password',
      body: 'Hi {{userName}},\n\nYou requested to reset your password. Click the link below to reset it:\n\n{{resetLink}}\n\nThis link will expire in 1 hour.\n\nIf you didn\'t request this, please ignore this email.\n\nBest regards,\nThe {{siteName}} Team'
    },
    accountDisabled: {
      subject: 'Account Status Update',
      body: 'Hi {{userName}},\n\nYour account has been temporarily disabled by an administrator.\n\nReason: {{reason}}\n\nIf you believe this is a mistake, please contact support at {{supportEmail}}.\n\nBest regards,\nThe {{siteName}} Team'
    }
  },

  // Document Numbering Rules
  documentNumbering: {
    invoice: {
      prefix: 'INV',
      format: 'PREFIX-YYYYMMDD-SEQ', // Options: PREFIX-SEQ, PREFIX-YYYYMMDD-SEQ, PREFIX-YYYYMMDD-INITIALS-SEQ
      startNumber: 1,
      padding: 3, // Number of digits (e.g., 001, 002)
      resetPeriod: 'yearly', // Options: never, daily, monthly, yearly
      includeClientInitials: false,
      separator: '-'
    },
    quote: {
      prefix: 'QUO',
      format: 'PREFIX-YYYYMMDD-SEQ',
      startNumber: 1,
      padding: 3,
      resetPeriod: 'yearly',
      includeClientInitials: false,
      separator: '-'
    },
    receipt: {
      prefix: 'REC',
      format: 'PREFIX-YYYYMMDD-SEQ',
      startNumber: 1,
      padding: 3,
      resetPeriod: 'yearly',
      includeClientInitials: false,
      separator: '-'
    },
    creditNote: {
      prefix: 'CN',
      format: 'PREFIX-YYYYMMDD-SEQ',
      startNumber: 1,
      padding: 3,
      resetPeriod: 'yearly',
      includeClientInitials: false,
      separator: '-'
    }
  },

  // Default Currency & Tax Settings
  defaults: {
    currency: 'ZAR',
    currencySymbol: 'R',
    currencyPosition: 'before', // before or after
    decimalPlaces: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    taxEnabled: true,
    taxName: 'VAT',
    taxRate: 15, // Percentage
    taxNumber: '',
    taxInclusive: false, // Tax inclusive or exclusive by default
    paymentTerms: 30, // Default payment terms in days
    latePaymentFee: 0, // Percentage
    latePaymentFeeAfterDays: 30
  },

  // Feature Toggles
  features: {
    // Beta Features
    beta: {
      recurringInvoices: true,
      multiCurrency: true,
      automatedReminders: true,
      clientPortal: true,
      expenseTracking: false,
      projectManagement: false,
      timeTracking: false,
      inventory: false,
      payrollIntegration: false
    },
    // Released Features
    enabled: {
      invoices: true,
      quotes: true,
      clients: true,
      payments: true,
      reports: true,
      dashboard: true,
      mobileApp: false,
      apiAccess: false,
      webhooks: false,
      customBranding: true,
      emailIntegration: true,
      bankIntegration: false,
      accounting: true,
      cashFlow: true,
      budgets: true
    },
    // Feature Limits
    limits: {
      maxInvoicesPerMonth: {
        free: 10,
        starter: 50,
        professional: 200,
        enterprise: -1 // unlimited
      },
      maxClientsPerAccount: {
        free: 5,
        starter: 50,
        professional: 200,
        enterprise: -1
      },
      maxUsersPerAccount: {
        free: 1,
        starter: 3,
        professional: 10,
        enterprise: -1
      }
    }
  },

  // Security Settings
  security: {
    passwordMinLength: 8,
    passwordRequireUppercase: true,
    passwordRequireLowercase: true,
    passwordRequireNumbers: true,
    passwordRequireSpecialChars: true,
    passwordExpiryDays: 0, // 0 = never expire
    twoFactorEnabled: false,
    ipWhitelist: [],
    allowedDomains: [],
    sessionSecure: true,
    cookieSecure: true,
    csrfProtection: true
  },

  // Notifications Settings
  notifications: {
    emailNotificationsEnabled: true,
    pushNotificationsEnabled: false,
    smsNotificationsEnabled: false,
    notifyOnNewInvoice: true,
    notifyOnPaymentReceived: true,
    notifyOnOverdueInvoice: true,
    notifyOnNewUser: true,
    notifyOnUserLogin: false,
    dailyReportEnabled: false,
    weeklyReportEnabled: false,
    monthlyReportEnabled: true
  },

  // Integration Settings (demo/local — never store production secrets in localStorage)
  integrations: {
    stripe: {
      enabled: false,
      publicKey: '',
      secretKey: '',
      webhookSecret: ''
    },
    paypal: {
      enabled: false,
      clientId: '',
      clientSecret: ''
    },
    quickbooks: {
      enabled: false,
      clientId: '',
      clientSecret: ''
    },
    xero: {
      enabled: false,
      clientId: '',
      clientSecret: ''
    },
    mailgun: {
      enabled: false,
      apiKey: '',
      domain: ''
    },
    sendgrid: {
      enabled: false,
      apiKey: ''
    }
  },

  // Branding Settings
  branding: {
    primaryColor: '#3b82f6',
    secondaryColor: '#1e293b',
    accentColor: '#10b981',
    logoUrl: '',
    faviconUrl: '',
    customCss: '',
    footerText: '© 2024 Invoice Breek. All rights reserved.',
    termsOfServiceUrl: '',
    privacyPolicyUrl: ''
  },

  // Last updated timestamp
  lastUpdated: new Date().toISOString(),
  updatedBy: null
};

export class SystemSettingsService {
  /**
   * Get all system settings
   * @returns {Object} All system settings
   */
  static getSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        const merged = this.mergeWithDefaults(settings);
        if (isProductionBuild() && merged.integrations) {
          return {
            ...merged,
            integrations: stripIntegrationSecrets(merged.integrations),
          };
        }
        return merged;
      }
      return { ...DEFAULT_SETTINGS };
    } catch (error) {
      console.error('Error loading system settings:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Merge stored settings with defaults (adds new settings from updates)
   * @param {Object} stored - Stored settings
   * @returns {Object} Merged settings
   */
  static mergeWithDefaults(stored) {
    const merged = { ...DEFAULT_SETTINGS };
    
    // Deep merge each section
    Object.keys(DEFAULT_SETTINGS).forEach(key => {
      if (stored[key] && typeof stored[key] === 'object' && !Array.isArray(stored[key])) {
        merged[key] = { ...DEFAULT_SETTINGS[key], ...stored[key] };
        
        // Handle nested objects (like feature.beta, feature.enabled, etc.)
        Object.keys(DEFAULT_SETTINGS[key]).forEach(subKey => {
          if (stored[key][subKey] && typeof stored[key][subKey] === 'object' && !Array.isArray(stored[key][subKey])) {
            merged[key][subKey] = { ...DEFAULT_SETTINGS[key][subKey], ...stored[key][subKey] };
          }
        });
      } else if (stored[key] !== undefined) {
        merged[key] = stored[key];
      }
    });
    
    return merged;
  }

  /**
   * Update system settings
   * @param {Object} updates - Settings to update
   * @param {string} userId - ID of user making the update
   * @returns {Object} Updated settings
   */
  static updateSettings(updates, userId = null) {
    try {
      const current = this.getSettings();
      const updated = {
        ...current,
        ...updates,
        lastUpdated: new Date().toISOString(),
        updatedBy: userId
      };
      if (isProductionBuild() && updated.integrations) {
        if (updates.integrations) {
          console.warn(
            '[Paidly] Production: integration secret fields are not stored in localStorage. Use server environment variables or a secrets manager for Stripe, PayPal, etc.'
          );
        }
        updated.integrations = stripIntegrationSecrets(updated.integrations);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      
      console.log('✅ System settings updated:', Object.keys(updates));
      return updated;
    } catch (error) {
      console.error('Error updating system settings:', error);
      throw error;
    }
  }

  /**
   * Update a specific section of settings
   * @param {string} section - Section name (system, emailTemplates, etc.)
   * @param {Object} updates - Updates for that section
   * @param {string} userId - ID of user making the update
   * @returns {Object} Updated settings
   */
  static updateSection(section, updates, userId = null) {
    try {
      const current = this.getSettings();
      let mergedSection = {
        ...current[section],
        ...updates
      };
      if (section === 'integrations' && isProductionBuild()) {
        console.warn(
          '[Paidly] Production: integration secret fields are not stored in localStorage. Use server env or a secrets manager.'
        );
        mergedSection = stripIntegrationSecrets(mergedSection);
      }
      const updated = {
        ...current,
        [section]: mergedSection,
        lastUpdated: new Date().toISOString(),
        updatedBy: userId
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      
      console.log(`✅ System settings section '${section}' updated`);
      return updated;
    } catch (error) {
      console.error(`Error updating system settings section '${section}':`, error);
      throw error;
    }
  }

  /**
   * Get a specific section of settings
   * @param {string} section - Section name
   * @returns {Object} Section settings
   */
  static getSection(section) {
    const settings = this.getSettings();
    return settings[section] || {};
  }

  /**
   * Reset settings to defaults
   * @returns {Object} Default settings
   */
  static resetToDefaults() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      console.log('✅ System settings reset to defaults');
      return { ...DEFAULT_SETTINGS };
    } catch (error) {
      console.error('Error resetting system settings:', error);
      throw error;
    }
  }

  /**
   * Check if maintenance mode is enabled
   * @returns {boolean} True if maintenance mode is on
   */
  static isMaintenanceMode() {
    const settings = this.getSettings();
    return settings.system?.maintenanceMode || false;
  }

  /**
   * Toggle maintenance mode
   * @param {boolean} enabled - Enable or disable maintenance mode
   * @param {string} message - Optional custom maintenance message
   * @param {string} userId - ID of user making the change
   * @returns {Object} Updated settings
   */
  static setMaintenanceMode(enabled, message = null, userId = null) {
    const updates = {
      maintenanceMode: enabled
    };
    
    if (message) {
      updates.maintenanceMessage = message;
    }
    
    return this.updateSection('system', updates, userId);
  }

  /**
   * Check if a feature is enabled
   * @param {string} featureName - Name of the feature
   * @param {string} type - Feature type: 'beta' or 'enabled'
   * @returns {boolean} True if feature is enabled
   */
  static isFeatureEnabled(featureName, type = 'enabled') {
    const settings = this.getSettings();
    return settings.features?.[type]?.[featureName] || false;
  }

  /**
   * Toggle a feature
   * @param {string} featureName - Name of the feature
   * @param {boolean} enabled - Enable or disable
   * @param {string} type - Feature type: 'beta' or 'enabled'
   * @param {string} userId - ID of user making the change
   * @returns {Object} Updated settings
   */
  static toggleFeature(featureName, enabled, type = 'enabled', userId = null) {
    const current = this.getSettings();
    const updated = {
      ...current,
      features: {
        ...current.features,
        [type]: {
          ...current.features[type],
          [featureName]: enabled
        }
      },
      lastUpdated: new Date().toISOString(),
      updatedBy: userId
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log(`✅ Feature '${featureName}' ${enabled ? 'enabled' : 'disabled'} in ${type}`);
    return updated;
  }

  /**
   * Get email template
   * @param {string} templateName - Name of the template
   * @returns {Object} Template with subject and body
   */
  static getEmailTemplate(templateName) {
    const settings = this.getSettings();
    return settings.emailTemplates?.[templateName] || null;
  }

  /**
   * Update email template
   * @param {string} templateName - Name of the template
   * @param {Object} template - Template data (subject, body)
   * @param {string} userId - ID of user making the update
   * @returns {Object} Updated settings
   */
  static updateEmailTemplate(templateName, template, userId = null) {
    const current = this.getSettings();
    const updated = {
      ...current,
      emailTemplates: {
        ...current.emailTemplates,
        [templateName]: template
      },
      lastUpdated: new Date().toISOString(),
      updatedBy: userId
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log(`✅ Email template '${templateName}' updated`);
    return updated;
  }

  /**
   * Get document numbering rules for a document type
   * @param {string} docType - Document type (invoice, quote, receipt, creditNote)
   * @returns {Object} Numbering rules
   */
  static getDocumentNumbering(docType) {
    const settings = this.getSettings();
    return settings.documentNumbering?.[docType] || null;
  }

  /**
   * Update document numbering rules
   * @param {string} docType - Document type
   * @param {Object} rules - Numbering rules
   * @param {string} userId - ID of user making the update
   * @returns {Object} Updated settings
   */
  static updateDocumentNumbering(docType, rules, userId = null) {
    const current = this.getSettings();
    const updated = {
      ...current,
      documentNumbering: {
        ...current.documentNumbering,
        [docType]: rules
      },
      lastUpdated: new Date().toISOString(),
      updatedBy: userId
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log(`✅ Document numbering rules for '${docType}' updated`);
    return updated;
  }

  /**
   * Get default currency and tax settings
   * @returns {Object} Default settings
   */
  static getDefaults() {
    const settings = this.getSettings();
    return settings.defaults || {};
  }

  /**
   * Export settings as JSON
   * @returns {string} Settings as JSON string
   */
  static exportSettings() {
    const settings = this.getSettings();
    return JSON.stringify(settings, null, 2);
  }

  /**
   * Import settings from JSON
   * @param {string} jsonString - Settings as JSON string
   * @param {string} userId - ID of user importing
   * @returns {Object} Imported settings
   */
  static importSettings(jsonString, userId = null) {
    try {
      const imported = JSON.parse(jsonString);
      imported.lastUpdated = new Date().toISOString();
      imported.updatedBy = userId;
      if (isProductionBuild() && imported.integrations) {
        console.warn(
          '[Paidly] Production: stripped integration secrets from imported settings; configure providers via server env.'
        );
        imported.integrations = stripIntegrationSecrets(imported.integrations);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      console.log('✅ System settings imported successfully');
      return imported;
    } catch (error) {
      console.error('Error importing system settings:', error);
      throw new Error('Invalid settings JSON format');
    }
  }
}

export default SystemSettingsService;
