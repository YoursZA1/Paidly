import { supabase } from '@/lib/supabaseClient';

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
  if (t.includes('affiliate')) return 'affiliates';
  if (t.includes('payout') || t.includes('payment')) return 'payouts';
  if (t.includes('team') || t.includes('role')) return 'team';
  return 'settings';
}

/** Merges Supabase `audit_logs`, Settings `paidly_audit_log`, and unified AuditLogService entries. */
async function listAuditLogs(limit = 200) {
  const out = [];
  const seenIds = new Set();

  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error && data?.length) {
      for (const row of data) {
        const n = normalizeAuditLogRowDb(row);
        if (n.id != null) seenIds.add(String(n.id));
        out.push(n);
      }
    }
  } catch {
    /* table or policy may be missing */
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
    const legacy = AuditLogService.getLogs({ limit: 150 });
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
  return out.slice(0, limit);
}

const ENTITY_TABLES = {
  PlatformUser: 'profiles',
  Subscription: 'subscriptions',
  AffiliateSubmission: 'affiliate_applications',
  AffiliatePayout: 'commissions',
  WaitlistEntry: 'waitlist_signups',
  User: 'profiles',
};

const ENTITY_SELECTS = {
  PlatformUser: 'id, full_name, email, role, status, plan, subscription_plan, company_name, invoices_sent, invoices_count, created_at, updated_at',
  Subscription: 'id, user_id, user_email, email, user_name, full_name, plan, current_plan, amount, custom_price, status, billing_cycle, start_date, next_billing_date, created_at, updated_at',
  AffiliateSubmission: 'id, user_id, email, full_name, audience_platform, status, created_at, updated_at',
  AffiliatePayout: 'id, affiliate_id, amount, currency, status, source, created_at, updated_at',
  WaitlistEntry: 'id, name, full_name, email, converted, created_at, updated_at',
  User: 'id, email, full_name, role, created_at',
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
    return {
      ...row,
      applicant_name: row.applicant_name || row.full_name || row.name || '',
      applicant_email: row.applicant_email || row.email || '',
      audience_type: row.audience_type || row.audience_platform || 'other',
      referrals_count: Number(row.referrals_count || 0),
      earnings: Number(row.earnings || 0),
      commission_rate: Number(row.commission_rate ?? 15),
      status: row.status || 'pending',
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
    return {
      ...payload,
      full_name: payload.full_name || payload.applicant_name,
      email: payload.email || payload.applicant_email,
      audience_platform: payload.audience_platform || payload.audience_type,
      commission_rate: payload.commission_rate ?? undefined,
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

function normalizeOrder(orderBy) {
  if (!orderBy) return { column: 'created_at', ascending: false };
  const descending = String(orderBy).startsWith('-');
  const raw = descending ? String(orderBy).slice(1) : String(orderBy);
  const column = raw === 'created_date' ? 'created_at' : raw;
  return { column, ascending: !descending };
}

async function list(entityName, orderBy = '-created_date', limit = 100) {
  if (entityName === 'AuditLog') {
    return listAuditLogs(limit);
  }
  const table = getTable(entityName);
  const { column, ascending } = normalizeOrder(orderBy);
  const selectClause = ENTITY_SELECTS[entityName] || '*';
  const runListQuery = async (selectColumns, withOrder = true) => {
    let q = supabase.from(table).select(selectColumns).limit(limit);
    if (withOrder) {
      q = q.order(column, { ascending });
    }
    return q;
  };

  let { data, error } = await runListQuery(selectClause, true);
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
  if (error) throw error;

  if (entityName === 'AffiliateSubmission') {
    const userIds = [...new Set((data || []).map((a) => a.user_id).filter(Boolean))];
    if (userIds.length) {
      const { data: affiliateRows } = await supabase
        .from('affiliates')
        .select('id, user_id, application_id, referral_code, commission_rate')
        .in('user_id', userIds);
      const affiliateByUser = new Map((affiliateRows || []).map((r) => [r.user_id, r]));
      data = (data || []).map((row) => ({
        ...row,
        referral_code: row.referral_code || affiliateByUser.get(row.user_id)?.referral_code || '',
        commission_rate: Number(row.commission_rate ?? affiliateByUser.get(row.user_id)?.commission_rate ?? 15),
      }));
    }
  }

  return (data || []).map((row) => normalizeEntity(entityName, row));
}

async function create(entityName, payload) {
  const table = getTable(entityName);
  const toInsert = denormalizeEntity(entityName, payload);
  const { data, error } = await supabase.from(table).insert(toInsert).select().single();
  if (error) throw error;
  return normalizeEntity(entityName, data);
}

async function update(entityName, id, payload) {
  const table = getTable(entityName);
  const toUpdate = denormalizeEntity(entityName, payload);
  const { data, error } = await supabase.from(table).update(toUpdate).eq('id', id).select().single();
  if (error) throw error;

  // Keep canonical affiliate profile in sync so /dashboard/affiliate reflects admin updates.
  if (entityName === 'AffiliateSubmission') {
    const userId = data?.user_id || payload?.user_id;
    if (userId) {
      const affiliatePatch = {
        commission_rate: Number(payload?.commission_rate ?? data?.commission_rate ?? 15),
      };
      if (payload?.referral_code) affiliatePatch.referral_code = payload.referral_code;
      if (payload?.status) affiliatePatch.status = payload.status;
      if (data?.id) affiliatePatch.application_id = data.id;
      await supabase.from('affiliates').upsert(
        {
          user_id: userId,
          ...affiliatePatch,
        },
        { onConflict: 'user_id' }
      );
    }
  }

  return normalizeEntity(entityName, data);
}

async function remove(entityName, id) {
  const table = getTable(entityName);
  const { error } = await supabase.from(table).delete().eq('id', id);
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

// Backward-compatible alias during migration from legacy Base44 naming.
export const base44 = paidlyClient;
