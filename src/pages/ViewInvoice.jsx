import { useState, useEffect, useRef } from 'react';
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
import InvoicePreviewSkeleton from '@/components/invoice/InvoicePreviewSkeleton';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { formatCurrency } from '@/utils/currencyCalculations';
import InvoiceActions from '@/components/invoice/InvoiceActions';
import InvoiceService from '@/api/InvoiceService';
import { retryOnAbort, isAbortError } from '@/utils/retryOnAbort';
import { withTimeoutRetry } from '@/utils/fetchWithTimeout';
import { usePaymentActions } from '@/hooks/usePaymentActions';
import { runPaidConfetti } from '@/utils/confetti';
import LogoImage from '@/components/shared/LogoImage';
import { canEditInvoice, canRecordPayment } from '@/logic';

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
    const [isSharing, setIsSharing] = useState(false);
    const [error, setError] = useState(null);
    const location = useLocation();
    const navigate = useNavigate();
    const invoiceId = invoiceIdProp ?? new URLSearchParams(location.search).get('id');
    const mountedRef = useRef(true);
    const loadIdRef = useRef(0);

    useEffect(() => {
        mountedRef.current = true;
        if (invoiceId) {
            loadInvoiceData(invoiceId);
        } else {
            setError("Invoice ID not found");
            setIsLoading(false);
        }
        return () => { mountedRef.current = false; };
    }, [invoiceId]);

    const loadInvoiceData = async (invoiceId) => {
        const thisLoadId = loadIdRef.current + 1;
        loadIdRef.current = thisLoadId;
        setIsLoading(true);
        setError(null);
        try {
            const invoiceData = await withTimeoutRetry(() => Invoice.get(invoiceId), 15000, 2);
            if (!mountedRef.current || loadIdRef.current !== thisLoadId) return;
            if (!invoiceData) throw new Error("Invoice not found");

            // Ensure invoice has items array (default to empty array if undefined)
            const invoiceWithItems = {
                ...invoiceData,
                items: Array.isArray(invoiceData.items) ? invoiceData.items : []
            };

            // Load related data with error handling for each (parallel)
            try {
                const results = await withTimeoutRetry(() => Promise.allSettled([
                    Client.get(invoiceData.client_id).catch(() => null),
                    User.me().catch(() => null),
                    invoiceData.banking_detail_id ? BankingDetail.get(invoiceData.banking_detail_id).catch(() => null) : Promise.resolve(null),
                    Payment.list('-payment_date').catch(() => [])
                ]), 15000, 2);

                if (!mountedRef.current || loadIdRef.current !== thisLoadId) return;

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
                if (!mountedRef.current) return;
                console.warn("Some related data failed to load:", relatedErr);
                setInvoice(invoiceWithItems);
            }
        } catch (err) {
            if (!mountedRef.current || loadIdRef.current !== thisLoadId) return;
            console.error("Error loading invoice:", err);
            setError(err.message || "Failed to load invoice");
            setInvoice(null);
        } finally {
            if (mountedRef.current) setIsLoading(false);
        }
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

    const handleShareViaWhatsApp = async () => {
        setIsSharing(true);
        try {
            let token = invoice.public_share_token;
            if (!token) {
                token = crypto.randomUUID();
                await retryOnAbort(() => Invoice.update(invoice.id, { public_share_token: token }));
                setInvoice((prev) => ({ ...prev, public_share_token: token }));
            }
            const publicViewUrl = `${window.location.origin}/view/${token}`;
            const brandName = company?.company_name || invoice.owner_company_name || 'Paidly';
            const message = `Hi ${client?.name || 'there'}, here is your invoice ${invoice.invoice_number} from ${brandName}.\n\nView it here: ${publicViewUrl}`;
            const phone = client?.phone?.replace(/\D/g, '') || '';
            const whatsappUrl = phone
                ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
                : `https://wa.me/?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        } catch (err) {
            console.error('Failed to share via WhatsApp:', err);
            alert(err?.message || 'Failed to open WhatsApp. Please try again.');
        } finally {
            setIsSharing(false);
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
                <InvoicePreviewSkeleton />
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
            {/* Action Bar — white rounded bar, fits + mobile-friendly */}
            <div className="no-print px-4 sm:px-6 pt-2 pb-4 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className="max-w-5xl mx-auto bg-white rounded-xl border border-slate-100 shadow-sm p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={embedded && onClose ? onClose : () => navigate(createPageUrl('Invoices'))}
                            className="flex items-center gap-2 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 h-9 sm:h-10"
                        >
                            <ArrowLeft className="w-4 h-4 shrink-0" />
                            Back
                        </Button>

                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <Button
                                size="sm"
                                onClick={() => setShowPaymentDialog(true)}
                                disabled={!canRecordPayment(invoice)}
                                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 rounded-xl shrink-0 h-9 sm:h-10"
                            >
                                <DollarSign className="w-4 h-4 shrink-0" />
                                <span className="hidden sm:inline">Record Payment</span>
                                <span className="sm:hidden">Payment</span>
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePreviewPDF}
                                className="flex items-center gap-2 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 h-9 sm:h-10"
                            >
                                <Eye className="w-4 h-4 shrink-0" />
                                Preview
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePrint}
                                className="flex items-center gap-2 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 h-9 sm:h-10"
                            >
                                <Printer className="w-4 h-4 shrink-0" />
                                <span className="hidden sm:inline">Print</span>
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownloadPDF}
                                className="flex items-center gap-2 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 h-9 sm:h-10"
                            >
                                <Download className="w-4 h-4 shrink-0" />
                                <span className="hidden sm:inline">Download PDF</span>
                                <span className="sm:hidden">PDF</span>
                            </Button>

                            <Button
                                size="sm"
                                onClick={handleSendEmail}
                                disabled={isSending}
                                className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2 rounded-xl shrink-0 h-9 sm:h-10"
                            >
                                <Mail className="w-4 h-4 shrink-0" />
                                <span className="hidden sm:inline">{isSending ? 'Sending...' : 'Email Client'}</span>
                                <span className="sm:hidden">{isSending ? '…' : 'Email'}</span>
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleShareViaWhatsApp}
                                disabled={isSharing}
                                className="flex items-center gap-2 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 h-9 sm:h-10"
                            >
                                <Share2 className="w-4 h-4 shrink-0" />
                                <span className="hidden sm:inline">{isSharing ? 'Opening…' : 'Share'}</span>
                                <span className="sm:hidden">{isSharing ? '…' : 'Share'}</span>
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(createPageUrl(`EditInvoice?id=${invoice.id}`))}
                                disabled={!canEditInvoice(invoice)}
                                className="flex items-center gap-2 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 h-9 sm:h-10"
                            >
                                <Edit className="w-4 h-4 shrink-0" />
                                <span className="hidden sm:inline">Edit</span>
                            </Button>
                        </div>
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
                                            <span
                                                className="tabular-nums tracking-tighter whitespace-nowrap min-w-0"
                                                style={{ fontSize: 'clamp(1.125rem, 3vw + 0.75rem, 2rem)' }}
                                            >
                                                {formatCurrency(invoice.total_amount, userCurrency)}
                                            </span>
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