import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { MoreHorizontal, Eye, Mail, Download, CheckCircle, Clock, AlertTriangle, Edit, Loader2, Trash2, DollarSign, Share2, FileText, Send, XCircle, MessageCircle } from 'lucide-react';
import { PaperAirplaneIcon, CheckIcon } from '@heroicons/react/24/outline';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Invoice, User, BankingDetail } from '@/api/entities';
import { breakApi } from '@/api/apiClient';
import ConfirmationDialog from '../shared/ConfirmationDialog';
import RecordPaymentModal from './RecordPaymentModal';
import { RecordPaymentForm } from './RecordPaymentForm';
import ManualShareModal from '../shared/ManualShareModal';
import EmailPreviewModal from './EmailPreviewModal';
import InvoiceService from '@/api/InvoiceService';
import { useToast } from '@/components/ui/use-toast';
import { sendDraftInvoice, recordDocumentSend, createTrackableInvoiceLink } from '@/services/InvoiceSendService';
import { retryOnAbort, isAbortError } from '@/utils/retryOnAbort';
import { appendHistory, createHistoryEntry } from '@/utils/invoiceHistory';
import { getAutoStatusUpdate, isManualStatusChangeAllowed } from '@/utils/invoiceStatus';
import { useQueryClient } from '@tanstack/react-query';
import { usePaymentActions } from '@/hooks/usePaymentActions';
import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { supabase } from '@/lib/supabaseClient';
import { generateInvoicePDF } from '@/components/pdf/generateInvoicePDF';

const statusOptions = [
    { value: 'sent', label: 'Mark as Sent', icon: Mail },
    { value: 'viewed', label: 'Mark as Viewed', icon: Eye },
    { value: 'partial_paid', label: 'Mark as Partially Paid', icon: DollarSign },
    { value: 'paid', label: 'Mark as Paid', icon: CheckCircle },
    { value: 'overdue', label: 'Mark as Overdue', icon: AlertTriangle },
    { value: 'cancelled', label: 'Mark as Cancelled', icon: XCircle },
];

function InvoiceActions({ invoice, client, onActionSuccess, onOptimisticUpdate, onPaymentFullyPaid }) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const queryClient = useQueryClient();
    const { recordPayment, isProcessing: isRecordingPayment } = usePaymentActions(invoice, {
        onSuccess: (result) => {
            onActionSuccess?.();
            if (result?.isFullyPaid) onPaymentFullyPaid?.();
            queryClient.invalidateQueries({ queryKey: ['cashflow-page'] });
        },
    });
    const [isGeneratingShareLink, setIsGeneratingShareLink] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [sendPhase, setSendPhase] = useState('idle'); // 'idle' | 'preparing' | 'sending' | 'success'
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [showManualShare, setShowManualShare] = useState(false);
    const [showEmailPreview, setShowEmailPreview] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();

    const closeDrawer = () => {
        setDrawerOpen(false);
        setShowPaymentForm(false);
    };

    const handleRecordPaymentFromForm = async (paymentData) => {
        try {
            await recordPayment(paymentData);
            setShowPaymentForm(false);
            setDrawerOpen(false);
        } catch {
            // Toast shown by usePaymentActions; form stays open
        }
    };

    const validateForSend = () => {
        const email = client?.email?.trim();
        if (!email) {
            toast({
                title: "Missing client email",
                description: "Add a client with a valid email address before sending.",
                variant: "destructive"
            });
            return false;
        }
        const items = Array.isArray(invoice.items) ? invoice.items : [];
        const hasValidItem = items.some(item => (item?.name || item?.service_name) && (item?.quantity ?? 0) > 0);
        if (!hasValidItem) {
            toast({
                title: "No line items",
                description: "Add at least one line item to the invoice before sending.",
                variant: "destructive"
            });
            return false;
        }
        return true;
    };

    const handleSendDraft = async () => {
        if (!validateForSend()) return;

        setSendPhase('preparing');
        setIsSending(true);
        onOptimisticUpdate?.(invoice.id, 'sending');

        await new Promise((r) => setTimeout(r, 280));

        setSendPhase('sending');

        try {
            await retryOnAbort(() => sendDraftInvoice(invoice.id));
            const historyEntry = createHistoryEntry({
                action: 'send',
                summary: 'Draft sent to client',
                changes: [{ field: 'status', from: 'draft', to: 'sent' }],
            });
            await Invoice.update(invoice.id, {
                version_history: appendHistory(invoice.version_history, historyEntry),
            });
            onOptimisticUpdate?.(invoice.id, 'sent');
            setSendPhase('success');
            toast({
                title: "Invoice sent",
                description: "Your invoice is on its way to the client.",
                variant: "success"
            });
            setTimeout(() => {
                onActionSuccess();
                setSendPhase('idle');
            }, 900);
        } catch (error) {
            console.error("Error sending draft invoice:", error);
            onOptimisticUpdate?.(invoice.id, 'draft');
            setSendPhase('idle');
            const message = isAbortError(error) ? "Request was interrupted. Please try again." : (error.message || "Failed to send invoice. Please try again.");
            toast({
                title: "Send failed",
                description: message,
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
            await retryOnAbort(() => Invoice.update(invoice.id, { public_share_token: token }));
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
            const publicInvoiceUrl = `${window.location.origin}/view/${token}`;
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

    const handleSendViaWhatsApp = async () => {
        try {
            await ensureToken();
            const { createTrackableInvoiceLink } = await import('@/services/InvoiceSendService');
            const { url: trackableUrl } = await createTrackableInvoiceLink(invoice, 'whatsapp', client?.phone || client?.email);
            const brandName = invoice.owner_company_name || 'Paidly';
            const message = `Hi ${client?.name || 'there'}, here is your invoice ${invoice.invoice_number} from ${brandName}.\n\nView your invoice here: ${trackableUrl}`;
            const phone = client?.phone?.replace(/\D/g, '') || '';
            const whatsappUrl = phone
                ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
                : `https://wa.me/?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
            recordDocumentSend('invoice', invoice.id, client?.id, 'whatsapp');
            toast({
                title: "WhatsApp opened",
                description: "Share the invoice link with your client.",
                variant: "success",
                duration: 3000
            });
        } catch (error) {
            console.error("Failed to prepare WhatsApp share:", error);
            toast({
                title: "Failed to open WhatsApp",
                description: error.message || "Please try again.",
                variant: "destructive"
            });
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
            const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
            const supabaseUrl = rawSupabaseUrl.replace(/\.supabase\.com/gi, '.supabase.co');
            if (!supabaseUrl) throw new Error('Supabase URL is not configured.');

            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            const accessToken = sessionData?.session?.access_token;
            if (!accessToken) throw new Error('You must be logged in to send emails.');

            // Generate the invoice PDF in the browser (same HTML templates as preview) and attach via Edge Function.
            const userData = await User.me();
            let bankingForPdf = null;
            if (invoice?.banking_detail_id) {
                try {
                    bankingForPdf = await BankingDetail.get(invoice.banking_detail_id);
                } catch {
                    bankingForPdf = null;
                }
            }
            const pdfBlob = await generateInvoicePDF({
                invoice,
                client,
                user: userData,
                bankingDetail: bankingForPdf,
            });

            const blobToBase64 = async (blob) =>
                new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = String(reader.result || '');
                        const base64 = result.includes(',') ? result.split(',')[1] : result;
                        resolve(base64);
                    };
                    reader.onerror = () => reject(new Error('Failed to read PDF blob.'));
                    reader.readAsDataURL(blob);
                });

            const pdfBase64 = await blobToBase64(pdfBlob);
            const subject = `Invoice #${invoice.invoice_number} from ${invoice.owner_company_name || 'Us'}`;
            const filename = `invoice-${invoice.invoice_number || invoice.reference_number || 'invoice'}.pdf`;

            const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-invoice-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    pdfBase64,
                    email: client.email,
                    subject,
                    html: htmlContent,
                    filename,
                }),
            });

            if (!sendRes.ok) {
                let details = '';
                try {
                    details = await sendRes.text();
                } catch {
                    details = '';
                }
                throw new Error(details || 'Failed to send email via backend.');
            }
            
            // Mark as sent (with retry on spurious AbortError)
            if (invoice.status === 'draft') {
                const historyEntry = createHistoryEntry({
                    action: 'send',
                    summary: 'Invoice sent to client',
                    changes: [
                        { field: 'status', from: 'draft', to: 'sent' },
                        { field: 'sent_to_email', from: invoice.sent_to_email || null, to: client.email },
                    ],
                });
                await retryOnAbort(() =>
                    Invoice.update(invoice.id, {
                        status: 'sent',
                        sent_to_email: client.email,
                        version_history: appendHistory(invoice.version_history, historyEntry),
                    })
                );
                onActionSuccess();
            }
            recordDocumentSend('invoice', invoice.id, client?.id, 'email');

            setShowEmailPreview(false);
            toast({
                title: "Email sent successfully",
                description: `Invoice sent to ${client.email}`,
                variant: "success",
                duration: 4000
            });
        } catch (error) {
            console.error("Failed to send email:", error);
            const message = isAbortError(error) ? "Request was interrupted. Please try again." : (error.message || "Please try again.");
            toast({
                title: "Failed to send email",
                description: message,
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
            InvoiceService.downloadInvoicePDF(invoice.id, invoice.invoice_number, {
                navigate,
                inAppPath: createPageUrl('InvoicePDF') + '?id=' + invoice.id + '&download=true',
            });
            toast({
                title: "Download started",
                description: "Opening PDF in-app; print dialog will open to save.",
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
            InvoiceService.previewInvoicePDF(invoice.id, {
                navigate,
                inAppPath: createPageUrl('InvoicePDF') + '?id=' + invoice.id,
            });
            toast({
                title: "Opening preview",
                description: "Loading PDF preview in-app...",
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

    const isMobile = useIsMobile();
    const isPaid = invoice.status === 'paid' || invoice.status === 'partial_paid' || invoice.status === 'cancelled';
    const isDraft = invoice.status === 'draft';
    const showManageEdit = !isPaid;
    const showManageRecordPayment = !isPaid;
    const showShareLink = !isDraft;

    const itemClass = "text-muted-foreground";
    const iconClass = "w-4 h-4 mr-2";

    const ActionMenuContent = ({ onItemClick, isDrawer }) => {
        const wrap = (fn) => () => { onItemClick?.(); fn?.(); };

        const Section = ({ label, children }) => (
            <div className={isDrawer ? "py-3" : ""}>
                {!isDrawer && <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{label}</DropdownMenuLabel>}
                {isDrawer && <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-2 mb-2">{label}</p>}
                {children}
            </div>
        );

        const DrawerItem = ({ icon: Icon, label, onClick, href }) => {
            if (href) {
                return (
                    <Link
                        to={href}
                        onClick={onItemClick}
                        className="flex w-full items-center min-h-[48px] px-4 py-3 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors touch-manipulation"
                    >
                        <Icon className={iconClass} />
                        <span>{label}</span>
                    </Link>
                );
            }
            return (
                <button
                    type="button"
                    onClick={wrap(onClick)}
                    className="flex w-full items-center min-h-[48px] px-4 py-3 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors touch-manipulation"
                >
                    <Icon className={iconClass} />
                    <span>{label}</span>
                </button>
            );
        };

        const SendInvoiceItem = () => {
            const isDisabled = sendPhase === 'preparing' || sendPhase === 'sending';
            const isSent = sendPhase === 'success';
            const showSpinner = sendPhase === 'preparing' || sendPhase === 'sending';
            const label = isSent ? 'Sent to Client' : showSpinner ? (sendPhase === 'preparing' ? 'Preparing…' : 'Sending…') : 'Send Invoice Now';
            return (
                <motion.button
                    type="button"
                    disabled={isDisabled || isSent}
                    onClick={wrap(handleSendDraft)}
                    whileTap={!isDisabled && !isSent ? { scale: 0.98 } : undefined}
                    className={`relative flex items-center justify-center gap-3 w-full min-h-[52px] p-4 rounded-2xl font-semibold transition-all touch-manipulation
                        ${isSent ? 'bg-emerald-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'}
                        ${(isDisabled || isSent) ? 'cursor-not-allowed' : ''}`}
                >
                    {showSpinner ? (
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                            className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full shrink-0"
                        />
                    ) : isSent ? (
                        <>
                            <CheckIcon className="w-6 h-6 shrink-0" strokeWidth={2.5} />
                            <span>{label}</span>
                        </>
                    ) : (
                        <>
                            <PaperAirplaneIcon className="w-6 h-6 -rotate-45 shrink-0" strokeWidth={2} />
                            <span>{label}</span>
                        </>
                    )}
                </motion.button>
            );
        };

        const SendInvoiceDropdownItem = () => {
            const showSpinner = sendPhase === 'preparing' || sendPhase === 'sending';
            const label = sendPhase === 'success' ? 'Sent!' : sendPhase === 'sending' ? 'Sending…' : sendPhase === 'preparing' ? 'Preparing…' : 'Send Invoice Now';
            return (
                <DropdownMenuItem
                    onClick={handleSendDraft}
                    disabled={showSpinner}
                    className={`${itemClass} min-w-0 ${sendPhase === 'success' ? 'text-green-600 dark:text-green-400' : ''} ${showSpinner ? 'animate-pulse' : ''}`}
                >
                    <span className="w-4 h-4 flex items-center justify-center shrink-0 mr-2">
                        <AnimatePresence mode="wait">
                            {sendPhase === 'success' ? (
                                <motion.span
                                    key="check"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                    className="text-green-600 dark:text-green-400"
                                >
                                    <CheckCircle className="w-4 h-4" strokeWidth={2.5} />
                                </motion.span>
                            ) : showSpinner ? (
                                <Loader2 key="spinner" className="w-4 h-4 animate-spin text-primary" />
                            ) : (
                                <Send key="send" className="w-4 h-4" />
                            )}
                        </AnimatePresence>
                    </span>
                    {label}
                </DropdownMenuItem>
            );
        };

        if (isDrawer) {
            return (
                <div className="px-4 pb-6 pb-safe">
                    <DrawerHeader className="text-left pb-2">
                        <DrawerTitle>Invoice Actions</DrawerTitle>
                    </DrawerHeader>
                    <div className="space-y-1">
                        <Section label="Manage">
                            {isDraft && (
                                <SendInvoiceItem />
                            )}
                            {showManageRecordPayment && (
                                <DrawerItem icon={DollarSign} label="Record Payment" onClick={() => setShowPaymentForm(true)} />
                            )}
                            {showManageEdit && (
                                <DrawerItem icon={Edit} label="Edit Invoice" href={createPageUrl(`EditInvoice?id=${invoice.id}`)} />
                            )}
                            {isPaid && (
                                <DrawerItem icon={Eye} label="View Invoice" href={createPageUrl(`ViewInvoice?id=${invoice.id}`)} />
                            )}
                        </Section>
                        <Section label="Share">
                            <DrawerItem icon={Mail} label="Email to Client" onClick={handleEmailClient} />
                            <DrawerItem icon={MessageCircle} label="Send via WhatsApp" onClick={handleSendViaWhatsApp} />
                            {showShareLink && (
                                <DrawerItem icon={Share2} label="Get Share Link" onClick={handleShare} />
                            )}
                        </Section>
                        <Section label="Export">
                            <DrawerItem icon={FileText} label="Preview PDF" onClick={handlePreviewPDF} />
                            <DrawerItem icon={isDownloading ? Loader2 : Download} label={isDownloading ? "Downloading…" : "Download PDF"} onClick={handleDownloadPDF} />
                            {!isPaid && (
                                <DrawerItem icon={Eye} label="View Invoice" href={createPageUrl(`ViewInvoice?id=${invoice.id}`)} />
                            )}
                        </Section>
                        {invoice.status !== 'draft' && !isPaid && (
                            <Section label="Status">
                                <div className="space-y-1">
                                    {statusOptions.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={wrap(() => handleStatusChange(opt.value))}
                                            disabled={invoice.status === opt.value || !isManualStatusChangeAllowed(invoice.status, opt.value)}
                                            className="flex w-full items-center min-h-[48px] px-4 py-3 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg disabled:opacity-50 touch-manipulation"
                                        >
                                            <opt.icon className={iconClass} />
                                            <span>{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </Section>
                        )}
                        <div className="pt-4 mt-4 border-t border-border">
                            <button
                                type="button"
                                onClick={wrap(() => setShowDeleteConfirm(true))}
                                className="flex w-full items-center min-h-[48px] px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 rounded-lg transition-colors touch-manipulation"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                <span>Delete Invoice</span>
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <>
                <Section label="Manage">
                    {isDraft && (
                        <SendInvoiceDropdownItem />
                    )}
                    {showManageRecordPayment && (
                        <DropdownMenuItem onClick={() => setShowPaymentModal(true)} className={itemClass}>
                            <DollarSign className={iconClass} />
                            Record Payment
                        </DropdownMenuItem>
                    )}
                    {showManageEdit && (
                        <DropdownMenuItem asChild>
                            <Link to={createPageUrl(`EditInvoice?id=${invoice.id}`)} className={itemClass}>
                                <Edit className={iconClass} />
                                Edit Invoice
                            </Link>
                        </DropdownMenuItem>
                    )}
                    {isPaid && (
                        <DropdownMenuItem asChild>
                            <Link to={createPageUrl(`ViewInvoice?id=${invoice.id}`)} className={itemClass}>
                                <Eye className={iconClass} />
                                View Invoice
                            </Link>
                        </DropdownMenuItem>
                    )}
                </Section>
                <DropdownMenuSeparator />
                <Section label="Share">
                    <DropdownMenuItem onClick={handleEmailClient} className={itemClass}>
                        <Mail className={iconClass} />
                        Email to Client
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSendViaWhatsApp} className={itemClass}>
                        <MessageCircle className={iconClass} />
                        Send via WhatsApp
                    </DropdownMenuItem>
                    {showShareLink && (
                        <DropdownMenuItem onClick={handleShare} className={itemClass}>
                            <Share2 className={iconClass} />
                            Get Share Link
                        </DropdownMenuItem>
                    )}
                </Section>
                <DropdownMenuSeparator />
                <Section label="Export">
                    <DropdownMenuItem onClick={handlePreviewPDF} className={itemClass} data-testid="invoice-preview-pdf">
                        <FileText className={iconClass} />
                        Preview PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadPDF} disabled={isDownloading} className={itemClass} data-testid="invoice-download-pdf">
                        {isDownloading ? <Loader2 className={iconClass + " animate-spin"} /> : <Download className={iconClass} />}
                        Download PDF
                    </DropdownMenuItem>
                    {!isPaid && (
                        <DropdownMenuItem asChild data-testid="invoice-view-link-item">
                            <Link to={createPageUrl(`ViewInvoice?id=${invoice.id}`)} className={itemClass} data-testid="invoice-view-link">
                                <Eye className={iconClass} />
                                View Invoice
                            </Link>
                        </DropdownMenuItem>
                    )}
                </Section>
                {invoice.status !== 'draft' && !isPaid && (
                    <>
                        <DropdownMenuSeparator />
                        <Section label="Status">
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger className={itemClass}>
                                    <Clock className={iconClass} />
                                    Update Status
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                    {statusOptions.map(opt => (
                                        <DropdownMenuItem
                                            key={opt.value}
                                            onClick={() => handleStatusChange(opt.value)}
                                            disabled={invoice.status === opt.value || !isManualStatusChangeAllowed(invoice.status, opt.value)}
                                            className={itemClass}
                                        >
                                            <opt.icon className={iconClass} />
                                            {opt.label}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                        </Section>
                    </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-red-500 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50 cursor-pointer"
                >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Invoice
                </DropdownMenuItem>
            </>
        );
    };

    const triggerButton = (
        <Button
            variant="ghost"
            size="icon"
            data-testid="invoice-actions-trigger"
            className="h-8 w-8 md:min-h-[44px] md:min-w-[44px] text-muted-foreground hover:text-foreground hover:bg-accent"
        >
            <MoreHorizontal className="w-4 h-4" />
        </Button>
    );

    return (
        <>
            {isMobile ? (
                <Drawer open={drawerOpen} onOpenChange={(open) => { setDrawerOpen(open); if (!open) setShowPaymentForm(false); }}>
                    <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
                    <DrawerContent className="max-h-[85vh] overflow-auto">
                        <AnimatePresence mode="wait">
                            {showPaymentForm ? (
                                <RecordPaymentForm
                                    key="form"
                                    invoice={invoice}
                                    onConfirm={handleRecordPaymentFromForm}
                                    onBack={() => setShowPaymentForm(false)}
                                    isProcessing={isRecordingPayment}
                                />
                            ) : (
                                <ActionMenuContent key="menu" isDrawer onItemClick={closeDrawer} />
                            )}
                        </AnimatePresence>
                    </DrawerContent>
                </Drawer>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <ActionMenuContent />
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

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
                    onSave={recordPayment}
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
                    getTrackableLink={() => createTrackableInvoiceLink(invoice, 'email', client?.email)}
                />
            )}
        </>
    );
}

export default React.memo(InvoiceActions);