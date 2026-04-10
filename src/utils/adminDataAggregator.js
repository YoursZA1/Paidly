/**
 * Admin Data Aggregator
 * Utilities for admins to access and aggregate data from all users
 * Now uses AdminDataService for unified data access
 */

import AdminDataService from '@/services/AdminDataService';
import { adminCacheGet } from '@/lib/adminLocalCache';

const SUPABASE_KEYS = {
  USERS: 'breakapi_supabase_users',
  CLIENTS: 'breakapi_supabase_clients',
  SERVICES: 'breakapi_supabase_services',
  INVOICES: 'breakapi_supabase_invoices',
  QUOTES: 'breakapi_supabase_quotes',
  PAYMENTS: 'breakapi_supabase_payments'
};

const getSupabaseData = (key) => {
  try {
    const stored = adminCacheGet(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const getSupabaseUserMap = () => {
  const users = getSupabaseData(SUPABASE_KEYS.USERS);
  const map = new Map();
  users.forEach((user) => {
    if (user?.id) {
      map.set(user.id, {
        email: user.email,
        full_name: user.profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || ""
      });
    }
  });
  return map;
};

/**
 * Get all users from the global users list
 */
export function getAllUsers() {
  return AdminDataService.getAllUsers();
}

/**
 * Generate user ID from email (matches the algorithm in customClient.js)
 */
export function generateUserId(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `user_${Math.abs(hash).toString(36)}`;
}

/**
 * Get all data for a specific entity type from a specific user
 */
export function getUserEntityData(userId, entityName) {
  try {
    const key = `breakapi_${userId}_${entityName}`;
    const stored = localStorage.getItem(key);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

/**
 * Get all invoices from all users
 */
export function getAllUsersInvoices() {
  const supabaseInvoices = getSupabaseData(SUPABASE_KEYS.INVOICES);
  if (supabaseInvoices.length) {
    const userMap = getSupabaseUserMap();
    return supabaseInvoices.map((invoice) => {
      const user = userMap.get(invoice.user_id) || {};
      return {
        ...invoice,
        user_id: invoice.user_id || invoice.created_by || invoice.org_owner_id || null,
        user_email: user.email || null,
        user_name: user.full_name || null
      };
    });
  }

  const users = getAllUsers();
  const allInvoices = [];

  users.forEach(user => {
    const userId = generateUserId(user.email);
    const invoices = getUserEntityData(userId, 'Invoice');
    
    Object.values(invoices).forEach(invoice => {
      allInvoices.push({
        ...invoice,
        user_id: userId,
        user_email: user.email,
        user_name: user.full_name,
        company_name: user.company_name
      });
    });
  });

  return allInvoices;
}

/**
 * Get all clients from all users
 */
export function getAllUsersClients() {
  const supabaseClients = getSupabaseData(SUPABASE_KEYS.CLIENTS);
  if (supabaseClients.length) {
    const userMap = getSupabaseUserMap();
    return supabaseClients.map((client) => {
      const userId = client.user_id || client.org_owner_id || null;
      const user = userId ? (userMap.get(userId) || {}) : {};
      return {
        ...client,
        user_id: userId,
        user_email: user.email || null,
        user_name: user.full_name || null
      };
    });
  }

  const users = getAllUsers();
  const allClients = [];

  users.forEach(user => {
    const userId = generateUserId(user.email);
    const clients = getUserEntityData(userId, 'Client');
    
    Object.values(clients).forEach(client => {
      allClients.push({
        ...client,
        user_id: userId,
        user_email: user.email,
        user_name: user.full_name
      });
    });
  });

  return allClients;
}

/**
 * Get all quotes from all users
 */
export function getAllUsersQuotes() {
  const supabaseQuotes = getSupabaseData(SUPABASE_KEYS.QUOTES);
  if (supabaseQuotes.length) {
    const userMap = getSupabaseUserMap();
    return supabaseQuotes.map((quote) => {
      const userId = quote.user_id || quote.created_by || quote.org_owner_id || null;
      const user = userId ? (userMap.get(userId) || {}) : {};
      return {
        ...quote,
        user_id: userId,
        user_email: user.email || null,
        user_name: user.full_name || null
      };
    });
  }

  const users = getAllUsers();
  const allQuotes = [];

  users.forEach(user => {
    const userId = generateUserId(user.email);
    const quotes = getUserEntityData(userId, 'Quote');
    
    Object.values(quotes).forEach(quote => {
      allQuotes.push({
        ...quote,
        user_id: userId,
        user_email: user.email,
        user_name: user.full_name
      });
    });
  });

  return allQuotes;
}

/**
 * Get all expenses from all users
 */
export function getAllUsersExpenses() {
  const users = getAllUsers();
  const allExpenses = [];

  users.forEach(user => {
    const userId = generateUserId(user.email);
    const expenses = getUserEntityData(userId, 'Expense');
    
    Object.values(expenses).forEach(expense => {
      allExpenses.push({
        ...expense,
        user_id: userId,
        user_email: user.email,
        user_name: user.full_name
      });
    });
  });

  return allExpenses;
}

/**
 * Get statistics for a specific user
 */
export function getUserStatistics(userId) {
  const invoices = Object.values(getUserEntityData(userId, 'Invoice'));
  const clients = Object.values(getUserEntityData(userId, 'Client'));
  const quotes = Object.values(getUserEntityData(userId, 'Quote'));
  const expenses = Object.values(getUserEntityData(userId, 'Expense'));

  const totalRevenue = invoices.reduce((sum, inv) => {
    return sum + (parseFloat(inv.total) || 0);
  }, 0);

  const paidInvoices = invoices.filter(inv => inv.payment_status === 'paid');
  const paidRevenue = paidInvoices.reduce((sum, inv) => {
    return sum + (parseFloat(inv.total) || 0);
  }, 0);

  const totalExpenses = expenses.reduce((sum, exp) => {
    return sum + (parseFloat(exp.amount) || 0);
  }, 0);

  return {
    totalInvoices: invoices.length,
    totalClients: clients.length,
    totalQuotes: quotes.length,
    totalExpenses: expenses.length,
    totalRevenue,
    paidRevenue,
    outstandingRevenue: totalRevenue - paidRevenue,
    expensesTotal: totalExpenses,
    netProfit: paidRevenue - totalExpenses
  };
}

/**
 * Get enriched user data with statistics
 */
export function getEnrichedUsers() {
  return AdminDataService.getEnrichedUsers();
}

/**
 * Get platform-wide statistics
 */
export function getPlatformStatistics() {
  return AdminDataService.getPlatformStatistics();
}

/**
 * Get invoices for a specific user by email
 */
export function getUserInvoicesByEmail(email) {
  const userId = generateUserId(email);
  const invoices = getUserEntityData(userId, 'Invoice');
  return Object.values(invoices);
}

/**
 * Get clients for a specific user by email
 */
export function getUserClientsByEmail(email) {
  const userId = generateUserId(email);
  const clients = getUserEntityData(userId, 'Client');
  return Object.values(clients);
}

/**
 * Search across all users and their data
 */
export function globalSearch(query) {
  if (!query || query.trim() === '') return { users: [], invoices: [], clients: [] };
  
  const searchTerm = query.toLowerCase();
  const users = getAllUsers();
  const allInvoices = getAllUsersInvoices();
  const allClients = getAllUsersClients();

  const matchedUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchTerm) ||
    user.email?.toLowerCase().includes(searchTerm) ||
    user.company_name?.toLowerCase().includes(searchTerm)
  );

  const matchedInvoices = allInvoices.filter(invoice =>
    invoice.invoice_number?.toLowerCase().includes(searchTerm) ||
    invoice.client_name?.toLowerCase().includes(searchTerm)
  );

  const matchedClients = allClients.filter(client =>
    client.name?.toLowerCase().includes(searchTerm) ||
    client.email?.toLowerCase().includes(searchTerm) ||
    client.company?.toLowerCase().includes(searchTerm)
  );

  return {
    users: matchedUsers,
    invoices: matchedInvoices,
    clients: matchedClients
  };
}
