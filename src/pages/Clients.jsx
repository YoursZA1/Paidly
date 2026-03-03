import React, { useState, useEffect, useRef } from "react";
import { Client, User, Invoice } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, Users, Crown, Star, Sparkles, AlertTriangle, RefreshCw, LayoutGrid, List, Download, Filter, X, Trash2, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import ClientCard from "../components/clients/ClientCard";
import ClientList from "../components/clients/ClientList";
import ClientForm from "../components/clients/ClientForm";
import ClientFollowUpService from "../components/clients/ClientFollowUpService";
import ClientFilters, { applyClientFilters } from "../components/filters/ClientFilters";
import { formatCurrency } from "../components/CurrencySelector";
import ConfirmationDialog from "../components/shared/ConfirmationDialog";
import { clientsToCsv, parseCsv, csvRowToClientPayload } from "@/utils/clientCsvMapping";

export default function Clients() {
    const [clients, setClients] = useState([]);
    const [user, setUser] = useState(null);
    const [filters, setFilters] = useState({});
    const [showForm, setShowForm] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingClient, setDeletingClient] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdatingSegments, setIsUpdatingSegments] = useState(false);
    const [viewMode, setViewMode] = useState('grid');
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(24);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastLoadTime, setLastLoadTime] = useState(Date.now());
    const { toast } = useToast();

    // Load clients on mount
    useEffect(() => {
        loadClients();
    }, []);

    // Auto-refresh when page becomes visible (user switches back to tab)
    // Only refresh if page was hidden for more than 5 seconds
    useEffect(() => {
        let hiddenTime = null;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenTime = Date.now();
            } else if (document.visibilityState === 'visible' && !isLoading) {
                // Only refresh if page was hidden for more than 5 seconds
                if (hiddenTime && Date.now() - hiddenTime > 5000) {
                    loadClients(false);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isLoading]);

    // Auto-refresh when window regains focus (only if last load was more than 30 seconds ago)
    useEffect(() => {
        const handleFocus = () => {
            if (!isLoading && Date.now() - lastLoadTime > 30000) {
                loadClients(false);
            }
        };

        window.addEventListener('focus', handleFocus);
        return () => {
            window.removeEventListener('focus', handleFocus);
        };
    }, [isLoading, lastLoadTime]);

    const loadClients = async (showLoadingState = true) => {
        if (showLoadingState) {
            setIsLoading(true);
        } else {
            setIsRefreshing(true);
        }
        try {
            const [clientsData, userData] = await Promise.all([
                Client.list("-created_date"),
                User.me()
            ]);
            setClients(clientsData);
            setUser(userData);
            setLastLoadTime(Date.now());
        } catch (error) {
            console.error("Error loading clients:", error);
            toast({
                title: "Could not load clients",
                description: error?.message || "Please check your connection and try again.",
                variant: "destructive",
            });
        } finally {
            if (showLoadingState) {
                setIsLoading(false);
            } else {
                setIsRefreshing(false);
            }
        }
    };

    const handleRefreshClients = async () => {
        await loadClients(false);
        toast({
            title: "✓ Clients Refreshed",
            description: "Client list has been updated.",
            variant: "success"
        });
    };

    const handleUpdateSegments = async () => {
        setIsUpdatingSegments(true);
        try {
            await ClientFollowUpService.updateClientSegments();
            await loadClients();
            toast({
                title: "✓ Segments Updated",
                description: "Client segments have been updated successfully.",
                variant: "success"
            });
        } catch (error) {
            console.error("Error updating segments:", error);
            toast({
                title: "✗ Error",
                description: "Failed to update segments. Please try again.",
                variant: "destructive"
            });
        }
        setIsUpdatingSegments(false);
    };

    const handleSaveClient = async (clientData) => {
        // Validation
        if (!clientData.name || !clientData.name.trim()) {
            toast({
                title: "✗ Validation Error",
                description: "Client name is required.",
                variant: "destructive"
            });
            return;
        }

        if (!clientData.email || !clientData.email.trim()) {
            toast({
                title: "✗ Validation Error",
                description: "Email address is required.",
                variant: "destructive"
            });
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(clientData.email.trim())) {
            toast({
                title: "✗ Validation Error",
                description: "Please enter a valid email address.",
                variant: "destructive"
            });
            return;
        }

        try {
            if (editingClient) {
                await Client.update(editingClient.id, clientData);
                toast({
                    title: "✓ Client Updated",
                    description: "Client information has been updated successfully.",
                    variant: "success"
                });
            } else {
                const newClient = await Client.create(clientData);
                toast({
                    title: "✓ Client Added",
                    description: `${clientData.name} has been added to your client list.`,
                    variant: "success"
                });
            }
            setShowForm(false);
            setEditingClient(null);
            // Auto-refresh the client list
            await loadClients();
        } catch (error) {
            console.error("Error saving client:", error);
            const errorMessage = error.message || error.toString();
            toast({
                title: "✗ Error",
                description: errorMessage.includes('organization') 
                    ? "No organization found. Please contact support or try logging out and back in."
                    : errorMessage.includes('permission') || errorMessage.includes('RLS')
                    ? "Permission denied. Please check your account permissions."
                    : errorMessage.includes('column') || errorMessage.includes('does not exist')
                    ? "Database schema mismatch. In Supabase go to SQL Editor and run: scripts/ensure-clients-schema.sql (or supabase/schema.postgres.sql if the clients table is missing)."
                    : errorMessage.includes('duplicate') || errorMessage.includes('unique')
                    ? "A client with this email already exists."
                    : `Failed to save client: ${errorMessage}`,
                variant: "destructive"
            });
        }
    };

    const handleEditClient = (client) => {
        setEditingClient(client);
        setShowForm(true);
    };

    const handleDeleteRequest = (client) => {
        setDeletingClient(client);
        setShowDeleteConfirm(true);
    };

    const handleDeleteClient = async () => {
        if (!deletingClient) return;
        setIsDeleting(true);
        try {
            const relatedInvoices = await Invoice.filter({ client_id: deletingClient.id });
            if (relatedInvoices && relatedInvoices.length > 0) {
                toast({
                    title: "Cannot delete client",
                    description: "This client has invoices. Please archive or delete their invoices first.",
                    variant: "destructive"
                });
                return;
            }

            await Client.delete(deletingClient.id);
            toast({
                title: "✓ Client Deleted",
                description: "Client has been permanently deleted.",
                variant: "default"
            });
            setShowDeleteConfirm(false);
            setDeletingClient(null);
            loadClients();
        } catch (error) {
            console.error("Error deleting client:", error);
            toast({
                title: "✗ Error",
                description: "Failed to delete client. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsDeleting(false);
        }
    };

    // Filter clients based on search term and filters
    const searchFilteredClients = clients.filter(client => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            client.name?.toLowerCase().includes(term) ||
            client.email?.toLowerCase().includes(term) ||
            client.phone?.toLowerCase().includes(term) ||
            client.contact_person?.toLowerCase().includes(term)
        );
    });

    const filteredClients = applyClientFilters(searchFilteredClients, filters);

    // Pagination logic
    const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
    const paginatedClients = filteredClients.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset to page 1 when search/filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filters]);

    const segmentCounts = {
        vip: clients.filter(c => c.segment === 'vip').length,
        regular: clients.filter(c => c.segment === 'regular').length,
        new: clients.filter(c => c.segment === 'new' || !c.segment).length,
        at_risk: clients.filter(c => c.segment === 'at_risk').length
    };

    const userCurrency = user?.currency || 'ZAR';

    const clientStats = {
        total: clients.length,
        totalSpent: clients.reduce((sum, c) => sum + (c.total_spent || 0), 0),
        averageSpent: clients.length > 0 ? clients.reduce((sum, c) => sum + (c.total_spent || 0), 0) / clients.length : 0
    };

    const handleSegmentClick = (segment) => {
        setFilters(prev => ({
            ...prev,
            segment: prev.segment === segment ? 'all' : segment
        }));
    };

    const handleExportClients = () => {
        try {
            const csvContent = clientsToCsv(filteredClients);
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Client_export_${new Date().getTime()}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: "Export complete", description: `${filteredClients.length} clients exported (Client_export format).`, variant: "default" });
        } catch (error) {
            console.error('Error exporting clients:', error);
            toast({ title: "Export failed", description: error?.message || "Failed to export clients", variant: "destructive" });
        }
    };

    const fileInputRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    const handleImportClients = () => {
        fileInputRef.current?.click();
    };
    const handleImportFile = async (e) => {
        const file = e.target?.files?.[0];
        e.target.value = "";
        if (!file) return;
        setIsImporting(true);
        try {
            const text = await file.text();
            const { headers, rows } = parseCsv(text);
            let created = 0;
            let skipped = 0;
            for (const row of rows) {
                const payload = csvRowToClientPayload(headers, row);
                if (!payload) {
                    skipped++;
                    continue;
                }
                try {
                    await Client.create(payload);
                    created++;
                } catch (err) {
                    console.warn("Import row failed:", payload.name, err);
                    skipped++;
                }
            }
            await loadClients();
            toast({
                title: "Import complete",
                description: `${created} clients imported${skipped ? `, ${skipped} skipped.` : "."}`,
                variant: "default"
            });
        } catch (error) {
            console.error("Import error:", error);
            toast({ title: "Import failed", description: error?.message || "Could not parse CSV.", variant: "destructive" });
        }
        setIsImporting(false);
    };

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6"
                >
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-2 font-display">
                            Clients
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Organize and manage your client relationships.
                        </p>
                    </div>
                    
                    <Button
                        onClick={() => setShowForm(true)}
                        className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add client
                    </Button>
                </motion.div>

                {/* Client Statistics */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.08 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"
                >
                    <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-0 shadow-lg">
                        <CardContent className="p-4">
                            <p className="text-sm text-blue-600 font-medium">Total Clients</p>
                            <p className="text-3xl font-bold text-blue-900">{clientStats.total}</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-0 shadow-lg">
                        <CardContent className="p-4">
                            <p className="text-sm text-green-600 font-medium">Total Revenue</p>
                            <p className="text-3xl font-bold text-green-900">
                                {formatCurrency(clientStats.totalSpent, userCurrency)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 border-0 shadow-lg">
                        <CardContent className="p-4">
                            <p className="text-sm text-purple-600 font-medium">Average Spend</p>
                            <p className="text-3xl font-bold text-purple-900">
                                {formatCurrency(clientStats.averageSpent, userCurrency)}
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Segment Quick Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
                >
                    <Card 
                        className={`cursor-pointer transition-all ${filters.segment === 'vip' ? 'ring-2 ring-amber-500' : ''}`}
                        onClick={() => handleSegmentClick('vip')}
                    >
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                                <Crown className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{segmentCounts.vip}</p>
                                <p className="text-xs text-slate-500">VIP Clients</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card 
                        className={`cursor-pointer transition-all ${filters.segment === 'regular' ? 'ring-2 ring-blue-500' : ''}`}
                        onClick={() => handleSegmentClick('regular')}
                    >
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <Star className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{segmentCounts.regular}</p>
                                <p className="text-xs text-slate-500">Regular</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card 
                        className={`cursor-pointer transition-all ${filters.segment === 'new' ? 'ring-2 ring-green-500' : ''}`}
                        onClick={() => handleSegmentClick('new')}
                    >
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{segmentCounts.new}</p>
                                <p className="text-xs text-slate-500">New Clients</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card 
                        className={`cursor-pointer transition-all ${filters.segment === 'at_risk' ? 'ring-2 ring-red-500' : ''}`}
                        onClick={() => handleSegmentClick('at_risk')}
                    >
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{segmentCounts.at_risk}</p>
                                <p className="text-xs text-slate-500">At Risk</p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Search and Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                    className="flex flex-col gap-4 mb-8"
                >
                    {/* Search Bar */}
                    <div className="flex gap-3">
                        <div className="flex-1 relative">
                            <Input
                                type="text"
                                placeholder="Search by client name, email, phone, or contact person..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-10 pl-4 pr-10 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <Button
                            onClick={() => setShowFilters(!showFilters)}
                            variant="outline"
                            className="h-10 rounded-xl"
                        >
                            <Filter className="w-4 h-4 mr-2" />
                            Filters {Object.keys(filters).length > 0 && `(${Object.keys(filters).length})`}
                        </Button>
                    </div>

                    {/* Advanced Filters */}
                    {showFilters && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
                        >
                            <ClientFilters onFilterChange={setFilters} />
                        </motion.div>
                    )}

                    {/* View Mode and Export */}
                    <div className="flex gap-2 justify-end">
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
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportFile}
                        />
                        <Button
                            onClick={handleImportClients}
                            variant="outline"
                            disabled={isImporting}
                            className="h-10 rounded-xl"
                            title="Import clients from Client_export.csv format"
                        >
                            <Upload className={`w-4 h-4 mr-2 ${isImporting ? 'animate-pulse' : ''}`} />
                            {isImporting ? "Importing…" : "Import CSV"}
                        </Button>
                        <Button
                            onClick={handleExportClients}
                            variant="outline"
                            disabled={filteredClients.length === 0}
                            className="h-10 rounded-xl"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                        </Button>
                        <Button
                            onClick={handleRefreshClients}
                            variant="outline"
                            disabled={isRefreshing || isLoading}
                            className="h-10 rounded-xl"
                            title="Refresh client list"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button
                            onClick={handleUpdateSegments}
                            variant="outline"
                            disabled={isUpdatingSegments}
                            className="h-10 rounded-xl"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${isUpdatingSegments ? 'animate-spin' : ''}`} />
                            Update Segments
                        </Button>
                    </div>
                </motion.div>

                {/* Client Form Dialog */}
                <Dialog open={showForm} onOpenChange={setShowForm}>
                    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                        <ClientForm
                            client={editingClient}
                            onSave={handleSaveClient}
                            onCancel={() => {
                                setShowForm(false);
                                setEditingClient(null);
                            }}
                        />
                    </DialogContent>
                </Dialog>

                {/* Clients Grid */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                >
                    {isLoading ? (
                        <div className={`grid ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'} gap-6`}>
                            {Array(6).fill(0).map((_, i) => (
                                <Card key={i} className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                                    <CardContent className="p-6">
                                        <div className="animate-pulse space-y-4">
                                            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                                            <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                                            <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <Card className="border-dashed border-border">
                            <CardContent className="p-12 text-center">
                                <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <Users className="w-7 h-7 text-muted-foreground" />
                                </div>
                                <h3 className="text-base font-semibold text-foreground mb-2 font-display">
                                    {searchTerm || Object.keys(filters).length > 0 ? "No clients found" : "No clients yet"}
                                </h3>
                                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                                    {searchTerm
                                        ? `No clients match "${searchTerm}"`
                                        : Object.keys(filters).length > 0
                                        ? "Try adjusting your filters."
                                        : "Add clients to send invoices and quotes. Supports ZAR and all major currencies."
                                    }
                                </p>
                                {!searchTerm && Object.keys(filters).length === 0 && (
                                    <Button
                                        onClick={() => setShowForm(true)}
                                        className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add your first client
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {viewMode === 'grid' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {paginatedClients.map((client, index) => (
                                        <ClientCard
                                            key={client.id}
                                            client={client}
                                            onEdit={handleEditClient}
                                            onDelete={handleDeleteRequest}
                                            delay={index * 0.1}
                                            currency={userCurrency}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <ClientList
                                    clients={paginatedClients}
                                    onEdit={handleEditClient}
                                    onDelete={handleDeleteRequest}
                                    currency={userCurrency}
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
                                                <SelectItem value="12">12</SelectItem>
                                                <SelectItem value="24">24</SelectItem>
                                                <SelectItem value="48">48</SelectItem>
                                                <SelectItem value="96">96</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-sm text-slate-600">
                                            of {filteredClients.length} clients
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
                </motion.div>
            </div>

            <ConfirmationDialog
                isOpen={showDeleteConfirm}
                onClose={() => {
                    setShowDeleteConfirm(false);
                    setDeletingClient(null);
                }}
                onConfirm={handleDeleteClient}
                title={`Delete ${deletingClient?.name || 'Client'}?`}
                description="This action cannot be undone. This will permanently delete the client."
                confirmText="Delete"
                isConfirming={isDeleting}
            />
        </div>
    );
}