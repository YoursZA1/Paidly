import { supabase } from '@/lib/supabaseClient';

const PAIDLY_API_URL =
  import.meta.env.VITE_PAIDLY_API_URL ||
  import.meta.env.VITE_BASE44_API_URL ||
  window?.appParams?.paidly?.url ||
  window?.appParams?.base44?.url ||
  null;
const PAIDLY_API_KEY =
  import.meta.env.VITE_PAIDLY_API_KEY ||
  import.meta.env.VITE_BASE44_API_KEY ||
  window?.appParams?.paidly?.api_key ||
  window?.appParams?.base44?.api_key ||
  null;
const PAIDLY_ENV = import.meta.env.VITE_PAIDLY_ENV || import.meta.env.VITE_BASE44_ENV || window?.appParams?.env || 'development';

function isPaidlyApiAvailable() {
  return Boolean(PAIDLY_API_URL);
}

function getQueryParams(query = {}) {
  const params = new URLSearchParams(query);
  if (PAIDLY_ENV) params.set('env', PAIDLY_ENV);
  return params.toString();
}

async function fetchPaidlyEntity(entityName, options = {}) {
  if (!isPaidlyApiAvailable()) {
    throw new Error('Paidly API is not configured');
  }

  const baseUrl = `${PAIDLY_API_URL.replace(/\/+$/, '')}/entities/${encodeURIComponent(entityName)}`;
  const query = getQueryParams(options);
  const url = `${baseUrl}${query ? `?${query}` : ''}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(PAIDLY_API_KEY ? { Authorization: `Bearer ${PAIDLY_API_KEY}` } : {})
  };

  const response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`Paidly API request failed for ${entityName}: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.data || payload.records || [];
}

async function fetchSupabaseEntity(entityName, filters = {}) {
  let query;
  switch (entityName) {
    case 'PlatformUser':
      query = supabase.from('profiles').select('id, full_name, email, company_name, subscription_plan, created_at');
      break;
    case 'Subscription':
      query = supabase.from('subscriptions').select('*');
      break;
    case 'AffiliateSubmission':
      query = supabase.from('affiliate_applications').select('*').order('created_at', { ascending: false });
      break;
    case 'AffiliatePayout':
      query = supabase.from('commissions').select('*').order('created_at', { ascending: false });
      break;
    case 'WaitlistEntry':
      query = supabase.from('waitlist_signups').select('*').order('created_at', { ascending: false });
      break;
    default:
      throw new Error(`Unknown entity name: ${entityName}`);
  }

  if (filters && Object.keys(filters).length > 0) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function fetchEntity(entityName, options = {}) {
  if (isPaidlyApiAvailable()) {
    try {
      return await fetchPaidlyEntity(entityName, options);
    } catch (err) {
      // fallback to Supabase if external API fails
      console.warn('Paidly API fetch failed, falling back to Supabase for', entityName, err);
    }
  }

  return fetchSupabaseEntity(entityName, options);
}

export default {
  isPaidlyApiAvailable,
  fetchEntity,
  fetchSupabaseEntity,
  fetchPaidlyEntity
};
