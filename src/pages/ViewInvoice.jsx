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
import { retryOnAbort, isAbortError } from '@/utils/retryOnAbort';
import { usePaymentActions } from '@/hooks/usePaymentActions';
import { runPaidConfetti } from '@/utils/confetti';
import LogoImage from '@/components/shared/LogoImage';

export default function ViewInvoice({ invoiceId: invoiceIdProp, embedded, onClose }) {
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
    const invoiceId = invoiceIdProp ?? new URLSearchParams(location.search).get('id');

    useEffect(() => {
        if (invoiceId) {
            loadInvoiceData(invoiceId);
        } else {
            setError("Invoice ID not found");
            setIsLoading(false);
        }
    }, [invoiceId]);

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
                await retryOnAbort(() => Invoice.update(invoice.id, { ...invoice, status: 'sent' }));
                setInvoice(prev => ({...prev, status: 'sent'}));
            }
            alert(result.message);
        } catch (error) {
            console.error("Failed to send email:", error);
            const message = isAbortError(error) ? "Request was interrupted. Please try again." : (error.message || 'Failed to send email. Please try again.');
            alert(message);
        } finally {
            setIsSending(false);
        }
    };
    
    const handleDownloadPDF = () => {
        try {
            InvoiceService.downloadInvoicePDF(invoice.id, invoice.invoice_number, {
                navigate,
                inAppPath: createPageUrl('InvoicePDF') + '?id=' + invoice.id + '&download=true',
            });
        } catch (error) {
            console.error("Failed to download PDF:", error);
            alert('Failed to download PDF. Please try again.');
        }
    };

    const handlePreviewPDF = () => {
        try {
            InvoiceService.previewInvoicePDF(invoice.id, {
                navigate,
                inAppPath: createPageUrl('InvoicePDF') + '?id=' + invoice.id,
            });
        } catch (error) {
            console.error("Failed to preview PDF:", error);
            alert('Failed to preview PDF. Please try again.');
        }
    };

    const handlePrint = () => {
        try {
            InvoiceService.printInvoice(invoice.id, {
                navigate,
                inAppPath: createPageUrl('InvoicePDF') + '?id=' + invoice.id,
            });
        } catch (error) {
            console.error("Failed to print:", error);
            alert('Failed to print. Please try again.');
        }
    };

    const { recordPayment } = usePaymentActions(
        invoice ? { ...invoice, payments } : null,
        {
            onSuccess: ({ invoice: updatedInvoice, payments: mergedPayments, isFullyPaid }) => {
                setInvoice(updatedInvoice);
                setPayments(mergedPayments);
                setPaymentPreset(null);
                if (isFullyPaid) runPaidConfetti();
            },
        }
    );

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
            <div className="bg-slate-100 p-8 animate-fade-in min-h-[60vh]" role="status" aria-label="Loading invoice">
                <Skeleton className="h-12 w-1/3 mb-4 animate-fade-in-up" style={{ animationDelay: "0.05s", animationFillMode: "backwards" }} />
                <Skeleton className="h-16 w-full mb-6 animate-fade-in-up" style={{ animationDelay: "0.1s", animationFillMode: "backwards" }} />
                <Skeleton className="h-[600px] w-full animate-fade-in-up" style={{ animationDelay: "0.15s", animationFillMode: "backwards" }} />
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
        <div className={embedded ? "min-h-0" : "min-h-screen bg-background"}>
            {/* Breadcrumb — hidden when embedded (e.g. slide-over panel) */}
            {!embedded && (
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
            )}
            {/* Action Bar - No Print */}
            <div className="no-print bg-card border-b border-border p-4 sticky top-0 z-10 shadow-sm">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <Button
                        variant="outline"
                        onClick={embedded && onClose ? onClose : () => navigate(createPageUrl('Invoices'))}
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
                            className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2"
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
                         <Card id="invoice-preview" className="shadow-lg print:shadow-none print:border-none bg-white">
                            <CardContent className="p-8">
                                {/* Agency-style: INVOICE left, company beige box right */}
                                <div className="flex flex-wrap justify-between items-start gap-6 mb-8">
                                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 uppercase tracking-tight">Invoice</h1>
                                    <div className="text-right">
                                        <div className="inline-block rounded-lg px-4 py-3 bg-[#f5f0e8] border border-[#e8e0d5]">
                                            {company?.logo_url ? (
                                                <div className="flex items-center gap-3">
                                                    <LogoImage src={company.logo_url} alt="" className="h-10 w-auto" style={{ maxHeight: "40px" }} />
                                                    <span className="font-semibold text-gray-800">{company?.company_name}</span>
                                                </div>
                                            ) : (
                                                <span className="font-semibold text-gray-800">{company?.company_name}</span>
                                            )}
                                        </div>
                                        <div className="mt-3 text-sm text-gray-600">
                                            <p>Invoice No: {invoice.invoice_number}</p>
                                            <p>Date: {format(new Date(invoice.created_date), "dd/MM/yyyy")}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Payable To | Bank Details */}
                                <div className="grid md:grid-cols-2 gap-8 mb-8">
                                    <div>
                                        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Payable To</h3>
                                        <p className="font-medium text-gray-900">{client.name}</p>
                                        {client.address && <p className="text-sm text-gray-600 mt-0.5">{client.address}</p>}
                                        {client.email && <p className="text-sm text-gray-600">{client.email}</p>}
                                    </div>
                                    <div className="text-right md:text-right">
                                        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Bank Details</h3>
                                        {bankingDetail ? (
                                            <>
                                                <p className="font-medium text-gray-900">{bankingDetail.account_name || bankingDetail.bank_name}</p>
                                                {bankingDetail.account_number && <p className="text-sm text-gray-600">{bankingDetail.account_number}</p>}
                                                {bankingDetail.bank_name && bankingDetail.account_name && <p className="text-sm text-gray-600">{bankingDetail.bank_name}</p>}
                                            </>
                                        ) : (
                                            <p className="text-sm text-gray-500">—</p>
                                        )}
                                    </div>
                                </div>

                                {/* Itemized table: beige header, 4 columns */}
                                <div className="overflow-x-auto rounded-t-lg overflow-hidden mb-6">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-[#f5f0e8] border border-[#e8e0d5]">
                                                <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-800 uppercase tracking-wider">Item Description</th>
                                                <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-800 uppercase tracking-wider w-20">Qty</th>
                                                <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-800 uppercase tracking-wider w-28">Price</th>
                                                <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-800 uppercase tracking-wider w-28">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                                                invoice.items.map((item, index) => {
                                                    const name = item.service_name || item.name || "Item";
                                                    const qty = Number(item.quantity ?? item.qty ?? 1);
                                                    const unitPrice = Number(item.unit_price ?? item.rate ?? item.price ?? 0);
                                                    const lineTotal = Number(item.total_price ?? item.total ?? qty * unitPrice);
                                                    return (
                                                        <tr key={index} className="border-b border-gray-100">
                                                            <td className="px-4 py-4 text-gray-900">{name}</td>
                                                            <td className="px-4 py-4 text-right text-gray-700 tabular-nums">{qty}</td>
                                                            <td className="px-4 py-4 text-right text-gray-700 tabular-nums">{formatCurrency(unitPrice, userCurrency)}</td>
                                                            <td className="px-4 py-4 text-right font-medium text-gray-900 tabular-nums">{formatCurrency(lineTotal, userCurrency)}</td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-10 text-center text-gray-500">No items added</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Notes */}
                                {invoice.notes && (
                                    <div className="mb-8">
                                        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Notes</h3>
                                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{invoice.notes}</p>
                                    </div>
                                )}

                                {/* Totals: right-aligned beige box */}
                                <div className="flex justify-end">
                                    <div className="w-full max-w-xs rounded-lg border border-[#e8e0d5] bg-[#f5f0e8] px-5 py-4">
                                        <div className="flex justify-between py-2 text-sm text-gray-700">
                                            <span>Sub Total</span>
                                            <span className="tabular-nums">{formatCurrency(invoice.subtotal ?? 0, userCurrency)}</span>
                                        </div>
                                        {invoice.tax_amount > 0 && (
                                            <div className="flex justify-between py-2 text-sm text-gray-700">
                                                <span>Tax ({invoice.tax_rate}%)</span>
                                                <span className="tabular-nums">{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                                            </div>
                                        )}
                                        <div className="border-t border-gray-300 mt-2 pt-3 flex justify-between text-base font-bold text-gray-900">
                                            <span>Grand Total</span>
                                            <span className="tabular-nums">{formatCurrency(invoice.total_amount, userCurrency)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Payment details (extra) */}
                                {bankingDetail && (bankingDetail.routing_number || bankingDetail.swift_code) && (
                                    <div className="mt-8 pt-6 border-t border-gray-200">
                                        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Payment Reference</h4>
                                        <div className="text-sm text-gray-600 space-y-0.5">
                                            {bankingDetail.routing_number && <p>Routing: {bankingDetail.routing_number}</p>}
                                            {bankingDetail.swift_code && <p>SWIFT/BIC: {bankingDetail.swift_code}</p>}
                                        </div>
                                    </div>
                                )}
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
                onSave={recordPayment}
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