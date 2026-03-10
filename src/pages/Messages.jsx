import React, { useState, useEffect, useRef } from 'react';
import { Message, Client, Invoice, Quote, User } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, MessageCircle, Inbox, Send as SendIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { breakApi } from '@/api/apiClient';
import MessageComposer from '../components/messages/MessageComposer';
import ConversationList from '../components/messages/ConversationList';
import ConversationThread from '../components/messages/ConversationThread';

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
        } catch (error) {
            console.error('Error polling messages:', error);
        }
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [messagesData, clientsData, invoicesData, quotesData, userData] = await Promise.all([
                Message.list('-created_date'),
                Client.list(),
                Invoice.list('-created_date'),
                Quote.list('-created_date'),
                User.me()
            ]);
            if (!mountedRef.current) return;
            setMessages(messagesData || []);
            setClients(clientsData || []);
            setInvoices(invoicesData || []);
            setQuotes(quotesData || []);
            setUser(userData);
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

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <Skeleton className="h-12 w-64 mb-8" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Skeleton className="h-96" />
                        <Skeleton className="h-96 lg:col-span-2" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">Messages</h1>
                        <p className="text-slate-600">Communicate with your clients</p>
                    </div>
                    <Button onClick={() => setShowComposer(true)} className="bg-primary hover:bg-primary/90">
                        <Plus className="w-4 h-4 mr-2" />
                        New Message
                    </Button>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Conversations List */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`${selectedConversation ? 'hidden lg:block' : ''}`}
                    >
                        <Card className="bg-white shadow-xl border-0">
                            <CardHeader className="border-b border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <CardTitle className="flex items-center gap-2">
                                        <MessageCircle className="w-5 h-5" />
                                        Conversations
                                    </CardTitle>
                                    {unreadCount > 0 && (
                                        <span className="bg-primary text-white text-xs px-2 py-1 rounded-full">
                                            {unreadCount} new
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
                            <CardContent className="p-4 max-h-[60vh] overflow-y-auto">
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
                        <Card className="bg-white shadow-xl border-0 h-[70vh]">
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
                                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                    <MessageCircle className="w-16 h-16 mb-4 opacity-50" />
                                    <p className="text-lg font-medium">Select a conversation</p>
                                    <p className="text-sm">Choose a conversation from the list to view messages</p>
                                </div>
                            )}
                        </Card>
                    </motion.div>
                </div>

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