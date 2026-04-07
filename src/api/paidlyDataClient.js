import { supabase } from '@/lib/supabaseClient';
import {
  getAuditLogsSupabaseAccessForbidden,
  markAuditLogsSupabaseAccessForbidden,
  markAuditLogsSupabaseTableMissing,
  resetAuditLogsSupabaseTableFlag,
} from '@/lib/auditLogsSupabaseStatus';
import { isSupabaseMissingRelationError } from '@/utils/supabaseErrorUtils';

const PAIDLY_AUDIT_STORAGE_KEY = 'paidly_audit_log';
let affiliateRowNotVisibleBreadcrumbShown = false;

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
  if (t.includes('affiliate')) return 'affiliates';
  if (t.includes('payout') || t.includes('payment')) return 'payouts';
  if (t.includes('team') || t.includes('role')) return 'team';
  return 'settings';
}

function logAffiliateRowNotVisibleOnce(context) {
  if (affiliateRowNotVisibleBreadcrumbShown || !import.meta.env?.DEV) return;
  affiliateRowNotVisibleBreadcrumbShown = true;
  console.info(
    `[dev breadcrumb] affiliate row not visible after write (${context}). Likely RLS or select visibility; operation may still have succeeded.`
  );
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

/** App entity name → Supabase public table. Affiliate pipeline rows: only `affiliate_applications` (not `affiliates`). */
const ENTITY_TABLES = {
  PlatformUser: 'profiles',
  Subscription: 'subscriptions',
  /** DB: public.affiliate_applications (not affiliate_submissions / not affiliates). */
  AffiliateSubmission: 'affiliate_applications',
  AffiliatePayout: 'commissions',
  WaitlistEntry: 'waitlist_signups',
  User: 'profiles',
  /** Platform documents — keyed by auth user for reporting (see documentOwnership.js). */
  Invoice: 'invoices',
  Quote: 'quotes',
  Payroll: 'payslips',
};

/** Single canonical table name (no status filter on list). */
const AFFILIATE_APPLICATION_TABLE_CANDIDATES = ['affiliate_applications'];

// Use '*' for tables whose schema differs across environments (PostgREST 400 if any column is missing).
// Normalization below still maps fields to the app shape.
const ENTITY_SELECTS = {
  PlatformUser: '*',
  Subscription: '*',
  WaitlistEntry: '*',
  AffiliateSubmission: '*',
  AffiliatePayout: 'id, affiliate_id, referral_id, amount, currency, status, source, created_at, updated_at',
  User: '*',
  Invoice: '*',
  Quote: '*',
  Payroll: '*',
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

  if (entityName === 'AffiliateSubmission') {
    const rawStatus = String(row.status || 'pending').toLowerCase();
    const normalizedStatus =
      rawStatus === 'accepted'
        ? 'approved'
        : rawStatus === 'rejected'
          ? 'declined'
          : rawStatus;
    return {
      ...row,
      applicant_name: row.applicant_name || row.full_name || row.name || '',
      applicant_email: row.applicant_email || row.email || '',
      audience_type: row.audience_type || row.audience_platform || 'other',
      audience_size: row.audience_size || null,
      why_promote: row.why_promote || null,
      description: row.description || row.why_promote || '',
      affiliate_partner_id: row.affiliate_partner_id ?? null,
      referrals_count: Number(row.referrals_count || 0),
      referrals_subscribed_count: Number(row.referrals_subscribed_count || 0),
      referrals_paid_count: Number(row.referrals_paid_count || 0),
      earnings: Number(row.earnings || 0),
      commission_rate: Number(row.commission_rate ?? 15),
      status: normalizedStatus || 'pending',
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

  if (entityName === 'Payroll') {
    return {
      ...row,
      created_date: row.created_date || row.created_at || null,
      user_id: row.user_id || row.created_by_id || null,
    };
  }

  if (entityName === 'AffiliatePayout') {
    const src = String(row.source || '');
    const readTag = (key) => {
      const m = src.match(new RegExp(`${key}=([^|]+)`));
      return m ? decodeURIComponent(m[1]) : null;
    };
    const period_month = readTag('period');
    const grossAmount = Number(readTag('gross'));
    const referralsCount = Number(readTag('referrals'));
    const sourceRate = Number(readTag('rate'));
    return {
      ...row,
      commission_amount: Number(row.amount ?? row.commission_amount ?? 0),
      period_month,
      gross_amount: Number.isFinite(grossAmount) ? grossAmount : null,
      referrals_count: Number.isFinite(referralsCount) ? referralsCount : null,
      commission_rate: Number.isFinite(sourceRate) ? sourceRate : row.commission_rate ?? null,
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

  if (entityName === 'AffiliateSubmission') {
    const rawStatus = String(payload.status || '').toLowerCase();
    // DB CHECK: pending | approved | rejected (not accepted/declined).
    const dbStatus =
      rawStatus === 'approved' || rawStatus === 'accepted'
        ? 'approved'
        : rawStatus === 'declined' || rawStatus === 'rejected'
          ? 'rejected'
          : payload.status;
    return {
      ...payload,
      full_name: payload.full_name || payload.applicant_name,
      email: payload.email || payload.applicant_email,
      audience_platform: payload.audience_platform || payload.audience_type,
      status: dbStatus,
      commission_rate: payload.commission_rate ?? undefined,
    };
  }

  if (entityName === 'WaitlistEntry') {
    const out = { ...payload };
    if (typeof out.email === 'string') out.email = out.email.trim().toLowerCase();
    if (out.full_name && !out.name) out.name = String(out.full_name).trim();
    return out;
  }

  if (entityName === 'AffiliatePayout') {
    const hasLedgerRow =
      payload?.affiliate_id != null &&
      Number(payload?.amount ?? payload?.commission_amount ?? NaN) > 0;
    if (!hasLedgerRow) {
      const out = {};
      if (payload?.status != null) out.status = payload.status;
      return out;
    }

    const notes = String(payload.notes || '')
      .trim()
      .replace(/\|/g, ' ')
      .slice(0, 400);
    const period = String(payload.period_month || '').trim();
    const rate =
      payload.commission_rate != null && payload.commission_rate !== ''
        ? String(payload.commission_rate).trim()
        : '';
    const gross =
      payload.gross_amount != null && payload.gross_amount !== ''
        ? String(payload.gross_amount).trim()
        : '';
    const referrals =
      payload.referrals_count != null && payload.referrals_count !== ''
        ? String(payload.referrals_count).trim()
        : '';
    const parts = ['payout_batch'];
    if (period) parts.push(`period=${encodeURIComponent(period)}`);
    if (rate) parts.push(`rate=${encodeURIComponent(rate)}`);
    if (gross) parts.push(`gross=${encodeURIComponent(gross)}`);
    if (referrals) parts.push(`referrals=${encodeURIComponent(referrals)}`);
    if (notes) parts.push(`notes=${encodeURIComponent(notes)}`);
    const source = parts.join('|').slice(0, 2000);

    return {
      affiliate_id: payload.affiliate_id,
      referral_id: payload.referral_id ?? null,
      amount: Number(payload.amount ?? payload.commission_amount ?? 0),
      currency: String(payload.currency || 'ZAR').slice(0, 8),
      status: payload.status || 'pending',
      source,
    };
  }

  return payload;
}

function getTable(entityName) {
  const table = ENTITY_TABLES[entityName];
  if (!table) throw new Error(`Unsupported entity: ${entityName}`);
  return table;
}

function getTableCandidates(entityName) {
  if (entityName === 'AffiliateSubmission') {
    return AFFILIATE_APPLICATION_TABLE_CANDIDATES;
  }
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

/** Join referral_code / commission from `affiliates` by application.user_id. */
async function enrichAffiliateSubmissionsRows(rows) {
  const userIds = [...new Set((rows || []).map((a) => a.user_id).filter(Boolean))];
  if (!userIds.length) return rows || [];
  const { data: affiliateRows, error: affiliatesEnrichError } = await supabase
    .from('affiliates')
    .select('*')
    .in('user_id', userIds);
  if (import.meta.env.DEV) {
    console.log(affiliateRows, affiliatesEnrichError);
    if (!affiliatesEnrichError && userIds.length && (!affiliateRows || affiliateRows.length === 0)) {
      console.warn(
        '[affiliate debug] affiliates enrichment: 0 rows for known user_ids → check RLS on public.affiliates (team_select).'
      );
    }
  }
  const affiliateByUser = new Map((affiliateRows || []).map((r) => [r.user_id, r]));
  return (rows || []).map((row) => ({
    ...row,
    referral_code: row.referral_code || affiliateByUser.get(row.user_id)?.referral_code || '',
    commission_rate: Number(
      row.commission_rate ??
        (() => {
          const v = affiliateByUser.get(row.user_id)?.commission_rate;
          const n = Number(v);
          if (!Number.isFinite(n)) return undefined;
          return n <= 1 ? n * 100 : n;
        })() ??
        15
    ),
  }));
}

/**
 * Shape raw `affiliate_applications` rows for admin UI (enrich from `affiliates` + normalize fields).
 * Use after service-role API fetch — no `user_id = auth.uid()` filter on the application rows themselves.
 */
export async function finalizeAffiliateApplicationsForAdmin(rawRows) {
  const enriched = await enrichAffiliateSubmissionsRows(rawRows || []);
  return enriched.map((row) =>
    normalizeEntity('AffiliateSubmission', {
      ...row,
      __source_table: 'affiliate_applications',
    })
  );
}

/**
 * Admin affiliate pipeline via **logged-in Supabase client** (RLS applies).
 * Prefer `fetchAdminAffiliateApplications` (Node API + service role) when available — full queue without session RLS quirks.
 */
export async function loadAffiliateSubmissionsForAdmin(orderBy = '-created_date', limitOrOpts = 150) {
  const limit = coerceListLimit(limitOrOpts, 150);
  const { column, ascending } = normalizeOrder(orderBy);
  const { data, error } = await supabase
    .from('affiliate_applications')
    .select('*')
    .order(column, { ascending })
    .limit(limit);
  if (import.meta.env.DEV) {
    console.log(data, error);
    if (!error && (!data || data.length === 0)) {
      console.warn(
        '[affiliate debug] affiliate_applications empty + no error → almost always RLS (not query filters). Check Supabase → Table → affiliate_applications → policies (team_select, jwt_admin_select).'
      );
    }
    if (error) {
      console.warn('[affiliate debug] affiliate_applications query error:', error.message);
    }
  }
  if (error) throw error;
  return finalizeAffiliateApplicationsForAdmin(data || []);
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
    ({ data, error } = await runListQuery(selectClause, true));
    if (error) {
      // Some tables do not expose the requested sort column; retry unsorted.
      const retryUnsorted = await runListQuery(selectClause, false);
      data = retryUnsorted.data;
      error = retryUnsorted.error;
    }
    if (error && selectClause !== '*') {
      // Schema may differ between environments; retry with wildcard columns.
      const retryWildcard = await runListQuery('*', true);
      data = retryWildcard.data;
      error = retryWildcard.error;
      if (error) {
        const retryWildcardUnsorted = await runListQuery('*', false);
        data = retryWildcardUnsorted.data;
        error = retryWildcardUnsorted.error;
      }
    }
    if (!error) break;
  }
  if (import.meta.env.DEV && entityName === 'AffiliateSubmission') {
    console.log(data, error);
    if (!error && Array.isArray(data) && data.length === 0) {
      console.warn(
        '[affiliate debug] AffiliateSubmission.list: 0 rows, no error → check RLS on affiliate_applications. If rows appear here after fixing RLS, any old .eq() filters in callers were the issue.'
      );
    }
  }
  if (error) throw error;

  if (entityName === 'AffiliateSubmission') {
    data = await enrichAffiliateSubmissionsRows(data || []);
  }

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
    const result = await supabase.from(table).insert(toInsert).select().limit(1);
    data = Array.isArray(result.data) ? result.data[0] : result.data;
    error = result.error;
    if (!error) break;
  }
  if (error) throw error;
  if (entityName === 'AffiliateSubmission' && !data) {
    logAffiliateRowNotVisibleOnce('create');
  }
  return normalizeEntity(entityName, data);
}

async function update(entityName, id, payload) {
  const toUpdate = denormalizeEntity(entityName, payload);
  const tableCandidates = getTableCandidates(entityName);
  let data;
  let error;
  for (const table of tableCandidates) {
    const result = await supabase.from(table).update(toUpdate).eq('id', id).select().limit(1);
    data = Array.isArray(result.data) ? result.data[0] : result.data;
    error = result.error;
    if (!error) break;
  }
  if (error && entityName === 'AffiliateSubmission' && payload?.status) {
    // Retry if an older client sent wrong vocabulary.
    const retryPatch = { ...toUpdate };
    const status = String(payload.status).toLowerCase();
    if (status === 'approved') retryPatch.status = 'approved';
    if (status === 'declined') retryPatch.status = 'rejected';
    for (const table of tableCandidates) {
      const result = await supabase.from(table).update(retryPatch).eq('id', id).select().limit(1);
      data = Array.isArray(result.data) ? result.data[0] : result.data;
      error = result.error;
      if (!error) break;
    }
  }
  if (error) throw error;
  if (entityName === 'AffiliateSubmission' && !data) {
    logAffiliateRowNotVisibleOnce('update');
  }

  // Keep canonical affiliate profile in sync so /dashboard/affiliate and commission webhooks match admin edits.
  if (entityName === 'AffiliateSubmission') {
    const toAffiliateRateFraction = (maybePercent) => {
      const n = Number(maybePercent);
      if (!Number.isFinite(n)) return undefined;
      if (n <= 0) return undefined;
      return n <= 1 ? n : n / 100;
    };

    const userId = data?.user_id || payload?.user_id;
    const applicationId = data?.id ?? id;
    const fraction =
      payload?.commission_rate != null || data?.commission_rate != null
        ? toAffiliateRateFraction(payload?.commission_rate ?? data?.commission_rate)
        : undefined;

    if (fraction != null && applicationId) {
      const { error: affUpErr } = await supabase
        .from('affiliates')
        .update({ commission_rate: fraction, updated_at: new Date().toISOString() })
        .eq('application_id', applicationId);
      if (affUpErr && import.meta.env?.DEV) {
        console.warn('[paidlyDataClient] affiliates commission sync by application_id:', affUpErr.message);
      }
    }

    if (userId) {
      const affiliatePatch = {};
      if (fraction != null) affiliatePatch.commission_rate = fraction;
      if (payload?.referral_code) affiliatePatch.referral_code = payload.referral_code;
      const st = String(payload?.status || '').toLowerCase();
      if (st === 'approved' || st === 'accepted') affiliatePatch.status = 'approved';
      else if (st === 'declined' || st === 'rejected') affiliatePatch.status = 'pending';
      if (data?.id) affiliatePatch.application_id = data.id;

      const payloadKeys = Object.keys(payload || {}).filter((k) => payload[k] !== undefined);
      const commissionOnly =
        payloadKeys.length === 1 && payloadKeys[0] === 'commission_rate';

      if (!commissionOnly && Object.keys(affiliatePatch).length > 0) {
        await supabase.from('affiliates').upsert(
          {
            user_id: userId,
            ...affiliatePatch,
          },
          { onConflict: 'user_id' }
        );
      }
    }
  }

  return normalizeEntity(entityName, data);
}

async function remove(entityName, id) {
  const tableCandidates = getTableCandidates(entityName);
  let error;
  for (const table of tableCandidates) {
    const result = await supabase.from(table).delete().eq('id', id);
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
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
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

