/**
 * Audit Logger Utility
 * Legacy compatibility wrapper for AuditLogService
 * @deprecated Use AuditLogService directly for new code
 */

import AuditLogService, {
  logInvoiceCreated as newLogInvoiceCreated,
  logInvoiceUpdated as newLogInvoiceUpdated,
  logPaymentRecorded as newLogPaymentRecorded,
  logStatusChanged as newLogStatusChanged,
  logAdminAction as newLogAdminAction,
  AUDIT_LOG_STORAGE_KEY
} from '@/services/AuditLogService';

// Re-export for backward compatibility
export { AUDIT_LOG_STORAGE_KEY };

export const logAuditEvent = (event) => {
  return AuditLogService.logEvent(event);
};

// Specific logging functions - delegate to new service
export const logInvoiceCreated = newLogInvoiceCreated;
export const logInvoiceUpdated = newLogInvoiceUpdated;
export const logPaymentRecorded = newLogPaymentRecorded;
export const logStatusChanged = newLogStatusChanged;
export const logAdminAction = newLogAdminAction;

