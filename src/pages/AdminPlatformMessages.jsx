import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isToday } from 'date-fns';
import { motion } from 'framer-motion';
import { MessageCircle, Plus, Search, Send, User, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import PlatformUsersLoadErrorHint from '@/components/PlatformUsersLoadErrorHint';
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

/** Toasts from server `email_delivery` (signup email via Auth + Resend). */
function toastAfterEmailDelivery(d) {
  const status = d?.status;
  const reason = String(d?.reason || '');

  if (status === 'sent') {
    toast.success('Message sent', {
      description: 'Delivered to the email on their Paidly signup (login) account.',
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
        'In-app record only: set RESEND_API_KEY and RESEND_FROM on the API server to email signup addresses.',
    });
    return;
  }
  if (reason === 'invalid_signup_email') {
    toast.success('Message saved', {
      description: 'Signup email on the auth account is invalid; the user was not emailed.',
    });
    return;
  }
  if (
    /no signup email on account/i.test(reason) ||
    reason === 'Auth user not found' ||
    reason === 'Auth lookup failed'
  ) {
    toast.success('Message saved', {
      description: 'No signup email found for this auth account; only the in-app record was created.',
    });
    return;
  }
  toast.success('Message saved', {
    description: reason
      ? `Not emailed: ${reason}`
      : 'Not emailed (no signup address or delivery was skipped).',
  });
}

export default function AdminPlatformMessages() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [userPickerQuery, setUserPickerQuery] = useState('');
  const [selectedRecipientId, setSelectedRecipientId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newSubject, setNewSubject] = useState('Message from Paidly');
  const [newBody, setNewBody] = useState('');
  const [replySubject, setReplySubject] = useState('Message from Paidly');
  const [replyBody, setReplyBody] = useState('');

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
    const sub = String(newSubject || '').trim() || 'Message from Paidly';
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
      setNewSubject('Message from Paidly');
      setNewBody('');
      setUserPickerQuery('');
    } catch {
      /* toast in mutation */
    }
  };

  const handleSendReply = async () => {
    if (!selectedRecipientId) return;
    const sub = String(replySubject || '').trim() || 'Message from Paidly';
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

  const selectedUser = selectedRecipientId ? userMap.get(selectedRecipientId) : null;

  const loadError = convError?.message || threadError?.message;

  return (
    <div className="w-full min-w-0 p-4 sm:p-6 space-y-6">
      <PageHeader
        title="User messages"
        description="Messages are stored in-app; email goes to each user’s signup address from Supabase Auth (sent via Resend when configured on the server)."
      />

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {usersError ? (
        <PlatformUsersLoadErrorHint message={usersErr?.message} />
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={() => setComposerOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New message
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className={cn(selectedRecipientId ? 'hidden lg:block' : '')}
        >
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border space-y-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="h-5 w-5" />
                Conversations
              </CardTitle>
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
            <CardContent className="p-2 pt-4">
              {convLoading ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>No conversations yet</p>
                  <p className="text-sm mt-1">Use New message to reach a user.</p>
                </div>
              ) : (
                <ScrollArea className="h-[min(70vh,560px)] pr-2">
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
            'lg:col-span-2',
            !selectedRecipientId ? 'hidden lg:block' : ''
          )}
        >
          <Card
            className={cn(
              'border border-border shadow-sm flex flex-col min-h-0 overflow-hidden',
              selectedRecipientId
                ? 'h-[min(70vh,calc(100dvh-10rem))] lg:h-[70vh]'
                : 'min-h-[240px] lg:h-[70vh]'
            )}
          >
            {selectedRecipientId ? (
              <>
                <div className="border-b border-border p-3 sm:p-4 flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    onClick={() => setSelectedRecipientId(null)}
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-lg truncate">{platformUserLabel(selectedUser)}</h2>
                    <p className="text-sm text-muted-foreground truncate">
                      {platformUserEmail(selectedUser) || selectedRecipientId}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => refetchThread()}
                    disabled={threadLoading || threadFetching}
                  >
                    Refresh
                  </Button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 bg-muted/20">
                  {threadLoading && sortedThread.length === 0 ? (
                    <Skeleton className="h-24 w-full max-w-md ml-auto" />
                  ) : (
                    sortedThread.map((m) => {
                      const mine =
                        m.sender_id === currentUser?.id ||
                        m.sender_id === currentUser?.supabase_id;
                      const at = m.created_at ? new Date(m.created_at) : null;
                      return (
                        <div
                          key={m.id}
                          className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                        >
                          <div
                            className={cn(
                              'max-w-[88%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm',
                              mine
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-card border border-border'
                            )}
                          >
                            {!mine ? (
                              <p className="text-xs text-muted-foreground mb-1">Team</p>
                            ) : null}
                            <p className="text-xs opacity-80 mb-1">{m.subject || 'Message'}</p>
                            <p className="whitespace-pre-wrap break-words">{m.content}</p>
                            {at ? (
                              <p
                                className={cn(
                                  'text-[10px] mt-2 opacity-70',
                                  mine ? 'text-primary-foreground/80' : 'text-muted-foreground'
                                )}
                              >
                                {format(at, 'MMM d, yyyy HH:mm')}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-border p-3 sm:p-4 space-y-2 bg-card">
                  <div className="space-y-1">
                    <Label htmlFor="reply-subject">Subject</Label>
                    <Input
                      id="reply-subject"
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      placeholder="Subject"
                      maxLength={300}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reply-body">Message</Label>
                    <Textarea
                      id="reply-body"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Type your update…"
                      rows={4}
                      className="resize-y min-h-[96px]"
                      maxLength={50000}
                    />
                  </div>
                  <div className="flex justify-end">
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
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                <MessageCircle className="w-16 h-16 mb-4 opacity-40" />
                <p className="text-lg font-medium text-foreground">Select a conversation</p>
                <p className="text-sm text-center max-w-sm mt-1">
                  Pick someone you have messaged, or start with New message. Platform users load from the same directory as the Users page.
                </p>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

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
