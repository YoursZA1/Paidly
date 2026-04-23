import React, { useState, useEffect, useRef } from 'react';
import { Message, Client, Invoice, Quote, User, DocumentSend, MessageLog, InvoiceView, Payment } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, MessageCircle, Inbox, FileText, X, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { breakApi } from '@/api/apiClient';
import MessageComposer from '../components/messages/MessageComposer';
import ConversationList from '../components/messages/ConversationList';
import ConversationThread from '../components/messages/ConversationThread';
import { supabase } from '@/lib/supabaseClient';

export default function MessagesPage() {
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
                .select('id, status, sent_at, read_at, admin_platform_messages(subject, content)')
                .eq('user_id', authData.user.id)
                .eq('channel', 'in_app')
                .order('sent_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            const rows = (data || []).map((row) => {
                const source = Array.isArray(row.admin_platform_messages)
                    ? row.admin_platform_messages[0]
                    : row.admin_platform_messages;
                return {
                    id: row.id,
                    subject: String(source?.subject || 'Message from Paidly'),
                    content: String(source?.content || ''),
                    sent_at: row.sent_at,
                    read: row.read_at != null || String(row.status || '').toLowerCase() === 'read',
                };
            });
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
                safe(() => Message.list('-created_date', { limit: 100, maxWaitMs: 4000 }), []),
                safe(() => Client.list('-created_date', { limit: 100, maxWaitMs: 4000 }), []),
                safe(() => Invoice.list('-created_date', { limit: 100, maxWaitMs: 4000 }), []),
                safe(() => Quote.list('-created_date', { limit: 100, maxWaitMs: 4000 }), []),
                safe(() => User.me(), null),
                safe(() => DocumentSend.list('-sent_at', { limit: 100, maxWaitMs: 4000 }), []),
                safe(() => MessageLog.list('-sent_at', { limit: 100, maxWaitMs: 4000 }), []),
                safe(() => InvoiceView.list('-viewed_at', { limit: 100, maxWaitMs: 4000 }), []),
                safe(() => Payment.list('-paid_at', { limit: 100, maxWaitMs: 4000 }), []),
            ]);

            const [
                messagesData,
                clientsData,
                invoicesData,
                quotesData,
                userData,
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
            setUser(userData);
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
            <div className="w-full min-w-0 mobile-page bg-background p-4 sm:p-6">
                <div className="max-w-7xl mx-auto min-w-0">
                    <Skeleton className="h-12 w-64 mb-8" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
                        <Skeleton className="h-96" />
                        <Skeleton className="h-96 lg:col-span-2" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-w-0 mobile-page bg-background p-4 sm:p-6 overflow-x-hidden">
            <div className="max-w-7xl mx-auto min-w-0">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-bold text-foreground mb-2">Messages</h1>
                        <p className="text-muted-foreground">
                            Conversations for in-app messages; Sent documents shows email opens, link clicks, and payment status.
                        </p>
                    </div>
                    <Button onClick={() => setShowComposer(true)} className="bg-primary hover:bg-primary/90">
                        <Plus className="w-4 h-4 mr-2" />
                        New Message
                    </Button>
                </motion.div>

                <Card className="bg-card shadow-xl border border-border mb-6">
                    <CardHeader className="border-b border-border">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="flex items-center gap-2">
                                <Bell className="w-5 h-5" />
                                Admin inbox
                                {adminInboxUnread > 0 && (
                                    <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full">
                                        {adminInboxUnread} unread
                                    </span>
                                )}
                            </CardTitle>
                            {adminInboxUnread > 0 ? (
                                <Button variant="outline" size="sm" onClick={markAdminInboxRead}>
                                    Mark all read
                                </Button>
                            ) : null}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                        {adminInboxMessages.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No admin messages yet.</p>
                        ) : (
                            adminInboxMessages.slice(0, 3).map((row) => (
                                <div key={row.id} className={`rounded-lg border px-3 py-2 ${row.read ? 'bg-card' : 'bg-primary/5 border-primary/30'}`}>
                                    <p className="text-sm font-semibold text-foreground">{row.subject}</p>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.content}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {row.sent_at ? format(new Date(row.sent_at), 'MMM d, yyyy HH:mm') : '—'}
                                    </p>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Tabs value={pageTab} onValueChange={setPageTab} className="mb-6">
                    <TabsList className="grid w-full max-w-xs grid-cols-2">
                        <TabsTrigger value="conversations" className="gap-2">
                            <MessageCircle className="w-4 h-4" />
                            Conversations
                        </TabsTrigger>
                        <TabsTrigger value="sent-documents" className="gap-2">
                            <FileText className="w-4 h-4" />
                            Sent documents
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {pageTab === 'sent-documents' ? (
                    <div className={`grid gap-6 min-w-0 ${selectedMessageDetail ? 'lg:grid-cols-[1fr,320px]' : ''}`}>
                        <Card className="bg-card shadow-xl border border-border">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-5 h-5" />
                                    Sent documents
                                </CardTitle>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Sent → Opened (email pixel) → Clicked (CTA) → Paid.
                                    <span className="ml-2">🟢 Paid</span>
                                    <span className="ml-2">🔵 Clicked</span>
                                    <span className="ml-2">🟡 Opened</span>
                                    <span className="ml-2">⚪ Sent</span>
                                </p>
                            </CardHeader>
                            <CardContent className="overflow-x-auto mobile-scroll-x min-w-0">
                                {sentDocumentsRows.length === 0 ? (
                                    <p className="text-muted-foreground py-8 text-center">
                                        No sent documents yet. Send an invoice via Email or WhatsApp to see them here.
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
                                                    className={`w-full text-left rounded-xl border border-border/60 bg-card px-4 py-3 hover:bg-muted/40 active:bg-muted/60 transition-colors ${
                                                        selectedMessageDetail?.rowId === row.id ? 'ring-2 ring-primary/40' : ''
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-foreground truncate">{row.document}</p>
                                                            <p className="text-xs text-muted-foreground truncate">{row.client} • {row.channel}</p>
                                                        </div>
                                                        <div className="shrink-0 text-xs text-muted-foreground">
                                                            {row.sentAt ? format(row.sentAt, 'MMM d') : '—'}
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                                        <span className="text-muted-foreground">{row.sentIndicator} Sent</span>
                                                        <span className="text-muted-foreground">{row.openedIndicator || '—'} Opened</span>
                                                        <span className="text-muted-foreground">{row.clickedIndicator || '—'} Clicked</span>
                                                        <span className="text-muted-foreground">{row.paidIndicator || '—'} Paid</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Desktop/tablet: table */}
                                        <table className="hidden sm:table w-full min-w-[640px] text-sm border-collapse">
                                            <thead>
                                                <tr className="border-b border-border">
                                                    <th className="text-left py-3 px-2 font-medium">Document</th>
                                                    <th className="text-left py-3 px-2 font-medium">Client</th>
                                                    <th className="text-left py-3 px-2 font-medium">Channel</th>
                                                    <th className="text-left py-3 px-2 font-medium">Sent</th>
                                                    <th className="text-left py-3 px-2 font-medium">Opened</th>
                                                    <th className="text-left py-3 px-2 font-medium">Clicked</th>
                                                    <th className="text-left py-3 px-2 font-medium">Paid</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sentDocumentsRows.map((row) => (
                                                    <tr
                                                        key={row.id}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => setSelectedMessageDetail(row.detail)}
                                                        onKeyDown={(e) => e.key === 'Enter' && setSelectedMessageDetail(row.detail)}
                                                        className={`border-b border-border/50 hover:bg-muted/50 cursor-pointer ${selectedMessageDetail?.rowId === row.id ? 'bg-muted/70' : ''}`}
                                                    >
                                                        <td className="py-2.5 px-2">{row.document}</td>
                                                        <td className="py-2.5 px-2">{row.client}</td>
                                                        <td className="py-2.5 px-2">{row.channel}</td>
                                                        <td className="py-2.5 px-2">{row.sentIndicator ? `${row.sentIndicator} ` : ''}{row.sent}</td>
                                                        <td className="py-2.5 px-2">{row.openedIndicator ? `${row.openedIndicator} ` : ''}{row.opened}</td>
                                                        <td className="py-2.5 px-2">{row.clickedIndicator ? `${row.clickedIndicator} ` : ''}{row.clicked}</td>
                                                        <td className="py-2.5 px-2">{row.paidIndicator ? `${row.paidIndicator} ` : ''}{row.paid}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                        {selectedMessageDetail && (
                            <Card className="bg-card shadow-xl border border-border h-fit sm:sticky sm:top-4">
                                <CardHeader className="border-b border-border flex flex-row items-start justify-between space-y-0 gap-2">
                                    <div>
                                        <CardTitle className="text-lg">{selectedMessageDetail.documentLabel}</CardTitle>
                                        <p className="text-sm text-muted-foreground">
                                            Sent via {selectedMessageDetail.channelLabel}
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="shrink-0 h-8 w-8"
                                        onClick={() => setSelectedMessageDetail(null)}
                                        aria-label="Close detail"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </CardHeader>
                                <CardContent className="pt-4 space-y-3">
                                    <p className="text-sm">
                                        <span className="text-muted-foreground">Sent: </span>
                                        {selectedMessageDetail.sentAt ? format(selectedMessageDetail.sentAt, 'MMMM d') : '—'}
                                    </p>
                                    <p className="text-sm">
                                        <span className="text-muted-foreground">Opened: </span>
                                        {selectedMessageDetail.openedAt ? format(selectedMessageDetail.openedAt, 'MMMM d, HH:mm') : '—'}
                                    </p>
                                    <p className="text-sm">
                                        <span className="text-muted-foreground">Link clicked: </span>
                                        {selectedMessageDetail.clickedAt ? format(selectedMessageDetail.clickedAt, 'MMMM d, HH:mm') : '—'}
                                    </p>
                                    <p className="text-sm">
                                        <span className="text-muted-foreground">Paid: </span>
                                        {selectedMessageDetail.paymentDate ? format(selectedMessageDetail.paymentDate, 'MMMM d') : '—'}
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
                    {/* Conversations List */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`${selectedConversation ? 'hidden lg:block' : ''}`}
                    >
                        <Card className="bg-card shadow-xl border border-border">
                            <CardHeader className="border-b border-border">
                                <div className="flex items-center justify-between mb-4">
                                    <CardTitle className="flex items-center gap-2">
                                        <MessageCircle className="w-5 h-5" />
                                        Conversations
                                    </CardTitle>
                                    {unreadCount > 0 && (
                                        <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full">
                                            {unreadCount} new
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search conversations..."
                                        className="pl-10"
                                    />
                                </div>
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                                    <TabsList className="w-full">
                                        <TabsTrigger value="all" className="flex-1">
                                            <Inbox className="w-4 h-4 mr-2" />
                                            All
                                        </TabsTrigger>
                                        <TabsTrigger value="unread" className="flex-1">
                                            <MessageCircle className="w-4 h-4 mr-2" />
                                            Unread
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </CardHeader>
                            <CardContent>
                                <ConversationList
                                    conversations={filteredConversations}
                                    clients={clients}
                                    invoices={invoices}
                                    onSelect={handleSelectConversation}
                                    onDelete={handleDeleteConversation}
                                    selectedId={selectedConversation ? selectedConversation.client_id + (selectedConversation.invoice_id || '') : null}
                                />
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Conversation Thread */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`lg:col-span-2 ${!selectedConversation ? 'hidden lg:block' : ''}`}
                    >
                        <Card className={`bg-card shadow-xl border border-border flex flex-col min-h-0 w-full min-w-0 overflow-hidden ${
                            selectedConversation
                                ? "h-[min(70vh,calc(100dvh-10rem))] lg:h-[70vh]"
                                : "min-h-[240px] lg:h-[70vh]"
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
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                    <MessageCircle className="w-16 h-16 mb-4 opacity-50" />
                                    <p className="text-lg font-medium">Select a conversation</p>
                                    <p className="text-sm">Choose a conversation from the list to view messages</p>
                                </div>
                            )}
                        </Card>
                    </motion.div>
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