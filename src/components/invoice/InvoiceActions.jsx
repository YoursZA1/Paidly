import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuContent
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Mail, Download, CheckCircle, Clock, AlertTriangle, Edit, Loader2, Trash2, DollarSign, Copy, FileJson, Share2, FileText, Send, XCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Invoice, Payment } from '@/api/entities';
import { breakApi } from '@/api/apiClient';
import ConfirmationDialog from '../shared/ConfirmationDialog';
import RecordPaymentModal from './RecordPaymentModal';
import ManualShareModal from '../shared/ManualShareModal';
import EmailPreviewModal from './EmailPreviewModal';
import InvoiceService from '@/api/InvoiceService';
import { useToast } from '@/components/ui/use-toast';
import { sendDraftInvoice } from '@/services/InvoiceSendService';
import { appendHistory, createHistoryEntry } from '@/utils/invoiceHistory';
import { getAutoStatusUpdate, isManualStatusChangeAllowed } from '@/utils/invoiceStatus';

const statusOptions = [
    { value: 'sent', label: 'Mark as Sent', icon: Mail },
    { value: 'viewed', label: 'Mark as Viewed', icon: Eye },
    { value: 'partial_paid', label: 'Mark as Partially Paid', icon: DollarSign },
    { value: 'paid', label: 'Mark as Paid', icon: CheckCircle },
    { value: 'overdue', label: 'Mark as Overdue', icon: AlertTriangle },
    { value: 'cancelled', label: 'Mark as Cancelled', icon: XCircle },
];

export default function InvoiceActions({ invoice, client, onActionSuccess }) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isRecordingPayment, setIsRecordingPayment] = useState(false);
    const [isGeneratingShareLink, setIsGeneratingShareLink] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showManualShare, setShowManualShare] = useState(false);
    const [showEmailPreview, setShowEmailPreview] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const navigate = useNavigate();
    const { toast } = useToast();

    const handleSendDraft = async () => {
        setIsSending(true);
        try {
            await sendDraftInvoice(invoice.id);
            const historyEntry = createHistoryEntry({
                action: 'send',
                summary: 'Draft sent to client',
                changes: [{ field: 'status', from: 'draft', to: 'sent' }],
            });
            await Invoice.update(invoice.id, {
                version_history: appendHistory(invoice.version_history, historyEntry),
            });
            toast({
                title: "✓ Invoice Sent",
                description: "Draft invoice has been sent to client.",
                variant: "success"
            });
            onActionSuccess();
        } catch (error) {
            console.error("Error sending draft invoice:", error);
            toast({
                title: "✗ Error",
                description: error.message || "Failed to send invoice. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsSending(false);
        }
    };

    const ensureToken = async () => {
        let token = invoice.public_share_token;
        if (!token) {
            token = crypto.randomUUID();
            await Invoice.update(invoice.id, { public_share_token: token });
            // Optimistic update for current scope
            invoice.public_share_token = token;
            onActionSuccess();
        }
        return token || invoice.public_share_token;
    };

    const handleShare = async () => {
        setIsGeneratingShareLink(true);
        try {
            const token = await ensureToken();
            const publicInvoiceUrl = `${window.location.origin}${createPageUrl(`PublicInvoice?token=${token}`)}`;
            setShareUrl(publicInvoiceUrl);
            setShowManualShare(true);
            toast({
                title: "Share link generated",
                description: "You can now share this link with your client.",
                variant: "success"
            });
        } catch (error) {
            console.error("Failed to generate share token:", error);
            toast({
                title: "Failed to generate share link",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsGeneratingShareLink(false);
        }
    };

    const handleEmailClient = async () => {
        try {
            await ensureToken();
            setShowEmailPreview(true);
        } catch (error) {
            console.error("Failed to prepare email:", error);
            toast({
                title: "Failed to prepare email",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleSendEmail = async (htmlContent) => {
        setIsProcessing(true);
        try {
            await breakApi.integrations.Core.SendEmail({
                to: client.email,
                subject: `Invoice #${invoice.invoice_number} from ${invoice.owner_company_name || 'Us'}`,
                body: htmlContent
            });
            
            // Mark as sent
            if (invoice.status === 'draft') {
                const historyEntry = createHistoryEntry({
                    action: 'send',
                    summary: 'Invoice sent to client',
                    changes: [
                        { field: 'status', from: 'draft', to: 'sent' },
                        { field: 'sent_to_email', from: invoice.sent_to_email || null, to: client.email },
                    ],
                });
                await Invoice.update(invoice.id, { 
                    status: 'sent',
                    sent_to_email: client.email,
                    version_history: appendHistory(invoice.version_history, historyEntry),
                });
                onActionSuccess();
            }
            
            setShowEmailPreview(false);
            toast({
                title: "Email sent successfully",
                description: `Invoice sent to ${client.email}`,
                variant: "success",
                duration: 4000
            });
        } catch (error) {
            console.error("Failed to send email:", error);
            toast({
                title: "Failed to send email",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        try {
            if (!isManualStatusChangeAllowed(invoice.status, newStatus)) {
                toast({
                    title: "Status change blocked",
                    description: `Cannot change status from ${invoice.status?.replace('_', ' ')} to ${newStatus.replace('_', ' ')}.`,
                    variant: "destructive",
                    duration: 4000
                });
                return;
            }
            const historyEntry = createHistoryEntry({
                action: 'status_change',
                summary: `Status changed to ${newStatus.replace('_', ' ')}`,
                changes: [{ field: 'status', from: invoice.status, to: newStatus }],
            });
            await Invoice.update(invoice.id, { 
                status: newStatus,
                version_history: appendHistory(invoice.version_history, historyEntry),
            });
            onActionSuccess();
            toast({
                title: "Status updated",
                description: `Invoice marked as ${newStatus.replace('_', ' ')}`,
                variant: "success",
                duration: 4000
            });
        } catch (error) {
            console.error(`Failed to update status to ${newStatus}:`, error);
            toast({
                title: "Failed to update status",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
        }
    };
    
    const handleMarkAsSentFromModal = async (sentToEmail) => {
        try {
            const updates = { sent_to_email: sentToEmail };
            if (invoice.status === 'draft') {
                updates.status = 'sent';
            }
            const changes = [
                { field: 'sent_to_email', from: invoice.sent_to_email || null, to: sentToEmail },
            ];
            if (invoice.status === 'draft') {
                changes.push({ field: 'status', from: 'draft', to: 'sent' });
            }
            const historyEntry = createHistoryEntry({
                action: 'send',
                summary: 'Marked as sent from share modal',
                changes,
            });
            await Invoice.update(invoice.id, {
                ...updates,
                version_history: appendHistory(invoice.version_history, historyEntry),
            });
            onActionSuccess();
            setShowManualShare(false);
            toast({
                title: "Invoice marked as sent",
                description: `Sent to ${sentToEmail}`,
                variant: "success",
                duration: 4000
            });
        } catch (error) {
            console.error("Failed to mark invoice as sent or save email:", error);
            toast({
                title: "Failed to update invoice",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleDownloadPDF = async () => {
        setIsDownloading(true);
        try {
            InvoiceService.downloadInvoicePDF(invoice.id, invoice.invoice_number);
            toast({
                title: "Download started",
                description: "Your PDF will download shortly",
                variant: "success",
                duration: 4000
            });
        } catch (error) {
            console.error("Failed to download PDF:", error);
            toast({
                title: "Failed to download PDF",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsDownloading(false);
        }
    };

    const handlePreviewPDF = () => {
        try {
            InvoiceService.previewInvoicePDF(invoice.id);
            toast({
                title: "Opening preview",
                description: "Loading PDF preview...",
                duration: 2000
            });
        } catch (error) {
            console.error("Failed to preview PDF:", error);
            toast({
                title: "Failed to preview PDF",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleExportJSON = async () => {
        setIsExporting(true);
        try {
            InvoiceService.exportInvoiceJSON(invoice, client);
            toast({
                title: "Export successful",
                description: "Invoice exported as JSON",
                duration: 4000
            });
        } catch (error) {
            console.error("Failed to export JSON:", error);
            toast({
                title: "Failed to export JSON",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsExporting(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await Invoice.delete(invoice.id);
            setShowDeleteConfirm(false);
            toast({
                title: "Invoice deleted",
                description: "Invoice has been permanently deleted",
                duration: 4000
            });
            onActionSuccess();
        } catch (error) {
            console.error("Failed to delete invoice:", error);
            toast({
                title: "Failed to delete invoice",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRecordPayment = async (paymentData) => {
        setIsRecordingPayment(true);
        try {
            // Create payment record in Payment entity
            const newPayment = await Payment.create({
                invoice_id: invoice.id,
                client_id: invoice.client_id,
                amount: paymentData.amount,
                payment_date: paymentData.payment_date,
                payment_method: paymentData.payment_method,
                reference_number: paymentData.reference_number,
                notes: paymentData.notes,
                created_date: new Date().toISOString()
            });

            // Get all payments for this invoice to calculate total
            const allPayments = await Payment.list('-payment_date');
            const invoicePayments = (allPayments || []).filter(p => p.invoice_id === invoice.id);
            const mergedPaymentsMap = new Map();
            [...invoicePayments, newPayment].forEach((payment) => {
                if (payment?.id) {
                    mergedPaymentsMap.set(payment.id, payment);
                }
            });
            const mergedPayments = Array.from(mergedPaymentsMap.values());

            const autoUpdate = getAutoStatusUpdate({
                ...invoice,
                payments: mergedPayments
            });
            const nextStatus = autoUpdate?.status || invoice.status;

            const changes = [
                { field: 'payment_recorded', from: null, to: newPayment },
            ];

            if (nextStatus !== invoice.status) {
                changes.push({ field: 'status', from: invoice.status, to: nextStatus });
            }

            const historyEntry = createHistoryEntry({
                action: 'payment_recorded',
                summary: `Payment recorded ($${paymentData.amount.toFixed(2)})`,
                changes,
                meta: { amount: paymentData.amount, payment_method: paymentData.payment_method },
            });

            const updatePayload = {
                ...(autoUpdate || {}),
                version_history: appendHistory(invoice.version_history, historyEntry)
            };

            await Invoice.update(invoice.id, updatePayload);
            
            setShowPaymentModal(false);
            toast({
                title: "Payment recorded",
                description: `Payment of $${paymentData.amount.toFixed(2)} recorded successfully`,
                duration: 4000
            });
            onActionSuccess();
        } catch (error) {
            console.error("Failed to record payment:", error);
            toast({
                title: "Failed to record payment",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsRecordingPayment(false);
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4 text-slate-500" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    
                    {/* Show Send Now option for draft invoices */}
                    {invoice.status === 'draft' && (
                        <>
                            <DropdownMenuItem onClick={handleSendDraft} disabled={isSending}>
                                {isSending ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4 mr-2" />
                                )}
                                Send Invoice Now
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                        </>
                    )}
                    
                     <DropdownMenuItem onClick={() => setShowPaymentModal(true)}>
                        <DollarSign className="w-4 h-4 mr-2" />
                        Record Payment
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link to={createPageUrl(`ViewInvoice?id=${invoice.id}`)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Invoice
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePreviewPDF}>
                        <FileText className="w-4 h-4 mr-2" />
                        Preview PDF
                    </DropdownMenuItem>
                     <DropdownMenuItem 
                        asChild={!(invoice.status === 'paid' || invoice.status === 'partial_paid' || invoice.status === 'cancelled')}
                        disabled={invoice.status === 'paid' || invoice.status === 'partial_paid' || invoice.status === 'cancelled'}
                        className={invoice.status === 'paid' || invoice.status === 'partial_paid' || invoice.status === 'cancelled' ? 'opacity-50 cursor-not-allowed' : ''}
                    >
                        {invoice.status === 'paid' || invoice.status === 'partial_paid' || invoice.status === 'cancelled' ? (
                            <span className="flex items-center">
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Invoice (Locked)
                            </span>
                        ) : (
                            <Link to={createPageUrl(`EditInvoice?id=${invoice.id}`)}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Invoice
                            </Link>
                        )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleEmailClient}>
                        <Mail className="w-4 h-4 mr-2" />
                        Email to Client
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShare}>
                        <Copy className="w-4 h-4 mr-2" />
                        Get Share Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadPDF}>
                        <Download className="w-4 h-4 mr-2" />
                        Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportJSON}>
                        <FileJson className="w-4 h-4 mr-2" />
                        Export as JSON
                    </DropdownMenuItem>

                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                            <Clock className="w-4 h-4 mr-2" />
                            Update Status
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            {statusOptions.map(opt => (
                                <DropdownMenuItem 
                                    key={opt.value} 
                                    onClick={() => handleStatusChange(opt.value)}
                                    disabled={invoice.status === opt.value || !isManualStatusChangeAllowed(invoice.status, opt.value)}
                                >
                                    <opt.icon className="w-4 h-4 mr-2" />
                                    {opt.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-red-600 focus:text-red-700 focus:bg-red-50">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Invoice
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ConfirmationDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Are you absolutely sure?"
                description="This action cannot be undone. This will permanently delete the invoice."
                confirmText="Delete"
                isConfirming={isDeleting}
            />

            {showPaymentModal && (
                <RecordPaymentModal
                    invoice={invoice}
                    isOpen={showPaymentModal}
                    onClose={() => setShowPaymentModal(false)}
                    onSave={handleRecordPayment}
                />
            )}

            {showManualShare && (
                <ManualShareModal
                    isOpen={showManualShare}
                    onClose={() => setShowManualShare(false)}
                    shareUrl={shareUrl}
                    itemType="invoice"
                    onMarkAsSent={handleMarkAsSentFromModal}
                    invoice={invoice}
                />
            )}

            {showEmailPreview && (
                <EmailPreviewModal
                    invoice={invoice}
                    client={client}
                    onClose={() => setShowEmailPreview(false)}
                    onSend={handleSendEmail}
                    isSending={isProcessing}
                />
            )}
        </>
    );
}