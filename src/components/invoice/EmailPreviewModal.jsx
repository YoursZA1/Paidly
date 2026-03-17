import React, { useState, useEffect } from 'react';
import Button from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Mail, FileText, X, Send } from 'lucide-react';
import { User, BankingDetail } from '@/api/entities';
import { formatCurrency } from '@/utils/currencyCalculations';
import { format } from 'date-fns';
import { getEmailOpenTrackingPixelUrl } from '@/services/InvoiceSendService';

/** Optional pixelUrl: when set, embeds a 1x1 tracking pixel to log email opens (GET /api/email-track/:token). */
export const generateInvoiceEmailHtml = (invoice, client, company, bankingDetail, publicViewUrl, pixelUrl = '') => {
    const companyName = company?.company_name || 'Your Company';
    const userCurrency = company?.currency || 'USD';
    const formattedAmount = formatCurrency(invoice.total_amount, userCurrency);
    const dueDate = format(new Date(invoice.delivery_date), 'MMM d, yyyy');

    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background: linear-gradient(135deg, #f24e00 0%, #ff7c00 100%); padding: 30px; border-radius: 10px 10px 0 0; color: white; text-align: center;">
            <h1 style="margin: 0; fontSize: 28px;">Invoice from ${companyName}</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Invoice #${invoice.invoice_number}</p>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #e1e5e9; border-top: none;">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Dear ${client.name},</p>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
                Thank you for your business. Please find attached your invoice for <strong>${invoice.project_title}</strong>.
            </p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e1e5e9;">
                <h3 style="margin: 0 0 15px 0; color: #333; border-bottom: 1px solid #e1e5e9; padding-bottom: 10px;">Invoice Summary</h3>
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: #666;">Invoice Number:</span>
                        <span style="font-weight: bold; color: #333;">${invoice.invoice_number}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: #666;">Project:</span>
                        <span style="font-weight: bold; color: #333;">${invoice.project_title}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: #666;">Amount Due:</span>
                        <span style="font-weight: bold; color: #333; font-size: 18px;">${formattedAmount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #666;">Due Date:</span>
                        <span style="font-weight: bold; color: #333;">${dueDate}</span>
                    </div>
                </div>
            </div>

            <div style="background: #fff7ed; padding: 15px; border-radius: 8px; border-left: 4px solid #f24e00; margin: 20px 0;">
                <p style="margin: 0; color: #9a3412; font-size: 14px;">
                    <strong>📎 Clean PDF Invoice:</strong> A professional PDF version of your invoice is available for download.
                </p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
                <a href="${publicViewUrl}" 
                   style="display: inline-block; background: linear-gradient(135deg, #f24e00 0%, #ff7c00 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(242, 78, 0, 0.3);">
                    🔍 View & Download Invoice
                </a>
            </div>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
                You can view this invoice online anytime by clicking the button above, or download the PDF version directly from there.
            </p>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
                If you have any questions about this invoice, please don't hesitate to contact us.
            </p>
            
            <div style="border-top: 1px solid #e1e5e9; padding-top: 20px; margin-top: 30px;">
                <p style="color: #888; font-size: 14px; margin: 0;">
                    Thank you for your partnership!
                </p>
            </div>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; text-align: center; border: 1px solid #e1e5e9; border-top: none;">
            <p style="margin: 0; color: #666; font-size: 14px;">This is an automated message from ${companyName}.</p>
        </div>
        ${pixelUrl ? `<img src="${String(pixelUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" width="1" height="1" alt="" />` : ''}
    </div>
    `;
};

export default function EmailPreviewModal({ invoice, client, onClose, onSend, isSending, getTrackableLink }) {
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
            const [companyData, allBankingDetails] = await Promise.all([
                User.me(),
                BankingDetail.list()
            ]);
            setCompany(companyData);
            const matchingDetail = allBankingDetails.find(b => b.id === invoice.banking_detail_id);
            setBankingDetail(matchingDetail);
        } catch (error) {
            console.error("Error loading data:", error);
            setError("Failed to load email preview data. Some details may be missing.");
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <Dialog open={true} onOpenChange={onClose}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
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
    const emailHtml = generateInvoiceEmailHtml(invoice, client, company, bankingDetail, publicViewUrl);
    const handleSend = async () => {
        const result = getTrackableLink ? await getTrackableLink().catch(() => ({ url: publicViewUrl })) : { url: publicViewUrl };
        const viewUrl = (result && typeof result === 'object' && result.url != null) ? result.url : result;
        const pixelUrl = result?.trackingToken ? getEmailOpenTrackingPixelUrl(result.trackingToken) : '';
        const html = generateInvoiceEmailHtml(invoice, client, company, bankingDetail, viewUrl, pixelUrl);
        onSend(html);
    };

    if (error) {
        return (
            <Dialog open={true} onOpenChange={onClose}>
                <DialogContent className="max-w-2xl" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>Email Preview</DialogTitle>
                    </DialogHeader>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
                        <p className="font-medium">⚠️ {error}</p>
                        <p className="text-sm mt-2">You can still send the email, but some company or banking details may not be included.</p>
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
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
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
                                                        <td className="border p-3">
                                                            <strong>{item.service_name}</strong>
                                                            {item.description && <br />}
                                                            <span className="text-sm text-gray-600">{item.description}</span>
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
                                        <div className="bg-yellow-50 p-4 rounded mb-6">
                                            <h3 className="font-bold text-yellow-800 mb-2">Additional Notes:</h3>
                                            <p>{invoice.notes}</p>
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