import React, { useState } from 'react';
import { Building2, FileText, MessageCircle, Trash2 } from 'lucide-react';
import { format, isToday } from 'date-fns';
import { Button } from '@/components/ui/button';
import ConfirmationDialog from '../shared/ConfirmationDialog';

export default function ConversationList({ conversations, clients, invoices, onSelect, onDelete, selectedId }) {
    const [conversationToDelete, setConversationToDelete] = useState(null);

    if (conversations.length === 0) {
        return (
            <div className="text-center py-10 text-muted-foreground">
                <MessageCircle className="w-7 h-7 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No conversations yet</p>
                <p className="text-xs mt-1">Send a message to a client to start a thread.</p>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-0.5">
                {conversations.map((conv) => {
                    const client = clients.find(c => c.id === conv.client_id);
                    const invoice = conv.invoice_id ? invoices.find(i => i.id === conv.invoice_id) : null;
                    const hasUnread = conv.messages.some(m => !m.is_read && m.sender_type === 'client');
                    const lastMessage = conv.messages[0];
                    const isSelected = selectedId === conv.client_id + (conv.invoice_id || '');

                    return (
                        <div
                            key={conv.client_id + (conv.invoice_id || '')}
                            role="button"
                            tabIndex={0}
                            className={`w-full cursor-pointer group relative rounded-xl px-3 py-2.5 text-left transition-colors ${
                                isSelected
                                    ? 'bg-orange-50 dark:bg-orange-950/40 ring-1 ring-orange-100 dark:ring-orange-800'
                                    : 'hover:bg-muted/50'
                            }`}
                            onClick={() => onSelect(conv)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelect(conv);
                                }
                            }}
                            aria-label={`Open conversation with ${client?.name || 'Unknown Client'}`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                        hasUnread ? 'bg-primary/15' : 'bg-muted'
                                    }`}>
                                        <Building2 className={`w-4 h-4 ${hasUnread ? 'text-primary' : 'text-muted-foreground'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <h4 className="text-sm font-medium truncate text-foreground">
                                                {client?.name || 'Unknown Client'}
                                            </h4>
                                            {hasUnread && (
                                                <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0"></span>
                                            )}
                                        </div>
                                        {invoice && (
                                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                                                <FileText className="w-3 h-3" />
                                                {invoice.invoice_number}
                                            </div>
                                        )}
                                        {lastMessage && (
                                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                                {lastMessage.sender_type === 'business' ? 'You: ' : ''}
                                                {lastMessage.content.replace(/<[^>]*>?/gm, '')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right shrink-0 flex flex-col items-end">
                                    {lastMessage && (
                                        <p className="text-[10px] text-muted-foreground">
                                            {isToday(new Date(lastMessage.created_date)) 
                                                ? format(new Date(lastMessage.created_date), 'h:mm a')
                                                : format(new Date(lastMessage.created_date), 'd MMM')}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-1 mt-1">
                                        <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                                            {conv.messages.length}
                                        </span>
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
                        </div>
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