import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Mail, Download, Edit, Trash2, CheckCircle, XCircle, ArrowRightSquare, Copy } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Quote, Client } from '@/api/entities';
import ConfirmationDialog from '../shared/ConfirmationDialog';
import ManualShareModal from '../shared/ManualShareModal';
import QuoteEmailPreviewModal from './QuoteEmailPreviewModal';
import { useToast } from '@/components/ui/use-toast';
import { documentSendSuccessDescription } from '@/components/shared/DocumentSendSuccessToast';
import { createTrackableQuoteLink, sendQuotePdfEmailToClient } from '@/services/InvoiceSendService';

function QuoteActions({ quote, onActionSuccess }) {
    const { toast } = useToast();
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showManualShare, setShowManualShare] = useState(false);
    const [showEmailPreview, setShowEmailPreview] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const [clientData, setClientData] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const navigate = useNavigate();

    const ensureToken = async () => {
        let token = quote.public_share_token;
        if (!token) {
            token = crypto.randomUUID();
            await Quote.update(quote.id, { public_share_token: token });
            quote.public_share_token = token;
            onActionSuccess();
        }
        return token || quote.public_share_token;
    };

    const handleShare = async () => {
        const token = await ensureToken();
        const publicQuoteUrl = `${window.location.origin}${createPageUrl(`PublicQuote?token=${token}`)}`;
        setShareUrl(publicQuoteUrl);
        setShowManualShare(true);
    };

    const handleEmailClient = async () => {
        try {
            // Fetch client data if not available in prop (QuoteActions doesn't have client prop usually, need to check usage)
            // But looking at previous files, InvoiceActions has client prop. QuoteActions props are { quote, onActionSuccess }
            // So we need to fetch client
            const client = await Client.get(quote.client_id);
            setClientData(client);
            await ensureToken();
            setShowEmailPreview(true);
        } catch (error) {
            console.error("Failed to prepare email:", error);
            alert("Could not load client data. Please try again.");
        }
    };

    const handleSendEmail = async (htmlContent) => {
        if (!clientData) return;
        setIsProcessing(true);
        try {
            await sendQuotePdfEmailToClient(quote, clientData, { html: htmlContent });

            if (quote.status === 'draft') {
                await Quote.update(quote.id, {
                    status: 'sent',
                    sent_date: new Date().toISOString(),
                });
                onActionSuccess();
            }

            setShowEmailPreview(false);
            toast({
                title: 'Quote sent successfully',
                description: documentSendSuccessDescription({
                    mode: 'quote',
                    recipientEmail: clientData.email?.trim() || '',
                }),
                variant: 'success',
                duration: 6500,
            });
        } catch (error) {
            console.error("Failed to send email:", error);
            toast({
                title: 'Failed to send email',
                description: error?.message || 'Please try again.',
                variant: 'destructive',
            });
        }
        setIsProcessing(false);
    };

    const handleStatusChange = async (newStatus) => {
        if (quote.status === newStatus) return;
        try {
            await Quote.update(quote.id, { status: newStatus });
            onActionSuccess();
        } catch (error) {
            console.error(`Failed to update status to ${newStatus}:`, error);
        }
    };
    
    const handleMarkAsSentFromModal = async () => {
        if (quote.status === 'draft') {
            await handleStatusChange('sent');
        }
        setShowManualShare(false);
    };

    const handleDownloadPDF = () => {
        navigate(createPageUrl(`QuotePDF?id=${quote.id}&download=true`));
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await Quote.delete(quote.id);
            onActionSuccess();
            setShowDeleteConfirm(false);
        } catch (error) {
            console.error("Failed to delete quote:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleConvertToInvoice = () => {
        navigate(createPageUrl(`CreateInvoice?quoteId=${quote.id}`));
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="quote-actions-trigger">
                        <MoreHorizontal className="w-4 h-4 text-slate-500" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                        <Link to={createPageUrl(`ViewQuote?id=${quote.id}`)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Quote
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link to={createPageUrl(`EditQuote?id=${quote.id}`)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Quote
                        </Link>
                    </DropdownMenuItem>
                     <DropdownMenuItem onClick={handleConvertToInvoice} data-testid="quote-convert-to-invoice">
                        <ArrowRightSquare className="w-4 h-4 mr-2" />
                        Convert to Invoice
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            <span>Mark as...</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => handleStatusChange('sent')}>
                                <Mail className="w-4 h-4 mr-2"/>Sent
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange('accepted')}>
                                <CheckCircle className="w-4 h-4 mr-2"/>Accepted
                            </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => handleStatusChange('rejected')}>
                                <XCircle className="w-4 h-4 mr-2"/>Rejected
                            </DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                     <DropdownMenuItem onClick={handleEmailClient}>
                        <Mail className="w-4 h-4 mr-2" />
                        Email Quote
                    </DropdownMenuItem>
                     <DropdownMenuItem onClick={handleShare}>
                        <Copy className="w-4 h-4 mr-2" />
                        Get Share Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadPDF}>
                        <Download className="w-4 h-4 mr-2" />
                        Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-red-600 focus:text-red-700 focus:bg-red-50">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Quote
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ConfirmationDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Are you absolutely sure?"
                description="This action cannot be undone. This will permanently delete the quote."
                confirmText="Delete"
                isConfirming={isDeleting}
            />

            {showManualShare && (
                <ManualShareModal
                    isOpen={showManualShare}
                    onClose={() => setShowManualShare(false)}
                    shareUrl={shareUrl}
                    itemType="quote"
                    onMarkAsSent={handleMarkAsSentFromModal}
                />
            )}

            {showEmailPreview && clientData && (
                <QuoteEmailPreviewModal
                    quote={quote}
                    client={clientData}
                    onClose={() => setShowEmailPreview(false)}
                    onSend={handleSendEmail}
                    isSending={isProcessing}
                    getTrackableLink={() => createTrackableQuoteLink(quote, 'email', clientData.email)}
                />
            )}
        </>
    );
}

export default React.memo(QuoteActions);