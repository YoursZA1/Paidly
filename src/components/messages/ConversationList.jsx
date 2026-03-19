import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, FileText, MessageCircle, Trash2 } from 'lucide-react';
import { format, isToday } from 'date-fns';
import { Button } from '@/components/ui/button';
import ConfirmationDialog from '../shared/ConfirmationDialog';

export default function ConversationList({ conversations, clients, invoices, onSelect, onDelete, selectedId }) {
    const [conversationToDelete, setConversationToDelete] = useState(null);

    if (conversations.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No conversations yet</p>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-2">
                {conversations.map((conv) => {
                    const client = clients.find(c => c.id === conv.client_id);
                    const invoice = conv.invoice_id ? invoices.find(i => i.id === conv.invoice_id) : null;
                    const hasUnread = conv.messages.some(m => !m.is_read && m.sender_type === 'client');
                    const lastMessage = conv.messages[0];

                    return (
                        <Card
                            key={conv.client_id + (conv.invoice_id || '')}
                            className={`cursor-pointer hover:shadow-md transition-all group relative ${
                                selectedId === conv.client_id + (conv.invoice_id || '')
                                    ? 'ring-2 ring-primary bg-primary/10'
                                    : 'bg-card'
                            }`}
                            onClick={() => onSelect(conv)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelect(conv);
                                }
                            }}
                            aria-label={`Open conversation with ${client?.name || 'Unknown Client'}`}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                            hasUnread ? 'bg-primary/15' : 'bg-muted'
                                        }`}>
                                            <Building2 className={`w-5 h-5 ${hasUnread ? 'text-primary' : 'text-muted-foreground'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className={`font-semibold truncate ${hasUnread ? 'text-foreground' : 'text-foreground'}`}>
                                                    {client?.name || 'Unknown Client'}
                                                </h4>
                                                {hasUnread && (
                                                    <span className="w-2 h-2 bg-primary rounded-full"></span>
                                                )}
                                            </div>
                                            {invoice && (
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                                    <FileText className="w-3 h-3" />
                                                    {invoice.invoice_number}
                                                </div>
                                            )}
                                            {lastMessage && (
                                                <p className="text-sm text-muted-foreground truncate mt-1">
                                                    {lastMessage.sender_type === 'business' ? 'You: ' : ''}
                                                    {lastMessage.content.replace(/<[^>]*>?/gm, '')}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0 flex flex-col items-end">
                                        {lastMessage && (
                                            <p className="text-xs text-muted-foreground">
                                                {isToday(new Date(lastMessage.created_date)) 
                                                    ? format(new Date(lastMessage.created_date), 'h:mm a')
                                                    : format(new Date(lastMessage.created_date), 'MMM d')}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="secondary" className="text-xs">
                                                {conv.messages.length}
                                            </Badge>
                                            {onDelete && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConversationToDelete(conv);
                                                    }}
                                                    aria-label={`Delete conversation with ${client?.name || 'Unknown Client'}`}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <ConfirmationDialog
                isOpen={!!conversationToDelete}
                onClose={() => setConversationToDelete(null)}
                onConfirm={() => {
                    if (conversationToDelete) {
                        onDelete(conversationToDelete);
                        setConversationToDelete(null);
                    }
                }}
                title="Delete Conversation"
                description="Are you sure you want to delete this entire conversation? This will delete all messages in this thread and cannot be undone."
                confirmText="Delete All"
                isDestructive={true}
            />
        </>
    );
}