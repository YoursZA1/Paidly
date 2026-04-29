import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  UserPlus,
  UserCheck,
  AlertCircle,
  Loader2,
  Mail,
  CheckCircle,
  XCircle,
  ChevronRight,
  FileText,
  ScrollText,
  Banknote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { stableDirectoryRowKey, stableEntityRowKey } from '@/utils/stableListKey';
import { formatCurrency } from '@/utils/currencyCalculations';
import { createPageUrl } from '@/utils';

const FEED_MAX = 8;

function normStatus(s) {
  return String(s || '').toLowerCase();
}

function parseTime(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function activityTimestamp(source) {
  const t =
    parseTime(source?.created_at) ||
    parseTime(source?.created_date) ||
    parseTime(source?.updated_at) ||
    parseTime(source?.submitted_at) ||
    parseTime(source?.approved_at);
  return t;
}

function documentActivityTime(doc) {
  return (
    parseTime(doc?.paid_at) ||
    parseTime(doc?.updated_at) ||
    parseTime(doc?.updated_date) ||
    parseTime(doc?.pay_date) ||
    parseTime(doc?.created_at) ||
    parseTime(doc?.created_date)
  );
}

function formatRelative(at) {
  if (!at || !Number.isFinite(at.getTime?.()) || at.getTime() <= 0) return '—';
  try {
    return formatDistanceToNow(at, { addSuffix: true });
  } catch {
    return '—';
  }
}

function semanticActivityKey(item) {
  if (item.kind === 'signup') {
    const id = String(item.user?.id || '').trim();
    if (id) return `signup:${id}`;
    return `signup-email:${String(item.user?.email || '').trim().toLowerCase()}`;
  }
  if (item.kind === 'affiliate_pending' || item.kind === 'affiliate_approved') {
    const appId = String(item.aff?.id || '').trim();
    if (appId) return `${item.kind}:id:${appId}`;
    const email = String(item.aff?.applicant_email || item.aff?.email || '').trim().toLowerCase();
    if (email) return `${item.kind}:email:${email}`;
    return `${item.kind}:fallback:${String(item.subtext || '').trim().toLowerCase()}`;
  }
  if (item.kind === 'invoice') {
    const id = String(item.inv?.id || '').trim();
    if (id) return `invoice:${id}`;
  }
  if (item.kind === 'quote') {
    const id = String(item.quote?.id || '').trim();
    if (id) return `quote:${id}`;
  }
  if (item.kind === 'payslip') {
    const id = String(item.payslip?.id || '').trim();
    if (id) return `payslip:${id}`;
  }
  return `${item.kind}:${String(item.subtext || '').trim().toLowerCase()}:${item.sortAt}`;
}

/**
 * @param {{
 *   users: object[],
 *   affiliates: object[],
 *   pendingAffiliateCount?: number,
 *   busyAffiliateId?: string | null,
 *   onApproveAffiliate?: (aff: object) => void | Promise<void>,
 *   onDeclineAffiliate?: (aff: object) => void | Promise<void>,
 *   onResendAffiliateLink?: (aff: object) => void | Promise<void>,
 *   invoices?: object[],
 *   quotes?: object[],
 *   payslips?: object[],
 *   className?: string,
 * }} props
 */
export default function RecentActivity({
  users,
  affiliates,
  invoices,
  quotes,
  payslips,
  pendingAffiliateCount,
  busyAffiliateId = null,
  onApproveAffiliate,
  onDeclineAffiliate,
  onResendAffiliateLink,
  className,
}) {
  const showAffiliateActions = Boolean(
    onApproveAffiliate || onDeclineAffiliate || onResendAffiliateLink
  );

  const pendingList = (affiliates || []).filter((a) => normStatus(a.status) === 'pending');
  const pendingCount =
    typeof pendingAffiliateCount === 'number' ? pendingAffiliateCount : pendingList.length;

  const signupItems = (users || []).map((u) => {
    const at = activityTimestamp(u);
    const name = String(u?.full_name || '').trim();
    const email = String(u?.email || '').trim();
    const subtext = [name || null, email || null].filter(Boolean).join(' · ') || 'Platform user';
    return {
      kind: 'signup',
      at: at || new Date(0),
      sortAt: at ? at.getTime() : 0,
      user: u,
      title: 'New signup',
      subtext,
      icon: UserPlus,
      iconClass: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    };
  });

  const pendingAffiliateItems = pendingList.map((aff) => {
    const at = activityTimestamp(aff) || new Date(0);
    return {
      kind: 'affiliate_pending',
      at,
      sortAt: at.getTime(),
      aff,
      title: 'Affiliate review',
      subtext: [String(aff.applicant_name || '').trim() || '—', String(aff.applicant_email || '').trim()]
        .filter(Boolean)
        .join(' · '),
      icon: UserCheck,
      iconClass: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
    };
  });

  const approvedItems = (affiliates || [])
    .filter((a) => {
      const st = normStatus(a.status);
      return st === 'approved' || st === 'accepted';
    })
    .map((aff) => {
      const at = activityTimestamp(aff) || new Date(0);
      return {
        kind: 'affiliate_approved',
        at,
        sortAt: at.getTime(),
        aff,
        title: 'Affiliate approved',
        subtext: [
          String(aff.applicant_name || aff.applicant_email || '').trim() || '—',
          aff.referral_code ? `Code ${aff.referral_code}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        icon: CheckCircle,
        iconClass: 'bg-primary/10 text-primary',
      };
    });

  const invoiceItems = (invoices || [])
    .filter((inv) => {
      const st = normStatus(inv?.status);
      return st === 'paid' || st === 'partial_paid';
    })
    .map((inv) => {
      const st = normStatus(inv?.status);
      const at = documentActivityTime(inv) || new Date(0);
      const amt = Number(inv?.total_amount ?? inv?.total ?? 0);
      const cur = String(inv?.currency || 'ZAR').trim() || 'ZAR';
      const num = String(inv?.invoice_number || '').trim();
      const proj = String(inv?.project_title || '').trim();
      const subtext = [num || null, proj || null, formatCurrency(amt, cur)].filter(Boolean).join(' · ') || 'Invoice';
      return {
        kind: 'invoice',
        at,
        sortAt: at.getTime(),
        inv,
        title: st === 'partial_paid' ? 'Invoice partially paid' : 'Invoice paid',
        subtext,
        icon: FileText,
        iconClass:
          st === 'partial_paid'
            ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400'
            : 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
      };
    });

  const quoteItems = (quotes || [])
    .filter((q) => normStatus(q?.status) === 'accepted')
    .map((quote) => {
      const at = documentActivityTime(quote) || new Date(0);
      const amt = Number(quote?.total_amount ?? quote?.total ?? 0);
      const cur = String(quote?.currency || 'ZAR').trim() || 'ZAR';
      const num = String(quote?.quote_number || '').trim();
      const proj = String(quote?.project_title || '').trim();
      const subtext = [num || null, proj || null, formatCurrency(amt, cur)].filter(Boolean).join(' · ') || 'Quote';
      return {
        kind: 'quote',
        at,
        sortAt: at.getTime(),
        quote,
        title: 'Quote accepted',
        subtext,
        icon: ScrollText,
        iconClass: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
      };
    });

  const payslipItems = (payslips || [])
    .filter((p) => {
      const st = normStatus(p?.status);
      return st === 'sent' || st === 'paid';
    })
    .map((payslip) => {
      const st = normStatus(payslip?.status);
      const at =
        parseTime(payslip?.updated_at) ||
        parseTime(payslip?.pay_date) ||
        parseTime(payslip?.created_at) ||
        new Date(0);
      const net = Number(payslip?.net_pay ?? 0);
      const cur = String(payslip?.currency || 'ZAR').trim() || 'ZAR';
      const num = String(payslip?.payslip_number || '').trim();
      const emp = String(payslip?.employee_name || '').trim();
      const subtext = [num || null, emp || null, formatCurrency(net, cur)].filter(Boolean).join(' · ') || 'Payslip';
      return {
        kind: 'payslip',
        at,
        sortAt: at.getTime(),
        payslip,
        title: st === 'paid' ? 'Payslip paid' : 'Payslip issued',
        subtext,
        icon: Banknote,
        iconClass: 'bg-sky-500/12 text-sky-800 dark:text-sky-300',
      };
    });

  const hasPaidInvoice = (invoices || []).some((inv) => {
    const st = normStatus(inv?.status);
    return st === 'paid' || st === 'partial_paid';
  });
  const hasAcceptedQuote = (quotes || []).some((q) => normStatus(q?.status) === 'accepted');
  const hasIssuedPayslip = (payslips || []).some((p) => {
    const st = normStatus(p?.status);
    return st === 'sent' || st === 'paid';
  });
  const hasDocLists =
    (invoices?.length || 0) + (quotes?.length || 0) + (payslips?.length || 0) > 0;

  const mergedRaw = [
    ...signupItems,
    ...pendingAffiliateItems,
    ...approvedItems,
    ...invoiceItems,
    ...quoteItems,
    ...payslipItems,
  ];

  // Defense in depth: if upstream writes duplicate events, keep the newest event per semantic entity.
  const dedupedBySemanticKey = new Map();
  for (const item of mergedRaw) {
    const key = semanticActivityKey(item);
    const prev = dedupedBySemanticKey.get(key);
    if (!prev || item.sortAt > prev.sortAt) {
      dedupedBySemanticKey.set(key, item);
    }
  }

  const merged = Array.from(dedupedBySemanticKey.values())
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, FEED_MAX);

  let viewAllHref = '/admin-v2/users';
  let viewAllTitle = 'Browse all users';
  if (pendingCount > 0) {
    viewAllHref = '/admin-v2/affiliates';
    viewAllTitle = 'Open affiliate queue';
  } else if (hasPaidInvoice) {
    viewAllHref = createPageUrl('Invoices');
    viewAllTitle = 'Open invoices';
  } else if (hasAcceptedQuote) {
    viewAllHref = createPageUrl('Quotes');
    viewAllTitle = 'Open quotes';
  } else if (hasIssuedPayslip) {
    viewAllHref = createPageUrl('Payslips');
    viewAllTitle = 'Open payslips';
  }

  return (
    <aside
      className={cn(
        'flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        'lg:sticky lg:top-4 lg:self-start',
        className
      )}
    >
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Recent Activity</h2>
            {pendingCount > 0 ? (
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {pendingCount} pending affiliate{pendingCount === 1 ? '' : 's'}
              </p>
            ) : hasDocLists ? (
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                Payments, quotes, payslips · signups &amp; partners
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-muted-foreground">Latest signups &amp; partners</p>
            )}
          </div>
          <Link
            to={viewAllHref}
            title={viewAllTitle}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md py-1 text-xs font-medium text-primary hover:underline"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="min-h-0 max-h-[min(20rem,38vh)] overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-2 sm:max-h-[min(22rem,42vh)]">
        {merged.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/70" aria-hidden />
            <p className="text-sm text-muted-foreground">No recent activity yet</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {merged.map((item, idx) => {
              const Icon = item.icon;
              const rel = formatRelative(item.at);
              const rowKey =
                item.kind === 'signup'
                  ? stableDirectoryRowKey(item.user, idx)
                  : item.kind === 'affiliate_pending' || item.kind === 'affiliate_approved'
                    ? stableEntityRowKey(item.aff, idx)
                    : item.kind === 'invoice'
                      ? stableEntityRowKey(item.inv, idx)
                      : item.kind === 'quote'
                        ? stableEntityRowKey(item.quote, idx)
                        : item.kind === 'payslip'
                          ? stableEntityRowKey(item.payslip, idx)
                          : `row:${idx}`;

              return (
                <li key={`${item.kind}-${rowKey}-${idx}`}>
                  <div
                    className={cn(
                      'rounded-lg px-2 py-2 transition-colors',
                      'hover:bg-muted/50 dark:hover:bg-muted/25'
                    )}
                  >
                    <div className="flex gap-2.5">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          item.iconClass
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-medium leading-tight text-foreground">{item.title}</p>
                          <time
                            dateTime={
                              item.at && item.at.getTime() > 0 ? item.at.toISOString() : undefined
                            }
                            className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground"
                          >
                            {rel}
                          </time>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                          {item.subtext}
                        </p>

                        {item.kind === 'affiliate_pending' && showAffiliateActions ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {onApproveAffiliate ? (
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 px-2 text-[11px] bg-emerald-600 text-white hover:bg-emerald-700"
                                disabled={busyAffiliateId === item.aff?.id}
                                onClick={() => onApproveAffiliate(item.aff)}
                              >
                                {busyAffiliateId === item.aff?.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                ) : (
                                  <CheckCircle className="h-3 w-3" aria-hidden />
                                )}
                                <span className="ml-1">Approve</span>
                              </Button>
                            ) : null}
                            {onDeclineAffiliate ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 border-destructive/25 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                                disabled={busyAffiliateId === item.aff?.id}
                                onClick={() => onDeclineAffiliate(item.aff)}
                              >
                                <XCircle className="h-3 w-3" aria-hidden />
                                <span className="ml-1">Decline</span>
                              </Button>
                            ) : null}
                          </div>
                        ) : null}

                        {item.kind === 'affiliate_approved' && onResendAffiliateLink ? (
                          <div className="mt-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 gap-1 px-2 text-[11px]"
                              disabled={busyAffiliateId === item.aff?.id}
                              onClick={() => onResendAffiliateLink(item.aff)}
                            >
                              {busyAffiliateId === item.aff?.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                              ) : (
                                <Mail className="h-3 w-3" aria-hidden />
                              )}
                              Resend link
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
