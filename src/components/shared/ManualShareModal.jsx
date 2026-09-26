import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Mail, CheckCircle, Send } from 'lucide-react';
import { breakApi } from '@/api/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { fetchEmailTemplates } from '@/services/EmailTemplatesService';
import { effectiveEmailTemplate, renderEmailTemplate } from '@shared/emailTemplates.js';
import { DocumentSentDone } from '@/components/shared/DocumentSentDone';

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Share a document by link or email. After an email is sent the modal becomes the Done State
 * (what was sent, to whom, what is still pending, next actions) instead of closing.
 * `doneActions` lets the caller supply page-specific next actions (e.g. Download PDF).
 */
export default function ManualShareModal({ isOpen, onClose, shareUrl, itemType = "invoice", onMarkAsSent, invoice, document: docRecord = null, client = null, doneActions = null }) {
    const { profile } = useAuth();
    const [sentTo, setSentTo] = useState('');
    const [sendError, setSendError] = useState('');
    const [copied, setCopied] = useState(false);
    const [emailTo, setEmailTo] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailMessage, setEmailMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    // Prefill from the company's email template (Business+) or Paidly's default wording.
    useEffect(() => {
        if (!isOpen) return undefined;
        setSentTo('');
        setSendError('');
        let cancelled = false;
        const record = docRecord || invoice || {};
        const docType = itemType === 'quote' ? 'quote' : 'invoice';
        const currency = record.currency || profile?.currency || 'ZAR';
        let amount = '';
        if (record.total_amount != null) {
            try {
                amount = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(record.total_amount) || 0);
            } catch {
                amount = `${currency} ${Number(record.total_amount || 0).toFixed(2)}`;
            }
        }
        const values = {
            client_name: client?.name || record.client_name || 'there',
            document_number: record.invoice_number || record.quote_number || '',
            company_name: profile?.company_name || profile?.full_name || 'Paidly',
            amount,
            due_date: record.due_date || record.valid_until || '',
        };
        const apply = (templates, allowed) => {
            if (cancelled) return;
            const t = effectiveEmailTemplate(templates, docType, allowed);
            setEmailSubject((prev) => prev || renderEmailTemplate(t.subject, values));
            setEmailMessage((prev) => prev || renderEmailTemplate(t.message, values));
            setEmailTo((prev) => prev || client?.email || '');
        };
        fetchEmailTemplates()
            .then(({ templates, allowed }) => apply(templates, allowed))
            .catch(() => apply({}, false));
        return () => {
            cancelled = true;
        };
    }, [isOpen, itemType, docRecord, invoice, client, profile?.company_name, profile?.full_name, profile?.currency]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSendEmail = async () => {
        if (!emailTo || !emailSubject) {
            setSendError('Please fill in the recipient email and subject.');
            return;
        }

        setSendError('');
        setIsSending(true);
        try {
            const emailBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #f9fafb;">
                    <div style="text-align: center; padding: 20px 0;">
                        <h1 style="font-size: 24px; color: #333;">You've received a new ${itemType}</h1>
                    </div>
                    <div style="background: white; padding: 30px; border: 1px solid #e1e5e9; border-radius: 8px;">
                        <p style="font-size: 16px; color: #555;">${escapeHtml(emailMessage || `Please find your ${itemType} below.`).replace(/\n/g, '<br/>')}</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${shareUrl}" 
                               style="background-color: #4f46e5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block;">
                                View ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}
                            </a>
                        </div>
                        <p style="font-size: 14px; color: #888; margin-top: 20px;">
                            Or copy this link: <br/>
                            <a href="${shareUrl}" style="color: #4f46e5; word-break: break-all;">${shareUrl}</a>
                        </p>
                    </div>
                    <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
                        <p>Sent from ${profile?.company_name || profile?.full_name || "Paidly"}</p>
                    </div>
                </div>
            `;

            await breakApi.integrations.Core.SendEmail({
                to: emailTo,
                subject: emailSubject,
                body: emailBody
            });

            if (onMarkAsSent) {
                try {
                    await onMarkAsSent(emailTo);
                } catch (markErr) {
                    // The email went out; a failed status update must not hide that.
                    console.warn('Email sent; could not update document status:', markErr);
                }
            }
            setSentTo(emailTo.trim());
        } catch (error) {
            console.error('Failed to send email:', error);
            setSendError('The email could not be sent. Check the address and try again.');
        } finally {
            setIsSending(false);
        }
    };

    const copyAction = {
        label: copied ? 'Link copied' : 'Copy link',
        icon: copied ? CheckCircle : Copy,
        onClick: handleCopyLink,
        variant: 'outline',
    };

    if (sentTo) {
        return (
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="max-w-lg">
                    <DialogHeader className="sr-only">
                        <DialogTitle>{itemType === 'quote' ? 'Quote sent' : itemType === 'payslip' ? 'Payslip sent' : 'Invoice sent'}</DialogTitle>
                        <DialogDescription>Sent to {sentTo}</DialogDescription>
                    </DialogHeader>
                    <DocumentSentDone
                        docType={itemType === 'quote' ? 'quote' : itemType === 'payslip' ? 'payslip' : 'invoice'}
                        record={docRecord || invoice || {}}
                        client={client}
                        recipient={sentTo}
                        currency={profile?.currency}
                        actions={doneActions}
                        extraActions={itemType === 'payslip' ? [copyAction] : []}
                        onDone={onClose}
                    />
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Share {itemType.charAt(0).toUpperCase() + itemType.slice(1)}</DialogTitle>
                    <DialogDescription>
                        Copy the link or send it directly via email to your client.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Copy Link Section */}
                    <div className="space-y-2">
                        <Label htmlFor="manual-share-public-url">Public Link</Label>
                        <div className="flex gap-2">
                            <Input 
                                id="manual-share-public-url"
                                value={shareUrl} 
                                readOnly 
                                className="flex-1 font-mono text-sm"
                            />
                            <Button 
                                onClick={handleCopyLink}
                                variant="outline"
                                className="shrink-0"
                            >
                                {copied ? <CheckCircle className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />}
                                {copied ? 'Copied!' : 'Copy'}
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500">Share this secure link with your client. They can view and download without logging in.</p>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-semibold mb-4 flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            Or Send via Email
                        </h4>
                        
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email-to">Recipient Email *</Label>
                                <Input
                                    id="email-to"
                                    type="email"
                                    placeholder="client@example.com"
                                    value={emailTo}
                                    onChange={(e) => setEmailTo(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email-subject">Subject *</Label>
                                <Input
                                    id="email-subject"
                                    placeholder={`Your ${itemType} is ready`}
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email-message">Personal Message (Optional)</Label>
                                <Textarea
                                    id="email-message"
                                    placeholder={`Add a personal message to your client...`}
                                    value={emailMessage}
                                    onChange={(e) => setEmailMessage(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {sendError ? (
                    <p className="text-sm text-destructive" role="alert">{sendError}</p>
                ) : null}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSendEmail}
                        disabled={isSending || !emailTo || !emailSubject}
                        className="bg-primary hover:bg-primary/90"
                    >
                        {isSending ? (
                            <>
                                <Send className="w-4 h-4 mr-2 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Send Email
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}