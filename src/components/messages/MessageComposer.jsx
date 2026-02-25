import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
    const [selectedTemplate, setSelectedTemplate] = useState('');

    const templates = [
        { label: 'Follow Up', subject: 'Following up', content: 'Hi, just wanted to follow up on my previous message. Let me know if you need anything else.' },
        { label: 'Payment Reminder', subject: 'Payment Reminder', content: 'Hi, this is a friendly reminder about the outstanding invoice. Please let us know if there are any issues.' },
        { label: 'Quote Follow Up', subject: 'Regarding Quote', content: 'Hi, I wanted to check if you had a chance to review the quote I sent. I\'m happy to answer any questions.' },
        { label: 'Thank You', subject: 'Thank You', content: 'Thank you for your business! We appreciate it.' }
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

    const selectedClient = clients.find(c => c.id === formData.client_id);
    const clientInvoices = invoices.filter(inv => inv.client_id === formData.client_id);
    const clientQuotes = quotes.filter(q => q.client_id === formData.client_id);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
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
                                        <span className="text-xs text-slate-500">Include link</span>
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
                                        <span className="text-xs text-slate-500">Include link</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label>Subject</Label>
                            <Select onValueChange={(idx) => applyTemplate(templates[idx])}>
                                <SelectTrigger className="w-[180px] h-8 text-xs">
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
                        <div className="bg-white rounded-md">
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
                            <Label className="text-xs text-slate-500">Attachments</Label>
                            <div className="flex flex-wrap gap-2">
                                {attachInvoice && formData.invoice_id && (
                                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-sm text-blue-700">
                                        <FileText className="w-3 h-3" />
                                        <span>Invoice #{invoices.find(i => i.id === formData.invoice_id)?.invoice_number}</span>
                                    </div>
                                )}
                                {attachQuote && formData.quote_id && (
                                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm text-amber-700">
                                        <FileText className="w-3 h-3" />
                                        <span>Quote #{quotes.find(q => q.id === formData.quote_id)?.quote_number}</span>
                                    </div>
                                )}
                                {attachments.map((file, index) => (
                                    <div key={index} className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 text-sm">
                                        <Paperclip className="w-3 h-3" />
                                        <span className="truncate max-w-32">{file.name}</span>
                                        <button type="button" onClick={() => removeAttachment(index)}>
                                            <X className="w-3 h-3 text-slate-500 hover:text-red-500" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <DialogFooter className="flex justify-between">
                        <div>
                            <label htmlFor="file-upload" className="cursor-pointer">
                                <div className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
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
                            <Button type="submit" disabled={isSending || !formData.client_id || !formData.content} className="bg-blue-600 hover:bg-blue-700">
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