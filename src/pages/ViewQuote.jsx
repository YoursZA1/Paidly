import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Quote, Client, User } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Download, Printer, Mail, ArrowLeft, Edit, ArrowRightSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { formatCurrency } from '@/components/CurrencySelector';
import QuoteActions from '@/components/quote/QuoteActions';
import QuoteStatusTracker from '@/components/quote/QuoteStatusTracker';
import LogoImage from '@/components/shared/LogoImage';

export default function ViewQuote() {
    const [quote, setQuote] = useState(null);
    const [client, setClient] = useState(null);
    const [company, setCompany] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const quoteId = params.get('id');
        
        if (quoteId) {
            loadQuoteData(quoteId);
        } else {
            setError("Quote ID not found");
            setIsLoading(false);
        }
    }, [location]);

    const loadQuoteData = async (quoteId) => {
        setIsLoading(true);
        try {
            const quoteData = await Quote.get(quoteId);
            if (!quoteData) throw new Error("Quote not found");

            const [clientData, companyData] = await Promise.all([
                Client.get(quoteData.client_id),
                User.me(),
            ]);

            setQuote(quoteData);
            setClient(clientData);
            setCompany(companyData);
        } catch (err) {
            console.error("Error loading quote:", err);
            setError(err.message || "Failed to load quote");
        }
        setIsLoading(false);
    };

    const handleDownloadPDF = () => {
        window.location.href = createPageUrl(`QuotePDF?id=${quote.id}`);
    };

    const handlePrint = () => {
        const pdfUrl = createPageUrl(`QuotePDF?id=${quote.id}`);
        const printWindow = window.open(pdfUrl, '_blank');
        printWindow.onload = () => {
            printWindow.print();
        };
    };

    if (isLoading) {
        return (
            <div className="p-8">
                <Skeleton className="h-12 w-1/4 mb-4" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    if (error) {
        return <div className="p-8 text-red-500">Error: {error}</div>;
    }

    const userCurrency = company?.currency || 'USD';
    const items = Array.isArray(quote?.items) ? quote.items : [];
    const isSentOrAccepted = quote?.status === 'sent' || quote?.status === 'accepted';

    return (
        <div className="min-h-screen bg-background">
            <div className="p-4 sm:p-8 max-w-5xl mx-auto">
                {/* Prominent Convert to Invoice CTA for sent/accepted quotes */}
                {isSentOrAccepted && (
                    <div className="mb-6 p-6 rounded-2xl bg-primary/10 border-2 border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-1">Quote {quote.status === 'accepted' ? 'Accepted' : 'Sent'}</p>
                            <p className="text-muted-foreground text-sm">Ready to get paid? Convert this quote to an invoice in one click.</p>
                        </div>
                        <Button
                            size="lg"
                            className="w-full sm:w-auto min-w-[220px] h-14 text-lg font-bold bg-primary hover:bg-primary/90 shadow-lg"
                            onClick={() => navigate(createPageUrl(`CreateInvoice?quoteId=${quote.id}`))}
                        >
                            <ArrowRightSquare className="w-6 h-6 mr-2" />
                            Convert to Invoice
                        </Button>
                    </div>
                )}
                <Breadcrumb className="mb-4">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild><Link to={createPageUrl('Quotes')}>Quotes</Link></BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>#{quote.quote_number}</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => navigate(createPageUrl('Quotes'))}>
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Quote #{quote.quote_number}</h1>
                            <p className="text-slate-500">Preview and manage your quote.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Button 
                            className="bg-primary hover:bg-primary/90 text-white"
                            onClick={() => navigate(createPageUrl(`CreateInvoice?quoteId=${quote.id}`))}
                        >
                            <ArrowRightSquare className="w-4 h-4 mr-2" /> Convert to Invoice
                        </Button>
                        <Button variant="outline" onClick={() => navigate(createPageUrl(`EditQuote?id=${quote.id}`))}>
                            <Edit className="w-4 h-4 mr-2" /> Edit
                        </Button>
                        <QuoteActions quote={quote} client={client} onActionSuccess={() => loadQuoteData(quote.id)} />
                    </div>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Invoice Preview */}
                    <div className="lg:col-span-2">
                         <Card className="shadow-lg">
                            <CardContent className="p-8">
                                {/* Company Header with Logo */}
                                <div className="flex flex-col sm:flex-row justify-between items-start mb-8 pb-6 border-b-2 border-primary">
                                    <div className="flex items-start gap-6 mb-4 sm:mb-0">
                                        {company?.logo_url && (
                                            <LogoImage 
                                                src={company.logo_url} 
                                                alt={company?.company_name || 'Company'} 
                                                className="w-24 h-24 object-contain rounded-xl shadow-lg"
                                            />
                                        )}
                                        <div>
                                            <h1 className={`font-semibold text-gray-600 ${company?.logo_url ? 'text-lg' : 'text-2xl sm:text-3xl text-primary'}`}>
                                                {company?.company_name}
                                            </h1>
                                            <p className="text-slate-600 mt-1 whitespace-pre-line text-sm">{company?.company_address}</p>
                                            <p className="text-slate-500 text-sm">Date: {format(new Date(), 'MMMM d, yyyy')}</p>
                                        </div>
                                    </div>
                                    <div className="text-left sm:text-right">
                                        <h2 className="text-2xl sm:text-3xl font-bold text-primary">QUOTE</h2>
                                        <p className="text-slate-600 text-lg">#{quote.quote_number}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-8 mb-8">
                                    <div>
                                        <h3 className="font-semibold text-slate-600 mb-2">Billed To</h3>
                                        <p className="font-bold text-slate-800">{client?.name}</p>
                                        <p className="text-slate-600">{client?.address}</p>
                                        <p className="text-slate-600">{client?.email}</p>
                                    </div>
                                    <div className="text-right">
                                         <h3 className="font-semibold text-slate-600 mb-2">Quote Details</h3>
                                         <p><span className="font-semibold">Date:</span> {format(new Date(quote.created_date), 'MMM d, yyyy')}</p>
                                         <p><span className="font-semibold">Valid Until:</span> {format(new Date(quote.valid_until), 'MMM d, yyyy')}</p>
                                    </div>
                                </div>
                                <table className="w-full mb-8">
                                    <thead className="bg-slate-100">
                                        <tr>
                                            <th className="p-3 text-left font-semibold text-slate-600">Service</th>
                                            <th className="p-3 text-center font-semibold text-slate-600">Qty</th>
                                            <th className="p-3 text-right font-semibold text-slate-600">Price</th>
                                            <th className="p-3 text-right font-semibold text-slate-600">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, index) => (
                                            <tr key={index} className="border-b">
                                                <td className="p-3">
                                                    <p className="font-bold">{item.service_name}</p>
                                                    <p className="text-slate-500 text-sm">{item.description}</p>
                                                </td>
                                                <td className="p-3 text-center">{item.quantity}</td>
                                                <td className="p-3 text-right">{formatCurrency(item.unit_price, userCurrency)}</td>
                                                <td className="p-3 text-right font-bold">{formatCurrency(item.total_price, userCurrency)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="flex justify-end">
                                    <div className="w-full max-w-sm">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-slate-600">Subtotal:</span>
                                            <span>{formatCurrency(quote.subtotal, userCurrency)}</span>
                                        </div>
                                        <div className="flex justify-between mb-2">
                                            <span className="text-slate-600">Tax ({quote.tax_rate}%):</span>
                                            <span>{formatCurrency(quote.tax_amount, userCurrency)}</span>
                                        </div>
                                        <div className="border-t-2 my-2"></div>
                                        <div className="flex justify-between font-bold text-xl">
                                            <span>Total:</span>
                                            <span>{formatCurrency(quote.total_amount, userCurrency)}</span>
                                        </div>
                                    </div>
                                </div>
                                {quote.notes && (
                                    <div className="mt-8 border-t pt-4">
                                        <h3 className="font-semibold mb-2">Notes</h3>
                                        <p className="text-slate-600">{quote.notes}</p>
                                    </div>
                                )}
                                {quote.terms_conditions && (
                                     <div className="mt-8 border-t pt-4">
                                        <h3 className="font-semibold mb-2">Terms & Conditions</h3>
                                        <p className="text-slate-600 text-sm">{quote.terms_conditions}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                     {/* Sidebar: Status timeline + Actions */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <h3 className="font-bold text-lg">Status</h3>
                            </CardHeader>
                            <CardContent>
                                <QuoteStatusTracker status={quote.status} />
                            </CardContent>
                        </Card>
                        <Card className="shadow-lg">
                            <CardHeader>
                                <h3 className="font-bold text-lg">Actions</h3>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button onClick={handleDownloadPDF} variant="outline" className="w-full justify-start">
                                    <Download className="w-4 h-4 mr-2" /> Download PDF
                                </Button>
                                <Button onClick={handlePrint} variant="outline" className="w-full justify-start">
                                    <Printer className="w-4 h-4 mr-2" /> Print Quote
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}