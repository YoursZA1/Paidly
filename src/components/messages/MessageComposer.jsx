import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Send, Paperclip, X, FileText } from 'lucide-react';
import ReactQuill from 'react-quill';
import { useToast } from '@/components/ui/use-toast';
import { UploadToActivities } from '@/api/integrations';
import { createPageUrl } from '@/utils';
import { Invoice, Quote } from '@/api/entities';

export default function MessageComposer({ open, onClose, onSend, clients = [], invoices = [], quotes = [], preselectedClient = null, preselectedInvoice = null }) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        client_id: preselectedClient || '',
        invoice_id: preselectedInvoice || '',
        quote_id: '',
        subject: '',
        content: ''
    });
    const [attachments, setAttachments] = useState([]);
    const [isSending, setIsSending] = useState(false);
    const [attachInvoice, setAttachInvoice] = useState(false);
    const [attachQuote, setAttachQuote] = useState(false);

    const templates = [
        { label: 'Follow Up', subject: 'Following up', content: 'Hi, just wanted to follow up on my previous message. Let me know if you need anything else.' },
        { label: 'Circling back', subject: 'Circling back', content: 'Hi,\n\nCircling back in case my last note missed you. If now is not a good time, just let me know when works better.\n\nThanks.' },
        { label: 'After our call', subject: 'Following our conversation', content: 'Hi,\n\nThank you for your time earlier. As discussed, here is a quick summary of next steps on my side. If I missed anything, reply and I will adjust.\n\nBest regards' },
        { label: 'Quote follow-up', subject: 'Regarding Quote', content: 'Hi, I wanted to check if you had a chance to review the quote I sent. I\'m happy to answer any questions.' },
        { label: 'Project check-in', subject: 'Quick check-in', content: 'Hi,\n\nI wanted to check in on how things are going with the project. Let me know if you need any changes from our side or if there is anything blocking you.\n\nThank you.' },
        { label: 'Payment reminder', subject: 'Payment Reminder', content: 'Hi, this is a friendly reminder about the outstanding invoice. Please let us know if there are any issues.' },
        { label: 'Invoice follow-up', subject: 'Following up on your invoice', content: 'Hi,\n\nI am following up on the invoice we sent. If you have already paid, please let me know so we can mark it received. If anything is unclear or blocking payment, reply here and we will help.\n\nThank you.' },
        { label: 'Overdue invoice', subject: 'Overdue invoice', content: 'Hi,\n\nOur records show this invoice is now overdue. If payment is already on the way, please disregard. If there is a problem with the invoice or you need a copy resent, reply here and we will sort it out promptly.\n\nThank you.' },
        { label: 'Thank you', subject: 'Thank You', content: 'Thank you for your business! We appreciate it.' },
    ];

    const applyTemplate = (template) => {
        setFormData(prev => ({
            ...prev,
            subject: template.subject,
            content: template.content
        }));
    };

    React.useEffect(() => {
        if (open) {
            setFormData({
                client_id: preselectedClient || '',
                invoice_id: preselectedInvoice || '',
                quote_id: '',
                subject: '',
                content: ''
            });
            setAttachments([]);
            setAttachInvoice(false);
            setAttachQuote(false);
        }
    }, [open, preselectedClient, preselectedInvoice]);

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            try {
                const { file_url } = await UploadToActivities({ file });
                setAttachments(prev => [...prev, { name: file.name, url: file_url }]);
            } catch (error) {
                console.error('Error uploading file:', error);
                toast({
                    title: 'Upload failed',
                    description: error?.message || 'Could not upload file. Try again.',
                    variant: 'destructive',
                });
            }
        }
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.client_id || !formData.content) return;

        setIsSending(true);
        try {
            // Build attachments including invoice/quote links
            const allAttachments = [...attachments];
            
            if (attachInvoice && formData.invoice_id) {
                let invoice = invoices.find(inv => inv.id === formData.invoice_id);
                if (invoice) {
                    let token = invoice.public_share_token;
                    if (!token) {
                        token = crypto.randomUUID();
                        // We should ideally wait for this but to avoid UI lag we'll just fire and hope or await it if critical
                        try {
                            await Invoice.update(invoice.id, { public_share_token: token });
                        } catch (e) {
                            console.error("Failed to update invoice token", e);
                            toast({
                                title: 'Share link issue',
                                description: 'Could not generate invoice link. You can still send the message.',
                                variant: 'destructive',
                            });
                        }
                    }

                    const invoiceUrl = `${window.location.origin}${createPageUrl('PublicInvoice')}?token=${token || invoice.id}`;
                    allAttachments.push({
                        name: `Invoice #${invoice.invoice_number} (PDF Download)`,
                        url: invoiceUrl,
                        type: 'invoice'
                    });
                }
            }
            
            if (attachQuote && formData.quote_id) {
                let quote = quotes.find(q => q.id === formData.quote_id);
                if (quote) {
                    let token = quote.public_share_token;
                    if (!token) {
                        token = crypto.randomUUID();
                        try {
                            await Quote.update(quote.id, { public_share_token: token });
                        } catch (e) {
                            console.error("Failed to update quote token", e);
                            toast({
                                title: 'Share link issue',
                                description: 'Could not generate quote link. You can still send the message.',
                                variant: 'destructive',
                            });
                        }
                    }
                    const quoteUrl = `${window.location.origin}${createPageUrl('PublicQuote')}?token=${token || quote.id}`;
                    allAttachments.push({
                        name: `Quote #${quote.quote_number} (PDF Download)`,
                        url: quoteUrl,
                        type: 'quote'
                    });
                }
            }

            await onSend({
                ...formData,
                attachments: allAttachments
            });
            onClose();
        } catch (error) {
            console.error('Error sending message:', error);
            toast({
                title: 'Message failed',
                description: error?.message || 'Could not send message. Try again.',
                variant: 'destructive',
            });
        }
        setIsSending(false);
    };

    const clientInvoices = invoices.filter(inv => inv.client_id === formData.client_id);
    const clientQuotes = quotes.filter(q => q.client_id === formData.client_id);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>New Message</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>To (Client) *</Label>
                        <Select
                            value={formData.client_id}
                            onValueChange={(value) => setFormData({ ...formData, client_id: value, invoice_id: '' })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select client" />
                            </SelectTrigger>
                            <SelectContent>
                                {clients.map(client => (
                                    <SelectItem key={client.id} value={client.id}>
                                        {client.name} - {client.email}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {clientInvoices.length > 0 && (
                        <div className="space-y-2">
                            <Label>Attach Invoice</Label>
                            <div className="flex items-center gap-3">
                                <Select
                                    value={formData.invoice_id}
                                    onValueChange={(value) => setFormData({ ...formData, invoice_id: value })}
                                >
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Select invoice" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={null}>None</SelectItem>
                                        {clientInvoices.map(invoice => (
                                            <SelectItem key={invoice.id} value={invoice.id}>
                                                {invoice.invoice_number} - {invoice.project_title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {formData.invoice_id && (
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={attachInvoice}
                                            onCheckedChange={setAttachInvoice}
                                        />
                                        <span className="text-xs text-muted-foreground">Include link</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {clientQuotes.length > 0 && (
                        <div className="space-y-2">
                            <Label>Attach Quote</Label>
                            <div className="flex items-center gap-3">
                                <Select
                                    value={formData.quote_id}
                                    onValueChange={(value) => setFormData({ ...formData, quote_id: value })}
                                >
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Select quote" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={null}>None</SelectItem>
                                        {clientQuotes.map(quote => (
                                            <SelectItem key={quote.id} value={quote.id}>
                                                {quote.quote_number} - {quote.project_title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {formData.quote_id && (
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={attachQuote}
                                            onCheckedChange={setAttachQuote}
                                        />
                                        <span className="text-xs text-muted-foreground">Include link</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label>Subject</Label>
                            <Select onValueChange={(idx) => applyTemplate(templates[idx])}>
                                <SelectTrigger className="w-[220px] h-8 text-xs">
                                    <SelectValue placeholder="Use Template" />
                                </SelectTrigger>
                                <SelectContent>
                                    {templates.map((t, i) => (
                                        <SelectItem key={i} value={i}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Input
                            value={formData.subject}
                            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                            placeholder="Message subject"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Message *</Label>
                        <div className="bg-background rounded-md">
                            <ReactQuill
                                value={formData.content}
                                onChange={(content) => setFormData({ ...formData, content })}
                                theme="snow"
                                placeholder="Type your message..."
                                modules={{
                                    toolbar: [
                                        ['bold', 'italic', 'underline', 'strike'],
                                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                        ['clean']
                                    ]
                                }}
                            />
                        </div>
                    </div>

                    {/* Attachments Preview */}
                    {(attachments.length > 0 || (attachInvoice && formData.invoice_id) || (attachQuote && formData.quote_id)) && (
                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Attachments</Label>
                            <div className="flex flex-wrap gap-2">
                                {attachInvoice && formData.invoice_id && (
                                    <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5 text-sm text-primary">
                                        <FileText className="w-3 h-3" />
                                        <span>Invoice #{invoices.find(i => i.id === formData.invoice_id)?.invoice_number}</span>
                                    </div>
                                )}
                                {attachQuote && formData.quote_id && (
                                    <div className="flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground">
                                        <FileText className="w-3 h-3" />
                                        <span>Quote #{quotes.find(q => q.id === formData.quote_id)?.quote_number}</span>
                                    </div>
                                )}
                                {attachments.map((file, index) => (
                                    <div key={index} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm">
                                        <Paperclip className="w-3 h-3" />
                                        <span className="truncate max-w-32">{file.name}</span>
                                        <button type="button" onClick={() => removeAttachment(index)}>
                                            <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <DialogFooter className="flex justify-between">
                        <div>
                            <label htmlFor="file-upload" className="cursor-pointer">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                                    <Paperclip className="w-4 h-4" />
                                    Attach files
                                </div>
                                <input
                                    id="file-upload"
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                            </label>
                        </div>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={isSending || !formData.client_id || !formData.content} className="bg-primary hover:bg-primary/90">
                                <Send className="w-4 h-4 mr-2" />
                                {isSending ? 'Sending...' : 'Send'}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}