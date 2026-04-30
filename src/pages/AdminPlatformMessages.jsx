import { useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Mail, Plus } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/button';
import PlatformUsersLoadErrorHint from '@/components/PlatformUsersLoadErrorHint';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import {
  fetchAdminBroadcastJobs,
  fetchAdminPlatformUserMessages,
  postAdminBroadcastUpdate,
  postAdminSendMessage,
} from '@/api/fetchAdminPlatformUserMessages';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';
import MessageList from '@/components/admin-messages/MessageList';
import MessageThread from '@/components/admin-messages/MessageThread';
import CampaignView from '@/components/admin-messages/CampaignView';
import ComposeModal from '@/components/admin-messages/ComposeModal';

const PAGE_SIZE = 30;
const THREAD_PAGE_SIZE = 40;

function channelToFlags(channel) {
  if (channel === 'email') return { sendEmail: true, sendInApp: false };
  if (channel === 'in_app') return { sendEmail: false, sendInApp: true };
  return { sendEmail: true, sendInApp: true };
}

function platformUserLabel(u) {
  return String(u?.full_name || u?.profile?.full_name || u?.email || u?.id || 'Unknown user').trim();
}

function platformUserEmail(u) {
  return String(u?.email || u?.profile?.email || '').trim();
}

function platformUserRole(u) {
  return String(u?.role || u?.profile?.role || '').trim().toLowerCase();
}

export default function AdminPlatformMessages() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useCurrentUser();
  const [segmentFilter, setSegmentFilter] = useState('all-users');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [replySubject, setReplySubject] = useState('Re: Paidly update');
  const [replyBody, setReplyBody] = useState('');
  const [replyChannel, setReplyChannel] = useState('both');
  const [composerMode, setComposerMode] = useState(null);

  const {
    data: platformUsers = [],
    isError: usersError,
    error: usersErr,
  } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => platformUsersQueryFn(3000),
    staleTime: 60_000,
  });

  const userMap = useMemo(() => {
    const m = new Map();
    for (const u of platformUsers) if (u?.id) m.set(String(u.id), u);
    return m;
  }, [platformUsers]);

  const segments = useMemo(() => {
    const now = Date.now();
    const activeIds = new Set();
    const trialIds = new Set();
    const failedIds = new Set();
    for (const u of platformUsers) {
      const id = String(u?.id || '').trim();
      if (!id) continue;
      const role = platformUserRole(u);
      const plan = String(u?.subscription_status || u?.subscription_plan || '').toLowerCase();
      if (role.includes('trial') || plan.includes('trial')) trialIds.add(id);
    }
    return [
      { id: 'all-users', label: 'All Users', count: platformUsers.length, ids: null },
      { id: 'recently-active', label: 'Recently Active', count: activeIds.size, ids: activeIds },
      { id: 'trial-users', label: 'Trial Users', count: trialIds.size, ids: trialIds },
      { id: 'failed-email-users', label: 'Failed Email Users', count: failedIds.size, ids: failedIds },
    ];
  }, [platformUsers]);

  const directInfinite = useInfiniteQuery({
    queryKey: ['admin-messages', 'direct-infinite'],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const payload = await fetchAdminPlatformUserMessages({
        listLimit: PAGE_SIZE,
        messageType: 'direct',
        listCursor: pageParam || undefined,
      });
      return {
        chunk: payload?.conversations || [],
        nextCursor: payload?.next_list_cursor || null,
      };
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
    refetchInterval: 12_000,
    staleTime: 10_000,
  });

  const campaignInfinite = useInfiniteQuery({
    queryKey: ['admin-messages', 'campaigns-infinite'],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const payload = await fetchAdminBroadcastJobs({ limit: PAGE_SIZE, cursor: pageParam || undefined });
      return {
        chunk: payload?.jobs || [],
        nextCursor: payload?.next_cursor || null,
      };
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
    refetchInterval: 20_000,
    staleTime: 15_000,
  });

  const directRows = useMemo(
    () => (directInfinite.data?.pages || []).flatMap((p) => p.chunk || []),
    [directInfinite.data]
  );
  const campaignRows = useMemo(
    () => (campaignInfinite.data?.pages || []).flatMap((p) => p.chunk || []),
    [campaignInfinite.data]
  );

  const selectedRecipientId =
    selectedItem?.kind === 'direct' ? String(selectedItem.id || selectedItem.recipient_id || '') : '';

  const threadInfinite = useInfiniteQuery({
    queryKey: ['admin-messages', 'thread-infinite', selectedRecipientId],
    enabled: Boolean(selectedRecipientId),
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const payload = await fetchAdminPlatformUserMessages({
        recipientId: selectedRecipientId,
        threadLimit: THREAD_PAGE_SIZE,
        messageType: 'direct',
        threadCursor: pageParam || undefined,
      });
      const messages = [...(payload?.messages || [])].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
      return {
        chunk: messages,
        nextCursor: payload?.next_thread_cursor || null,
      };
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
    refetchInterval: 12_000,
    staleTime: 8_000,
  });

  const threadMessages = useMemo(
    () => (threadInfinite.data?.pages || []).flatMap((p) => p.chunk || []),
    [threadInfinite.data]
  );

  const mergedListItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const seg = segments.find((s) => s.id === segmentFilter);
    const direct = directRows
      .filter((row) => (seg?.ids ? seg.ids.has(String(row.recipient_id || '')) : true))
      .map((row) => {
        const u = userMap.get(String(row.recipient_id || ''));
        const channel = String(row.channel || '').toLowerCase();
        return {
          kind: 'direct',
          id: String(row.recipient_id || ''),
          title: platformUserLabel(u),
          subject: String(row.subject || 'Direct message'),
          preview: String(row.preview || ''),
          at: row.last_at,
          unread: String(row.status || '').toLowerCase() !== 'opened',
          channelEmail: channel === 'email' || channel === 'both' || Boolean(row.send_email),
          channelInApp: channel === 'in_app' || channel === 'both' || Boolean(row.send_in_app),
          priority: String(row.status || '').toLowerCase() === 'failed',
          data: row,
        };
      });
    const campaigns = campaignRows.map((job) => ({
      kind: 'broadcast',
      id: String(job.id || ''),
      title: 'Broadcast Campaign',
      subject: String(job.subject || 'Campaign'),
      preview: String(job.content || ''),
      at: job.created_at,
      unread: false,
      channelEmail: true,
      channelInApp: true,
      priority: Number(job.email_failed || 0) > 0,
      data: job,
    }));
    return [...direct, ...campaigns]
      .filter((i) => !q || `${i.title} ${i.subject} ${i.preview}`.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
  }, [searchTerm, segments, segmentFilter, directRows, campaignRows, userMap]);

  const sendMutation = useMutation({
    mutationFn: postAdminSendMessage,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['admin-messages', 'direct-infinite'] });
      return { previous: queryClient.getQueryData(['admin-messages', 'direct-infinite']) };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin-messages', 'direct-infinite'], ctx.previous);
      toast.error(err?.message || 'Failed to send message');
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-messages'] });
      notifySuccess(
        'Message sent',
        `Delivered ${Number(result?.sent || 0)} · Email failed ${Number(result?.failedEmail || 0)}`
      );
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: postAdminBroadcastUpdate,
    onError: (err) => toast.error(err?.message || 'Failed to send campaign'),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-messages'] });
      notifySuccess('Campaign sent', `Recipients ${result?.recipients || 0} · Sent ${result?.emailSent || 0}`);
    },
  });

  const selectedKey = selectedItem ? `${selectedItem.kind}:${selectedItem.id}` : '';
  const selectedUser = selectedRecipientId ? userMap.get(selectedRecipientId) : null;
  const selectedCampaign = selectedItem?.kind === 'broadcast' ? selectedItem.data : null;

  const handleSubmitCompose = async (payload) => {
    if (payload.mode === 'broadcast') {
      await broadcastMutation.mutateAsync({
        subject: payload.subject,
        content: payload.contentPlain || payload.content || '',
      });
      setComposerMode(null);
      return;
    }
    const { sendEmail, sendInApp } = channelToFlags(payload.channel);
    await sendMutation.mutateAsync({
      recipientIds: [payload.recipientId],
      subject: payload.subject,
      content: payload.contentPlain || payload.content || '',
      sendEmail,
      sendInApp,
    });
    setComposerMode(null);
  };

  const handleReply = async () => {
    if (!selectedRecipientId || !String(replyBody).trim()) return;
    const { sendEmail, sendInApp } = channelToFlags(replyChannel);
    await sendMutation.mutateAsync({
      recipientIds: [selectedRecipientId],
      subject: String(replySubject || '').trim() || 'Message from Paidly',
      content: String(replyBody || '').trim(),
      sendEmail,
      sendInApp,
    });
    setReplyBody('');
  };

  const listHasNext = directInfinite.hasNextPage || campaignInfinite.hasNextPage;
  const listFetchingNext = directInfinite.isFetchingNextPage || campaignInfinite.isFetchingNextPage;

  return (
    <div className="h-[calc(100dvh-4.5rem)] flex flex-col min-w-0">
      <div className="px-5 pt-4 pb-3 border-b border-border/70 shrink-0">
        <PageHeader
          title="User Communication"
          description="Gmail-style support and campaign operations for in-app and email channels."
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setComposerMode('direct')}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Message
          </Button>
          <Button size="sm" variant="outline" onClick={() => setComposerMode('broadcast')}>
            <Megaphone className="h-4 w-4 mr-1.5" />
            Broadcast Campaign
          </Button>
          <Button size="sm" variant="outline" onClick={() => setComposerMode('broadcast')}>
            <Mail className="h-4 w-4 mr-1.5" />
            Email Campaign
          </Button>
        </div>
      </div>

      {usersError ? (
        <div className="px-5 pt-3">
          <PlatformUsersLoadErrorHint message={usersErr?.message} />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 grid grid-cols-1 xl:grid-cols-[260px_380px_minmax(0,1fr)]">
        <aside className="hidden xl:block border-r border-border/70 min-h-0">
          <div className="px-3 py-3">
            {segments.map((segment) => (
              <button
                key={segment.id}
                type="button"
                onClick={() => setSegmentFilter(segment.id)}
                className={cn(
                  'w-full h-10 rounded-md px-3 text-left text-sm mb-1',
                  segmentFilter === segment.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'
                )}
              >
                {segment.label} ({segment.count})
              </button>
            ))}
          </div>
        </aside>

        <MessageList
          items={mergedListItems}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          selectedKey={selectedKey}
          onSelectItem={setSelectedItem}
          isLoading={directInfinite.isLoading || campaignInfinite.isLoading}
          hasNextPage={Boolean(listHasNext)}
          isFetchingNextPage={Boolean(listFetchingNext)}
          onLoadMore={() => {
            if (directInfinite.hasNextPage) directInfinite.fetchNextPage();
            if (campaignInfinite.hasNextPage) campaignInfinite.fetchNextPage();
          }}
        />

        <main className="min-h-0 flex flex-col">
          {selectedItem?.kind === 'broadcast' ? (
            <CampaignView campaign={selectedCampaign} />
          ) : selectedRecipientId ? (
            <MessageThread
              userLabel={platformUserLabel(selectedUser)}
              userEmail={platformUserEmail(selectedUser) || selectedRecipientId}
              messages={threadMessages}
              currentUserId={currentUser?.id || currentUser?.supabase_id}
              replySubject={replySubject}
              onReplySubjectChange={setReplySubject}
              replyBody={replyBody}
              onReplyBodyChange={setReplyBody}
              replyChannel={replyChannel}
              onReplyChannelChange={setReplyChannel}
              channelOptions={[
                { id: 'in_app', label: 'In-App' },
                { id: 'email', label: 'Email' },
                { id: 'both', label: 'Both' },
              ]}
              onSendReply={() => void handleReply()}
              canSendReply={!sendMutation.isPending && Boolean(String(replyBody).trim())}
              sending={sendMutation.isPending}
              hasNextPage={threadInfinite.hasNextPage}
              isFetchingNextPage={threadInfinite.isFetchingNextPage}
              onLoadMore={() => threadInfinite.fetchNextPage()}
            />
          ) : (
            <div className="h-full grid place-items-center text-muted-foreground">
              Select a conversation or campaign
            </div>
          )}
        </main>
      </div>

      <ComposeModal
        open={Boolean(composerMode)}
        onOpenChange={(open) => {
          if (!open) setComposerMode(null);
        }}
        mode={composerMode === 'broadcast' ? 'broadcast' : 'direct'}
        users={platformUsers}
        segments={segments}
        sending={sendMutation.isPending || broadcastMutation.isPending}
        onSubmit={(payload) => void handleSubmitCompose(payload)}
        defaultRecipientId={selectedRecipientId}
      />
    </div>
  );
}
