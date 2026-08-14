import React, { useState, useEffect, useRef } from 'react';
import { Message, Client, Invoice, Quote, DocumentSend, MessageLog, InvoiceView, Payment } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, MessageCircle, FileText, X, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { breakApi } from '@/api/apiClient';
import MessageComposer from '../components/messages/MessageComposer';
import ConversationList from '../components/messages/ConversationList';
import ConversationThread from '../components/messages/ConversationThread';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

function plainPreview(text, max = 140) {
    const plain = String(text || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!plain) return '';
    return plain.length > max ? `${plain.slice(0, max).trim()}…` : plain;
}

function dedupeAdminInbox(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows) {
        const minute = row.sent_at
            ? format(new Date(row.sent_at), 'yyyy-MM-dd HH:mm')
            : '';
        const key = row.message_id || `${row.subject}\n${row.content}\n${minute}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

export default function MessagesPage() {
    const { profile } = useAuth();
    const [messages, setMessages] = useState([]);
    const [clients, setClients] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showComposer, setShowComposer] = useState(false);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [pageTab, setPageTab] = useState('conversations'); // 'conversations' | 'sent-documents'
    const [documentSends, setDocumentSends] = useState([]);
    const [messageLogs, setMessageLogs] = useState([]);
    const [invoiceViews, setInvoiceViews] = useState([]);
    const [payments, setPayments] = useState([]);
    const [selectedMessageDetail, setSelectedMessageDetail] = useState(null);
    const [adminInboxMessages, setAdminInboxMessages] = useState([]);
    const [adminInboxUnread, setAdminInboxUnread] = useState(0);
    const [expandedAdminId, setExpandedAdminId] = useState(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        loadData();
        const interval = setInterval(() => {
            loadMessagesOnly();
        }, 10000); // Poll every 10 seconds

        return () => {
            mountedRef.current = false;
            clearInterval(interval);
        };
    }, []);

    const loadMessagesOnly = async () => {
        try {
            const messagesData = await Message.list('-created_date');
            if (mountedRef.current) setMessages(messagesData || []);
            await loadAdminInbox();
        } catch (error) {
            console.error('Error polling messages:', error);
        }
    };

    const loadAdminInbox = async () => {
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData?.user?.id) return;
            const { data, error } = await supabase
                .from('message_deliveries')
                .select('id, message_id, status, sent_at, read_at, admin_platform_messages(id, subject, content)')
                .eq('user_id', authData.user.id)
                .eq('channel', 'in_app')
                .order('sent_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            const mapped = (data || []).map((row) => {
                const source = Array.isArray(row.admin_platform_messages)
                    ? row.admin_platform_messages[0]
                    : row.admin_platform_messages;
                return {
                    id: row.id,
                    message_id: row.message_id || source?.id || null,
                    subject: String(source?.subject || 'Message from Paidly'),
                    content: String(source?.content || ''),
                    sent_at: row.sent_at,
                    read: row.read_at != null || String(row.status || '').toLowerCase() === 'read',
                };
            });
            const rows = dedupeAdminInbox(mapped);
            if (!mountedRef.current) return;
            setAdminInboxMessages(rows);
            setAdminInboxUnread(rows.filter((row) => !row.read).length);
        } catch (error) {
            console.error('Error loading admin inbox messages:', error);
        }
    };

    const markAdminInboxRead = async () => {
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData?.user?.id) return;
            await supabase
                .from('message_deliveries')
                .update({ read_at: new Date().toISOString(), status: 'read' })
                .eq('user_id', authData.user.id)
                .eq('channel', 'in_app')
                .is('read_at', null);
            await loadAdminInbox();
        } catch (error) {
            console.error('Error marking admin inbox read:', error);
        }
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Keep the page responsive even when tenant data grows.
            // Use bounded queries + best-effort timeouts for heavy tables.
            const safe = async (fn, fallback) => {
                try {
                    return await fn();
                } catch {
                    return fallback;
                }
            };

            const settled = await Promise.allSettled([
                safe(() => Message.list('-created_date', { limit: 100, maxWaitMs: 12000 }), []),
                safe(() => Client.list('-created_date', { limit: 100, maxWaitMs: 12000 }), []),
                safe(() => Invoice.list('-created_date', { limit: 100, maxWaitMs: 12000 }), []),
                safe(() => Quote.list('-created_date', { limit: 100, maxWaitMs: 12000 }), []),
                safe(() => DocumentSend.list('-sent_at', { limit: 100, maxWaitMs: 12000 }), []),
                safe(() => MessageLog.list('-sent_at', { limit: 100, maxWaitMs: 12000 }), []),
                safe(() => InvoiceView.list('-viewed_at', { limit: 100, maxWaitMs: 12000 }), []),
                safe(() => Payment.list('-paid_at', { limit: 100, maxWaitMs: 12000 }), []),
            ]);

            const [
                messagesData,
                clientsData,
                invoicesData,
                quotesData,
                sendsData,
                logsData,
                viewsData,
                paymentsData,
            ] = settled.map((r) => (r.status === 'fulfilled' ? r.value : null));
            if (!mountedRef.current) return;
            setMessages(messagesData || []);
            setClients(clientsData || []);
            setInvoices(invoicesData || []);
            setQuotes(quotesData || []);
            setUser(profile || null);
            setDocumentSends(sendsData || []);
            setMessageLogs(logsData || []);
            setInvoiceViews(viewsData || []);
            setPayments(paymentsData || []);
            await loadAdminInbox();
        } catch (error) {
            console.error('Error loading messages:', error);
        } finally {
            if (mountedRef.current) setIsLoading(false);
        }
    };

    useEffect(() => {
        setUser(profile || null);
    }, [profile]);

    // Group messages into conversations by client and optionally invoice
    const getConversations = () => {
        const convMap = new Map();
        
        messages.forEach(msg => {
            const key = msg.client_id + (msg.invoice_id || '');
            if (!convMap.has(key)) {
                convMap.set(key, {
                    client_id: msg.client_id,
                    invoice_id: msg.invoice_id,
                    messages: []
                });
            }
            convMap.get(key).messages.push(msg);
        });

        // Sort messages within each conversation
        convMap.forEach(conv => {
            conv.messages.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        });

        return Array.from(convMap.values()).sort((a, b) => {
            const aLatest = new Date(a.messages[0]?.created_date || 0);
            const bLatest = new Date(b.messages[0]?.created_date || 0);
            return bLatest - aLatest;
        });
    };

    const conversations = getConversations();

    // Filter conversations
    const filteredConversations = conversations.filter(conv => {
        const client = clients.find(c => c.id === conv.client_id);
        const matchesSearch = !searchTerm || 
            client?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            client?.email?.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (activeTab === 'unread') {
            return matchesSearch && conv.messages.some(m => !m.is_read && m.sender_type === 'client');
        }
        return matchesSearch;
    });

    const handleSendMessage = async (messageData) => {
        try {
            const client = clients.find(c => c.id === messageData.client_id);
            
            // Create message record
            await Message.create({
                ...messageData,
                sender_type: 'business',
                sender_name: user?.company_name || user?.full_name || 'Business',
                sender_email: user?.email,
                is_read: true
            });

            // Send email notification to client
            const attachmentLinks = messageData.attachments?.map(att => 
                `<li><a href="${att.url}">${att.name}</a></li>`
            ).join('');

            await breakApi.integrations.Core.SendEmail({
                to: client.email,
                subject: messageData.subject || `New message from ${user?.company_name || 'Your Business'}`,
                body: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>You have a new message</h2>
                        <div style="font-size: 16px; line-height: 1.5; color: #333;">
                            ${messageData.content}
                        </div>
                        
                        ${attachmentLinks ? `
                            <div style="margin-top: 20px; padding: 15px; background-color: #f9fafb; border-radius: 8px;">
                                <h3 style="margin-top: 0; font-size: 16px;">Attachments:</h3>
                                <ul>${attachmentLinks}</ul>
                            </div>
                        ` : ''}

                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />
                        <p style="color: #666; font-size: 14px;">
                            From: ${user?.company_name || user?.full_name}
                        </p>
                    </div>
                `
            });

            loadData();
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    };

    const handleSendReply = async (content) => {
        if (!selectedConversation) return;
        
        await handleSendMessage({
            client_id: selectedConversation.client_id,
            invoice_id: selectedConversation.invoice_id,
            content
        });
    };

    const markConversationAsRead = async (conv) => {
        const unreadMessages = conv.messages.filter(m => !m.is_read && m.sender_type === 'client');
        for (const msg of unreadMessages) {
            await Message.update(msg.id, { ...msg, is_read: true });
        }
        loadData();
    };

    const handleSelectConversation = (conv) => {
        setSelectedConversation(conv);
        markConversationAsRead(conv);
    };

    const handleDeleteMessage = async (messageId) => {
        try {
            await Message.delete(messageId);
            
            // Update local state immediately for responsiveness
            if (selectedConversation) {
                const updatedMessages = selectedConversation.messages.filter(m => m.id !== messageId);
                if (updatedMessages.length === 0) {
                    setSelectedConversation(null);
                } else {
                    setSelectedConversation({
                        ...selectedConversation,
                        messages: updatedMessages
                    });
                }
            }
            
            loadData();
        } catch (error) {
            console.error("Error deleting message:", error);
        }
    };

    const handleDeleteConversation = async (conversation) => {
        try {
            // Delete all messages in the conversation
            await Promise.all(conversation.messages.map(msg => Message.delete(msg.id)));
            
            if (selectedConversation && 
                selectedConversation.client_id === conversation.client_id && 
                selectedConversation.invoice_id === conversation.invoice_id) {
                setSelectedConversation(null);
            }
            
            loadData();
        } catch (error) {
            console.error("Error deleting conversation:", error);
        }
    };

    const unreadCount = conversations.reduce((count, conv) => {
        return count + conv.messages.filter(m => !m.is_read && m.sender_type === 'client').length;
    }, 0);

    // Timeline table: Document, Client, Channel, Sent, Opened, Paid (⚪ Sent, 🟡 Opened, 🟢 Paid)
    const buildTimelineRow = (row, sentAt, openedAt, paymentDate, clickedAt) => {
        const isInvoice = row.document_type === 'invoice';
        const doc = isInvoice
            ? invoices.find((i) => i.id === row.document_id)
            : quotes.find((q) => q.id === row.document_id);
        const docNumber = doc?.invoice_number ?? doc?.quote_number ?? row.document_id;
        const docLabel = doc
            ? (isInvoice ? `Invoice ${docNumber}` : `Quote ${docNumber}`)
            : (isInvoice ? 'Invoice' : 'Quote');
        const client = clients.find((c) => c.id === row.client_id);
        const clientName = client?.name || '—';
        const channelLabel = row.channel === 'whatsapp' ? 'WhatsApp' : 'Email';
        const opened = row.viewed === true;
        const paid = row.paid === true;
        const clicked = clickedAt != null;
        const sentAtDate = sentAt ? new Date(sentAt) : null;
        return {
            id: row.id,
            sentAt: sentAtDate,
            document: docLabel,
            client: clientName,
            channel: channelLabel,
            sent: '✓',
            sentIndicator: '⚪',
            opened: opened ? '✓' : '✗',
            openedIndicator: opened ? '🟡' : null,
            clicked: clicked ? '✓' : '✗',
            clickedIndicator: clicked ? '🔵' : null,
            paid: paid ? '✓' : '–',
            paidIndicator: paid ? '🟢' : null,
            detail: {
                rowId: row.id,
                documentLabel: isInvoice ? `Invoice ${docNumber}` : `Quote ${docNumber}`,
                channel: row.channel,
                channelLabel,
                sentAt: sentAtDate,
                openedAt: openedAt ? new Date(openedAt) : null,
                clickedAt: clickedAt ? new Date(clickedAt) : null,
                paymentDate: paymentDate ? new Date(paymentDate) : null,
            },
        };
    };
    const timelineFromMessageLogs = messageLogs.map((log) =>
        buildTimelineRow(log, log.sent_at, log.opened_at, log.payment_date, log.clicked_at)
    );
    const timelineFromDocumentSends = documentSends
        .filter((send) => !messageLogs.some((l) => l.document_id === send.document_id && l.channel === send.channel))
        .map((send) => {
            const isInvoice = send.document_type === 'invoice';
            const doc = isInvoice ? invoices.find((i) => i.id === send.document_id) : quotes.find((q) => q.id === send.document_id);
            const viewsForDoc = isInvoice ? invoiceViews.filter((v) => v.invoice_id === send.document_id) : [];
            const paymentsForInvoice = isInvoice ? payments.filter((p) => p.invoice_id === send.document_id) : [];
            const paid = isInvoice && (doc?.status === 'paid' || paymentsForInvoice.length > 0);
            const latestView = viewsForDoc.length > 0
                ? viewsForDoc.reduce((a, v) => (new Date(v.viewed_at) > new Date(a.viewed_at) ? v : a), viewsForDoc[0])
                : null;
            const latestPayment = paymentsForInvoice.length > 0
                ? paymentsForInvoice.reduce((a, p) => {
                    const d = p.paid_at || p.payment_date || p.created_at;
                    const aD = a.paid_at || a.payment_date || a.created_at;
                    return d && new Date(d) > new Date(aD) ? p : a;
                }, paymentsForInvoice[0])
                : null;
            const openedAt = latestView?.viewed_at ?? null;
            const paymentDate = latestPayment ? (latestPayment.paid_at || latestPayment.payment_date || latestPayment.created_at) : null;
            return buildTimelineRow(
                { ...send, viewed: viewsForDoc.length > 0, paid },
                send.sent_at,
                openedAt,
                paymentDate,
                null
            );
        });
    const sentDocumentsRows = [...timelineFromMessageLogs, ...timelineFromDocumentSends].sort(
        (a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0)
    );

    if (isLoading) {
        return (
            <div className="w-full min-w-0 mobile-page bg-slate-50/50 dark:bg-slate-900/50 p-4 lg:p-6">
                <div className="max-w-7xl mx-auto min-w-0">
                    <Skeleton className="h-8 w-40 mb-4" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-w-0">
                        <Skeleton className="h-72 rounded-2xl" />
                        <Skeleton className="h-72 lg:col-span-2 rounded-2xl" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-w-0 mobile-page bg-slate-50/50 dark:bg-slate-900/50 p-4 lg:p-6 overflow-x-hidden">
            <div className="max-w-7xl mx-auto min-w-0">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <h1 className="text-xl font-semibold text-foreground tracking-tight font-display">Messages</h1>
                    <Button
                        size="sm"
                        onClick={() => setShowComposer(true)}
                        className="rounded-xl text-xs font-medium bg-primary hover:bg-primary/90 shadow-sm shadow-primary/20"
                    >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        New Message
                    </Button>
                </div>

                {adminInboxMessages.length > 0 && (
                    <div className="rounded-2xl border border-border bg-card shadow-sm mb-4 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
                            <div className="flex items-center gap-2 min-w-0">
                                <p className="text-sm font-medium text-foreground">From Paidly</p>
                                {adminInboxUnread > 0 && (
                                    <span className="text-[10px] font-medium uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                        {adminInboxUnread} new
                                    </span>
                                )}
                            </div>
                            {adminInboxUnread > 0 ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={markAdminInboxRead}
                                    className="h-7 text-xs font-medium"
                                >
                                    Mark all read
                                </Button>
                            ) : null}
                        </div>
                        {adminInboxMessages.slice(0, 4).map((row) => {
                            const expanded = expandedAdminId === row.id;
                            return (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => setExpandedAdminId(expanded ? null : row.id)}
                                    className={`w-full text-left px-4 py-2.5 border-b border-border last:border-0 transition-colors ${
                                        row.read ? 'hover:bg-muted/40' : 'bg-primary/5 hover:bg-primary/10'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <p className={`text-sm truncate ${row.read ? 'font-medium text-foreground' : 'font-semibold text-foreground'}`}>
                                            {row.subject}
                                        </p>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="text-[11px] text-muted-foreground">
                                                {row.sent_at ? format(new Date(row.sent_at), 'd MMM yyyy') : '—'}
                                            </span>
                                            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                        </div>
                                    </div>
                                    {expanded ? (
                                        <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-2 leading-relaxed">
                                            {row.content}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                                            {plainPreview(row.content)}
                                        </p>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                <Tabs value={pageTab} onValueChange={setPageTab} className="mb-4">
                    <TabsList className="h-9 grid w-full max-w-sm grid-cols-2">
                        <TabsTrigger value="conversations" className="gap-1.5 text-xs font-medium">
                            <MessageCircle className="w-3.5 h-3.5" />
                            Conversations
                        </TabsTrigger>
                        <TabsTrigger value="sent-documents" className="gap-1.5 text-xs font-medium">
                            <FileText className="w-3.5 h-3.5" />
                            Sent documents
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {pageTab === 'sent-documents' ? (
                    <div className={`grid gap-4 min-w-0 ${selectedMessageDetail ? 'lg:grid-cols-[1fr,280px]' : ''}`}>
                        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                            <div className="px-5 py-3 border-b border-border">
                                <h2 className="text-sm font-medium text-foreground">Sent documents</h2>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Sent → opened → clicked → paid
                                </p>
                            </div>
                            <div className="p-4 overflow-x-auto mobile-scroll-x min-w-0">
                                {sentDocumentsRows.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-10 text-center">
                                        No sent documents yet. Send an invoice via email or WhatsApp to see them here.
                                    </p>
                                ) : (
                                    <>
                                        {/* Mobile: card list */}
                                        <div className="sm:hidden space-y-2">
                                            {sentDocumentsRows.map((row) => (
                                                <button
                                                    key={row.id}
                                                    type="button"
                                                    onClick={() => setSelectedMessageDetail(row.detail)}
                                                    className={`w-full text-left rounded-xl border border-border/60 bg-card px-3.5 py-2.5 hover:bg-muted/40 active:bg-muted/60 transition-colors ${
                                                        selectedMessageDetail?.rowId === row.id ? 'ring-1 ring-primary/30' : ''
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-foreground truncate">{row.document}</p>
                                                            <p className="text-[11px] text-muted-foreground truncate">{row.client} • {row.channel}</p>
                                                        </div>
                                                        <div className="shrink-0 text-[11px] text-muted-foreground">
                                                            {row.sentAt ? format(row.sentAt, 'd MMM') : '—'}
                                                        </div>
                                                    </div>
                                                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                                        <span>{row.sentIndicator} Sent</span>
                                                        <span>{row.openedIndicator || '—'} Opened</span>
                                                        <span>{row.clickedIndicator || '—'} Clicked</span>
                                                        <span>{row.paidIndicator || '—'} Paid</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Desktop/tablet: table */}
                                        <table className="hidden sm:table w-full min-w-[640px] text-left">
                                            <thead>
                                                <tr className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider border-b border-border">
                                                    <th className="pb-3 pr-2">Document</th>
                                                    <th className="pb-3 pr-2">Client</th>
                                                    <th className="pb-3 pr-2">Channel</th>
                                                    <th className="pb-3 pr-2">Sent</th>
                                                    <th className="pb-3 pr-2">Opened</th>
                                                    <th className="pb-3 pr-2">Clicked</th>
                                                    <th className="pb-3">Paid</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-sm text-muted-foreground">
                                                {sentDocumentsRows.map((row) => (
                                                    <tr
                                                        key={row.id}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => setSelectedMessageDetail(row.detail)}
                                                        onKeyDown={(e) => e.key === 'Enter' && setSelectedMessageDetail(row.detail)}
                                                        className={`border-b border-border hover:bg-muted/50 cursor-pointer ${selectedMessageDetail?.rowId === row.id ? 'bg-muted/70' : ''}`}
                                                    >
                                                        <td className="py-3 pr-2 font-medium text-foreground">{row.document}</td>
                                                        <td className="py-3 pr-2">{row.client}</td>
                                                        <td className="py-3 pr-2">{row.channel}</td>
                                                        <td className="py-3 pr-2">{row.sentIndicator ? `${row.sentIndicator} ` : ''}{row.sent}</td>
                                                        <td className="py-3 pr-2">{row.openedIndicator ? `${row.openedIndicator} ` : ''}{row.opened}</td>
                                                        <td className="py-3 pr-2">{row.clickedIndicator ? `${row.clickedIndicator} ` : ''}{row.clicked}</td>
                                                        <td className="py-3">{row.paidIndicator ? `${row.paidIndicator} ` : ''}{row.paid}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </>
                                )}
                            </div>
                        </div>
                        {selectedMessageDetail && (
                            <div className="rounded-2xl border border-border bg-card shadow-sm h-fit sm:sticky sm:top-4 overflow-hidden">
                                <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-medium text-foreground truncate">{selectedMessageDetail.documentLabel}</h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            Sent via {selectedMessageDetail.channelLabel}
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="shrink-0 h-7 w-7"
                                        onClick={() => setSelectedMessageDetail(null)}
                                        aria-label="Close detail"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <div className="px-4 py-3 space-y-2 text-xs">
                                    <p>
                                        <span className="text-muted-foreground">Sent: </span>
                                        {selectedMessageDetail.sentAt ? format(selectedMessageDetail.sentAt, 'd MMMM') : '—'}
                                    </p>
                                    <p>
                                        <span className="text-muted-foreground">Opened: </span>
                                        {selectedMessageDetail.openedAt ? format(selectedMessageDetail.openedAt, 'd MMMM, HH:mm') : '—'}
                                    </p>
                                    <p>
                                        <span className="text-muted-foreground">Link clicked: </span>
                                        {selectedMessageDetail.clickedAt ? format(selectedMessageDetail.clickedAt, 'd MMMM, HH:mm') : '—'}
                                    </p>
                                    <p>
                                        <span className="text-muted-foreground">Paid: </span>
                                        {selectedMessageDetail.paymentDate ? format(selectedMessageDetail.paymentDate, 'd MMMM') : '—'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-w-0 lg:min-h-[min(70vh,calc(100dvh-14rem))]">
                    {/* Conversations List */}
                    <div className={`${selectedConversation ? 'hidden lg:block' : ''} min-h-0`}>
                        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col h-full">
                            <div className="px-4 py-3 border-b border-border space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-foreground">Inbox</p>
                                    {unreadCount > 0 && (
                                        <span className="text-[10px] font-medium uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                            {unreadCount} new
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                    <Input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search conversations..."
                                        className="pl-9 h-8 text-sm rounded-xl bg-muted border-none"
                                    />
                                </div>
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    <TabsList className="w-full h-8">
                                        <TabsTrigger value="all" className="flex-1 text-xs font-medium h-7">
                                            All
                                        </TabsTrigger>
                                        <TabsTrigger value="unread" className="flex-1 text-xs font-medium h-7">
                                            Unread
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto p-2">
                                <ConversationList
                                    conversations={filteredConversations}
                                    clients={clients}
                                    invoices={invoices}
                                    onSelect={handleSelectConversation}
                                    onDelete={handleDeleteConversation}
                                    selectedId={selectedConversation ? selectedConversation.client_id + (selectedConversation.invoice_id || '') : null}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Conversation Thread */}
                    <div className={`lg:col-span-2 ${!selectedConversation ? 'hidden lg:block' : ''} min-h-0`}>
                        <div className={`rounded-2xl border border-border bg-card shadow-sm flex flex-col min-h-0 w-full min-w-0 overflow-hidden ${
                            selectedConversation
                                ? "h-[min(70vh,calc(100dvh-10rem))] lg:h-full"
                                : "min-h-[220px] lg:h-full"
                        }`}>
                            {selectedConversation ? (
                                <ConversationThread
                                    messages={selectedConversation.messages}
                                    client={clients.find(c => c.id === selectedConversation.client_id)}
                                    invoice={selectedConversation.invoice_id ? invoices.find(i => i.id === selectedConversation.invoice_id) : null}
                                    user={user}
                                    onSendReply={handleSendReply}
                                    onDeleteMessage={handleDeleteMessage}
                                    onBack={() => setSelectedConversation(null)}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-4">
                                    <MessageCircle className="w-8 h-8 mb-2 opacity-40" />
                                    <p className="text-sm font-medium">Select a conversation</p>
                                    <p className="text-xs mt-1 text-center">Choose a thread from the list to view messages.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                )}

                {/* Message Composer Modal */}
                <MessageComposer
                    open={showComposer}
                    onClose={() => setShowComposer(false)}
                    onSend={handleSendMessage}
                    clients={clients}
                    invoices={invoices}
                    quotes={quotes}
                />
            </div>
        </div>
    );
}