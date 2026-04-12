import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isToday } from 'date-fns';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  Plus,
  Search,
  Send,
  User,
  ArrowLeft,
  LayoutTemplate,
  ClipboardList,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';

import { paidly } from '@/api/paidlyClient';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import {
  fetchAdminPlatformUserMessages,
  postAdminPlatformUserMessage,
} from '@/api/fetchAdminPlatformUserMessages';
import PageHeader from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { cn } from '@/lib/utils';

function platformUserLabel(u) {
  if (!u) return 'Unknown user';
  const name = String(u.full_name || u.profile?.full_name || '').trim();
  const email = String(u.email || '').trim();
  if (name && name !== '—') return name;
  return email || u.id || 'Unknown user';
}

/** Display only: merged admin API uses Auth email first; profile fallback when using profiles-only list. */
function platformUserEmail(u) {
  return String(u?.email || u?.profile?.email || '').trim();
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
      toast.success('Waitlist summary copied');
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

/** Toasts from server `email_delivery` (signup email via Auth + Resend). */
function toastAfterEmailDelivery(d) {
  const status = d?.status;
  const reason = String(d?.reason || '');

  if (status === 'sent') {
    toast.success('Message sent', {
      description:
        'Delivered to the email address on their Paidly account (the one they use to sign in).',
    });
    return;
  }
  if (status === 'failed') {
    toast.warning('Message saved', {
      description: reason || 'Email could not be sent. Check server logs and Resend.',
    });
    return;
  }
  if (reason === 'resend_not_configured') {
    toast.success('Message saved', {
      description:
        'Saved in-app only: set RESEND_API_KEY and RESEND_FROM on the API server to email signup addresses.',
    });
    return;
  }
  if (reason === 'invalid_signup_email') {
    toast.success('Message saved', {
      description:
        'The signup email on their auth account looks invalid, so we did not send an email.',
    });
    return;
  }
  if (
    /no signup email on account/i.test(reason) ||
    reason === 'Auth user not found' ||
    reason === 'Auth lookup failed'
  ) {
    toast.success('Message saved', {
      description:
        'No signup email found for this auth account — only the in-app message was created.',
    });
    return;
  }
  toast.success('Message saved', {
    description: reason
      ? `Not emailed: ${reason}`
      : 'Not emailed (no signup address or delivery was skipped).',
  });
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
        <ScrollArea className="min-h-0 flex-1 max-h-[min(52vh,480px)] border-y border-border">
          <div className="space-y-2 p-4 pr-5">
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
        </ScrollArea>
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
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();
  const messagePresets = useMemo(
    () =>
      buildAdminPlatformMessagePresets(
        typeof window !== 'undefined' ? window.location.origin : 'https://www.paidly.co.za'
      ),
    []
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [userPickerQuery, setUserPickerQuery] = useState('');
  const [selectedRecipientId, setSelectedRecipientId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newTemplateId, setNewTemplateId] = useState('');
  const [newSubject, setNewSubject] = useState(DEFAULT_ADMIN_PLATFORM_SUBJECT);
  const [newBody, setNewBody] = useState('');
  const [replyTemplateId, setReplyTemplateId] = useState('');
  const [replySubject, setReplySubject] = useState(DEFAULT_ADMIN_PLATFORM_SUBJECT);
  const [replyBody, setReplyBody] = useState('');
  const [templatePickerTarget, setTemplatePickerTarget] = useState(
    /** @type {null | 'reply' | 'new'} */ (null)
  );
  const threadEndRef = useRef(null);

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
    queryFn: () => fetchAdminPlatformUserMessages({ listLimit: 500 }),
    refetchInterval: 12_000,
  });

  const conversations = convPayload?.conversations ?? [];

  const {
    data: threadPayload,
    isLoading: threadLoading,
    error: threadError,
    refetch: refetchThread,
    isFetching: threadFetching,
  } = useQuery({
    queryKey: ['admin-platform-user-messages', 'thread', selectedRecipientId],
    queryFn: () =>
      fetchAdminPlatformUserMessages({ recipientId: selectedRecipientId, threadLimit: 150 }),
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

  const filteredConversations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const u = userMap.get(c.recipient_id);
      const label = platformUserLabel(u).toLowerCase();
      const email = platformUserEmail(u).toLowerCase();
      const prev = String(c.preview || '').toLowerCase();
      return label.includes(q) || email.includes(q) || prev.includes(q);
    });
  }, [conversations, searchTerm, userMap]);

  const sendMutation = useMutation({
    mutationFn: postAdminPlatformUserMessage,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-platform-user-messages'] });
      if (variables.recipientId) {
        setSelectedRecipientId(variables.recipientId);
      }
    },
    onError: (e) => {
      toast.error(e?.message || 'Failed to send');
    },
  });

  const handleSendNew = async () => {
    const rid = String(newRecipientId || '').trim();
    const sub = String(newSubject || '').trim() || DEFAULT_ADMIN_PLATFORM_SUBJECT;
    const body = String(newBody || '').trim();
    if (!rid) {
      toast.error('Choose a recipient');
      return;
    }
    if (!body) {
      toast.error('Enter a message');
      return;
    }
    try {
      const { emailDelivery } = await sendMutation.mutateAsync({
        recipientId: rid,
        subject: sub,
        content: body,
      });
      toastAfterEmailDelivery(emailDelivery);
      setComposerOpen(false);
      setNewRecipientId('');
      setNewTemplateId('');
      setNewSubject(DEFAULT_ADMIN_PLATFORM_SUBJECT);
      setNewBody('');
      setUserPickerQuery('');
    } catch {
      /* toast in mutation */
    }
  };

  const handleSendReply = async () => {
    if (!selectedRecipientId) return;
    const sub = String(replySubject || '').trim() || DEFAULT_ADMIN_PLATFORM_SUBJECT;
    const body = String(replyBody || '').trim();
    if (!body) {
      toast.error('Enter a message');
      return;
    }
    try {
      const { emailDelivery } = await sendMutation.mutateAsync({
        recipientId: selectedRecipientId,
        subject: sub,
        content: body,
      });
      toastAfterEmailDelivery(emailDelivery);
      setReplyTemplateId('');
      setReplyBody('');
    } catch {
      /* toast in mutation */
    }
  };

  const pickerUsers = useMemo(() => {
    const q = userPickerQuery.trim().toLowerCase();
    const list = [...platformUsers];
    if (!q) return list.slice(0, 80);
    return list
      .filter((u) => {
        const label = platformUserLabel(u).toLowerCase();
        const email = platformUserEmail(u).toLowerCase();
        return label.includes(q) || email.includes(q) || String(u.id).toLowerCase().includes(q);
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

  return (
    <div className="w-full min-w-0 p-4 sm:p-6 space-y-6">
      <PageHeader
        title="User messages"
        description="Messages are stored in-app and emailed to each user’s signup (login) address via Resend — HTML and plain text, with Reply-To support. Ideal for product updates, moving waitlist sign-ups onto Paidly, and nudging users who have not confirmed their email. Use a verified sending domain with SPF, DKIM, and DMARC in Resend. Optional server env: ADMIN_OUTREACH_REPLY_TO, ADMIN_OUTREACH_MAILER_FOOTER."
      />

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {usersError ? (
        <PlatformUsersLoadErrorHint message={usersErr?.message} />
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] gap-0 min-w-0 lg:gap-px lg:rounded-xl lg:border lg:border-border lg:bg-border lg:shadow-sm overflow-hidden min-h-[min(85dvh,820px)]">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className={cn(
            'min-h-0 bg-card lg:rounded-none',
            selectedRecipientId ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'
          )}
        >
          <Card className="border-0 shadow-none rounded-none flex flex-col min-h-0 flex-1">
            <CardHeader className="border-b border-border space-y-3 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg mb-0">
                  <MessageCircle className="h-5 w-5 shrink-0" />
                  Inbox
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setComposerOpen(true)}
                  className="gap-1.5 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Compose
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, email, or preview…"
                  className="pl-9"
                  aria-label="Search conversations"
                />
              </div>
            </CardHeader>
            <CardContent className="p-2 pt-3 flex-1 min-h-0 flex flex-col">
              {convLoading ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>No conversations yet</p>
                  <p className="text-sm mt-1">Use Compose to message a user.</p>
                </div>
              ) : (
                <ScrollArea className="flex-1 min-h-[200px] lg:min-h-0 pr-2">
                  <div className="space-y-2">
                    {filteredConversations.map((c) => {
                      const u = userMap.get(c.recipient_id);
                      const active = selectedRecipientId === c.recipient_id;
                      const lastAt = c.last_at ? new Date(c.last_at) : null;
                      return (
                        <button
                          key={c.recipient_id}
                          type="button"
                          onClick={() => setSelectedRecipientId(c.recipient_id)}
                          className={cn(
                            'w-full text-left rounded-lg border px-3 py-3 transition-colors',
                            active
                              ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                              : 'border-border/60 bg-card hover:bg-muted/50'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                                active ? 'bg-primary/20' : 'bg-muted'
                              )}
                            >
                              <User className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold truncate">{platformUserLabel(u)}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {platformUserEmail(u) || c.recipient_id}
                              </p>
                              <p className="text-sm text-muted-foreground truncate mt-1">
                                {String(c.preview || '').replace(/<[^>]*>?/gm, '')}
                              </p>
                            </div>
                            <div className="text-xs text-muted-foreground shrink-0">
                              {lastAt
                                ? isToday(lastAt)
                                  ? format(lastAt, 'HH:mm')
                                  : format(lastAt, 'MMM d')
                                : ''}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className={cn(
            'min-h-0 bg-card flex flex-col lg:rounded-none',
            !selectedRecipientId ? 'hidden lg:flex' : 'flex flex-col flex-1 min-h-[50dvh] lg:min-h-0'
          )}
        >
          <Card className="border-0 shadow-none rounded-none flex flex-col flex-1 min-h-0 overflow-hidden">
            {selectedRecipientId ? (
              <>
                <div className="border-b border-border px-3 py-3 sm:px-5 sm:py-4 flex items-start gap-3 shrink-0 bg-card">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="lg:hidden shrink-0 mt-0.5"
                    onClick={() => setSelectedRecipientId(null)}
                    aria-label="Back to inbox"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-base sm:text-lg leading-tight truncate">
                      {platformUserLabel(selectedUser)}
                    </h2>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {platformUserEmail(selectedUser) || selectedRecipientId}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 hidden sm:block">
                      {sortedThread.length}{' '}
                      {sortedThread.length === 1 ? 'message' : 'messages'} in this thread
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => refetchThread()}
                    disabled={threadLoading || threadFetching}
                  >
                    Refresh
                  </Button>
                </div>

                <div className="border-b border-border px-3 py-2.5 sm:px-5 bg-muted/10 shrink-0 space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Waitlist (matched by signup email)
                  </p>
                  <WaitlistContextBlock
                    entry={selectedWaitlistEntry}
                    loading={waitlistLoading}
                    errorMessage={waitlistErrorMessage || undefined}
                  />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30">
                  <div className="max-w-3xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-3">
                    {threadLoading && sortedThread.length === 0 ? (
                      <>
                        <Skeleton className="h-32 w-full rounded-xl" />
                        <Skeleton className="h-28 w-full rounded-xl" />
                      </>
                    ) : sortedThread.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No messages yet. Send the first one below.
                      </p>
                    ) : (
                      sortedThread.map((m) => {
                        const mine =
                          m.sender_id === currentUser?.id ||
                          m.sender_id === currentUser?.supabase_id;
                        const at = m.created_at ? new Date(m.created_at) : null;
                        const peerLabel = platformUserLabel(selectedUser);
                        const peerInitial = peerLabel.charAt(0).toUpperCase() || 'U';
                        return (
                          <article
                            key={m.id}
                            className={cn(
                              'rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden',
                              mine ? 'border-primary/25 ring-1 ring-primary/10' : 'border-border'
                            )}
                          >
                            <header className="flex items-start justify-between gap-3 border-b border-border/80 bg-muted/20 px-4 py-2.5">
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={cn(
                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                    mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                  )}
                                  aria-hidden
                                >
                                  {mine ? 'You' : peerInitial}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold leading-tight truncate">
                                    {mine ? 'You (Paidly team)' : peerLabel}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {mine
                                      ? `To ${platformUserEmail(selectedUser) || 'user'}`
                                      : 'Message in this thread'}
                                  </p>
                                </div>
                              </div>
                              {at ? (
                                <time
                                  dateTime={at.toISOString()}
                                  className="text-xs text-muted-foreground whitespace-nowrap shrink-0 tabular-nums pt-0.5"
                                >
                                  {format(at, 'EEE, MMM d, yyyy · HH:mm')}
                                </time>
                              ) : null}
                            </header>
                            <div className="px-4 py-3 sm:py-4">
                              <h3 className="text-sm sm:text-base font-medium text-foreground mb-2">
                                {m.subject?.trim() || 'Message'}
                              </h3>
                              <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                                {m.content}
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                    <div ref={threadEndRef} className="h-px shrink-0" aria-hidden />
                  </div>
                </div>

                <div className="border-t border-border bg-card shrink-0 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.12)]">
                  <div className="max-w-3xl mx-auto px-3 py-3 sm:px-6 sm:py-4 space-y-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <Label htmlFor="reply-subject" className="text-xs text-muted-foreground">
                          Subject
                        </Label>
                        <Input
                          id="reply-subject"
                          value={replySubject}
                          onChange={(e) => setReplySubject(e.target.value)}
                          placeholder="Subject"
                          maxLength={300}
                          className="h-9"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 shrink-0 h-9"
                        onClick={() => setTemplatePickerTarget('reply')}
                      >
                        <LayoutTemplate className="h-4 w-4" />
                        Templates
                      </Button>
                    </div>
                    {replyPresetLabel ? (
                      <p className="text-xs text-muted-foreground">
                        Starter: <span className="text-foreground font-medium">{replyPresetLabel}</span>
                      </p>
                    ) : null}
                    <div className="space-y-1">
                      <Label htmlFor="reply-body" className="text-xs text-muted-foreground">
                        Reply
                      </Label>
                      <Textarea
                        id="reply-body"
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="Type your update…"
                        rows={5}
                        className="resize-y min-h-[120px] text-sm"
                        maxLength={50000}
                      />
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button
                        type="button"
                        onClick={handleSendReply}
                        disabled={sendMutation.isPending || usersLoading}
                        className="gap-2"
                      >
                        <Send className="h-4 w-4" />
                        Send
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 min-h-[280px] text-muted-foreground p-8">
                <MessageCircle className="w-16 h-16 mb-4 opacity-40" />
                <p className="text-lg font-medium text-foreground">Select a conversation</p>
                <p className="text-sm text-center max-w-sm mt-1">
                  Choose a thread from the inbox, or use Compose to message someone new. Users match the
                  platform directory on the Users page.
                </p>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

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
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0 py-1">
            <div className="space-y-1">
              <Label>Find user</Label>
              <Input
                value={userPickerQuery}
                onChange={(e) => setUserPickerQuery(e.target.value)}
                placeholder="Search name or email…"
              />
            </div>
            <ScrollArea className="h-48 rounded-md border border-border">
              <div className="p-1 space-y-1">
                {usersLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  pickerUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setNewRecipientId(u.id)}
                      className={cn(
                        'w-full text-left rounded-md px-3 py-2 text-sm transition-colors',
                        newRecipientId === u.id ? 'bg-primary/15' : 'hover:bg-muted/80'
                      )}
                    >
                      <span className="font-medium block truncate">{platformUserLabel(u)}</span>
                      <span className="text-xs text-muted-foreground truncate block">
                        {platformUserEmail(u) || u.id}
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
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setComposerOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSendNew}
              disabled={sendMutation.isPending || !newRecipientId}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
