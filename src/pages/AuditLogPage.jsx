import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { format } from 'date-fns';
import {
  Users,
  CreditCard,
  UserCheck,
  Settings,
  Banknote,
  Shield,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ScrollText,
  Lock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/dashboard/PageHeader';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getAuditLogsSupabaseTableMissing } from '@/lib/auditLogsSupabaseStatus';

const CATEGORY_META = {
  users: { label: 'Users', icon: Users, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  subscriptions: {
    label: 'Subscriptions',
    icon: CreditCard,
    color: 'bg-primary/10 text-primary border-primary/20',
  },
  affiliates: {
    label: 'Affiliates',
    icon: UserCheck,
    color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  },
  payouts: { label: 'Payouts', icon: Banknote, color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  settings: { label: 'Settings', icon: Settings, color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  team: { label: 'Team', icon: Shield, color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

function DiffViewer({ before, after }) {
  if (!before && !after) return null;
  let b;
  let a;
  try {
    b = before ? JSON.parse(before) : null;
  } catch {
    b = before;
  }
  try {
    a = after ? JSON.parse(after) : null;
  } catch {
    a = after;
  }

  if (!b && !a) return null;

  const keys = Array.from(new Set([...Object.keys(b || {}), ...Object.keys(a || {})]));

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border text-xs font-mono">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/40 text-muted-foreground">
            <th className="px-3 py-1.5 text-left font-medium">Field</th>
            <th className="px-3 py-1.5 text-left font-medium text-red-400">Before</th>
            <th className="px-3 py-1.5 text-left font-medium text-emerald-400">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {keys.map((k) => (
            <tr key={k} className="hover:bg-muted/20">
              <td className="px-3 py-1.5 text-muted-foreground">{k}</td>
              <td className="px-3 py-1.5 text-red-400">{b?.[k] !== undefined ? String(b[k]) : '—'}</td>
              <td className="px-3 py-1.5 text-emerald-400">{a?.[k] !== undefined ? String(a[k]) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[log.category] || CATEGORY_META.settings;
  const Icon = meta.icon;
  const hasDiff = log.before || log.after;

  return (
    <div className="border-b border-border/50 last:border-0">
      <div
        role={hasDiff ? 'button' : undefined}
        tabIndex={hasDiff ? 0 : undefined}
        className={cn(
          'flex items-start gap-4 px-5 py-4 transition-colors',
          hasDiff && 'cursor-pointer hover:bg-muted/20'
        )}
        onClick={() => hasDiff && setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (!hasDiff) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <div className={cn('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border', meta.color)}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('text-xs border', meta.color)}>
              {meta.label}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">{log.action}</span>
          </div>
          <p className="text-sm text-foreground">{log.description}</p>
          {log.target_label ? (
            <p className="mt-0.5 text-xs text-muted-foreground">Target: {log.target_label}</p>
          ) : null}
          {expanded ? <DiffViewer before={log.before} after={log.after} /> : null}
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1 text-right">
          <div className="flex items-center gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {(log.actor_name || log.actor_email || '?')[0].toUpperCase()}
            </div>
            <span className="text-xs font-medium">{log.actor_name || log.actor_email || '—'}</span>
          </div>
          {log.actor_role ? (
            <span className="text-xs capitalize text-muted-foreground">{log.actor_role}</span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {log.created_date ? format(new Date(log.created_date), 'dd MMM yyyy, HH:mm') : '—'}
          </span>
          {hasDiff ? (
            <span className="mt-1 text-xs text-muted-foreground">
              {expanded ? <ChevronDown className="inline h-3 w-3" /> : <ChevronRight className="inline h-3 w-3" />} diff
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const PAGE_TITLE = 'Audit Log';

export default function AuditLogPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    document.title = `${PAGE_TITLE} · Paidly`;
  }, []);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const logs = await paidly.entities.AuditLog.list('-created_date', 200);
      return { logs, supabaseTableMissing: getAuditLogsSupabaseTableMissing() };
    },
  });

  const logs = data?.logs ?? [];
  const supabaseTableMissing = data?.supabaseTableMissing ?? false;

  const filtered = logs.filter((l) => {
    const matchCategory = categoryFilter === 'all' || l.category === categoryFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (l.description || '').toLowerCase().includes(q) ||
      (l.actor_email || '').toLowerCase().includes(q) ||
      (l.actor_name || '').toLowerCase().includes(q) ||
      (l.target_label || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q);
    return matchCategory && matchSearch;
  });

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8">
      <PageHeader
        title={PAGE_TITLE}
        icon={<Shield className="h-6 w-6 text-primary" aria-hidden />}
        description="Full history of critical actions performed by internal team members."
        descriptionClassName="mt-2 max-w-2xl text-sm leading-relaxed sm:text-base"
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      {supabaseTableMissing ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="text-sm leading-relaxed">
            The <code className="rounded bg-muted px-1 font-mono text-foreground">public.audit_logs</code> table is
            not in this Supabase project (PostgREST 404 / missing relation). Apply the migration{' '}
            <code className="rounded bg-muted px-1 font-mono text-foreground">
              supabase/migrations/20260404150100_audit_logs.sql
            </code>{' '}
            via <span className="font-medium">Supabase CLI</span> (<code className="rounded bg-muted px-1">supabase
            db push</code>) or paste the file into the <span className="font-medium">SQL Editor</span> and run it.
            Until then, this page still shows entries from local storage and the unified audit service only.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="leading-relaxed">
            <span className="font-medium text-foreground">Internal compliance view.</span>{' '}
            Privileged changes—user access, subscriptions, affiliates, payouts, and platform settings—are
            listed below. This feed is read-only; expand a row when a before/after snapshot exists.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:shrink-0">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          <span>Latest 200 events from the server</span>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        {Object.entries(CATEGORY_META).map(([key, meta]) => {
          const count = logs.filter((l) => l.category === key).length;
          const Icon = meta.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setCategoryFilter(categoryFilter === key ? 'all' : key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                meta.color,
                categoryFilter === key
                  ? 'ring-2 ring-current ring-offset-1 ring-offset-background'
                  : 'opacity-70 hover:opacity-100'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
              <span className="rounded-full bg-black/10 px-1.5 py-0.5 dark:bg-white/10">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by description, actor, or target..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full bg-card sm:w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {!isLoading && filtered.length > 0 ? (
          <div className="hidden border-b border-border bg-muted/30 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_11rem] md:gap-4">
            <span>Activity and target</span>
            <span className="text-right">Actor and time</span>
          </div>
        ) : null}
        {isLoading ? (
          <div className="space-y-0 divide-y divide-border/50 px-5 py-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex animate-pulse gap-4 py-4">
                <div className="h-8 w-8 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 rounded bg-muted" />
                  <div className="h-3 w-full max-w-md rounded bg-muted" />
                </div>
                <div className="hidden w-28 flex-col gap-2 sm:flex">
                  <div className="ml-auto h-3 w-20 rounded bg-muted" />
                  <div className="ml-auto h-3 w-24 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/40">
              <Shield className="h-7 w-7 text-muted-foreground" aria-hidden />
            </div>
            <div className="max-w-md space-y-1">
              <p className="text-sm font-medium text-foreground">No entries match your filters</p>
              <p className="text-sm text-muted-foreground">
                {logs.length === 0
                  ? 'No internal audit events have been recorded yet, or your account cannot read the audit table. Try refreshing, or widen search and category filters.'
                  : 'Try clearing search or setting category to “All categories” to see the full internal history.'}
              </p>
            </div>
          </div>
        ) : (
          filtered.map((log) => <LogRow key={log.id} log={log} />)
        )}
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Showing {filtered.length} of {logs.length} internal audit event{logs.length === 1 ? '' : 's'} (server cap:
        200)
      </p>
    </div>
  );
}
