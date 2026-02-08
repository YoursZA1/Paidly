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

export const generateQuoteEmailHtml = (quote, client, company, publicViewUrl) => {
    const companyName = company?.company_name || 'Your Company';
    const userCurrency = company?.currency || 'USD';
    const formattedAmount = formatCurrency(quote.total_amount, userCurrency);
    const validUntil = format(new Date(quote.valid_until), 'MMM d, yyyy');

    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; color: white; text-align: center;">
            <h1 style="margin: 0; fontSize: 28px;">Quote from ${companyName}</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Quote #${quote.quote_number}</p>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #e1e5e9; border-top: none;">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Dear ${client.name},</p>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
                Thank you for your interest. Please find your quote for <strong>${quote.project_title}</strong> below.
            </p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e1e5e9;">
                <h3 style="margin: 0 0 15px 0; color: #333; border-bottom: 1px solid #e1e5e9; padding-bottom: 10px;">Quote Summary</h3>
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: #666;">Quote Number:</span>
                        <span style="font-weight: bold; color: #333;">${quote.quote_number}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: #666;">Project:</span>
                        <span style="font-weight: bold; color: #333;">${quote.project_title}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: #666;">Total Amount:</span>
                        <span style="font-weight: bold; color: #333; font-size: 18px;">${formattedAmount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #666;">Valid Until:</span>
                        <span style="font-weight: bold; color: #333;">${validUntil}</span>
                    </div>
                </div>
            </div>

            <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; border-left: 4px solid #4CAF50; margin: 20px 0;">
                <p style="margin: 0; color: #2e7d32; font-size: 14px;">
                    <strong>📎 Professional Quote PDF:</strong> A detailed PDF version of your quote is available for download.
                </p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
                <a href="${publicViewUrl}" 
                   style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
                    🔍 View & Download Quote
                </a>
            </div>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
                You can view this quote online anytime by clicking the button above, or download the PDF version directly from there.
            </p>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
                If you have any questions about this quote, please don't hesitate to contact us. We look forward to working with you!
            </p>
            
            <div style="border-top: 1px solid #e1e5e9; padding-top: 20px; margin-top: 30px;">
                <p style="color: #888; font-size: 14px; margin: 0;">
                    Thank you for considering our services!
                </p>
            </div>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; text-align: center; border: 1px solid #e1e5e9; border-top: none;">
            <p style="margin: 0; color: #666; font-size: 14px;">This is an automated message from ${companyName}.</p>
        </div>
    </div>
    `;
};

export default function QuoteEmailPreviewModal({ quote, client, onClose, onSend, isSending }) {
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
        }
        setIsLoading(false);
    };

    if (isLoading) {
        return (
            <Dialog open={true} onOpenChange={onClose}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const companyName = company?.company_name || 'Your Company';
    const userCurrency = company?.currency || 'USD';
    const publicViewUrl = `${window.location.origin}${createPageUrl(`PublicQuote?token=${quote.public_share_token || quote.id}`)}`;
    
    const emailHtml = generateQuoteEmailHtml(quote, client, company, publicViewUrl);

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                                    <div className="flex justify-between items-start mb-8 border-b-2 border-indigo-500 pb-4">
                                        <div>
                                            <h1 className="text-2xl font-bold text-indigo-600 mb-2">{companyName}</h1>
                                            <p className="text-gray-600">{company?.company_address}</p>
                                            <p className="text-gray-600">Date: {format(new Date(), 'MMMM d, yyyy')}</p>
                                        </div>
                                        <div className="text-right">
                                            <h2 className="text-2xl font-bold text-indigo-600">QUOTE</h2>
                                            <p className="text-gray-600">#{quote.quote_number}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-8 mb-8">
                                        <div>
                                            <h3 className="font-bold text-indigo-600 mb-2">Quote For:</h3>
                                            <p className="font-semibold">{client.name}</p>
                                            <p>{client.email}</p>
                                            {client.phone && <p>{client.phone}</p>}
                                            {client.address && <p>{client.address}</p>}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-indigo-600 mb-2">Quote Details:</h3>
                                            <p><strong>Project:</strong> {quote.project_title}</p>
                                            <p><strong>Valid Until:</strong> {format(new Date(quote.valid_until), 'MMMM d, yyyy')}</p>
                                            <p><strong>Status:</strong> {quote.status.charAt(0).toUpperCase() + quote.status.slice(1).replace('_', ' ')}</p>
                                        </div>
                                    </div>

                                    {quote.project_description && (
                                        <div className="mb-6 p-4 bg-gray-50 rounded">
                                            <h3 className="font-bold text-indigo-600 mb-2">Project Description:</h3>
                                            <p>{quote.project_description}</p>
                                        </div>
                                    )}

                                    <div className="mb-6">
                                        <table className="w-full border-collapse">
                                            <thead>
                                                <tr className="bg-indigo-600 text-white">
                                                    <th className="border p-3 text-left">Service</th>
                                                    <th className="border p-3 text-center">Qty</th>
                                                    <th className="border p-3 text-right">Unit Price</th>
                                                    <th className="border p-3 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {quote.items?.map((item, index) => (
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
                                                <span>{formatCurrency(quote.subtotal, userCurrency)}</span>
                                            </div>
                                            {quote.tax_amount > 0 && (
                                                <div className="flex justify-between py-2">
                                                    <span>Tax ({quote.tax_rate}%):</span>
                                                    <span>{formatCurrency(quote.tax_amount, userCurrency)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between py-2 border-t-2 border-indigo-600 font-bold text-lg">
                                                <span>Total Amount:</span>
                                                <span>{formatCurrency(quote.total_amount, userCurrency)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {(quote.notes || quote.terms_conditions) && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                            {quote.notes && (
                                                <div className="bg-yellow-50 p-4 rounded">
                                                    <h3 className="font-bold text-yellow-800 mb-2">Additional Notes:</h3>
                                                    <p className="whitespace-pre-wrap">{quote.notes}</p>
                                                </div>
                                            )}
                                            {quote.terms_conditions && (
                                                <div className="bg-purple-50 p-4 rounded">
                                                    <h3 className="font-bold text-purple-800 mb-2">Terms & Conditions:</h3>
                                                    <p className="whitespace-pre-wrap">{quote.terms_conditions}</p>
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
                    <Button onClick={() => onSend(emailHtml)} disabled={isSending} className="bg-indigo-600 hover:bg-indigo-700">
                        <Send className="w-4 h-4 mr-2" />
                        {isSending ? 'Sending...' : 'Send Email with Download Link'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}