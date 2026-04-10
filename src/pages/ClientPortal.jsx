import React, { useState, useEffect } from 'react';
import { ClientPortalProvider, useClientPortal } from '@/contexts/ClientPortalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    FileText, 
    Download, 
    CreditCard, 
    User, 
    CheckCircle, 
    Clock,
    AlertCircle,
    LogOut,
    Mail,
    Phone,
    MapPin,
    Calendar,
    MessageCircle
} from 'lucide-react';
import { formatCurrency } from '../components/CurrencySelector';
import { format, parseISO, isValid } from 'date-fns';
import { createPageUrl } from '@/utils';
import ClientLogin from '../components/clientportal/ClientLogin';
import PaymentModal from '../components/clientportal/PaymentModal';
import ContactUpdateModal from '../components/clientportal/ContactUpdateModal';
import ClientMessages from '../components/clientportal/ClientMessages';
import { Skeleton } from '@/components/ui/skeleton';

const statusStyles = {
    draft: "bg-status-draft/15 text-slate-600 border border-status-draft/25",
    sent: "bg-status-sent/12 text-status-sent border border-status-sent/25",
    viewed: "bg-status-sent/10 text-status-sent border border-status-sent/20",
    paid: "bg-status-paid/12 text-status-paid border border-status-paid/25",
    partial_paid: "bg-status-pending/12 text-status-pending border border-status-pending/25",
    overdue: "bg-status-overdue/12 text-status-overdue border border-status-overdue/25",
    cancelled: "bg-status-declined/12 text-status-declined border border-status-declined/25",
    accepted: "bg-status-accepted/12 text-status-accepted border border-status-accepted/25",
    rejected: "bg-status-declined/12 text-status-declined border border-status-declined/25",
    expired: "bg-status-declined/10 text-status-declined border border-status-declined/20",
    declined: "bg-status-declined/12 text-status-declined border border-status-declined/25",
};

const PORTAL_TAB_STORAGE_KEY = 'paidly_portal_active_tab_v1';
const PORTAL_TAB_VALUES = new Set(['invoices', 'quotes', 'messages', 'reports', 'payments']);

function readStoredPortalTab() {
    try {
        const v = sessionStorage.getItem(PORTAL_TAB_STORAGE_KEY);
        if (v && PORTAL_TAB_VALUES.has(v)) return v;
    } catch {
        /* ignore */
    }
    return 'invoices';
}

const safeFormatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
        const date = parseISO(dateStr);
        return isValid(date) ? format(date, 'MMM d, yyyy') : 'N/A';
    } catch {
        return 'N/A';
    }
};

function ClientPortalShell() {
    const {
        client,
        invoices,
        quotes,
        isBootstrapping,
        isLoading,
        login,
        logout,
        updateClientProfile,
        recordPayment,
    } = useClientPortal();
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [activeTab, setActiveTab] = useState(readStoredPortalTab);

    useEffect(() => {
        try {
            sessionStorage.setItem(PORTAL_TAB_STORAGE_KEY, activeTab);
        } catch {
            /* ignore */
        }
    }, [activeTab]);

    const handleLogout = () => {
        logout();
    };

    const handlePayment = (invoice) => {
        setSelectedInvoice(invoice);
        setShowPaymentModal(true);
    };

    const handlePaymentSuccess = async (invoiceId, amount) => {
        try {
            await recordPayment(invoiceId, amount, {
                method: 'credit_card',
                notes: 'Online payment via client portal',
            });
        } catch (error) {
            console.error("Payment processing error:", error);
            alert("Payment could not be recorded. Please contact support.");
        }
    };

    const handleContactUpdate = async (formData) => {
        await updateClientProfile(formData);
    };

    const handleDownload = (type, id) => {
        const url = type === 'invoice' 
            ? createPageUrl(`InvoicePDF?id=${id}`)
            : createPageUrl(`QuotePDF?id=${id}`);
        window.location.href = url;
    };

    const calculateTotalPaid = (invoice) => {
        if (!invoice.payments || invoice.payments.length === 0) return 0;
        return invoice.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    };

    // Always use partial paid amount as current balance for partial_paid invoices
    const calculateOutstanding = (invoice) => {
        if (!invoice.payments || invoice.payments.length === 0) return invoice.total_amount;
        const totalPaid = calculateTotalPaid(invoice);
        if (invoice.status === 'partial_paid') {
            return invoice.total_amount - totalPaid;
        }
        if (invoice.status === 'paid') {
            return 0;
        }
        return invoice.total_amount - totalPaid;
    };

    // Stats
    const totalOutstanding = invoices
        .filter(inv => inv.status === 'sent' || inv.status === 'overdue')
        .reduce((sum, inv) => sum + calculateOutstanding(inv), 0);
    
    const totalPaid = invoices
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.total_amount, 0);

    const pendingQuotes = quotes.filter(q => q.status === 'sent' || q.status === 'viewed').length;

    if (isBootstrapping) {
        return (
            <div className="min-h-screen bg-slate-50 p-4">
                <div className="max-w-7xl mx-auto space-y-6">
                    <Skeleton className="h-40 w-full" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                    </div>
                    <Skeleton className="h-96 w-full" />
                </div>
            </div>
        );
    }

    if (!client) {
        return <ClientLogin onLogin={login} isSubmitting={isLoading} />;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header */}
            <div className="bg-white border-b shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">Welcome back, {client.name}</h1>
                            <p className="text-slate-600 mt-1">Manage your invoices, quotes, and account details</p>
                        </div>
                        <div className="flex gap-2">
                            <Button 
                                onClick={() => setShowContactModal(true)}
                                variant="outline"
                                className="gap-2"
                            >
                                <User className="w-4 h-4" />
                                Update Contact
                            </Button>
                            <Button 
                                onClick={handleLogout}
                                variant="outline"
                                className="gap-2"
                            >
                                <LogOut className="w-4 h-4" />
                                Logout
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Client Info Card */}
                <Card className="mb-8 border-0 shadow-lg">
                    <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="flex items-start gap-3">
                                <Mail className="w-5 h-5 text-emerald-600 mt-1" />
                                <div>
                                    <p className="text-sm text-slate-600">Email</p>
                                    <p className="font-medium text-slate-900">{client.email}</p>
                                </div>
                            </div>
                            {client.phone && (
                                <div className="flex items-start gap-3">
                                    <Phone className="w-5 h-5 text-emerald-600 mt-1" />
                                    <div>
                                        <p className="text-sm text-slate-600">Phone</p>
                                        <p className="font-medium text-slate-900">{client.phone}</p>
                                    </div>
                                </div>
                            )}
                            {client.address && (
                                <div className="flex items-start gap-3">
                                    <MapPin className="w-5 h-5 text-emerald-600 mt-1" />
                                    <div>
                                        <p className="text-sm text-slate-600">Address</p>
                                        <p className="font-medium text-slate-900">{client.address}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Card className="border-0 shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-600 mb-1">Outstanding Balance</p>
                                    <p className="text-2xl font-bold text-red-600">
                                        {formatCurrency(totalOutstanding, client.currency || 'ZAR')}
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                                    <AlertCircle className="w-6 h-6 text-red-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-600 mb-1">Total Paid</p>
                                    <p className="text-2xl font-bold text-green-600">
                                        {formatCurrency(totalPaid, client.currency || 'ZAR')}
                                    </p>
                                </div>
                                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                                    <CheckCircle className="w-6 h-6 text-green-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-600 mb-1">Pending Quotes</p>
                                    <p className="text-2xl font-bold text-primary">{pendingQuotes}</p>
                                </div>
                                <div className="w-12 h-12 bg-primary/15 rounded-lg flex items-center justify-center">
                                    <Clock className="w-6 h-6 text-primary" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs — controlled + sessionStorage so switching/re-auth does not snap back to Invoices */}
                <Tabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="w-full"
                >
                    <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 mb-6">
                        <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
                        <TabsTrigger value="quotes">Quotes ({quotes.length})</TabsTrigger>
                        <TabsTrigger value="messages">
                            <MessageCircle className="w-4 h-4 mr-2" />
                            Messages
                        </TabsTrigger>
                        <TabsTrigger value="reports">
                            <FileText className="w-4 h-4 mr-2" />
                            Reports
                        </TabsTrigger>
                        <TabsTrigger value="payments">Payments</TabsTrigger>
                    </TabsList>

                    <TabsContent value="invoices">
                        <div className="space-y-4">
                            {invoices.length === 0 ? (
                                <Card className="border-0 shadow-lg">
                                    <CardContent className="p-12 text-center">
                                        <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold text-slate-900 mb-2">No invoices yet</h3>
                                        <p className="text-slate-600">You don't have any invoices at the moment</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                invoices.map(invoice => (
                                    <Card key={invoice.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                                        <CardContent className="p-6">
                                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <h3 className="font-bold text-lg text-slate-900">
                                                            Invoice #{invoice.invoice_number}
                                                        </h3>
                                                        <Badge className={statusStyles[invoice.status]}>
                                                            {invoice.status?.replace('_', ' ')}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-slate-600 mb-2">{invoice.project_title}</p>
                                                    <div className="flex items-center gap-4 text-sm text-slate-500">
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="w-4 h-4" />
                                                            {safeFormatDate(invoice.created_date)}
                                                        </div>
                                                        {invoice.delivery_date && (
                                                            <div>Due: {safeFormatDate(invoice.delivery_date)}</div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end justify-between gap-4">
                                                    <div className="text-right">
                                                        <p className="text-sm text-slate-600">Total Amount</p>
                                                        <p className="text-2xl font-bold text-slate-900">
                                                            {formatCurrency(invoice.total_amount, invoice.owner_currency || 'ZAR')}
                                                        </p>
                                                        {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                                                            <p className="text-sm text-red-600 mt-1">
                                                                Outstanding: {formatCurrency(calculateOutstanding(invoice), invoice.owner_currency || 'ZAR')}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            onClick={() => handleDownload('invoice', invoice.id)}
                                                            variant="outline"
                                                            size="sm"
                                                        >
                                                            <Download className="w-4 h-4 mr-2" />
                                                            Download
                                                        </Button>
                                                        {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                                                            <Button
                                                                onClick={() => handlePayment(invoice)}
                                                                size="sm"
                                                                className="bg-emerald-600 hover:bg-emerald-700"
                                                            >
                                                                <CreditCard className="w-4 h-4 mr-2" />
                                                                Pay Now
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="quotes">
                        <div className="space-y-4">
                            {quotes.length === 0 ? (
                                <Card className="border-0 shadow-lg">
                                    <CardContent className="p-12 text-center">
                                        <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold text-slate-900 mb-2">No quotes yet</h3>
                                        <p className="text-slate-600">You don't have any quotes at the moment</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                quotes.map(quote => (
                                    <Card key={quote.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                                        <CardContent className="p-6">
                                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <h3 className="font-bold text-lg text-slate-900">
                                                            Quote #{quote.quote_number}
                                                        </h3>
                                                        <Badge className={statusStyles[quote.status]}>
                                                            {quote.status?.replace('_', ' ')}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-slate-600 mb-2">{quote.project_title}</p>
                                                    <div className="flex items-center gap-4 text-sm text-slate-500">
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="w-4 h-4" />
                                                            Created: {safeFormatDate(quote.created_date)}
                                                        </div>
                                                        {quote.valid_until && (
                                                            <div>Valid until: {safeFormatDate(quote.valid_until)}</div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end justify-between gap-4">
                                                    <div className="text-right">
                                                        <p className="text-sm text-slate-600">Quote Amount</p>
                                                        <p className="text-2xl font-bold text-slate-900">
                                                            {formatCurrency(quote.total_amount, client.currency || 'ZAR')}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        onClick={() => handleDownload('quote', quote.id)}
                                                        variant="outline"
                                                        size="sm"
                                                    >
                                                        <Download className="w-4 h-4 mr-2" />
                                                        Download
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="messages">
                        <ClientMessages client={client} invoices={invoices} />
                    </TabsContent>

                    <TabsContent value="reports">
                        <Card className="border-0 shadow-lg">
                            <CardHeader>
                                <CardTitle>Shared Reports</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 border rounded-lg bg-white hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-primary/15 rounded-lg flex items-center justify-center">
                                                <FileText className="w-6 h-6 text-primary" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-slate-900">Statement of Account</h4>
                                                <p className="text-sm text-slate-500">Full history of invoices and payments</p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={() => window.location.href = createPageUrl(`ReportPDF?client=${client.id}&range=year`)}
                                            variant="outline"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Download
                                        </Button>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border rounded-lg bg-white hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                                <Clock className="w-6 h-6 text-purple-600" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-slate-900">Outstanding Balance Report</h4>
                                                <p className="text-sm text-slate-500">Summary of all unpaid invoices</p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={() => window.location.href = createPageUrl(`ReportPDF?client=${client.id}&status=overdue`)}
                                            variant="outline"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Download
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="payments">
                        <Card className="border-0 shadow-lg">
                            <CardHeader>
                                <CardTitle>Payment History</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {invoices
                                        .filter(inv => inv.payments && inv.payments.length > 0)
                                        .flatMap(inv => 
                                            inv.payments.map(payment => ({
                                                ...payment,
                                                invoiceNumber: inv.invoice_number,
                                                invoiceId: inv.id
                                            }))
                                        )
                                        .sort(
                                            (a, b) =>
                                                new Date(b.payment_date || b.paid_at || b.created_at || 0) -
                                                new Date(a.payment_date || a.paid_at || a.created_at || 0)
                                        )
                                        .map((payment, index) => (
                                            <div key={index} className="flex justify-between items-center py-4 border-b last:border-0">
                                                <div>
                                                    <p className="font-medium text-slate-900">
                                                        Invoice #{payment.invoiceNumber}
                                                    </p>
                                                    <p className="text-sm text-slate-600">
                                                        {safeFormatDate(
                                                            payment.payment_date || payment.paid_at || payment.created_at
                                                        )}{' '}
                                                        • {(payment.payment_method || payment.method || '').replace('_', ' ')}
                                                    </p>
                                                    {payment.notes && (
                                                        <p className="text-xs text-slate-500 mt-1">{payment.notes}</p>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold text-green-600">
                                                        {formatCurrency(payment.amount, client.currency || 'ZAR')}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    
                                    {invoices.every(inv => !inv.payments || inv.payments.length === 0) && (
                                        <div className="text-center py-12 text-slate-500">
                                            <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                            <p>No payment history yet</p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Modals */}
            {showPaymentModal && selectedInvoice && (
                <PaymentModal
                    isOpen={showPaymentModal}
                    onClose={() => {
                        setShowPaymentModal(false);
                        setSelectedInvoice(null);
                    }}
                    invoice={selectedInvoice}
                    onPaymentSuccess={handlePaymentSuccess}
                />
            )}

            {showContactModal && (
                <ContactUpdateModal
                    isOpen={showContactModal}
                    onClose={() => setShowContactModal(false)}
                    client={client}
                    onUpdate={handleContactUpdate}
                />
            )}
        </div>
    );
}

export default function ClientPortal() {
    return (
        <ClientPortalProvider>
            <ClientPortalShell />
        </ClientPortalProvider>
    );
}