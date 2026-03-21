# Platform Settings & Configuration

## Overview

The Platform Settings feature provides comprehensive system-wide configuration controls for administrators. This allows platform admins to manage core system behavior, email templates, document numbering, defaults, feature toggles, security, notifications, integrations, and branding.

## Access

**URL**: `/PlatformSettings` or `/admin/platform-settings`  
**Permission**: Admin role required  
**Navigation**: Admin sidebar → Platform Settings (wrench icon)

## Features

### 1. System Settings
Configure core system behavior and maintenance options.

**Settings Include:**
- **Site Information**
  - Site Name
  - Site Description
  - Admin Email
  - Support Email
  
- **System Configuration**
  - Time Zone
  - Session Timeout (minutes)
  - Max Login Attempts
  - Date Format
  - Time Format

- **Maintenance Mode**
  - Toggle maintenance mode on/off
  - Custom maintenance message
  - Blocks non-admin access when enabled

- **User Registration**
  - Allow/disallow new user registration
  - Require email verification option

**Usage:**
```javascript
import SystemSettingsService from '@/services/SystemSettingsService';

// Get system settings
const settings = SystemSettingsService.getSettings();

// Check maintenance mode
const isMaintenance = SystemSettingsService.isMaintenanceMode();

// Toggle maintenance mode
SystemSettingsService.setMaintenanceMode(true, "Be back soon!", userId);
```

---

### 2. Email Templates
Customize email templates for system notifications.

**Available Templates:**
1. **Welcome Email** - Sent when users sign up
2. **Invoice Created** - Client notification for new invoice
3. **Payment Reminder** - Sent before due date
4. **Invoice Overdue** - Sent after due date passes
5. **Payment Received** - Receipt confirmation
6. **Password Reset** - Password reset link
7. **Account Disabled** - Account status notification

**Template Variables:**
- `{{siteName}}` - Platform name
- `{{userName}}` - User's name
- `{{clientName}}` - Client's name
- `{{invoiceNumber}}` - Invoice number
- `{{amount}}` - Invoice/payment amount
- `{{dueDate}}` - Invoice due date
- `{{paymentDate}}` - Payment date
- `{{companyName}}` - Company name
- `{{invoiceLink}}` - Invoice URL
- `{{resetLink}}` - Password reset URL
- `{{supportEmail}}` - Support contact
- `{{reason}}` - Account action reason

**Usage:**
```javascript
// Get a template
const template = SystemSettingsService.getEmailTemplate('invoiceReminder');

// Update a template
SystemSettingsService.updateEmailTemplate('welcome', {
  subject: 'Welcome to {{siteName}}!',
  body: 'Hi {{userName}}, welcome aboard!'
}, userId);
```

---

### 3. Document Numbering
Configure automatic numbering rules for documents.

**Document Types:**
- Invoice
- Quote
- Receipt
- Credit Note

**Numbering Options:**
- **Prefix**: Custom prefix (e.g., INV, QUO, REC, CN)
- **Format**: Choose from:
  - `PREFIX-001`
  - `PREFIX-20240101-001`
  - `PREFIX-20240101-AB-001` (with client initials)
- **Start Number**: Starting sequence number
- **Padding**: Number of digits (e.g., 001 vs 00001)
- **Reset Period**: Never, Daily, Monthly, Yearly
- **Separator**: Character between parts (-, _, etc.)
- **Include Client Initials**: Add client initials to number

**Examples:**
- `INV-001`
- `INV-20240205-001`
- `INV-20240205-JD-001`
- `QUO-2024-0001`

**Usage:**
```javascript
// Get numbering rules for invoices
const rules = SystemSettingsService.getDocumentNumbering('invoice');

// Update numbering rules
SystemSettingsService.updateDocumentNumbering('invoice', {
  prefix: 'INV',
  format: 'PREFIX-YYYYMMDD-SEQ',
  startNumber: 1,
  padding: 3,
  resetPeriod: 'yearly',
  includeClientInitials: false,
  separator: '-'
}, userId);
```

---

### 4. Default Currency & Tax Settings
Set system-wide defaults for currency, tax, and payments.

**Currency Settings:**
- Default Currency (ZAR, USD, EUR, GBP, AED)
- Currency Symbol (R, $, €, £)
- Symbol Position (before/after)
- Decimal Places (0-4)
- Thousands Separator
- Decimal Separator

**Tax Settings:**
- Enable/Disable Tax
- Tax Name (VAT, GST, Sales Tax)
- Tax Rate (percentage)
- Tax Number
- Tax Inclusive/Exclusive

**Payment Settings:**
- Default Payment Terms (days)
- Late Payment Fee (percentage)
- Apply Fee After (days)

**Usage:**
```javascript
// Get default settings
const defaults = SystemSettingsService.getDefaults();

// Update defaults
SystemSettingsService.updateSection('defaults', {
  currency: 'ZAR',
  currencySymbol: 'R',
  taxEnabled: true,
  taxName: 'VAT',
  taxRate: 15,
  paymentTerms: 30
}, userId);
```

---

### 5. Feature Toggles
Control feature availability across the platform.

**Beta Features:**
- Recurring Invoices
- Multi-Currency
- Automated Reminders
- Client Portal
- Expense Tracking
- Project Management
- Time Tracking
- Inventory
- Payroll Integration

**Released Features:**
- Invoices
- Quotes
- Clients
- Payments
- Reports
- Dashboard
- Mobile App
- API Access
- Webhooks
- Custom Branding
- Email Integration
- Bank Integration
- Accounting
- Cash Flow
- Budgets

**Feature Limits by Plan:**
- Max Invoices per Month
- Max Clients per Account
- Max Users per Account

**Usage:**
```javascript
// Check if feature is enabled
const isEnabled = SystemSettingsService.isFeatureEnabled('recurringInvoices', 'beta');

// Toggle a feature
SystemSettingsService.toggleFeature('recurringInvoices', true, 'beta', userId);

// Toggle multiple features
const updated = SystemSettingsService.updateSection('features', {
  beta: { recurringInvoices: true, multiCurrency: true },
  enabled: { invoices: true, quotes: true }
}, userId);
```

---

### 6. Security Settings
Configure password policies and security features.

**Password Requirements:**
- Minimum Length (6-32 characters)
- Require Uppercase Letters
- Require Lowercase Letters
- Require Numbers
- Require Special Characters
- Password Expiry (days, 0 = never)

**Additional Security:**
- Two-Factor Authentication
- Secure Sessions
- CSRF Protection
- IP Whitelist
- Allowed Domains
- Cookie Security

**Usage:**
```javascript
// Get security settings
const security = SystemSettingsService.getSection('security');

// Update security settings
SystemSettingsService.updateSection('security', {
  passwordMinLength: 10,
  passwordRequireUppercase: true,
  twoFactorEnabled: true
}, userId);
```

---

### 7. Notifications
Configure system notifications and scheduled reports.

**Notification Channels:**
- Email Notifications
- Push Notifications
- SMS Notifications

**Event Notifications:**
- New Invoice Created
- Payment Received
- Invoice Overdue
- New User Registration
- User Login (Admin only)

**Scheduled Reports:**
- Daily Report
- Weekly Report
- Monthly Report

**Usage:**
```javascript
// Get notification settings
const notifications = SystemSettingsService.getSection('notifications');

// Update notifications
SystemSettingsService.updateSection('notifications', {
  emailNotificationsEnabled: true,
  notifyOnPaymentReceived: true,
  monthlyReportEnabled: true
}, userId);
```

---

### 8. Third-Party Integrations
Configure API keys for external services.

**Supported Integrations:**

**Payment Gateways:**
- Stripe (Public Key, Secret Key, Webhook Secret)
- PayPal (Client ID, Client Secret)

**Accounting:**
- QuickBooks (Client ID, Client Secret)
- Xero (Client ID, Client Secret)

**Email Services:**
- Mailgun (API Key, Domain)
- SendGrid (API Key)

**Usage:**
```javascript
// Get integration settings
const integrations = SystemSettingsService.getSection('integrations');

// Enable Stripe integration
SystemSettingsService.updateSection('integrations', {
  stripe: {
    enabled: true,
    publicKey: '<stripe-publishable-key>',
    secretKey: '<server-side-only — do not use production secrets in localStorage>',
    webhookSecret: '<configure on server / Stripe dashboard>'
  }
}, userId);
```

---

### 9. Branding & Customization
Customize the platform's look and feel.

**Color Settings:**
- Primary Color
- Secondary Color
- Accent Color

**Assets:**
- Logo URL
- Favicon URL

**Text:**
- Footer Text
- Terms of Service URL
- Privacy Policy URL

**Advanced:**
- Custom CSS

**Usage:**
```javascript
// Get branding settings
const branding = SystemSettingsService.getSection('branding');

// Update branding
SystemSettingsService.updateSection('branding', {
  primaryColor: '#3b82f6',
  logoUrl: 'https://example.com/logo.png',
  footerText: '© 2024 My Company'
}, userId);
```

---

## Additional Features

### Export/Import Settings

**Export:**
Download all settings as JSON backup.

```javascript
const json = SystemSettingsService.exportSettings();
// Downloads: system-settings-2024-02-05.json
```

**Import:**
Upload previously exported settings to restore configuration.

```javascript
SystemSettingsService.importSettings(jsonString, userId);
```

### Reset to Defaults

Reset all settings to factory defaults.

```javascript
SystemSettingsService.resetToDefaults();
```

---

## API Reference

### SystemSettingsService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getSettings()` | - | Object | Get all settings |
| `updateSettings(updates, userId)` | updates: Object, userId: string | Object | Update settings |
| `updateSection(section, updates, userId)` | section: string, updates: Object, userId: string | Object | Update specific section |
| `getSection(section)` | section: string | Object | Get specific section |
| `resetToDefaults()` | - | Object | Reset to defaults |
| `isMaintenanceMode()` | - | Boolean | Check maintenance status |
| `setMaintenanceMode(enabled, message, userId)` | enabled: boolean, message: string, userId: string | Object | Set maintenance mode |
| `isFeatureEnabled(name, type)` | name: string, type: string | Boolean | Check feature status |
| `toggleFeature(name, enabled, type, userId)` | name: string, enabled: boolean, type: string, userId: string | Object | Toggle feature |
| `getEmailTemplate(name)` | name: string | Object | Get email template |
| `updateEmailTemplate(name, template, userId)` | name: string, template: Object, userId: string | Object | Update template |
| `getDocumentNumbering(docType)` | docType: string | Object | Get numbering rules |
| `updateDocumentNumbering(docType, rules, userId)` | docType: string, rules: Object, userId: string | Object | Update numbering |
| `getDefaults()` | - | Object | Get default settings |
| `exportSettings()` | - | String | Export as JSON |
| `importSettings(jsonString, userId)` | jsonString: string, userId: string | Object | Import from JSON |

---

## Storage

**Location**: `localStorage`  
**Key**: `breakapi_system_settings`  
**Format**: JSON

**Data Structure**:
```javascript
{
  system: { ... },
  emailTemplates: { ... },
  documentNumbering: { ... },
  defaults: { ... },
  features: { ... },
  security: { ... },
  notifications: { ... },
  integrations: { ... },
  branding: { ... },
  lastUpdated: "2024-02-05T10:30:00.000Z",
  updatedBy: "user-id"
}
```

---

## Best Practices

1. **Backup Before Changes**: Export settings before making major changes
2. **Test in Staging**: Test feature toggles and numbering changes in non-production
3. **Maintenance Mode**: Notify users before enabling maintenance mode
4. **Security Settings**: Use strong password requirements for production
5. **Email Templates**: Test templates before deploying to avoid broken emails
6. **Document Numbering**: Never change numbering rules if documents already exist
7. **Feature Toggles**: Disable beta features in production until tested
8. **Integration Keys**: Never share or expose API keys publicly

---

## Troubleshooting

### Settings Not Saving
- Check browser console for errors
- Verify localStorage is not full
- Ensure user has admin role

### Maintenance Mode Not Working
- Check `SystemSettingsService.isMaintenanceMode()`
- Verify auth middleware respects maintenance flag

### Email Templates Not Applied
- Confirm template variables match data
- Check email service integration settings

### Document Numbers Duplicate
- Review reset period settings
- Check for concurrent invoice creation
- Verify sequence counter in database

---

## Security Considerations

1. **Admin Only**: All settings require admin role
2. **Audit Trail**: Track who updated settings and when
3. **Sensitive Data**: Integration keys stored in localStorage (consider backend storage for production)
4. **Validation**: Validate all inputs before saving
5. **XSS Protection**: Sanitize custom CSS and HTML inputs

---

## Future Enhancements

- [ ] Backend API for settings persistence
- [ ] Multi-tenant settings isolation
- [ ] Settings versioning/history
- [ ] Role-based settings access
- [ ] Real-time settings sync across tabs
- [ ] Settings validation schemas
- [ ] Import/export with encryption
- [ ] Settings diff viewer
- [ ] Rollback functionality
- [ ] Settings search/filter

---

## Quick Reference

**Navigate to Settings**: Admin Sidebar → Platform Settings  
**Export Backup**: Click "Export" button  
**Import Settings**: Click "Import" button, select JSON file  
**Reset All**: Click "Reset" button (confirmation required)  
**Save Changes**: Click "Save" button on each tab

---

## Support

For questions or issues with Platform Settings:
- Check browser console for error messages
- Verify admin role permissions
- Review this documentation
- Contact system administrator

---

**Last Updated**: February 5, 2024  
**Version**: 1.0.0  
**Author**: Paidly Development Team
