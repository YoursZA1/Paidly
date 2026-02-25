import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Invoice, Client, User, BankingDetail, Payment } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Download, Printer, Eye, ArrowLeft, Edit, Share2, Clock, DollarSign, Mail } from 'lucide-react';
import RecordPaymentModal from '@/components/invoice/RecordPaymentModal';
import PaymentHistory from '@/components/payments/PaymentHistory';
import PaymentSchedule from '@/components/payments/PaymentSchedule';
import PaymentScheduleDialog from '@/components/payments/PaymentScheduleDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { formatCurrency } from '@/utils/currencyCalculations';
import InvoiceActions from '@/components/invoice/InvoiceActions';
import InvoiceService from '@/api/InvoiceService';
import { getAutoStatusUpdate } from '@/utils/invoiceStatus';
import LogoImage from '@/components/shared/LogoImage';

export default function ViewInvoice() {
    const [invoice, setInvoice] = useState(null);
    const [client, setClient] = useState(null);
    const [company, setCompany] = useState(null);
    const [bankingDetail, setBankingDetail] = useState(null);
    const [payments, setPayments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [showPaymentDialog, setShowPaymentDialog] = useState(false);
    const [showScheduleDialog, setShowScheduleDialog] = useState(false);
    const [paymentSchedule, setPaymentSchedule] = useState([]);
    const [paymentPreset, setPaymentPreset] = useState(null);
    const [error, setError] = useState(null);
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const invoiceId = params.get('id');
        
        if (invoiceId) {
            loadInvoiceData(invoiceId);
        } else {
            setError("Invoice ID not found");
            setIsLoading(false);
        }
    }, [location]);

    const loadInvoiceData = async (invoiceId) => {
        setIsLoading(true);
        setError(null);
        try {
            const invoiceData = await Invoice.get(invoiceId);
            if (!invoiceData) throw new Error("Invoice not found");

            // Ensure invoice has items array (default to empty array if undefined)
            const invoiceWithItems = {
                ...invoiceData,
                items: Array.isArray(invoiceData.items) ? invoiceData.items : []
            };

            // Load related data with error handling for each
            try {
                const results = await Promise.allSettled([
                    Client.get(invoiceData.client_id).catch(() => null),
                    User.me().catch(() => null),
                    invoiceData.banking_detail_id ? BankingDetail.get(invoiceData.banking_detail_id).catch(() => null) : Promise.resolve(null),
                    Payment.list('-payment_date').catch(() => [])
                ]);

                const clientData = results[0].status === 'fulfilled' ? results[0].value : null;
                const companyData = results[1].status === 'fulfilled' ? results[1].value : null;
                const bankingData = results[2].status === 'fulfilled' ? results[2].value : null;
                const allPayments = results[3].status === 'fulfilled' ? results[3].value : [];

                // Filter payments for this invoice
                const paymentsData = Array.isArray(allPayments) 
                    ? allPayments.filter(p => p && p.invoice_id === invoiceId)
                    : [];

                setInvoice(invoiceWithItems);
                setClient(clientData);
                setCompany(companyData);
                setBankingDetail(bankingData);
                setPayments(paymentsData || []);
                setPaymentSchedule(invoiceData.payment_schedule || []);
            } catch (relatedErr) {
                // If related data fails to load, still set the invoice
                console.warn("Some related data failed to load:", relatedErr);
                setInvoice(invoiceWithItems);
            }
        } catch (err) {
            console.error("Error loading invoice:", err);
            setError(err.message || "Failed to load invoice");
            setInvoice(null);
        }
        setIsLoading(false);
    };
    
    const handleSendEmail = async () => {
        if (!client || !invoice || !company) return;
        setIsSending(true);

        try {
            const result = await InvoiceService.sendInvoiceEmail(
                invoice,
                client.email,
                client.name,
                company.company_name,
                invoice.invoice_number
            );

            if (invoice.status === 'draft') {
                await Invoice.update(invoice.id, { ...invoice, status: 'sent' });
                setInvoice(prev => ({...prev, status: 'sent'}));
            }
            alert(result.message);
        } catch (error) {
            console.error("Failed to send email:", error);
            alert(error.message || 'Failed to send email. Please try again.');
        } finally {
            setIsSending(false);
        }
    };
    
    const handleDownloadPDF = () => {
        try {
            InvoiceService.downloadInvoicePDF(invoice.id, invoice.invoice_number);
        } catch (error) {
            console.error("Failed to download PDF:", error);
            alert('Failed to download PDF. Please try again.');
        }
    };

    const handlePreviewPDF = () => {
        try {
            InvoiceService.previewInvoicePDF(invoice.id);
        } catch (error) {
            console.error("Failed to preview PDF:", error);
            alert('Failed to preview PDF. Please try again.');
        }
    };

    const handlePrint = () => {
        try {
            InvoiceService.printInvoice(invoice.id);
        } catch (error) {
            console.error("Failed to print:", error);
            alert('Failed to print. Please try again.');
        }
    };

    const handleRecordPayment = async (paymentData) => {
        try {
            // Create payment record
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

            // Calculate total payments
            const allPayments = [...payments, newPayment];
            const totalPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

            const autoUpdate = getAutoStatusUpdate({
                ...invoice,
                payments: allPayments
            });

            if (autoUpdate) {
                await Invoice.update(invoice.id, autoUpdate);
                setInvoice(prev => ({ ...prev, ...autoUpdate }));
            }

            // Update payments list
            setPayments(allPayments);
            setPaymentPreset(null);
            setShowPaymentDialog(false);
            
            alert('Payment recorded successfully!');
        } catch (error) {
            console.error("Error recording payment:", error);
            alert('Failed to record payment. Please try again.');
        }
    };

    const handleSaveSchedule = async (schedule) => {
        try {
            await Invoice.update(invoice.id, { payment_schedule: schedule });
            setPaymentSchedule(schedule);
            setShowScheduleDialog(false);
            alert('Payment schedule created successfully!');
        } catch (error) {
            console.error("Error saving payment schedule:", error);
            alert('Failed to save payment schedule. Please try again.');
        }
    };

    const handleRecordScheduledPayment = (installment) => {
        if (!installment) return;
        setPaymentPreset({
            amount: installment.amount,
            payment_date: installment.due_date,
            notes: installment.description || ''
        });
        setShowPaymentDialog(true);
    };

    if (isLoading) {
        return (
            <div className="bg-slate-100 p-8">
                <Skeleton className="h-12 w-1/3 mb-4" />
                <Skeleton className="h-[800px] w-full" />
            </div>
        )
    }

    if (error) {
        return <div className="p-8 text-center text-red-500">Error: {error}</div>;
    }

    if (!invoice) {
        return <div className="p-8 text-center text-red-500">Error: Invoice not found</div>;
    }

    const userCurrency = company?.currency || 'USD';
    const history = Array.isArray(invoice?.version_history) ? invoice.version_history : [];

    return (
        <div className="min-h-screen bg-background">
            {/* Breadcrumb */}
            <div className="no-print max-w-5xl mx-auto px-4 sm:px-8 pt-2">
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild><Link to={createPageUrl('Invoices')}>Invoices</Link></BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>#{invoice.invoice_number}</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </div>
            {/* Action Bar - No Print */}
            <div className="no-print bg-card border-b border-border p-4 sticky top-0 z-10 shadow-sm">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <Button
                        variant="outline"
                        onClick={() => navigate(createPageUrl('Invoices'))}
                        className="flex items-center gap-2 rounded-xl"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </Button>
                    
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => setShowPaymentDialog(true)}
                            disabled={invoice.status === 'paid' || invoice.status === 'cancelled'}
                            className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                        >
                            <DollarSign className="w-4 h-4" />
                            Record Payment
                        </Button>

                        <Button
                            variant="outline"
                            onClick={handlePreviewPDF}
                            className="flex items-center gap-2"
                        >
                            <Eye className="w-4 h-4" />
                            Preview
                        </Button>

                        <Button
                            variant="outline"
                            onClick={handlePrint}
                            className="flex items-center gap-2"
                        >
                            <Printer className="w-4 h-4" />
                            Print
                        </Button>
                        
                        <Button
                            variant="outline"
                            onClick={handleDownloadPDF}
                            className="flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Download PDF
                        </Button>
                        
                        <Button
                            onClick={handleSendEmail}
                            disabled={isSending}
                            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                        >
                            <Mail className="w-4 h-4" />
                            {isSending ? 'Sending...' : 'Email Client'}
                        </Button>
                        
                        <Button
                            variant="outline"
                            onClick={() => navigate(createPageUrl(`EditInvoice?id=${invoice.id}`))}
                            className="flex items-center gap-2"
                            disabled={['paid', 'partial_paid', 'cancelled'].includes(invoice.status)}
                        >
                            <Edit className="w-4 h-4" />
                            Edit
                        </Button>
                    </div>
                </div>
            </div>
            
            {/* Main Content Area (Invoice and potential Sidebar) */}
            <div className="p-4 sm:p-8 max-w-5xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Invoice Preview Column */}
                    <div className="lg:col-span-2">
                         <Card id="invoice-preview" className="shadow-lg print:shadow-none print:border-none">
                            <CardContent className="p-8">
                                {/* Company Header with Logo */}
                                <div className="flex flex-col sm:flex-row justify-between items-start mb-8 pb-6 border-b-2 border-indigo-600">
                                    <div className="flex items-start gap-6 mb-4 sm:mb-0">
                                        {company?.logo_url && (
                                            <LogoImage 
                                                src={company.logo_url} 
                                                alt={company?.company_name || 'Company'} 
                                                className="w-24 h-24 object-contain rounded-xl shadow-lg"
                                            />
                                        )}
                                        <div>
                                            <h1 className={`font-semibold text-gray-600 ${company?.logo_url ? 'text-lg' : 'text-2xl sm:text-3xl text-indigo-600'}`}>
                                                {company?.company_name}
                                            </h1>
                                            <p className="text-slate-600 mt-1 whitespace-pre-line text-sm">{company?.company_address}</p>
                                            <p className="text-slate-500 text-sm">Date: {format(new Date(), 'MMMM d, yyyy')}</p>
                                        </div>
                                    </div>
                                    <div className="text-left sm:text-right">
                                        <h2 className="text-2xl sm:text-3xl font-bold text-indigo-600">INVOICE</h2>
                                        <p className="text-slate-600 text-lg">#{invoice.invoice_number}</p>
                                    </div>
                                </div>

                                {/* Billed To, Dates */}
                                <div className="grid grid-cols-2 gap-8 mb-10">
                                    <div>
                                        <h4 className="font-semibold text-slate-500 mb-2">Billed To</h4>
                                        <p className="font-bold text-slate-800">{client.name}</p>
                                        <p className="text-slate-600">{client.address}</p>
                                        <p className="text-slate-600">{client.email}</p>
                                    </div>
                                    <div className="text-right">
                                        <h4 className="font-semibold text-slate-500 mb-2">Date of Issue</h4>
                                        <p className="text-slate-800">{format(new Date(invoice.created_date), 'MMMM d, yyyy')}</p>
                                        <h4 className="font-semibold text-slate-500 mt-4 mb-2">Due Date</h4>
                                        <p className="text-slate-800">{format(new Date(invoice.delivery_date), 'MMMM d, yyyy')}</p>
                                    </div>
                                </div>

                                {/* Items Table */}
                                <table className="w-full mb-10">
                                    <thead className="bg-slate-100">
                                        <tr>
                                            <th className="p-3 text-left font-semibold text-slate-600">Service</th>
                                            <th className="p-3 text-center font-semibold text-slate-600">Qty</th>
                                            <th className="p-3 text-right font-semibold text-slate-600">Rate</th>
                                            <th className="p-3 text-right font-semibold text-slate-600">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                                            invoice.items.map((item, index) => (
                                                <tr key={index} className="border-b border-slate-100">
                                                    <td className="p-3">
                                                        <p className="font-medium text-slate-800">{item.service_name}</p>
                                                        <p className="text-sm text-slate-500">{item.description}</p>
                                                    </td>
                                                    <td className="p-3 text-center">{item.quantity}</td>
                                                    <td className="p-3 text-right">{formatCurrency(item.unit_price, userCurrency)}</td>
                                                    <td className="p-3 text-right">{formatCurrency(item.total_price, userCurrency)}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="4" className="p-3 text-center text-slate-500">No items found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                {/* Totals */}
                                <div className="flex justify-end mb-10">
                                    <div className="w-full max-w-sm">
                                        <div className="flex justify-between py-2 border-b">
                                            <span className="text-slate-600">Subtotal</span>
                                            <span className="font-medium text-slate-800">{formatCurrency(invoice.subtotal, userCurrency)}</span>
                                        </div>
                                        {invoice.tax_amount > 0 && (
                                            <div className="flex justify-between py-2 border-b">
                                                <span className="text-slate-600">Tax ({invoice.tax_rate}%)</span>
                                                <span className="font-medium text-slate-800">{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between py-3 bg-slate-100 px-4 rounded-b-lg">
                                            <span className="font-bold text-slate-900">Total</span>
                                            <span className="font-bold text-lg text-slate-900">{formatCurrency(invoice.total_amount, userCurrency)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Notes & Payment Details */}
                                <div className="grid md:grid-cols-2 gap-8">
                                    <div>
                                        {invoice.notes && (
                                            <>
                                                <h4 className="font-semibold text-slate-800 mb-2">Notes</h4>
                                                <p className="text-sm text-slate-600">{invoice.notes}</p>
                                            </>
                                        )}
                                    </div>
                                     <div>
                                        {bankingDetail && (
                                            <>
                                                <h4 className="font-semibold text-slate-800 mb-2">Payment Details</h4>
                                                <div className="text-sm text-slate-600 space-y-1">
                                                    <p><strong>Bank:</strong> {bankingDetail.bank_name}</p>
                                                    <p><strong>Account Name:</strong> {bankingDetail.account_name}</p>
                                                    <p><strong>Account Number:</strong> {bankingDetail.account_number}</p>
                                                    {bankingDetail.routing_number && <p><strong>Routing:</strong> {bankingDetail.routing_number}</p>}
                                                    {bankingDetail.swift_code && <p><strong>SWIFT/BIC:</strong> {bankingDetail.swift_code}</p>}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-1">
                        <Card className="shadow-md">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Clock className="w-4 h-4 text-slate-600" />
                                    <h3 className="font-semibold text-slate-800">Version History</h3>
                                </div>
                                {history.length === 0 ? (
                                    <p className="text-sm text-slate-500">No changes recorded yet.</p>
                                ) : (
                                    <ul className="space-y-4">
                                        {history.map((entry) => (
                                            <li key={entry.id || entry.timestamp} className="border-l-2 border-slate-200 pl-3">
                                                <p className="text-sm font-medium text-slate-800">
                                                    {entry.summary || 'Invoice updated'}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {entry.timestamp ? format(new Date(entry.timestamp), 'MMM d, yyyy h:mm a') : 'Unknown time'}
                                                </p>
                                                {Array.isArray(entry.changes) && entry.changes.length > 0 && (
                                                    <p className="text-xs text-slate-600 mt-1">
                                                        {entry.changes.length} change{entry.changes.length > 1 ? 's' : ''}
                                                    </p>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Payment History */}
                    <div className="mt-8">
                        <PaymentHistory payments={payments} currency={userCurrency} />
                    </div>

                    {/* Payment Schedule */}
                    {(paymentSchedule.length > 0 || payments.length === 0) && (
                        <div className="mt-8">
                            <PaymentSchedule
                                invoice={invoice}
                                payments={payments}
                                schedule={paymentSchedule}
                                currency={userCurrency}
                                onAddSchedule={() => setShowScheduleDialog(true)}
                                onRecordPayment={handleRecordScheduledPayment}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Recording Dialog */}
            <RecordPaymentModal
                invoice={invoice}
                isOpen={showPaymentDialog}
                onClose={() => {
                    setShowPaymentDialog(false);
                    setPaymentPreset(null);
                }}
                onSave={handleRecordPayment}
                defaultValues={paymentPreset}
            />

            {/* Payment Schedule Dialog */}
            <PaymentScheduleDialog
                invoice={invoice}
                isOpen={showScheduleDialog}
                onClose={() => setShowScheduleDialog(false)}
                onSave={handleSaveSchedule}
            />
        </div>
    );
}