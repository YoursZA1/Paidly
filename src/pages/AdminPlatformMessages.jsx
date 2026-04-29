import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isToday } from 'date-fns';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  Megaphone,
  Plus,
  Search,
  Send,
  User,
  ArrowLeft,
  LayoutTemplate,
  ClipboardList,
  Copy,
  Mail,
  CircleAlert,
  CheckCircle2,
  Clock3,
  Radio,
  Filter,
  Star,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';

import { paidly } from '@/api/paidlyClient';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import {
  fetchAdminPlatformUserMessages,
  fetchAdminBroadcastJobs,
  postAdminBroadcastUpdate,
  postAdminSendMessage,
} from '@/api/fetchAdminPlatformUserMessages';
import PageHeader from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import PlatformUsersLoadErrorHint from '@/components/PlatformUsersLoadErrorHint';
import {
  buildAdminPlatformMessagePresets,
  DEFAULT_ADMIN_PLATFORM_SUBJECT,
} from '@/lib/adminPlatformMessagePresets';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { stableDirectoryRowKey } from '@/utils/stableListKey';

const CHANNEL_OPTIONS = [
  { id: 'in_app', label: 'In-App' },
  { id: 'email', label: 'Email' },
  { id: 'both', label: 'Both' },
];
const THREADS_PER_PAGE = 18;

function channelToFlags(channel) {
  const normalized = String(channel || 'both').toLowerCase();
  if (normalized === 'in_app') return { sendInApp: true, sendEmail: false };
  if (normalized === 'email') return { sendInApp: false, sendEmail: true };
  return { sendInApp: true, sendEmail: true };
}

function normalizeMessageChannel(message) {
  const raw = String(message?.channel || '').toLowerCase();
  if (raw === 'in_app' || raw === 'email' || raw === 'both') return raw;
  const hasEmail = Boolean(message?.send_email);
  const hasInApp = Boolean(message?.send_in_app);
  if (hasEmail && hasInApp) return 'both';
  if (hasEmail) return 'email';
  return 'in_app';
}

function platformUserLabel(u) {
  if (!u) return 'Unknown user';
  const name = String(u.full_name || u.profile?.full_name || '').trim();
  const email = String(u.email || '').trim();
  if (name && name !== '—') return name;
  return email || u.id || 'Unknown user';
}

function platformUserRole(u) {
  const role = String(u?.role || u?.profile?.role || u?.profile?.user_role || '').trim().toLowerCase();
  return role || 'user';
}

/** Display only: merged admin API uses Auth email first; profile fallback when using profiles-only list. */
function platformUserEmail(u) {
  return String(u?.email || u?.profile?.email || '').trim();
}

function platformUserSearchBlob(u) {
  if (!u) return '';
  const label = platformUserLabel(u);
  const email = platformUserEmail(u);
  const id = String(u.id || '').trim();
  const role = platformUserRole(u);
  const profileName = String(u?.profile?.full_name || '').trim();
  const profileCompany = String(u?.profile?.company_name || u?.company_name || u?.company || '').trim();
  const metadataName = String(u?.user_metadata?.full_name || u?.user_metadata?.name || '').trim();
  return [label, email, id, role, profileName, profileCompany, metadataName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function channelLabelFromConversation(c) {
  const hasEmail = Boolean(c?.send_email);
  const hasInApp = Boolean(c?.send_in_app);
  if (hasEmail && hasInApp) return 'both';
  if (hasEmail) return 'email';
  if (hasInApp) return 'in_app';
  return String(c?.channel || 'both');
}

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'failed') return 'destructive';
  if (s === 'opened' || s === 'delivered') return 'default';
  if (s === 'sent') return 'secondary';
  return 'outline';
}

function normalizeEmailKey(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/** @param {Array<{ email?: string }>} entries */
function buildWaitlistByEmail(entries) {
  const m = new Map();
  for (const e of entries || []) {
    const k = normalizeEmailKey(e?.email);
    if (k) m.set(k, e);
  }
  return m;
}

/** @param {Record<string, unknown> | null | undefined} entry */
function buildWaitlistClipboardSummary(entry) {
  if (!entry) return '';
  const email = String(entry.email || '').trim();
  const name = String(entry.name || '').trim() || '—';
  const joined = entry.created_date
    ? format(new Date(entry.created_date), 'MMM d, yyyy')
    : '—';
  const source = String(entry.source || '').trim() || '—';
  const converted = entry.converted ? 'yes' : 'no';
  return `Waitlist (internal): ${name} <${email}> | Joined: ${joined} | Source: ${source} | Marked converted: ${converted}`;
}

/** If waitlist has a name, replace leading `Hi there,` with `Hi {First},` in starter bodies. */
function personalizeTemplateBodyFromWaitlist(body, waitlistEntry) {
  const raw = String(body || '');
  const full = String(waitlistEntry?.name || '').trim();
  if (!full) return raw;
  const first = full.split(/\s+/)[0];
  if (!first) return raw;
  return raw.replace(/^Hi there,/m, `Hi ${first},`);
}

/**
 * @param {object} props
 * @param {Record<string, unknown> | null | undefined} props.entry
 * @param {boolean} props.loading
 * @param {string} [props.errorMessage]
 * @param {string} [props.className]
 */
function WaitlistContextBlock({ entry, loading, errorMessage, className }) {
  if (loading) {
    return <Skeleton className={cn('h-16 w-full rounded-lg', className)} />;
  }
  if (errorMessage) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)} role="status">
        Could not load waitlist ({errorMessage})
      </p>
    );
  }
  if (!entry) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground',
          className
        )}
      >
        No waitlist row matches this signup email — they may have registered without joining the waitlist.
      </div>
    );
  }

  const joined = entry.created_date
    ? format(new Date(entry.created_date), 'MMM d, yyyy')
    : '—';

  const handleCopy = async () => {
    const text = buildWaitlistClipboardSummary(entry);
    try {
      await navigator.clipboard.writeText(text);
      notifySuccess('Waitlist summary copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <div className={cn('rounded-lg border border-border bg-muted/15 px-3 py-2.5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <span className="text-sm font-medium">Waitlist</span>
          {entry.converted ? (
            <Badge variant="secondary" className="text-[10px] font-normal">
              Converted
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-normal">
              Not converted
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs shrink-0"
          onClick={handleCopy}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy summary
        </Button>
      </div>
      <dl className="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-1">
          <dt className="font-medium text-foreground/85">Name on waitlist</dt>
          <dd className="truncate">{String(entry.name || '').trim() || '—'}</dd>
        </div>
        <div className="min-w-0 sm:col-span-1">
          <dt className="font-medium text-foreground/85">Signed up</dt>
          <dd>{joined}</dd>
        </div>
        {String(entry.source || '').trim() ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="font-medium text-foreground/85">Source</dt>
            <dd className="break-words">{String(entry.source).trim()}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function presetBodyPreview(body, max = 96) {
  const line = String(body || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max)}…`;
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {Array<{ id: string, label: string, subject: string, body: string }>} props.presets
 * @param {(preset: { id: string, label: string, subject: string, body: string } | null) => void} props.onSelect
 */
function AdminStarterTemplatesDialog({ open, onOpenChange, presets, onSelect }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[min(90dvh,720px)] flex flex-col gap-0 p-0 overflow-hidden sm:max-w-lg">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 text-left">
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" aria-hidden />
            Starter templates
          </DialogTitle>
          <DialogDescription>
            South African English starters for waitlist, confirmations, and updates. Edit before sending;
            login links use this site&apos;s origin.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 border-y border-border overflow-y-auto overscroll-contain">
          <div className="space-y-2 p-4 pr-4 pb-6">
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="w-full rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-medium text-foreground">Write from scratch</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Keep your current subject and message; no template applied
              </span>
            </button>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-medium text-foreground">{p.label}</span>
                <span className="mt-1 block text-xs font-medium text-muted-foreground">{p.subject}</span>
                <span className="mt-1.5 block text-xs leading-snug text-muted-foreground line-clamp-2">
                  {presetBodyPreview(p.body)}
                </span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t border-border bg-muted/10 px-6 py-4 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPlatformMessages() {
  const SWIPE_HINT_STORAGE_KEY = 'paidly_admin_messages_swipe_hint_dismissed';
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();
  const { resolvedTheme, setTheme } = useTheme();
  const messagePresets = useMemo(
    () =>
      buildAdminPlatformMessagePresets(
        typeof window !== 'undefined' ? window.location.origin : 'https://www.paidly.co.za'
      ),
    []
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [messageKindFilter, setMessageKindFilter] = useState('all');
  const [segmentFilter, setSegmentFilter] = useState('all-users');
  const [userPickerQuery, setUserPickerQuery] = useState('');
  const [selectedRecipientId, setSelectedRecipientId] = useState(null);
  const [selectedHubType, setSelectedHubType] = useState('direct');
  const [selectedBroadcastJobId, setSelectedBroadcastJobId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newTemplateId, setNewTemplateId] = useState('');
  const [newSubject, setNewSubject] = useState(DEFAULT_ADMIN_PLATFORM_SUBJECT);
  const [newBody, setNewBody] = useState('');
  const [newChannel, setNewChannel] = useState('both');
  const [replyTemplateId, setReplyTemplateId] = useState('');
  const [replySubject, setReplySubject] = useState(DEFAULT_ADMIN_PLATFORM_SUBJECT);
  const [replyBody, setReplyBody] = useState('');
  const [replyChannel, setReplyChannel] = useState('both');
  const [templatePickerTarget, setTemplatePickerTarget] = useState(
    /** @type {null | 'reply' | 'new'} */ (null)
  );
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastSubject, setBroadcastSubject] = useState('Paidly platform update');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [threadsPage, setThreadsPage] = useState(1);
  const [segmentsCollapsed, setSegmentsCollapsed] = useState(true);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const threadEndRef = useRef(null);
  const drawerTouchStartXRef = useRef(null);

  const {
    data: platformUsers = [],
    isLoading: usersLoading,
    isError: usersError,
    error: usersErr,
  } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => platformUsersQueryFn(2000),
    staleTime: 60_000,
  });

  const userMap = useMemo(() => {
    const m = new Map();
    for (const u of platformUsers) {
      if (u?.id) m.set(u.id, u);
    }
    return m;
  }, [platformUsers]);

  const {
    data: waitlistEntries = [],
    isLoading: waitlistLoading,
    isError: waitlistIsError,
    error: waitlistQueryError,
  } = useQuery({
    queryKey: ['waitlist', 'admin-platform-messages'],
    queryFn: () => paidly.entities.WaitlistEntry.list('-created_date', 2500),
    staleTime: 60_000,
  });

  const waitlistByEmail = useMemo(() => buildWaitlistByEmail(waitlistEntries), [waitlistEntries]);

  const {
    data: convPayload,
    isLoading: convLoading,
    error: convError,
  } = useQuery({
    queryKey: ['admin-platform-user-messages', 'conversations'],
    queryFn: () => fetchAdminPlatformUserMessages({ listLimit: 500, messageType: 'direct' }),
    refetchInterval: 12_000,
  });

  const conversations = convPayload?.conversations ?? [];

  const { data: broadcastPayload, isLoading: broadcastLoading } = useQuery({
    queryKey: ['admin-broadcast-jobs'],
    queryFn: () => fetchAdminBroadcastJobs({ limit: 120 }),
    refetchInterval: 20_000,
  });
  const broadcastJobs = broadcastPayload?.jobs ?? [];

  const {
    data: threadPayload,
    isLoading: threadLoading,
    error: threadError,
    refetch: refetchThread,
    isFetching: threadFetching,
  } = useQuery({
    queryKey: ['admin-platform-user-messages', 'thread', selectedRecipientId],
    queryFn: () =>
      fetchAdminPlatformUserMessages({ recipientId: selectedRecipientId, threadLimit: 150, messageType: 'direct' }),
    enabled: Boolean(selectedRecipientId),
    refetchInterval: 12_000,
  });

  const threadMessages = threadPayload?.messages ?? [];

  useEffect(() => {
    if (!selectedRecipientId || threadMessages.length === 0) return;
    const latest = threadMessages[0];
    const sub = String(latest?.subject || '').trim();
    if (sub) setReplySubject(sub.startsWith('Re:') ? sub : `Re: ${sub}`);
  }, [selectedRecipientId, threadMessages]);

  const userSegments = useMemo(() => {
    const now = Date.now();
    const activeIds = new Set(
      conversations
        .filter((c) => {
          const ts = c?.last_at ? new Date(c.last_at).getTime() : 0;
          return Number.isFinite(ts) && now - ts <= 1000 * 60 * 60 * 24 * 14;
        })
        .map((c) => c.recipient_id)
    );
    const trialIds = new Set(
      platformUsers
        .filter((u) => {
          const role = platformUserRole(u);
          const plan = String(u?.subscription_status || u?.subscription_plan || u?.plan || '').toLowerCase();
          return role.includes('trial') || plan.includes('trial');
        })
        .map((u) => u.id)
    );
    const payingIds = new Set(
      platformUsers
        .filter((u) => {
          const plan = String(u?.subscription_status || u?.subscription_plan || u?.plan || '').toLowerCase();
          return ['active', 'paid', 'pro', 'premium', 'business'].some((t) => plan.includes(t));
        })
        .map((u) => u.id)
    );
    const failedEmailIds = new Set(
      conversations
        .filter((c) => {
          const st = String(c?.status || '').toLowerCase();
          const emailSt = String(c?.deliveries?.email?.status || '').toLowerCase();
          return st === 'failed' || emailSt === 'failed';
        })
        .map((c) => c.recipient_id)
    );
    return [
      { id: 'all-users', label: 'All Users', count: platformUsers.length, ids: null },
      { id: 'recently-active', label: 'Recently Active', count: activeIds.size, ids: activeIds },
      { id: 'trial-users', label: 'Trial Users', count: trialIds.size, ids: trialIds },
      { id: 'paying-users', label: 'Paying Users', count: payingIds.size, ids: payingIds },
      { id: 'failed-email-users', label: 'Failed Email Users', count: failedEmailIds.size, ids: failedEmailIds },
    ];
  }, [platformUsers, conversations]);

  const filteredConversations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const segment = userSegments.find((s) => s.id === segmentFilter);
    return conversations.filter((c) => {
      if (segment?.ids && !segment.ids.has(c.recipient_id)) return false;
      const status = String(c?.status || '').toLowerCase();
      const channel = channelLabelFromConversation(c);
      const failed = status === 'failed' || String(c?.deliveries?.email?.status || '').toLowerCase() === 'failed';
      if (messageKindFilter === 'broadcast') return false;
      if (messageKindFilter === 'email' && !(channel === 'email' || channel === 'both')) return false;
      if (messageKindFilter === 'direct' && channel === 'email') return false;
      if (messageKindFilter === 'failed' && !failed) return false;
      if (!q) return true;
      const u = userMap.get(c.recipient_id);
      const label = platformUserLabel(u).toLowerCase();
      const email = platformUserEmail(u).toLowerCase();
      const prev = String(c.preview || '').toLowerCase();
      return label.includes(q) || email.includes(q) || prev.includes(q);
    });
  }, [conversations, searchTerm, userMap, segmentFilter, messageKindFilter, userSegments]);

  const filteredBroadcastJobs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return broadcastJobs.filter((job) => {
      if (messageKindFilter === 'direct') return false;
      if (messageKindFilter === 'email') return true;
      if (messageKindFilter === 'failed') {
        return Number(job?.email_failed || 0) > 0 || String(job?.status || '').toLowerCase() === 'failed';
      }
      if (!q) return true;
      return (
        String(job?.subject || '').toLowerCase().includes(q) ||
        String(job?.content || '').toLowerCase().includes(q)
      );
    });
  }, [broadcastJobs, messageKindFilter, searchTerm]);

  const pagedThreadItems = useMemo(() => {
    const conversationItems = filteredConversations.map((conversation) => ({
      kind: 'direct',
      id: String(conversation.recipient_id || ''),
      sortAt: conversation?.last_at ? new Date(conversation.last_at).getTime() : 0,
      payload: conversation,
    }));
    const broadcastItems = filteredBroadcastJobs.map((job) => ({
      kind: 'broadcast',
      id: String(job?.id || ''),
      sortAt: job?.created_at ? new Date(job.created_at).getTime() : 0,
      payload: job,
    }));
    const all = [...conversationItems, ...broadcastItems].sort((a, b) => b.sortAt - a.sortAt);
    const totalPages = Math.max(1, Math.ceil(all.length / THREADS_PER_PAGE));
    const safePage = Math.min(Math.max(1, threadsPage), totalPages);
    const start = (safePage - 1) * THREADS_PER_PAGE;
    const items = all.slice(start, start + THREADS_PER_PAGE);
    return { items, total: all.length, totalPages, safePage };
  }, [filteredConversations, filteredBroadcastJobs, threadsPage]);

  useEffect(() => {
    setThreadsPage(1);
  }, [searchTerm, messageKindFilter, segmentFilter]);

  useEffect(() => {
    if (threadsPage !== pagedThreadItems.safePage) {
      setThreadsPage(pagedThreadItems.safePage);
    }
  }, [threadsPage, pagedThreadItems.safePage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = window.sessionStorage.getItem(SWIPE_HINT_STORAGE_KEY) === '1';
    setShowSwipeHint(!dismissed);
  }, []);

  const sendMutation = useMutation({
    mutationFn: postAdminSendMessage,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-platform-user-messages'] });
      const recipientId = variables.recipientId || variables.recipientIds?.[0];
      if (recipientId) {
        setSelectedRecipientId(recipientId);
        setSelectedHubType('direct');
      }
    },
    onError: (e) => {
      toast.error(e?.message || 'Failed to send');
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: postAdminBroadcastUpdate,
    onError: (e) => {
      toast.error(e?.message || 'Failed to broadcast update');
    },
  });

  const handleSendNew = async () => {
    if (sendMutation.isPending) return;
    const rid = String(newRecipientId || '').trim();
    const sub = String(newSubject || '').trim() || DEFAULT_ADMIN_PLATFORM_SUBJECT;
    const body = newBodyTrimmed;
    if (!rid) {
      toast.error('Choose a recipient');
      return;
    }
    if (!body) {
      toast.error('Enter a message');
      return;
    }
    try {
      const { sendInApp, sendEmail } = channelToFlags(newChannel);
      const result = await sendMutation.mutateAsync({
        recipientIds: [rid],
        subject: sub,
        content: body,
        sendInApp,
        sendEmail,
      });
      const channelSummary = [sendInApp ? 'Dashboard' : null, sendEmail ? 'Email' : null]
        .filter(Boolean)
        .join(' + ');
      const skippedEmail = Number(result?.skippedEmail || 0);
      notifySuccess(
        'Message sent',
        `${channelSummary} delivery attempted. Delivered to ${result.sent || 0} recipient(s). Email failed: ${result.failedEmail || 0}. Email skipped: ${skippedEmail}.`
      );
      setComposerOpen(false);
      setNewRecipientId('');
      setNewTemplateId('');
      setNewSubject(DEFAULT_ADMIN_PLATFORM_SUBJECT);
      setNewBody('');
      setNewChannel('both');
      setUserPickerQuery('');
    } catch {
      /* toast in mutation */
    }
  };

  const handleSendReply = async () => {
    if (sendMutation.isPending) return;
    if (!selectedRecipientId) return;
    const sub = String(replySubject || '').trim() || DEFAULT_ADMIN_PLATFORM_SUBJECT;
    const body = replyBodyTrimmed;
    if (!body) {
      toast.error('Enter a message');
      return;
    }
    try {
      const { sendInApp, sendEmail } = channelToFlags(replyChannel);
      const result = await sendMutation.mutateAsync({
        recipientIds: [selectedRecipientId],
        subject: sub,
        content: body,
        sendInApp,
        sendEmail,
      });
      const channelSummary = [sendInApp ? 'Dashboard' : null, sendEmail ? 'Email' : null]
        .filter(Boolean)
        .join(' + ');
      const skippedEmail = Number(result?.skippedEmail || 0);
      notifySuccess(
        'Message sent',
        `${channelSummary} delivery attempted. Delivered to ${result.sent || 0} recipient(s). Email failed: ${result.failedEmail || 0}. Email skipped: ${skippedEmail}.`
      );
      setReplyTemplateId('');
      setReplyBody('');
    } catch {
      /* toast in mutation */
    }
  };

  const handleBroadcastUpdate = async () => {
    const subject = String(broadcastSubject || '').trim();
    const content = String(broadcastBody || '').trim();
    if (!content) {
      toast.error('Enter an update message');
      return;
    }
    try {
      const result = await broadcastMutation.mutateAsync({ subject, content });
      setBroadcastResult(result);
      if (result?.jobId) {
        setSelectedBroadcastJobId(String(result.jobId));
        setSelectedHubType('broadcast');
      }
      notifySuccess(
        'Update sent',
        `Inbox messages: ${result.insertedMessages}. Notifications: ${result.inserted}. Email sent: ${result.emailSent}. Queued: ${result.emailQueued}.`
      );
      setBroadcastSubject('Paidly platform update');
      setBroadcastBody('');
    } catch {
      /* toast from mutation */
    }
  };

  const pickerUsers = useMemo(() => {
    const q = userPickerQuery.trim().toLowerCase();
    const list = [...platformUsers];
    if (!q) return list.slice(0, 80);
    return list
      .filter((u) => {
        return platformUserSearchBlob(u).includes(q);
      })
      .slice(0, 80);
  }, [platformUsers, userPickerQuery]);

  const sortedThread = useMemo(
    () =>
      [...threadMessages].sort(
        (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
      ),
    [threadMessages]
  );

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedThread.length, selectedRecipientId]);

  const selectedUser = selectedRecipientId ? userMap.get(selectedRecipientId) : null;
  const selectedBroadcastJob = useMemo(
    () => broadcastJobs.find((j) => String(j?.id || '') === String(selectedBroadcastJobId || '')) || null,
    [broadcastJobs, selectedBroadcastJobId]
  );
  const selectedSignupEmailKey = normalizeEmailKey(platformUserEmail(selectedUser));
  const selectedWaitlistEntry = selectedSignupEmailKey
    ? waitlistByEmail.get(selectedSignupEmailKey)
    : null;

  const composePickUser = newRecipientId ? userMap.get(newRecipientId) : null;
  const composeSignupEmailKey = normalizeEmailKey(platformUserEmail(composePickUser));
  const composeWaitlistEntry = composeSignupEmailKey
    ? waitlistByEmail.get(composeSignupEmailKey)
    : null;

  const waitlistErrorMessage = waitlistIsError
    ? String(waitlistQueryError?.message || 'Failed to load')
    : '';

  const replyPresetLabel = messagePresets.find((p) => p.id === replyTemplateId)?.label;
  const newPresetLabel = messagePresets.find((p) => p.id === newTemplateId)?.label;

  const applyTemplateSelection = (preset) => {
    const target = templatePickerTarget;
    if (!target) return;
    if (!preset) {
      if (target === 'reply') setReplyTemplateId('');
      else setNewTemplateId('');
      setTemplatePickerTarget(null);
      return;
    }
    if (target === 'reply') {
      setReplyTemplateId(preset.id);
      setReplySubject(preset.subject);
      setReplyBody(personalizeTemplateBodyFromWaitlist(preset.body, selectedWaitlistEntry));
    } else {
      setNewTemplateId(preset.id);
      setNewSubject(preset.subject);
      setNewBody(personalizeTemplateBodyFromWaitlist(preset.body, composeWaitlistEntry));
    }
    setTemplatePickerTarget(null);
  };

  const loadError = convError?.message || threadError?.message;
  const newBodyTrimmed = String(newBody || '').trim();
  const replyBodyTrimmed = String(replyBody || '').trim();
  const canSendNew = !sendMutation.isPending && Boolean(newRecipientId) && Boolean(newBodyTrimmed);
  const canSendReply = !sendMutation.isPending && Boolean(selectedRecipientId) && Boolean(replyBodyTrimmed);
  const sendNewDisabledReason = !newRecipientId
    ? 'Choose a recipient'
    : !newBodyTrimmed
      ? 'Enter a message'
      : '';
  const sendReplyDisabledReason = !selectedRecipientId
    ? 'Choose a recipient'
    : !replyBodyTrimmed
      ? 'Enter a reply'
      : '';
  const isDark = resolvedTheme === 'dark';
  const hasDetailsSelection = (selectedHubType === 'broadcast' && Boolean(selectedBroadcastJob)) || Boolean(selectedRecipientId);

  const handleSelectDirectThread = (recipientId) => {
    setSelectedRecipientId(recipientId);
    setSelectedHubType('direct');
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setDetailsDrawerOpen(true);
    }
  };

  const handleSelectBroadcastThread = (jobId) => {
    setSelectedBroadcastJobId(String(jobId));
    setSelectedHubType('broadcast');
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setDetailsDrawerOpen(true);
    }
  };

  const threadNavItems = useMemo(
    () =>
      pagedThreadItems.items.map((item) => ({
        kind: item.kind,
        id: item.kind === 'direct' ? String(item.payload?.recipient_id || '') : String(item.payload?.id || ''),
      })),
    [pagedThreadItems.items]
  );

  const activeThreadNavIndex = useMemo(() => {
    if (selectedHubType === 'direct' && selectedRecipientId) {
      return threadNavItems.findIndex((i) => i.kind === 'direct' && i.id === String(selectedRecipientId));
    }
    if (selectedHubType === 'broadcast' && selectedBroadcastJobId) {
      return threadNavItems.findIndex((i) => i.kind === 'broadcast' && i.id === String(selectedBroadcastJobId));
    }
    return -1;
  }, [selectedHubType, selectedRecipientId, selectedBroadcastJobId, threadNavItems]);

  const goToAdjacentThread = (delta) => {
    if (activeThreadNavIndex < 0) return;
    const nextIndex = activeThreadNavIndex + delta;
    if (nextIndex < 0 || nextIndex >= threadNavItems.length) return;
    const nextItem = threadNavItems[nextIndex];
    if (!nextItem) return;
    if (nextItem.kind === 'direct') handleSelectDirectThread(nextItem.id);
    else handleSelectBroadcastThread(nextItem.id);
    if (showSwipeHint && typeof window !== 'undefined') {
      setShowSwipeHint(false);
      window.sessionStorage.setItem(SWIPE_HINT_STORAGE_KEY, '1');
    }
  };

  const detailsPaneContent = (
    <>
      {selectedHubType === 'broadcast' && selectedBroadcastJob ? (
        <div className="p-4.5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Broadcast Campaign</h3>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {String(selectedBroadcastJob.status || 'queued')}
            </Badge>
          </div>
          <p className="text-[13px] leading-5 text-muted-foreground">{String(selectedBroadcastJob.subject || 'Campaign')}</p>
          <div className="grid grid-cols-2 gap-2.5 text-sm">
            <div className="rounded-md border border-border/55 p-2.5">Audience: {Number(selectedBroadcastJob.total_recipients || 0)}</div>
            <div className="rounded-md border border-border/55 p-2.5">Channels: Email + In-App</div>
            <div className="rounded-md border border-border/55 p-2.5">Sent: {Number(selectedBroadcastJob.email_sent || 0)}</div>
            <div className="rounded-md border border-border/55 p-2.5">Delivered: {Number(selectedBroadcastJob.email_sent || 0) + Number(selectedBroadcastJob.email_skipped || 0)}</div>
            <div className="rounded-md border border-border/55 p-2.5">Failed: {Number(selectedBroadcastJob.email_failed || 0)}</div>
            <div className="rounded-md border border-border/55 p-2.5">Open rate: Not tracked</div>
          </div>
          <p className="text-[13px] leading-5 text-muted-foreground whitespace-pre-wrap">{String(selectedBroadcastJob.content || '')}</p>
        </div>
      ) : selectedRecipientId ? (
        <>
          <div className="border-b border-border/50 px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold truncate">{platformUserLabel(selectedUser)}</h2>
              <p className="text-[13px] leading-5 text-muted-foreground truncate">{platformUserEmail(selectedUser) || selectedRecipientId}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => refetchThread()} disabled={threadLoading || threadFetching}>
              Refresh
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto bg-muted/20">
            <div className="max-w-3xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-3">
              {sortedThread.map((m) => {
                const mine = m.sender_id === currentUser?.id || m.sender_id === currentUser?.supabase_id;
                const channel = normalizeMessageChannel(m);
                return (
                  <article key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[82%] rounded-2xl border px-3.5 py-2.5',
                        mine
                          ? 'bg-primary/10 border-primary/30 text-foreground'
                          : 'bg-card border-border/60'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium leading-5">{mine ? 'Paidly team' : platformUserLabel(selectedUser)}</p>
                        <span className="text-[11px] leading-4 text-muted-foreground">
                          {m.created_at ? format(new Date(m.created_at), isToday(new Date(m.created_at)) ? 'HH:mm' : 'MMM d, HH:mm') : '—'}
                        </span>
                      </div>
                      <h3 className="text-[13px] font-medium leading-5 mt-1">{m.subject?.trim() || 'Message'}</h3>
                      <p className="text-[13px] leading-5 text-foreground/90 whitespace-pre-wrap mt-1">{m.content}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="outline" className="gap-1 h-5 px-1.5 text-[10px]">
                          {(channel === 'both' || channel === 'in_app') ? <Radio className="h-3 w-3" /> : null}
                          {(channel === 'both' || channel === 'email') ? <Mail className="h-3 w-3" /> : null}
                          {channel === 'both' ? 'Both' : channel === 'email' ? 'Email' : 'In-App'}
                        </Badge>
                        <Badge variant={statusTone(m?.status)} className="capitalize h-5 px-1.5 text-[10px]">
                          {String(m?.status || 'pending')}
                        </Badge>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border/50 bg-card p-3.5 space-y-2.5">
            <div className="space-y-1">
              <Label htmlFor="reply-subject">Subject</Label>
              <Input id="reply-subject" value={replySubject} onChange={(e) => setReplySubject(e.target.value)} maxLength={300} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reply-body">Message</Label>
              <Textarea id="reply-body" value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={4} maxLength={50000} />
            </div>
            <div className="space-y-1">
              <Label>Channel</Label>
              <div className="inline-flex rounded-lg border border-border p-1">
                {CHANNEL_OPTIONS.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={replyChannel === option.id ? 'default' : 'ghost'}
                    className="h-8 px-3"
                    onClick={() => setReplyChannel(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={handleSendReply} disabled={!canSendReply || usersLoading} className="gap-2">
                <Send className="h-4 w-4" />
                {sendMutation.isPending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 min-h-[320px] text-muted-foreground p-8">
          <MessageCircle className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-base font-medium text-foreground">Select a direct thread or broadcast campaign</p>
          <p className="text-sm text-center mt-1">Use filters and segments to focus communication operations quickly.</p>
        </div>
      )}
    </>
  );

  return (
    <div
      className={cn(
        'w-full min-w-0 p-4 sm:p-6 space-y-6 rounded-2xl border',
        'bg-[#f6f8fc] border-[#dfe3eb] text-[#202124]',
        isDark && 'bg-background border-border text-foreground'
      )}
    >
      <PageHeader
        title="User Communication"
        description="Professional communication hub for direct support, broadcasts, and campaign-style updates with channel-aware delivery tracking."
      />

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {usersError ? (
        <PlatformUsersLoadErrorHint message={usersErr?.message} />
      ) : null}

      <div
        className={cn(
          'rounded-2xl border p-3 sm:p-3.5 space-y-2.5',
          'border-[#dfe3eb] bg-white shadow-sm',
          isDark && 'border-border bg-card'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => setComposerOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Message
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setBroadcastOpen(true)} className="gap-1.5">
            <Megaphone className="h-4 w-4" />
            Broadcast Message
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setBroadcastSubject('Paidly email campaign');
              setBroadcastOpen(true);
            }}
            className="gap-1.5"
          >
            <Mail className="h-4 w-4" />
            Email Campaign
          </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="gap-1.5"
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? 'Light' : 'Dark'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground pr-1">
            <Filter className="h-3.5 w-3.5" />
            Filters:
          </span>
          {[
            ['all', 'All'],
            ['broadcast', 'Broadcasts'],
            ['direct', 'Direct'],
            ['email', 'Email'],
            ['failed', 'Failed'],
          ].map(([id, label]) => (
            <Button
              key={id}
              type="button"
              variant={messageKindFilter === id ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setMessageKindFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[240px_minmax(340px,460px)_minmax(0,1fr)] gap-3.5 min-w-0 min-h-[min(85dvh,820px)]">
        <div className="xl:hidden space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-11 justify-between"
            onClick={() => setSegmentsCollapsed((v) => !v)}
            aria-expanded={!segmentsCollapsed}
            aria-controls="mobile-segment-rail"
          >
            <span>User Segments</span>
            {segmentsCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
          {!segmentsCollapsed ? (
            <div id="mobile-segment-rail" className="rounded-xl border border-border/60 bg-card p-2 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {userSegments.map((segment) => (
                  <button
                    key={`mobile-${segment.id}`}
                    type="button"
                    onClick={() => setSegmentFilter(segment.id)}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm whitespace-nowrap transition-colors',
                      segmentFilter === segment.id
                        ? 'border-[#c2dbff] bg-[#e8f0fe] text-[#174ea6]'
                        : 'border-border/45 text-muted-foreground hover:bg-muted/35',
                      isDark &&
                        (segmentFilter === segment.id
                          ? 'border-primary/40 bg-primary/15 text-foreground'
                          : 'text-muted-foreground')
                    )}
                  >
                    {segment.label} ({segment.count})
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {hasDetailsSelection ? (
            <Button type="button" variant="outline" size="sm" className="w-full h-11" onClick={() => setDetailsDrawerOpen(true)}>
              Open Details
            </Button>
          ) : null}
        </div>

        <Card className="hidden xl:block border border-border/70 bg-card">
          <CardHeader className="pb-2.5">
            <CardTitle className="text-sm">User Segments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pb-4">
            {userSegments.map((segment) => (
              <button
                key={segment.id}
                type="button"
                onClick={() => setSegmentFilter(segment.id)}
                className={cn(
                  'w-full rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
                  segmentFilter === segment.id
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border/45 text-muted-foreground hover:bg-muted/35'
                )}
              >
                <span className="font-medium">{segment.label}</span>
                <span className="ml-2 text-xs">({segment.count})</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className={cn('border border-border/70 bg-card min-h-0 flex flex-col', !isDark && 'border-[#dfe3eb] bg-white shadow-sm')}>
          <CardHeader className="border-b border-border/50 space-y-2.5 shrink-0 pb-3">
            <CardTitle className="text-sm">Message Threads</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search users, subjects, campaigns"
                className={cn('pl-9', !isDark && 'bg-[#f1f3f4] border-transparent focus-visible:border-[#d2e3fc]')}
                aria-label="Search communication hub"
              />
            </div>
          </CardHeader>
          <CardContent className="p-2 pt-2.5 flex-1 min-h-0">
            <div className="h-[620px] min-h-0 rounded-xl border border-border/40 bg-background/40">
              <ScrollArea className="h-[560px] pr-1">
                <div className="space-y-1.5 p-1">
                {pagedThreadItems.items.map((item) => {
                  if (item.kind === 'direct') {
                    const c = item.payload;
                  const u = userMap.get(c.recipient_id);
                  const status = String(c?.status || 'pending').toLowerCase();
                  const channel = channelLabelFromConversation(c);
                    const unread = !['delivered', 'opened', 'sent'].includes(status);
                    const failed = status === 'failed' || String(c?.deliveries?.email?.status || '').toLowerCase() === 'failed';
                  return (
                    <button
                        key={`direct-${c.recipient_id}`}
                      type="button"
                      onClick={() => {
                        handleSelectDirectThread(c.recipient_id);
                      }}
                      className={cn(
                          'w-full rounded-xl border px-3 py-3 min-h-16 text-left transition-colors',
                        selectedHubType === 'direct' && selectedRecipientId === c.recipient_id
                            ? 'border-[#c2dbff] bg-[#e8f0fe]'
                            : 'border-transparent hover:bg-muted/55',
                          isDark &&
                            (selectedHubType === 'direct' && selectedRecipientId === c.recipient_id
                              ? 'border-primary/40 bg-primary/15'
                              : 'hover:bg-muted/35')
                      )}
                        aria-current={selectedHubType === 'direct' && selectedRecipientId === c.recipient_id}
                    >
                        <div className="flex items-start gap-2">
                          <div className="pt-0.5">
                            <Star
                              className={cn(
                                'h-4 w-4',
                                failed ? 'text-amber-500 fill-amber-500/30' : 'text-muted-foreground'
                              )}
                              aria-hidden
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn('truncate text-[13px]', unread ? 'font-semibold' : 'font-medium')}>
                                {platformUserLabel(u)}
                              </p>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {c.last_at ? format(new Date(c.last_at), isToday(new Date(c.last_at)) ? 'HH:mm' : 'MMM d') : '—'}
                              </span>
                            </div>
                            <p className={cn('truncate text-[12px] leading-5', unread ? 'text-foreground' : 'text-muted-foreground')}>
                              {String(c.preview || '')}
                            </p>
                            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                              {(channel === 'both' || channel === 'in_app') ? <Radio className="h-3.5 w-3.5" /> : null}
                              {(channel === 'both' || channel === 'email') ? <Mail className="h-3.5 w-3.5" /> : null}
                              {unread ? <span className="h-2 w-2 rounded-full bg-[#1a73e8]" aria-label="Unread" /> : null}
                            </div>
                          </div>
                        </div>
                    </button>
                  );
                  }
                  const job = item.payload;
                  const failed = Number(job?.email_failed || 0);
                  const delivered = Number(job?.email_sent || 0) + Number(job?.email_skipped || 0);
                  const total = Number(job?.total_recipients || 0);
                  const openRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
                  return (
                    <button
                      key={`broadcast-${job.id}`}
                      type="button"
                      onClick={() => {
                        handleSelectBroadcastThread(job.id);
                      }}
                      className={cn(
                        'w-full rounded-xl border px-3 py-3 min-h-16 text-left transition-colors',
                        selectedHubType === 'broadcast' && String(selectedBroadcastJobId || '') === String(job.id)
                          ? 'border-[#c2dbff] bg-[#e8f0fe]'
                          : 'border-transparent hover:bg-muted/55',
                        isDark &&
                          (selectedHubType === 'broadcast' && String(selectedBroadcastJobId || '') === String(job.id)
                            ? 'border-primary/40 bg-primary/15'
                            : 'hover:bg-muted/35')
                      )}
                      aria-current={selectedHubType === 'broadcast' && String(selectedBroadcastJobId || '') === String(job.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium truncate">{String(job?.subject || 'Broadcast campaign')}</p>
                        <Badge variant={failed > 0 ? 'destructive' : 'secondary'} className="h-5 px-1.5 text-[10px]">
                          {String(job?.status || 'queued')}
                        </Badge>
                      </div>
                      <p className="text-[13px] leading-5 text-muted-foreground mt-1">Audience {total} · Delivered {delivered} · Open {openRate}%</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Megaphone className="h-3.5 w-3.5" />
                        <Mail className="h-3.5 w-3.5" />
                        <span className="ml-auto">
                          {job?.created_at ? format(new Date(job.created_at), 'MMM d') : '—'}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {(convLoading || broadcastLoading) ? (
                  <>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </>
                ) : null}
              </div>
              </ScrollArea>
              <div className="h-[60px] border-t border-border/40 px-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {pagedThreadItems.items.length} of {pagedThreadItems.total}
                </p>
                <div className="inline-flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 sm:h-7 sm:w-7"
                    onClick={() => setThreadsPage((p) => Math.max(1, p - 1))}
                    disabled={pagedThreadItems.safePage <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground min-w-[64px] text-center">
                    {pagedThreadItems.safePage} / {pagedThreadItems.totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 sm:h-7 sm:w-7"
                    onClick={() => setThreadsPage((p) => Math.min(pagedThreadItems.totalPages, p + 1))}
                    disabled={pagedThreadItems.safePage >= pagedThreadItems.totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hidden xl:flex border border-border/70 bg-card min-h-0 flex-col overflow-hidden">
          {detailsPaneContent}
        </Card>
      </div>

      <Dialog open={detailsDrawerOpen} onOpenChange={setDetailsDrawerOpen}>
        <DialogContent className="xl:hidden max-w-[96vw] h-[92dvh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border/50">
            <DialogTitle className="flex items-center justify-between gap-2 text-base">
              <span>Thread Details</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setDetailsDrawerOpen(false)}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div
            className="flex-1 min-h-0 overflow-y-auto pb-20"
            onTouchStart={(e) => {
              drawerTouchStartXRef.current = e.touches?.[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              const startX = drawerTouchStartXRef.current;
              const endX = e.changedTouches?.[0]?.clientX ?? null;
              drawerTouchStartXRef.current = null;
              if (!Number.isFinite(startX) || !Number.isFinite(endX)) return;
              const deltaX = endX - startX;
              if (Math.abs(deltaX) < 40) return;
              if (deltaX < 0) goToAdjacentThread(1);
              if (deltaX > 0) goToAdjacentThread(-1);
            }}
          >
            {detailsPaneContent}
          </div>
          <div className="absolute bottom-0 left-0 right-0 border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            {showSwipeHint ? (
              <p className="px-3 pt-2 text-[11px] text-muted-foreground">
                Swipe left/right to change thread
              </p>
            ) : null}
            <div className="px-3 py-2 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => setDetailsDrawerOpen(false)}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                onClick={() => goToAdjacentThread(-1)}
                disabled={activeThreadNavIndex <= 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                onClick={() => goToAdjacentThread(1)}
                disabled={activeThreadNavIndex < 0 || activeThreadNavIndex >= threadNavItems.length - 1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AdminStarterTemplatesDialog
        open={templatePickerTarget !== null}
        onOpenChange={(next) => {
          if (!next) setTemplatePickerTarget(null);
        }}
        presets={messagePresets}
        onSelect={applyTemplateSelection}
      />

      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Message a platform user</DialogTitle>
          </DialogHeader>
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendNew();
            }}
          >
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0 py-1">
            <div className="space-y-1">
              <Label>Find user</Label>
              <Input
                value={userPickerQuery}
                onChange={(e) => setUserPickerQuery(e.target.value)}
                placeholder="Search name, email, role, or user ID…"
              />
            </div>
            <ScrollArea className="h-48 rounded-md border border-border">
              <div className="p-1 space-y-1">
                {usersLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  pickerUsers.map((u, pickIdx) => (
                    <button
                      key={stableDirectoryRowKey(u, pickIdx)}
                      type="button"
                      onClick={() => setNewRecipientId(u?.id ?? '')}
                      className={cn(
                        'w-full text-left rounded-md px-3 py-2 text-sm transition-colors',
                        newRecipientId === u?.id ? 'bg-primary/15' : 'hover:bg-muted/80'
                      )}
                    >
                      <span className="font-medium block truncate">{platformUserLabel(u)}</span>
                      <span className="text-xs text-muted-foreground truncate block">
                        {platformUserEmail(u) || 'No email'} • {platformUserRole(u)} • ID: {u?.id ?? '—'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
            {newRecipientId ? (
              <div className="space-y-1.5 rounded-lg border border-border bg-muted/10 p-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Waitlist (signup email)
                </p>
                <WaitlistContextBlock
                  entry={composeWaitlistEntry}
                  loading={waitlistLoading}
                  errorMessage={waitlistErrorMessage || undefined}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[180px] space-y-1">
                <Label className="text-xs text-muted-foreground">Starter</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 h-9"
                  onClick={() => setTemplatePickerTarget('new')}
                >
                  <LayoutTemplate className="h-4 w-4 shrink-0" />
                  {newPresetLabel || 'Browse templates…'}
                </Button>
              </div>
            </div>
            {newPresetLabel ? (
              <p className="text-xs text-muted-foreground -mt-1">
                Using starter &quot;{newPresetLabel}&quot; — edit below before sending.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground -mt-1">
                Optional: open templates for SA English starters (waitlist, email confirm, updates). Links use
                this site&apos;s origin.
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor="new-subject">Subject</Label>
              <Input
                id="new-subject"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-body">Message</Label>
              <Textarea
                id="new-body"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={5}
                className="resize-y"
                maxLength={50000}
              />
            </div>
            <div className="space-y-1">
              <Label>Channel</Label>
              <div className="inline-flex rounded-lg border border-border p-1">
                {CHANNEL_OPTIONS.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={newChannel === option.id ? 'default' : 'ghost'}
                    className="h-8 px-3"
                    onClick={() => setNewChannel(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {sendNewDisabledReason ? (
              <p className="mr-auto text-xs text-muted-foreground">{sendNewDisabledReason}</p>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setComposerOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleSendNew}
              disabled={!canSendNew}
            >
              {sendMutation.isPending ? 'Sending…' : 'Send'}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Broadcast platform update</DialogTitle>
            <DialogDescription>
              Sends one in-app notification and an email update to all users.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="broadcast-subject">Subject</Label>
              <Input
                id="broadcast-subject"
                value={broadcastSubject}
                onChange={(e) => setBroadcastSubject(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="broadcast-body">Update message</Label>
              <Textarea
                id="broadcast-body"
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                rows={6}
                maxLength={50000}
                placeholder="Describe the release/update for all users…"
              />
            </div>
            {broadcastResult ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-foreground">Latest delivery breakdown</p>
                <p className="mt-1 text-muted-foreground">
                  Job status: <span className="font-medium text-foreground">{String(broadcastResult.status || 'queued')}</span>
                  {" · "}
                  Inbox messages: <span className="font-medium text-foreground">{broadcastResult.insertedMessages}</span>
                  {" · "}
                  In-app notifications: <span className="font-medium text-foreground">{broadcastResult.inserted}</span>
                  {" · "}
                  Emails sent: <span className="font-medium text-foreground">{broadcastResult.emailSent}</span>
                  {" · "}
                  Queued: <span className="font-medium text-foreground">{broadcastResult.emailQueued ?? 0}</span>
                  {" · "}
                  Skipped: <span className="font-medium text-foreground">{broadcastResult.emailSkipped}</span>
                  {" · "}
                  Failed: <span className="font-medium text-foreground">{broadcastResult.emailFailed}</span>
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBroadcastOpen(false);
                setBroadcastResult(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleBroadcastUpdate}
              disabled={broadcastMutation.isPending}
              className="gap-2"
            >
              <Megaphone className="h-4 w-4" />
              Send to all users
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
