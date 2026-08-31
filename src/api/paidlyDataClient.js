import { supabase } from '@/lib/supabaseClient';
import { runPostgrestWithResilience } from '@/lib/supabaseDataResilience';
import { subscriptionRowToProfilePatch } from '@/lib/subscriptionRowToProfilePatch';
import {
  getAuditLogsSupabaseAccessForbidden,
  markAuditLogsSupabaseAccessForbidden,
  markAuditLogsSupabaseTableMissing,
  resetAuditLogsSupabaseTableFlag,
} from '@/lib/auditLogsSupabaseStatus';
import { isSupabaseMissingRelationError } from '@/utils/supabaseErrorUtils';

const PAIDLY_AUDIT_STORAGE_KEY = 'paidly_audit_log';

function stringifyMaybeJson(val) {
  if (val == null) return null;
  return typeof val === 'string' ? val : JSON.stringify(val);
}

function normalizeAuditLogRowDb(row) {
  return {
    id: row.id,
    category: row.category || 'settings',
    action: row.action || '',
    description: row.description || '',
    before: stringifyMaybeJson(row.before),
    after: stringifyMaybeJson(row.after),
    actor_name: row.actor_name || (row.actor_email ? String(row.actor_email).split('@')[0] : null),
    actor_email: row.actor_email || null,
    actor_role: row.actor_role || null,
    created_date: row.created_date || row.created_at,
    target_label: row.target_label || null,
  };
}

function mapLegacyEntityToCategory(entityType) {
  if (!entityType) return 'settings';
  const t = String(entityType).toLowerCase();
  if (t.includes('user') || t.includes('client')) return 'users';
  if (t.includes('subscription') || t.includes('invoice')) return 'subscriptions';
  if (t.includes('payout') || t.includes('payment')) return 'payouts';
  if (t.includes('team') || t.includes('role')) return 'team';
  return 'settings';
}

/** Pulls Supabase `audit_logs` (never permanently skipped — old localStorage flag caused empty DB forever). */
async function fetchAuditLogRowsFromSupabase(limit) {
  if (getAuditLogsSupabaseAccessForbidden()) {
    return [];
  }
  try {
    const ordered = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!ordered.error && Array.isArray(ordered.data)) {
      return ordered.data;
    }

    if (ordered.error && isSupabaseMissingRelationError(ordered.error)) {
      markAuditLogsSupabaseTableMissing();
      console.warn(
        '[paidly] public.audit_logs is missing — apply repo migration `supabase/migrations/20260404150100_audit_logs.sql` (e.g. `supabase db push` or SQL Editor). Until then, only local / unified audit entries will show.'
      );
      return [];
    }
    if (ordered.error && String(ordered.error.code || '') === '42501') {
      markAuditLogsSupabaseAccessForbidden();
      return [];
    }

    if (import.meta.env?.DEV && ordered.error) {
      console.warn('[paidly] audit_logs query:', ordered.error.code, ordered.error.message);
    }

    // e.g. missing sort column in an old fork — still return rows
    const fallback = await supabase.from('audit_logs').select('*').limit(limit);
    if (!fallback.error && Array.isArray(fallback.data)) {
      return fallback.data.sort(
        (a, b) => new Date(b.created_at || b.created_date || 0) - new Date(a.created_at || a.created_date || 0)
      );
    }

    if (fallback.error && isSupabaseMissingRelationError(fallback.error)) {
      markAuditLogsSupabaseTableMissing();
      console.warn(
        '[paidly] public.audit_logs is missing — apply `supabase/migrations/20260404150100_audit_logs.sql`.'
      );
      return [];
    }
    if (fallback.error && String(fallback.error.code || '') === '42501') {
      markAuditLogsSupabaseAccessForbidden();
      return [];
    }

    if (import.meta.env?.DEV && fallback.error) {
      console.warn('[paidly] audit_logs fallback:', fallback.error.message);
    }
  } catch (e) {
    if (import.meta.env?.DEV) {
      console.warn('[paidly] audit_logs:', e?.message || e);
    }
  }
  return [];
}

/** Merges Supabase `audit_logs`, Settings `paidly_audit_log`, and unified AuditLogService entries. */
async function listAuditLogs(limit = 200) {
  resetAuditLogsSupabaseTableFlag();
  const cap = Number(limit) > 0 ? Math.min(Number(limit), 500) : 200;
  const out = [];
  const seenIds = new Set();

  // Legacy: older builds set this when `audit_logs` was missing and never retried after the table existed.
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('paidly_audit_db_unavailable');
    }
  } catch {
    /* ignore */
  }

  const dbRows = await fetchAuditLogRowsFromSupabase(cap);
  for (const row of dbRows) {
    const n = normalizeAuditLogRowDb(row);
    if (n.id != null) seenIds.add(String(n.id));
    out.push(n);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(PAIDLY_AUDIT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      parsed.forEach((e, i) => {
        const id = `paidly-${e.ts}-${i}`;
        if (seenIds.has(id)) return;
        seenIds.add(id);
        out.push({
          id,
          category: e.category || 'settings',
          action: e.action || '',
          description: e.description || '',
          before: e.before != null ? JSON.stringify(e.before) : null,
          after: e.after != null ? JSON.stringify(e.after) : null,
          actor_name: e.actorEmail ? String(e.actorEmail).split('@')[0] : null,
          actor_email: e.actorEmail || null,
          actor_role: null,
          created_date: e.ts,
          target_label: e.targetLabel || null,
        });
      });
    }
  } catch {
    /* ignore */
  }

  try {
    const { default: AuditLogService } = await import('@/services/AuditLogService');
    const legacy = AuditLogService.getLogs({ limit: Math.min(cap, 400) });
    for (const log of legacy) {
      const lid = log.id ? String(log.id) : null;
      if (lid && seenIds.has(lid)) continue;
      if (lid) seenIds.add(lid);
      out.push({
        id: log.id || `legacy-${log.timestamp}-${Math.random().toString(36).slice(2, 9)}`,
        category: mapLegacyEntityToCategory(log.entityType),
        action: log.action || log.type || 'event',
        description: log.entityName ? `${log.action || log.type || 'Event'} — ${log.entityName}` : log.action || log.type || 'Audit event',
        before: null,
        after: log.details ? JSON.stringify(log.details) : null,
        actor_name: log.userName || log.performedBy || null,
        actor_email: null,
        actor_role: null,
        created_date: log.timestamp,
        target_label: log.clientName || log.entityName || null,
      });
    }
  } catch {
    /* ignore */
  }

  out.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  return out.slice(0, cap);
}

/** App entity name → Supabase public table. */
const ENTITY_TABLES = {
  PlatformUser: 'profiles',
  Subscription: 'subscriptions',
  WaitlistEntry: 'waitlist_signups',
  User: 'profiles',
  /** Platform documents — keyed by auth user for reporting (see documentOwnership.js). */
  Invoice: 'invoices',
  Quote: 'quotes',
  Payroll: 'payslips',
  Payslip: 'payslips',
  RecurringInvoice: 'recurring_invoices',
};

// Use '*' for tables whose schema differs across environments (PostgREST 400 if any column is missing).
// Normalization below still maps fields to the app shape.
const ENTITY_SELECTS = {
  PlatformUser: '*',
  Subscription: '*',
  WaitlistEntry: '*',
  User: '*',
  Invoice: '*',
  Quote: '*',
  Payroll: '*',
  Payslip: '*',
  RecurringInvoice: '*',
};

function normalizeEntity(entityName, row) {
  if (!row) return row;

  if (entityName === 'PlatformUser') {
    return {
      ...row,
      full_name: row.full_name || row.name || row.display_name || '',
      company: row.company || row.company_name || '',
      plan: row.plan || row.subscription_plan || 'none',
      status: row.status || 'active',
      role: row.role || row.user_role || '',
      email_verified: row.email_verified,
      email_confirmed_at: row.email_confirmed_at ?? null,
      invoices_sent: Number(row.invoices_sent ?? row.invoices_count ?? 0),
      created_date: row.created_date || row.created_at || null,
    };
  }

  if (entityName === 'Subscription') {
    return {
      ...row,
      user_email: row.user_email || row.email || '',
      user_name: row.user_name || row.full_name || '',
      plan: row.plan || row.current_plan || 'individual',
      amount: Number(row.amount ?? row.custom_price ?? 0),
      status: row.status || 'active',
      billing_cycle: row.billing_cycle || 'monthly',
      next_billing_date: row.next_billing_date || null,
      created_date: row.created_date || row.created_at || null,
    };
  }

  if (entityName === 'WaitlistEntry') {
    return {
      ...row,
      email: (row.email || '').trim(),
      name: (row.name || row.full_name || '').trim() || '',
      converted: Boolean(row.converted),
      created_date: row.created_at || row.created_date || null,
    };
  }

  if (entityName === 'Invoice' || entityName === 'Quote') {
    return {
      ...row,
      created_date: row.created_date || row.created_at || null,
      user_id: row.user_id || row.created_by || null,
    };
  }

  if (entityName === 'Payroll' || entityName === 'Payslip') {
    return {
      ...row,
      created_date: row.created_date || row.created_at || null,
      user_id: row.user_id || row.created_by_id || null,
    };
  }

  return row;
}

function denormalizeEntity(entityName, payload) {
  if (!payload) return payload;

  if (entityName === 'PlatformUser') {
    return {
      ...payload,
      company_name: payload.company_name || payload.company,
      subscription_plan: payload.subscription_plan || payload.plan,
      plan: payload.plan || payload.subscription_plan,
    };
  }

  if (entityName === 'Subscription') {
    return {
      ...payload,
      current_plan: payload.current_plan || payload.plan,
      email: payload.email || payload.user_email,
      full_name: payload.full_name || payload.user_name,
      custom_price: payload.custom_price ?? payload.amount,
    };
  }

  if (entityName === 'WaitlistEntry') {
    const out = { ...payload };
    if (typeof out.email === 'string') out.email = out.email.trim().toLowerCase();
    if (out.full_name && !out.name) out.name = String(out.full_name).trim();
    return out;
  }

  return payload;
}

function getTable(entityName) {
  const table = ENTITY_TABLES[entityName];
  if (!table) throw new Error(`Unsupported entity: ${entityName}`);
  return table;
}

function getTableCandidates(entityName) {
  return [getTable(entityName)];
}

function normalizeOrder(orderBy) {
  if (!orderBy) return { column: 'created_at', ascending: false };
  const descending = String(orderBy).startsWith('-');
  const raw = descending ? String(orderBy).slice(1) : String(orderBy);
  const column = raw === 'created_date' ? 'created_at' : raw;
  return { column, ascending: !descending };
}

function coerceListLimit(limitOrOpts, fallback = 100) {
  if (limitOrOpts != null && typeof limitOrOpts === 'object' && !Array.isArray(limitOrOpts)) {
    const n = Number(limitOrOpts.limit);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  const n = Number(limitOrOpts);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * When an admin edits `subscriptions`, mirror plan + lifecycle into `profiles` so the member app
 * (Dashboard, Settings, nav) matches without PayFast. Requires admin JWT + `admin full access profiles` RLS.
 */
async function syncProfileFromAdminSubscriptionRow(row) {
  const nowIso = new Date().toISOString();
  const mapped = subscriptionRowToProfilePatch(row, nowIso);
  if (!mapped) return;

  const { error } = await runPostgrestWithResilience(
    () => supabase.from("profiles").update(mapped.patch).eq("id", mapped.userId),
    { kind: "write", silent: true, label: "paidly.profile.syncSubscription" }
  );
  if (error) {
    console.warn("[paidlyDataClient] sync profiles from admin subscription failed:", error.message || error);
  }
}

async function list(entityName, orderBy = '-created_date', limitOrOpts = 100) {
  if (entityName === 'AuditLog') {
    return listAuditLogs(coerceListLimit(limitOrOpts, 200));
  }
  const limit = coerceListLimit(limitOrOpts, 100);
  const tableCandidates = getTableCandidates(entityName);
  let table = tableCandidates[0];
  const { column, ascending } = normalizeOrder(orderBy);
  const selectClause = ENTITY_SELECTS[entityName] || '*';
  const runListQuery = async (selectColumns, withOrder = true) => {
    let q = supabase.from(table).select(selectColumns).limit(limit);
    if (withOrder) {
      q = q.order(column, { ascending });
    }
    return q;
  };

  let data;
  let error;
  for (const candidate of tableCandidates) {
    table = candidate;
    ({ data, error } = await runPostgrestWithResilience(() => runListQuery(selectClause, true), {
      kind: 'read',
      label: `paidly.list.${entityName}`,
    }));
    if (error) {
      const retryUnsorted = await runPostgrestWithResilience(() => runListQuery(selectClause, false), {
        kind: 'read',
        silent: true,
        label: `paidly.list.${entityName}.unsorted`,
      });
      data = retryUnsorted.data;
      error = retryUnsorted.error;
    }
    if (error && selectClause !== '*') {
      const retryWildcard = await runPostgrestWithResilience(() => runListQuery('*', true), {
        kind: 'read',
        silent: true,
        label: `paidly.list.${entityName}.wildcard`,
      });
      data = retryWildcard.data;
      error = retryWildcard.error;
      if (error) {
        const retryWildcardUnsorted = await runPostgrestWithResilience(() => runListQuery('*', false), {
          kind: 'read',
          silent: true,
          label: `paidly.list.${entityName}.wildcardUnsorted`,
        });
        data = retryWildcardUnsorted.data;
        error = retryWildcardUnsorted.error;
      }
    }
    if (!error) break;
  }
  if (error) throw error;

  return (data || []).map((row) =>
    normalizeEntity(entityName, {
      ...row,
      __source_table: table,
    })
  );
}

async function create(entityName, payload) {
  const tableCandidates = getTableCandidates(entityName);
  const toInsert = denormalizeEntity(entityName, payload);
  let data;
  let error;
  for (const table of tableCandidates) {
    const result = await runPostgrestWithResilience(
      () => supabase.from(table).insert(toInsert).select().limit(1),
      { kind: 'write', label: `paidly.${entityName}.create` }
    );
    data = Array.isArray(result.data) ? result.data[0] : result.data;
    error = result.error;
    if (!error) break;
  }
  if (error) throw error;
  const created = normalizeEntity(entityName, data);
  if (entityName === "Subscription" && created?.user_id) {
    await syncProfileFromAdminSubscriptionRow(created);
  }
  return created;
}

async function update(entityName, id, payload) {
  const toUpdate = denormalizeEntity(entityName, payload);
  const tableCandidates = getTableCandidates(entityName);
  let data;
  let error;
  for (const table of tableCandidates) {
    const result = await runPostgrestWithResilience(
      () => supabase.from(table).update(toUpdate).eq('id', id).select().limit(1),
      { kind: 'write', label: `paidly.${entityName}.update` }
    );
    data = Array.isArray(result.data) ? result.data[0] : result.data;
    error = result.error;
    if (!error) break;
  }
  if (error) throw error;

  if (entityName === "Subscription") {
    let syncRow = normalizeEntity(entityName, data);
    if (!syncRow?.user_id && id) {
      for (const table of tableCandidates) {
        const { data: reread } = await runPostgrestWithResilience(
          () => supabase.from(table).select("*").eq("id", id).maybeSingle(),
          { kind: 'read', silent: true, label: 'paidly.subscription.reread' }
        );
        if (reread) {
          syncRow = normalizeEntity(entityName, reread);
          break;
        }
      }
    }
    if (syncRow?.user_id) {
      await syncProfileFromAdminSubscriptionRow({ ...syncRow, ...toUpdate });
    }
  }

  return normalizeEntity(entityName, data);
}

async function remove(entityName, id) {
  const tableCandidates = getTableCandidates(entityName);
  let error;
  for (const table of tableCandidates) {
    const result = await runPostgrestWithResilience(
      () => supabase.from(table).delete().eq('id', id),
      { kind: 'write', label: `paidly.${entityName}.delete` }
    );
    error = result.error;
    if (!error) break;
  }
  if (error) throw error;
  return { success: true };
}

async function me() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) throw authError || new Error('Not authenticated');

  const user = authData.user;
  const { data: profile, error: profileErr } = await runPostgrestWithResilience(
    () => supabase.from('profiles').select('*').eq('id', user.id).single(),
    { kind: 'read', label: 'paidly.me.profile' }
  );
  if (profileErr) throw profileErr;
  return {
    id: user.id,
    email: user.email,
    role: profile?.role || profile?.user_role || 'admin',
    full_name: profile?.full_name || user.user_metadata?.full_name || user.email,
    ...profile,
  };
}

function entityApi(entityName) {
  return {
    list: (orderBy, limit) => list(entityName, orderBy, limit),
    create: (payload) => create(entityName, payload),
    update: (id, payload) => update(entityName, id, payload),
    delete: (id) => remove(entityName, id),
  };
}

export const paidlyClient = {
  entities: new Proxy(
    {},
    {
      get(_, entityName) {
        return entityApi(entityName);
      },
    }
  ),
  auth: { me },
  users: {
    inviteUser: async () => {
      throw new Error('User invitations are not configured for Supabase-only mode.');
    },
  },
};

