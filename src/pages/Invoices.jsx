import React, { useState, useEffect } from "react";
import { Invoice, Client, User, Payment } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, LayoutGrid, List, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import InvoiceList from "../components/invoice/InvoiceList";
import InvoiceGrid from "../components/invoice/InvoiceGrid";
import InvoiceFilters, { applyInvoiceFilters } from "../components/filters/InvoiceFilters";
import { getAutoStatusUpdate } from "@/utils/invoiceStatus";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState([]);
    const [clients, setClients] = useState([]);
    const [user, setUser] = useState(null);
    const [filters, setFilters] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState('list');
    const [paymentsMap, setPaymentsMap] = useState(new Map());
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [invoicesData, clientsData, userData, paymentsData] = await Promise.all([
                Invoice.list("-created_date"),
                Client.list(),
                User.me(),
                Payment.list()
            ]);
            const updates = invoicesData
                .map((inv) => ({ inv, update: getAutoStatusUpdate(inv) }))
                .filter(({ update }) => update);

            if (updates.length > 0) {
                await Promise.all(
                    updates.map(({ inv, update }) => Invoice.update(inv.id, update))
                );
                const updatedMap = new Map(updates.map(({ inv, update }) => [inv.id, update]));
                setInvoices(
                    invoicesData.map((inv) => ({ ...inv, ...(updatedMap.get(inv.id) || {}) }))
                );
            } else {
                setInvoices(invoicesData);
            }

            // Group payments by invoice_id
            const paymentsByInvoice = new Map();
            paymentsData.forEach(payment => {
                if (!paymentsByInvoice.has(payment.invoice_id)) {
                    paymentsByInvoice.set(payment.invoice_id, []);
                }
                paymentsByInvoice.get(payment.invoice_id).push(payment);
            });
            setPaymentsMap(paymentsByInvoice);

            setClients(clientsData);
            setUser(userData);
        } catch (error) {
            console.error("Error loading data:", error);
        }
        setIsLoading(false);
    };

    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    };

    const userCurrency = user?.currency || 'ZAR';

    const filteredInvoices = applyInvoiceFilters(invoices, filters, getClientName);
    
    // Pagination logic
    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
    const paginatedInvoices = filteredInvoices.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filters]);

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                            All Invoices
                        </h1>
                        <p className="text-gray-600">
                            Track, manage, and download all your invoices.
                        </p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <div className="flex bg-white p-1 rounded-lg border shadow-sm h-10">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('grid')}
                                className={`h-8 w-8 rounded-md ${viewMode === 'grid' ? 'bg-slate-100 text-blue-600' : 'text-slate-400'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('list')}
                                className={`h-8 w-8 rounded-md ${viewMode === 'list' ? 'bg-slate-100 text-blue-600' : 'text-slate-400'}`}
                            >
                                <List className="w-4 h-4" />
                            </Button>
                        </div>
                        <Link to={createPageUrl("CreateInvoice")} className="flex-1 sm:flex-none">
                            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 w-full sm:w-auto">
                                <Plus className="w-4 h-4 mr-2" />
                                Create New Invoice
                            </Button>
                        </Link>
                    </div>
                </motion.div>

                <Card className="bg-white border border-gray-200">
                    <CardHeader>
                        <div className="space-y-4">
                            <CardTitle>Invoice List</CardTitle>
                            <InvoiceFilters 
                                onFilterChange={setFilters} 
                                clients={clients}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                        {isLoading ? (
                             viewMode === 'list' ? (
                                <InvoiceList isLoading={true} />
                             ) : (
                                <InvoiceGrid isLoading={true} />
                             )
                        ) : filteredInvoices.length === 0 ? (
                            <div className="text-center py-12">
                                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                                <h3 className="mt-2 text-sm font-medium text-gray-900">No invoices found</h3>
                                <p className="mt-1 text-sm text-gray-500">Create your first invoice to see it here.</p>
                                <div className="mt-6">
                                    <Link to={createPageUrl("CreateInvoice")}>
                                        <Button>
                                            <Plus className="-ml-1 mr-2 h-5 w-5" />
                                            New Invoice
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <>
                                {viewMode === 'list' ? (
                                    <InvoiceList 
                                        invoices={paginatedInvoices} 
                                        clients={clients} 
                                        userCurrency={userCurrency}
                                        paymentsMap={paymentsMap}
                                        onActionSuccess={loadData}
                                    />
                                ) : (
                                    <InvoiceGrid 
                                        invoices={paginatedInvoices} 
                                        clients={clients} 
                                        userCurrency={userCurrency}
                                        paymentsMap={paymentsMap}
                                        onActionSuccess={loadData}
                                    />
                                )}
                                
                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-slate-600">Show</span>
                                            <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                                                <SelectTrigger className="w-[70px] h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="10">10</SelectItem>
                                                    <SelectItem value="25">25</SelectItem>
                                                    <SelectItem value="50">50</SelectItem>
                                                    <SelectItem value="100">100</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span className="text-sm text-slate-600">
                                                of {filteredInvoices.length} invoices
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                            >
                                                <ChevronLeft className="w-4 h-4 mr-1" />
                                                Previous
                                            </Button>
                                            
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                    let pageNum;
                                                    if (totalPages <= 5) {
                                                        pageNum = i + 1;
                                                    } else if (currentPage <= 3) {
                                                        pageNum = i + 1;
                                                    } else if (currentPage >= totalPages - 2) {
                                                        pageNum = totalPages - 4 + i;
                                                    } else {
                                                        pageNum = currentPage - 2 + i;
                                                    }
                                                    return (
                                                        <Button
                                                            key={i}
                                                            variant={currentPage === pageNum ? "default" : "outline"}
                                                            size="sm"
                                                            onClick={() => setCurrentPage(pageNum)}
                                                            className="w-9 h-9"
                                                        >
                                                            {pageNum}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                            
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                            >
                                                Next
                                                <ChevronRight className="w-4 h-4 ml-1" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}