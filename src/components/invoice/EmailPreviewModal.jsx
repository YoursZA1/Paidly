import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Mail, FileText, X, Send } from 'lucide-react';
import { BankingDetail } from '@/api/entities';
import { formatCurrency } from '@/utils/currencyCalculations';
import { formatLineItemNameAndDescription } from '@/utils/invoiceTemplateData';
import { format } from 'date-fns';
import { getEmailOpenTrackingPixelUrl, getTrackedLinkUrl } from '@/services/InvoiceSendService';
import { buildBrandedEmailDocumentHtml } from '@/utils/brandedEmailTemplates';
import { parseDocumentBrandHex } from '@/utils/documentBrandColors';
import { escapeHtml, sanitizeHttpUrl } from '@/utils/htmlSecurity';
import { useAuth } from '@/contexts/AuthContext';

/** ctaHref: use tracked URL from getTrackedLinkUrl when sending; pixelUrl for opens. */
export const generateInvoiceEmailHtml = (invoice, client, company, ctaHref, pixelUrl = '') => {
    const companyName = company?.company_name || 'Your Company';
    const userCurrency = company?.currency || 'USD';
    const formattedAmount = formatCurrency(invoice.total_amount, userCurrency);
    const dueDate = format(new Date(invoice.delivery_date), 'MMM d, yyyy');
    const primary = parseDocumentBrandHex(invoice?.document_brand_primary) || parseDocumentBrandHex(company?.document_brand_primary) || '#f24e00';
    const secondary = parseDocumentBrandHex(invoice?.document_brand_secondary) || parseDocumentBrandHex(company?.document_brand_secondary) || '#ff7c00';

    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const safeCta = sanitizeHttpUrl(ctaHref, base) || '#';
    const innerHtml = `
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Dear ${escapeHtml(client.name || 'there')},</p>
      <p style="margin:0 0 20px;color:#52525b;line-height:1.6;">
        Thank you for your business. Your invoice for <strong>${escapeHtml(invoice.project_title || '')}</strong> is ready — PDF attached.
      </p>
      <table role="presentation" width="100%" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;margin:0 0 20px;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Summary</p>
          <table role="presentation" width="100%" style="font-size:14px;color:#18181b;">
            <tr><td style="padding:4px 0;color:#71717a;">Invoice #</td><td align="right" style="font-weight:600;">${escapeHtml(invoice.invoice_number || '')}</td></tr>
            <tr><td style="padding:4px 0;color:#71717a;">Amount due</td><td align="right" style="font-weight:700;font-size:18px;color:${primary};">${escapeHtml(formattedAmount)}</td></tr>
            <tr><td style="padding:4px 0;color:#71717a;">Due</td><td align="right" style="font-weight:600;">${escapeHtml(dueDate)}</td></tr>
          </table>
        </td></tr>
      </table>
      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(safeCta)}" style="display:inline-block;background:linear-gradient(135deg, ${primary} 0%, ${secondary} 100%);color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(242,78,0,0.25);">
          View invoice online
        </a>
      </div>
      <p style="margin:0;color:#71717a;font-size:13px;line-height:1.55;">
        Questions? Reply to this email or contact ${escapeHtml(companyName)}.
      </p>
    `;

    return buildBrandedEmailDocumentHtml({
        preheader: `Invoice ${invoice.invoice_number} — ${formattedAmount} due ${dueDate}`,
        title: 'Invoice',
        subtitle: `Invoice #${invoice.invoice_number}`,
        innerHtml,
        companyName,
        footerNote: 'This is an automated message from your supplier.',
        primaryHex: primary,
        secondaryHex: secondary,
        pixelUrl,
    });
};

export default function EmailPreviewModal({ invoice, client, onClose, onSend, isSending, getTrackableLink }) {
    const { profile } = useAuth();
    const [company, setCompany] = useState(null);
    const [bankingDetail, setBankingDetail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setError(null);
            const allBankingDetails = await BankingDetail.list();
            setCompany(profile || null);
            const matchingDetail = allBankingDetails.find(b => b.id === invoice.banking_detail_id);
            setBankingDetail(matchingDetail);
        } catch (error) {
            console.error("Error loading data:", error);
            setError("Failed to load email preview data. Some details may be missing.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setCompany(profile || null);
    }, [profile]);

    if (isLoading) {
        return (
            <Dialog open={true} onOpenChange={onClose}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogTitle className="sr-only">Loading email preview</DialogTitle>
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const publicViewUrl = invoice?.public_share_token
        ? `${window.location.origin}/view/${invoice.public_share_token}`
        : '';
    const emailHtml = generateInvoiceEmailHtml(invoice, client, company, publicViewUrl);
    const handleSend = async () => {
        const result = getTrackableLink ? await getTrackableLink().catch(() => ({ url: publicViewUrl })) : { url: publicViewUrl };
        const viewUrl = (result && typeof result === 'object' && result.url != null) ? result.url : result;
        const pixelUrl = result?.trackingToken ? getEmailOpenTrackingPixelUrl(result.trackingToken) : '';
        const ctaHref =
            result?.trackingToken && viewUrl
                ? getTrackedLinkUrl(result.trackingToken, viewUrl)
                : viewUrl;
        const html = generateInvoiceEmailHtml(invoice, client, company, ctaHref, pixelUrl);
        onSend(html);
    };

    if (error) {
        return (
            <Dialog open={true} onOpenChange={onClose}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Email Preview</DialogTitle>
                    </DialogHeader>
                    <div className="rounded-lg border border-border bg-muted/80 p-4 text-foreground">
                        <p className="font-medium text-status-pending">⚠️ {error}</p>
                        <p className="text-sm mt-2 text-muted-foreground">You can still send the email, but some company or banking details may not be included.</p>
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={handleSend} disabled={isSending} className="bg-primary hover:bg-primary/90">
                            <Send className="w-4 h-4 mr-2" />
                            {isSending ? 'Sending...' : 'Send Anyway'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const companyName = company?.company_name || 'Your Company';
    const userCurrency = company?.currency || 'USD';

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5" />
                        Email & PDF Preview
                    </DialogTitle>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Badge variant="outline">To: {client.email}</Badge>
                        <Badge variant="outline">Subject: Invoice {invoice.invoice_number} from {companyName}</Badge>
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                            🔗 Download Link Included
                        </Badge>
                    </div>
                </DialogHeader>

                <Tabs defaultValue="email" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="email">
                            <Mail className="w-4 h-4 mr-2" />
                            Email Preview
                        </TabsTrigger>
                        <TabsTrigger value="pdf">
                            <FileText className="w-4 h-4 mr-2" />
                            PDF Preview
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="email" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Email Content</CardTitle>
                                <p className="text-sm text-gray-600">
                                    Includes secure link to view and download PDF
                                </p>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto">
                                    <div dangerouslySetInnerHTML={{ __html: emailHtml }} />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="pdf" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">PDF Preview</CardTitle>
                                <p className="text-sm text-gray-600">This is what your client will see in the PDF attachment</p>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-lg p-6 bg-white max-h-96 overflow-y-auto" style={{ fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif' }}>
                                    {/* PDF Content Preview */}
                                    <div className="flex justify-between items-start mb-8 border-b-2 border-primary pb-4">
                                        <div>
                                            <h1 className="text-2xl font-bold text-primary mb-2">{companyName}</h1>
                                            <p className="text-gray-600">{company?.company_address}</p>
                                            <p className="text-gray-600">Date: {format(new Date(), 'MMMM d, yyyy')}</p>
                                        </div>
                                        <div className="text-right">
                                            <h2 className="text-2xl font-bold text-primary">INVOICE</h2>
                                            <p className="text-gray-600">#{invoice.invoice_number}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-8 mb-8">
                                        <div>
                                            <h3 className="font-bold text-primary mb-2">Bill To:</h3>
                                            <p className="font-semibold">{client.name}</p>
                                            <p>{client.email}</p>
                                            {client.phone && <p>{client.phone}</p>}
                                            {client.address && <p>{client.address}</p>}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-primary mb-2">Invoice Details:</h3>
                                            <p><strong>Project:</strong> {invoice.project_title}</p>
                                            <p><strong>Due Date:</strong> {format(new Date(invoice.delivery_date), 'MMMM d, yyyy')}</p>
                                            <p><strong>Status:</strong> {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1).replace('_', ' ')}</p>
                                        </div>
                                    </div>

                                    {invoice.project_description && (
                                        <div className="mb-6 p-4 bg-gray-50 rounded">
                                            <h3 className="font-bold text-primary mb-2">Project Description:</h3>
                                            <p>{invoice.project_description}</p>
                                        </div>
                                    )}

                                    <div className="mb-6">
                                        <table className="w-full border-collapse">
                                            <thead>
                                                <tr className="bg-primary text-white">
                                                    <th className="border p-3 text-left">Service</th>
                                                    <th className="border p-3 text-center">Qty</th>
                                                    <th className="border p-3 text-right">Unit Price</th>
                                                    <th className="border p-3 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {invoice.items?.map((item, index) => (
                                                    <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                                        <td className="border p-3 text-sm text-gray-800">
                                                            {formatLineItemNameAndDescription(item)}
                                                        </td>
                                                        <td className="border p-3 text-center">{item.quantity}</td>
                                                        <td className="border p-3 text-right">{formatCurrency(item.unit_price, userCurrency)}</td>
                                                        <td className="border p-3 text-right font-semibold">{formatCurrency(item.total_price, userCurrency)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="flex justify-end mb-6">
                                        <div className="w-64">
                                            <div className="flex justify-between py-2">
                                                <span>Subtotal:</span>
                                                <span>{formatCurrency(invoice.subtotal, userCurrency)}</span>
                                            </div>
                                            {invoice.tax_amount > 0 && (
                                                <div className="flex justify-between py-2">
                                                    <span>Tax ({invoice.tax_rate}%):</span>
                                                    <span>{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between py-2 border-t-2 border-primary font-bold text-lg">
                                                <span>Total Amount:</span>
                                                <span>{formatCurrency(invoice.total_amount, userCurrency)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {bankingDetail && (
                                        <div className="bg-primary/10 p-4 rounded mb-6">
                                            <h3 className="font-bold text-primary mb-2">Payment Information</h3>
                                            <p><strong>Bank:</strong> {bankingDetail.bank_name}</p>
                                            <p><strong>Account Name:</strong> {bankingDetail.account_name}</p>
                                            {bankingDetail.account_number && <p><strong>Account Number:</strong> {bankingDetail.account_number}</p>}
                                            <p><strong>Payment Method:</strong> {bankingDetail.payment_method.replace('_', ' ').toUpperCase()}</p>
                                        </div>
                                    )}

                                    {invoice.notes && (
                                        <div className="mb-6 rounded-lg border border-primary/15 bg-primary/5 p-4">
                                            <h3 className="mb-2 font-bold text-primary">Additional Notes:</h3>
                                            <p className="text-foreground">{invoice.notes}</p>
                                        </div>
                                    )}

                                    <div className="text-center text-gray-600 text-sm border-t pt-4">
                                        <p>Thank you for your business!</p>
                                        <p>This invoice was generated on {format(new Date(), 'MMMM d, yyyy')} by {companyName}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                <div className="flex justify-end gap-3 mt-6">
                    <Button variant="outline" onClick={onClose}>
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                    </Button>
                        <Button onClick={handleSend} disabled={isSending} className="bg-primary hover:bg-primary/90">
                            <Send className="w-4 h-4 mr-2" />
                            {isSending ? 'Sending...' : 'Send Email with Download Link'}
                        </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}