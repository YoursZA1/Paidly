import React, { useState, useEffect, useRef } from 'react';
import { breakApi } from '@/api/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, MessageCircle, Paperclip } from 'lucide-react';
import { format } from 'date-fns';

export default function ClientMessages({ client, invoices }) {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        loadMessages();
    }, [client?.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadMessages = async () => {
        if (!client?.id) return;
        setIsLoading(true);
        try {
            const allMessages = await breakApi.backend.ClientPortal.getMessages({ 
                clientId: client.id,
                email: client.email 
            });
            setMessages(allMessages.sort((a, b) => new Date(a.created_date) - new Date(b.created_date)));
            
            // Mark messages as read
            const unreadIds = allMessages
                .filter(m => !m.is_read && m.sender_type === 'business')
                .map(m => m.id);
            
            if (unreadIds.length > 0) {
                await breakApi.backend.ClientPortal.markMessagesRead({
                    clientId: client.id,
                    messageIds: unreadIds
                });
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        }
        setIsLoading(false);
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !client?.id) return;
        
        setIsSending(true);
        try {
            await breakApi.backend.ClientPortal.sendMessage({
                clientId: client.id,
                email: client.email,
                content: newMessage,
                attachments: [] // Attachments not implemented in UI yet
            });
            setNewMessage('');
            loadMessages();
        } catch (error) {
            console.error('Error sending message:', error);
        }
        setIsSending(false);
    };

    if (isLoading) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-6 text-center">
                    <div className="animate-pulse space-y-4">
                        <div className="h-4 bg-slate-200 rounded w-1/3 mx-auto"></div>
                        <div className="h-40 bg-slate-100 rounded"></div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-0 shadow-lg">
            <CardContent className="p-0">
                {/* Messages List */}
                <div className="h-96 overflow-y-auto p-6 bg-slate-50">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <MessageCircle className="w-12 h-12 mb-4 opacity-50" />
                            <p className="text-lg font-medium">No messages yet</p>
                            <p className="text-sm">Start a conversation with the business</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {messages.map((message) => {
                                const isFromClient = message.sender_type === 'client';
                                return (
                                    <div
                                        key={message.id}
                                        className={`flex ${isFromClient ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`max-w-[75%]`}>
                                            <div
                                                className={`rounded-2xl px-4 py-3 ${
                                                    isFromClient
                                                        ? 'bg-emerald-600 text-white rounded-br-md'
                                                        : 'bg-white border border-slate-200 rounded-bl-md'
                                                }`}
                                            >
                                                {message.subject && (
                                                    <p className={`font-semibold text-sm mb-1 ${isFromClient ? 'text-emerald-100' : 'text-slate-600'}`}>
                                                        {message.subject}
                                                    </p>
                                                )}
                                                <p className="whitespace-pre-wrap">{message.content}</p>
                                                
                                                {message.attachments?.length > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        {message.attachments.map((att, idx) => (
                                                            <a
                                                                key={idx}
                                                                href={att.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={`flex items-center gap-2 text-sm ${
                                                                    isFromClient ? 'text-emerald-100 hover:text-white' : 'text-blue-600 hover:text-blue-700'
                                                                }`}
                                                            >
                                                                <Paperclip className="w-3 h-3" />
                                                                {att.name}
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <p className={`text-xs text-slate-400 mt-1 ${isFromClient ? 'text-right' : ''}`}>
                                                {format(new Date(message.created_date), 'MMM d, h:mm a')}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Reply Box */}
                <div className="bg-white border-t p-4">
                    <div className="flex gap-3">
                        <Textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Type your message..."
                            rows={2}
                            className="flex-1 resize-none"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                        />
                        <Button 
                            onClick={handleSendMessage} 
                            disabled={isSending || !newMessage.trim()}
                            className="bg-emerald-600 hover:bg-emerald-700 self-end"
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Press Enter to send, Shift+Enter for new line</p>
                </div>
            </CardContent>
        </Card>
    );
}