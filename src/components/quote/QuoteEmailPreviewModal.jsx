import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Mail, FileText, X, Send } from 'lucide-react';
import { User } from '@/api/entities';
import { formatCurrency } from '../CurrencySelector';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { formatLineItemNameAndDescription } from '@/utils/invoiceTemplateData';
import { buildBrandedEmailDocumentHtml } from '@/utils/brandedEmailTemplates';
import { parseDocumentBrandHex } from '@/utils/documentBrandColors';
import { getEmailOpenTrackingPixelUrl, getTrackedLinkUrl } from '@/services/InvoiceSendService';
import { escapeHtml, sanitizeHttpUrl } from '@/utils/htmlSecurity';

export const generateQuoteEmailHtml = (quote, client, company, ctaHref, pixelUrl = '') => {
    const companyName = company?.company_name || 'Your Company';
    const userCurrency = company?.currency || 'USD';
    const formattedAmount = formatCurrency(quote.total_amount, userCurrency);
    const validUntil = format(new Date(quote.valid_until), 'MMM d, yyyy');
    const primary = parseDocumentBrandHex(quote?.document_brand_primary) || parseDocumentBrandHex(company?.document_brand_primary) || '#f24e00';
    const secondary = parseDocumentBrandHex(quote?.document_brand_secondary) || parseDocumentBrandHex(company?.document_brand_secondary) || '#ff7c00';

    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const safeCta = sanitizeHttpUrl(ctaHref, base) || '#';
    const innerHtml = `
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Dear ${escapeHtml(client.name || 'there')},</p>
      <p style="margin:0 0 20px;color:#52525b;line-height:1.6;">
        Thank you for your interest. Your quote for <strong>${escapeHtml(quote.project_title || '')}</strong> is ready — PDF attached.
      </p>
      <table role="presentation" width="100%" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;margin:0 0 20px;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Quote summary</p>
          <table role="presentation" width="100%" style="font-size:14px;color:#18181b;">
            <tr><td style="padding:4px 0;color:#71717a;">Quote #</td><td align="right" style="font-weight:600;">${escapeHtml(quote.quote_number || '')}</td></tr>
            <tr><td style="padding:4px 0;color:#71717a;">Total</td><td align="right" style="font-weight:700;font-size:18px;color:${primary};">${escapeHtml(formattedAmount)}</td></tr>
            <tr><td style="padding:4px 0;color:#71717a;">Valid until</td><td align="right" style="font-weight:600;">${escapeHtml(validUntil)}</td></tr>
          </table>
        </td></tr>
      </table>
      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(safeCta)}" style="display:inline-block;background:linear-gradient(135deg, ${primary} 0%, ${secondary} 100%);color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(242,78,0,0.25);">
          View quote online
        </a>
      </div>
      <p style="margin:0;color:#71717a;font-size:13px;line-height:1.55;">
        We look forward to working with you.
      </p>
    `;

    return buildBrandedEmailDocumentHtml({
        preheader: `Quote ${quote.quote_number} — ${formattedAmount} · valid ${validUntil}`,
        title: 'Quote',
        subtitle: `Quote #${quote.quote_number}`,
        innerHtml,
        companyName,
        footerNote: 'This is an automated message from your supplier.',
        primaryHex: primary,
        secondaryHex: secondary,
        pixelUrl,
    });
};

export default function QuoteEmailPreviewModal({ quote, client, onClose, onSend, isSending, getTrackableLink }) {
    const [company, setCompany] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const companyData = await User.me();
            setCompany(companyData);
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <Dialog open={true} onOpenChange={onClose}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
                    <DialogTitle className="sr-only">Loading quote email preview</DialogTitle>
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const companyName = company?.company_name || 'Your Company';
    const userCurrency = company?.currency || 'USD';
    const publicViewUrl = `${window.location.origin}${createPageUrl(`PublicQuote?token=${quote.public_share_token || quote.id}`)}`;
    
    const emailHtml = generateQuoteEmailHtml(quote, client, company, publicViewUrl);

    const handleSendClick = async () => {
        const result = getTrackableLink ? await getTrackableLink().catch(() => ({ url: publicViewUrl })) : { url: publicViewUrl };
        const viewUrl = (result && typeof result === 'object' && result.url != null) ? result.url : result;
        const pixelUrl = result?.trackingToken ? getEmailOpenTrackingPixelUrl(result.trackingToken) : '';
        const ctaHref =
            result?.trackingToken && viewUrl
                ? getTrackedLinkUrl(result.trackingToken, viewUrl)
                : viewUrl;
        const html = generateQuoteEmailHtml(quote, client, company, ctaHref, pixelUrl);
        onSend(html);
    };

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5" />
                        Quote Email & PDF Preview
                    </DialogTitle>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Badge variant="outline">To: {client.email}</Badge>
                        <Badge variant="outline">Subject: Quote {quote.quote_number} from {companyName}</Badge>
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
                                    {/* PDF Content Preview for Quote */}
                                    <div className="flex justify-between items-start mb-8 border-b-2 border-primary pb-4">
                                        <div>
                                            <h1 className="text-2xl font-bold text-primary mb-2">{companyName}</h1>
                                            <p className="text-gray-600">{company?.company_address}</p>
                                            <p className="text-gray-600">Date: {format(new Date(), 'MMMM d, yyyy')}</p>
                                        </div>
                                        <div className="text-right">
                                            <h2 className="text-2xl font-bold text-primary">QUOTE</h2>
                                            <p className="text-gray-600">#{quote.quote_number}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-8 mb-8">
                                        <div>
                                            <h3 className="font-bold text-primary mb-2">Quote For:</h3>
                                            <p className="font-semibold">{client.name}</p>
                                            <p>{client.email}</p>
                                            {client.phone && <p>{client.phone}</p>}
                                            {client.address && <p>{client.address}</p>}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-primary mb-2">Quote Details:</h3>
                                            <p><strong>Project:</strong> {quote.project_title}</p>
                                            <p><strong>Valid Until:</strong> {format(new Date(quote.valid_until), 'MMMM d, yyyy')}</p>
                                            <p><strong>Status:</strong> {quote.status.charAt(0).toUpperCase() + quote.status.slice(1).replace('_', ' ')}</p>
                                        </div>
                                    </div>

                                    {quote.project_description && (
                                        <div className="mb-6 p-4 bg-gray-50 rounded">
                                            <h3 className="font-bold text-primary mb-2">Project Description:</h3>
                                            <p>{quote.project_description}</p>
                                        </div>
                                    )}

                                    <div className="mb-6">
                                        <table className="w-full border-collapse">
                                            <thead>
                                                <tr className="bg-primary text-primary-foreground">
                                                    <th className="border p-3 text-left">Service</th>
                                                    <th className="border p-3 text-center">Qty</th>
                                                    <th className="border p-3 text-right">Unit Price</th>
                                                    <th className="border p-3 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {quote.items?.map((item, index) => (
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
                                                <span>{formatCurrency(quote.subtotal, userCurrency)}</span>
                                            </div>
                                            {quote.tax_amount > 0 && (
                                                <div className="flex justify-between py-2">
                                                    <span>Tax ({quote.tax_rate}%):</span>
                                                    <span>{formatCurrency(quote.tax_amount, userCurrency)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between py-2 border-t-2 border-primary font-bold text-lg">
                                                <span>Total Amount:</span>
                                                <span>{formatCurrency(quote.total_amount, userCurrency)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {(quote.notes || quote.terms_conditions) && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                            {quote.notes && (
                                                <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
                                                    <h3 className="mb-2 font-bold text-primary">Additional Notes:</h3>
                                                    <p className="whitespace-pre-wrap text-foreground">{quote.notes}</p>
                                                </div>
                                            )}
                                            {quote.terms_conditions && (
                                                <div className="rounded-lg border border-border bg-muted/60 p-4">
                                                    <h3 className="mb-2 font-bold text-foreground">Terms & Conditions:</h3>
                                                    <p className="whitespace-pre-wrap text-muted-foreground">{quote.terms_conditions}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="text-center text-gray-600 text-sm border-t pt-4">
                                        <p>Thank you for considering our services!</p>
                                        <p>This quote was generated on {format(new Date(), 'MMMM d, yyyy')} by {companyName}</p>
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
                    <Button onClick={handleSendClick} disabled={isSending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        <Send className="w-4 h-4 mr-2" />
                        {isSending ? 'Sending...' : 'Send Email with PDF Attachment'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}