import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Paperclip, FileText, ArrowLeft, Building2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import ReactQuill from 'react-quill';
import { breakApi } from '@/api/apiClient';
import ConfirmationDialog from '../shared/ConfirmationDialog';

export default function ConversationThread({ messages, client, invoice, user, onSendReply, onBack, onDeleteMessage }) {
    const [replyContent, setReplyContent] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [messageToDelete, setMessageToDelete] = useState(null);
    const messagesEndRef = useRef(null);

    const quickReplies = [
        "Thank you!",
        "I'll check and get back to you.",
        "Received, thanks.",
        "Could you provide more details?",
        "Please see the attached invoice."
    ];

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendReply = async () => {
        if (!replyContent.trim()) return;
        setIsSending(true);
        try {
            await onSendReply(replyContent);
            setReplyContent('');
        } catch (error) {
            console.error('Error sending reply:', error);
        }
        setIsSending(false);
    };

    const sortedMessages = [...messages].sort((a, b) => 
        new Date(a.created_date) - new Date(b.created_date)
    );

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="bg-card border-b border-border p-4 flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={onBack}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-muted-foreground" />
                        <h2 className="font-semibold text-lg text-foreground">{client?.name}</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">{client?.email}</p>
                </div>
                {invoice && (
                    <Badge variant="outline" className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {invoice.invoice_number}
                    </Badge>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
                {sortedMessages.map((message) => {
                    const isFromBusiness = message.sender_type === 'business';
                    return (
                        <div
                            key={message.id}
                            className={`flex ${isFromBusiness ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`max-w-[75%] ${isFromBusiness ? 'order-2' : ''}`}>
                                <div
                                    className={`rounded-2xl px-4 py-3 ${
                                        isFromBusiness
                                            ? 'bg-primary text-white rounded-br-md'
                                            : 'bg-card border border-border rounded-bl-md'
                                    }`}
                                >
                                    {message.subject && (
                                        <p className={`font-semibold text-sm mb-1 ${isFromBusiness ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                                            {message.subject}
                                        </p>
                                    )}
                                    <div 
                                        className="whitespace-pre-wrap prose prose-sm max-w-none"
                                        dangerouslySetInnerHTML={{ __html: message.content }}
                                    />
                                    
                                    {message.attachments?.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                            {message.attachments.map((att, idx) => (
                                                <a
                                                    key={idx}
                                                    href={att.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`flex items-center gap-2 text-sm ${
                                                        isFromBusiness ? 'text-primary-foreground hover:text-white' : 'text-primary hover:text-primary'
                                                    }`}
                                                >
                                                    <Paperclip className="w-3 h-3" />
                                                    {att.name}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className={`flex items-center mt-1 gap-2 ${isFromBusiness ? 'justify-end' : ''}`}>
                                    <p className="text-xs text-muted-foreground">
                                        {message.sender_name} • {format(new Date(message.created_date), 'MMM d, h:mm a')}
                                    </p>
                                    {onDeleteMessage && (
                                        <button 
                                            onClick={() => setMessageToDelete(message)}
                                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                            title="Delete message"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            <ConfirmationDialog
                isOpen={!!messageToDelete}
                onClose={() => setMessageToDelete(null)}
                onConfirm={() => {
                    if (messageToDelete) {
                        onDeleteMessage(messageToDelete.id);
                        setMessageToDelete(null);
                    }
                }}
                title="Delete Message"
                description="Are you sure you want to delete this message? This action cannot be undone."
                confirmText="Delete"
                isDestructive={true}
            />

            {/* Reply Box */}
            <div className="bg-card border-t border-border p-4 space-y-3">
                {/* Quick Replies */}
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {quickReplies.map((reply, index) => (
                        <button
                            key={index}
                            onClick={() => setReplyContent(reply)}
                            className="whitespace-nowrap px-3 py-1 bg-muted hover:bg-muted/80 text-muted-foreground text-xs rounded-full transition-colors"
                        >
                            {reply}
                        </button>
                    ))}
                </div>

                <div className="flex gap-3">
                    <div className="flex-1 bg-background">
                        <ReactQuill
                            value={replyContent}
                            onChange={setReplyContent}
                            theme="snow"
                            placeholder="Type your reply..."
                            modules={{
                                toolbar: [
                                    ['bold', 'italic', 'underline', 'strike'],
                                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                    ['clean']
                                ]
                            }}
                        />
                    </div>
                    <Button 
                        onClick={handleSendReply} 
                        disabled={isSending || !replyContent || replyContent === '<p><br></p>'}
                        className="bg-primary hover:bg-primary/90 self-end mb-2"
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}