/**
 * Custom API Client — data access layer for all Paidly entities.
 *
 * SPLIT PLAN (tracked): AuthManager → src/api/auth/; IntegrationManager → src/api/integration/.
 * Thin orchestrator: AuthManager, IntegrationManager, EntityManager in src/api/*.
 */

/**
 * Tenant isolation (authoritative enforcement: Postgres RLS in supabase/schema.postgres.sql):
 * - Org-scoped tables (invoices, quotes, clients, services, payslips, payments, expenses, tasks, …): every
 *   row has `org_id`. This client resolves the active org via `ensureUserHasOrganization(sessionUserId)` and
 *   applies `.eq('org_id', orgId)` on list/get/update/delete. Creates overwrite any client-supplied `org_id`
 *   for those tables (except packages: forced to the same org below).
 * - Per-user / profile: `public.profiles.id` = Supabase auth user id; `notes.user_id` = auth uid.
 * - Line items (`invoice_items`, `quote_items`): scoped indirectly via parent invoice/quote RLS.
 */

import { AuthManager } from "@/api/auth/AuthManager.js";
import { IntegrationManager } from "@/api/integration/IntegrationManager.js";
import { EntityManager } from "@/api/entity/EntityManager.js";
export { selectProfileByUserId } from "@/api/auth/profileSelect.js";
export { clearSessionOrgIdCache } from "@/api/auth/orgCache.js";

class CustomAPIClient {
  constructor(config = {}) {
    this.config = config;
    this.auth = new AuthManager();
    this.integrations = new IntegrationManager();
    this.entities = this.createEntities();
    EntityManager.setBreakApiClient(this);
    this.setupAuthListener();
  }

  setupAuthListener() {
    // Listen for user changes and update entity managers
    const originalLogin = this.auth.login.bind(this.auth);
    const originalLogout = this.auth.logout.bind(this.auth);

    this.auth.login = async (credentials) => {
      const user = await originalLogin(credentials);
      this.updateEntitiesForUser(user?.id ?? null);
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
    if (import.meta.env.DEV && typeof console !== "undefined" && console.debug) {
      console.debug(`🔄 Switching to ${userId ? `user: ${userId.slice(0, 8)}…` : "guest"}`);
    }
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
      'DocumentSend',
      'MessageLog',
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
