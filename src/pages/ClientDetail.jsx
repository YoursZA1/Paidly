import React, { useState, useEffect } from "react";
import { Client, Invoice, User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
    ArrowLeft, Mail, Phone, MapPin, User as UserIcon, 
    FileText, ChevronLeft, ChevronRight, Plus, Edit, Trash2, Globe, Smartphone, Building2, Lock, StickyNote, CreditCard
} from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "../components/CurrencySelector";
import { format, parseISO, isValid } from "date-fns";
import ClientForm from "../components/clients/ClientForm";
import ClientSegmentBadge from "../components/clients/ClientSegmentBadge";
import IndustryBadge from "../components/clients/IndustryBadge";
import ConfirmationDialog from "../components/shared/ConfirmationDialog";
import { useToast } from "@/components/ui/use-toast";

const INVOICES_PER_PAGE = 5;

const statusStyles = {
    draft: "bg-gray-100 text-gray-700",
    sent: "bg-blue-100 text-blue-700",
    viewed: "bg-purple-100 text-purple-700",
    partial_paid: "bg-yellow-100 text-yellow-700",
    paid: "bg-green-100 text-green-700",
    overdue: "bg-red-100 text-red-700"
};

const getPaymentTermsText = (terms, days) => {
    if (!terms) return 'Net 30 Days';
    if (terms === 'due_on_receipt') return 'Due on Receipt';
    if (terms === 'custom') return `Net ${days || 30} Days`;
    if (terms.startsWith('net_')) {
        const termDays = terms.split('_')[1];
        return `Net ${termDays} Days`;
    }
    return 'Net 30 Days';
};

/** Supabase client ids are UUIDs; legacy numeric ids (e.g. from old links) are invalid. */
const isClientIdUuid = (id) =>
    id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id).trim());

export default function ClientDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');

    const [client, setClient] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showEditForm, setShowEditForm] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const { toast } = useToast();

    useEffect(() => {
        if (clientId) {
            loadData();
        }
    }, [clientId]);

    const loadData = async () => {
        setIsLoading(true);
        if (clientId && !isClientIdUuid(clientId)) {
            setClient(null);
            setInvoices([]);
            try { setUser(await User.me()); } catch { /* ignore */ }
            setIsLoading(false);
            return;
        }
        try {
            const [clientData, invoicesData, userData] = await Promise.all([
                Client.filter({ id: clientId }),
                Invoice.filter({ client_id: clientId }, '-created_date'),
                User.me()
            ]);
            setClient(clientData?.[0] || null);
            setInvoices(invoicesData || []);
            setUser(userData);
        } catch (error) {
            console.error("Error loading client data:", error);
            setClient(null);
            setInvoices([]);
        }
        setIsLoading(false);
    };

    const handleSaveClient = async (clientData) => {
        if (clientId && !isClientIdUuid(clientId)) {
            toast({
                title: "Cannot save",
                description: "This client link is invalid. Please open the client from the Clients list.",
                variant: "destructive"
            });
            return;
        }
        try {
            await Client.update(clientId, clientData);
            setShowEditForm(false);
            loadData();
        } catch (error) {
            console.error("Error saving client:", error);
            const msg = error?.message || "";
            toast({
                title: "Could not save client",
                description: msg.includes("older version") ? "Please open this client from the Clients list and try again." : msg,
                variant: "destructive"
            });
        }
    };

    const handleDeleteClient = async () => {
        if (!clientId) return;
        setIsDeleting(true);
        try {
            if (invoices.length > 0) {
                toast({
                    title: "Cannot delete client",
                    description: "This client has invoices. Please archive or delete their invoices first.",
                    variant: "destructive"
                });
                return;
            }

            await Client.delete(clientId);
            toast({
                title: "✓ Client Deleted",
                description: "Client has been permanently deleted.",
                variant: "default"
            });
            window.location.href = createPageUrl("Clients");
        } catch (error) {
            console.error("Error deleting client:", error);
            toast({
                title: "✗ Error",
                description: "Failed to delete client. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    const safeFormatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        try {
            const date = parseISO(dateStr);
            return isValid(date) ? format(date, 'MMM d, yyyy') : 'N/A';
        } catch {
            return 'N/A';
        }
    };

    // Filter invoices by status
    const filteredInvoices = statusFilter === 'all' 
        ? invoices 
        : invoices.filter(inv => inv.status === statusFilter);
    
    const totalPages = Math.ceil(filteredInvoices.length / INVOICES_PER_PAGE);
    const paginatedInvoices = filteredInvoices.slice(
        (currentPage - 1) * INVOICES_PER_PAGE,
        currentPage * INVOICES_PER_PAGE
    );

    const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const totalPaid = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    // Use partial paid amount as current balance for partial_paid invoices
    const totalOutstanding = invoices.filter(inv => ['sent', 'viewed', 'partial_paid', 'overdue'].includes(inv.status)).reduce((sum, inv) => {
        if (inv.status === 'partial_paid' && inv.payments && inv.payments.length > 0) {
            const totalPaid = inv.payments.reduce((s, p) => s + (p.amount || 0), 0);
            return sum + (inv.total_amount - totalPaid);
        }
        if (inv.status === 'paid') {
            return sum;
        }
        return sum + (inv.total_amount || 0);
    }, 0);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
                <div className="max-w-4xl mx-auto">
                    <Skeleton className="h-8 w-32 mb-6" />
                    <Skeleton className="h-48 w-full mb-6" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        );
    }

    if (!client) {
        return (
            <div className="min-h-screen bg-slate-100 p-4 sm:p-6 flex items-center justify-center">
                <Card className="p-8 text-center max-w-md">
                    <h2 className="text-xl font-semibold mb-2">Client not found</h2>
                    <p className="text-slate-600 mb-6">
                        This client may have been from an older version, or the link is invalid. Open a client from the Clients list.
                    </p>
                    <Link to={createPageUrl("Clients")}>
                        <Button>Back to Clients</Button>
                    </Link>
                </Card>
            </div>
        );
    }

    const userCurrency = user?.currency || client?.currency || 'ZAR';

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-7xl mx-auto">
                <Breadcrumb className="mb-4">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild><Link to={createPageUrl('Clients')}>Clients</Link></BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>{client.name}</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mb-6"
                >
                    <Link to={createPageUrl("Clients")}>
                        <Button variant="ghost" className="gap-2 rounded-xl">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Clients
                        </Button>
                    </Link>
                </motion.div>

                {/* Client Info Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <Card className="bg-white shadow-lg border-0 mb-6">
                        <CardContent className="p-6">
                            <div className="flex items-start justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                                        <UserIcon className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
                                        {client.contact_person && (
                                            <p className="text-slate-600">Contact: {client.contact_person}</p>
                                        )}
                                        <div className="flex gap-2 mt-2">
                                            <ClientSegmentBadge segment={client.segment || 'new'} />
                                            {client.industry && <IndustryBadge industry={client.industry} />}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => setShowEditForm(true)}>
                                        <Edit className="w-4 h-4 mr-2" />
                                        Edit
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="text-red-600 hover:text-red-700"
                                        onClick={() => setShowDeleteConfirm(true)}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="flex items-center gap-2 text-sm">
                                    <Mail className="w-4 h-4 text-slate-400" />
                                    <span className="text-slate-600">{client.email}</span>
                                </div>
                                {client.alternate_email && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Mail className="w-4 h-4 text-slate-400" />
                                        <span className="text-slate-600">{client.alternate_email}</span>
                                    </div>
                                )}
                                {client.phone && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Phone className="w-4 h-4 text-slate-400" />
                                        <span className="text-slate-600">{client.phone}</span>
                                    </div>
                                )}
                                {client.fax && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Smartphone className="w-4 h-4 text-slate-400" />
                                        <span className="text-slate-600">Fax: {client.fax}</span>
                                    </div>
                                )}
                                {client.website && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Globe className="w-4 h-4 text-slate-400" />
                                        <a 
                                            href={client.website} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-700"
                                        >
                                            {client.website.replace(/^https?:\/\//, '')}
                                        </a>
                                    </div>
                                )}
                                {client.address && (
                                    <div className="flex items-start gap-2 text-sm md:col-span-2">
                                        <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                                        <span className="text-slate-600">{client.address}</span>
                                    </div>
                                )}
                                {client.tax_id && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Building2 className="w-4 h-4 text-slate-400" />
                                        <span className="text-slate-600">Tax ID: {client.tax_id}</span>
                                    </div>
                                )}
                            </div>

                            {client.notes && (
                                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                    <div className="flex items-center gap-2 mb-1">
                                        <StickyNote className="w-4 h-4 text-blue-600" />
                                        <p className="text-xs font-semibold text-blue-700 uppercase">Client Notes</p>
                                    </div>
                                    <p className="text-sm text-slate-700">{client.notes}</p>
                                </div>
                            )}

                            {client.internal_notes && (
                                <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-300">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Lock className="w-4 h-4 text-amber-700" />
                                        <p className="text-xs font-semibold text-amber-900 uppercase">Internal Notes (Private)</p>
                                    </div>
                                    <p className="text-sm text-slate-700 whitespace-pre-line">{client.internal_notes}</p>
                                </div>
                            )}

                            {/* Payment Terms */}
                            <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <CreditCard className="w-4 h-4 text-indigo-600" />
                                    <p className="text-xs font-semibold text-indigo-900 uppercase">Default Payment Terms</p>
                                </div>
                                <p className="text-lg font-bold text-indigo-900">
                                    {getPaymentTermsText(client.payment_terms, client.payment_terms_days)}
                                </p>
                                <p className="text-xs text-slate-600 mt-1">Auto-applies to new invoices</p>
                            </div>

                            {/* Summary Stats */}
                            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
                                <div className="text-center">
                                    <p className="text-sm text-slate-500">Total Invoiced</p>
                                    <p className="text-xl font-bold text-slate-900">{formatCurrency(totalInvoiced, userCurrency)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-slate-500">Paid</p>
                                    <p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid, userCurrency)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-slate-500">Outstanding</p>
                                    <p className="text-xl font-bold text-orange-600">{formatCurrency(totalOutstanding, userCurrency)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Invoice History */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-white shadow-lg border-0">
                        <CardHeader className="border-b border-slate-100">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-5 h-5" />
                                    Invoice History
                                    <Badge variant="secondary">{filteredInvoices.length}</Badge>
                                    {statusFilter !== 'all' && (
                                        <span className="text-xs text-slate-500">
                                            of {invoices.length} total
                                        </span>
                                    )}
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    {/* Status Filter */}
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => {
                                            setStatusFilter(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="all">All Invoices</option>
                                        <option value="draft">Draft</option>
                                        <option value="sent">Sent</option>
                                        <option value="viewed">Viewed</option>
                                        <option value="partial_paid">Partially Paid</option>
                                        <option value="paid">Paid</option>
                                        <option value="overdue">Overdue</option>
                                    </select>
                                    
                                    <Link to={createPageUrl("CreateInvoice") + `?client_id=${clientId}`}>
                                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                                            <Plus className="w-4 h-4 mr-2" />
                                            New Invoice
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {invoices.length === 0 ? (
                                <div className="p-8 text-center">
                                    <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                                    <p className="text-slate-600 mb-4">No invoices yet for this client</p>
                                    <Link to={createPageUrl("CreateInvoice") + `?client_id=${clientId}`}>
                                        <Button className="bg-blue-600 hover:bg-blue-700">
                                            <Plus className="w-4 h-4 mr-2" />
                                            Create First Invoice
                                        </Button>
                                    </Link>
                                </div>
                            ) : filteredInvoices.length === 0 ? (
                                <div className="p-8 text-center">
                                    <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                                    <p className="text-slate-600 mb-2">No {statusFilter} invoices found</p>
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => setStatusFilter('all')}
                                        className="mt-2"
                                    >
                                        Show All Invoices
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <div className="divide-y divide-slate-100">
                                        {paginatedInvoices.map((invoice) => (
                                            <Link
                                                key={invoice.id}
                                                to={createPageUrl("ViewInvoice") + `?id=${invoice.id}`}
                                                className="block hover:bg-slate-50 transition-colors"
                                            >
                                                <div className="p-4 flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-1">
                                                            <span className="font-semibold text-slate-900">
                                                                #{invoice.invoice_number}
                                                            </span>
                                                            <Badge className={statusStyles[invoice.status] || statusStyles.draft}>
                                                                {invoice.status?.replace('_', ' ')}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-sm text-slate-600">{invoice.project_title}</p>
                                                        <p className="text-xs text-slate-400 mt-1">
                                                            Due: {safeFormatDate(invoice.delivery_date)}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-slate-900">
                                                            {formatCurrency(invoice.total_amount, userCurrency)}
                                                        </p>
                                                        <p className="text-xs text-slate-400">
                                                            {safeFormatDate(invoice.created_date)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>

                                    {/* Pagination */}
                                    {totalPages > 1 && (
                                        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                                            <p className="text-sm text-slate-500">
                                                Showing {(currentPage - 1) * INVOICES_PER_PAGE + 1} - {Math.min(currentPage * INVOICES_PER_PAGE, filteredInvoices.length)} of {filteredInvoices.length}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    disabled={currentPage === 1}
                                                >
                                                    <ChevronLeft className="w-4 h-4" />
                                                </Button>
                                                <span className="text-sm text-slate-600 px-2">
                                                    Page {currentPage} of {totalPages}
                                                </span>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                    disabled={currentPage === totalPages}
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Edit Form Modal */}
                {showEditForm && (
                    <ClientForm
                        client={client}
                        onSave={handleSaveClient}
                        onCancel={() => setShowEditForm(false)}
                    />
                )}

                <ConfirmationDialog
                    isOpen={showDeleteConfirm}
                    onClose={() => setShowDeleteConfirm(false)}
                    onConfirm={handleDeleteClient}
                    title={`Delete ${client?.name || 'Client'}?`}
                    description="This action cannot be undone. This will permanently delete the client."
                    confirmText="Delete"
                    isConfirming={isDeleting}
                />
            </div>
        </div>
    );
}