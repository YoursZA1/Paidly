import React, { useState, useEffect, useRef } from 'react';
import { RecurringInvoice, Client } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, Repeat, AlertCircle, CheckCircle, Loader2, LayoutGrid, List, Zap, BarChart3, ArrowLeft, Download, Upload } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { recurringInvoicesToCsv, parseRecurringInvoiceCsv, csvRowToRecurringInvoicePayload } from '@/utils/recurringInvoiceCsvMapping';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RecurringInvoiceService } from '../services/RecurringInvoiceService';
import CreateRecurringInvoice from '../components/recurring/CreateRecurringInvoice';
import RecurringInvoiceCard from '../components/recurring/RecurringInvoiceCard';
import RecurringInvoiceAnalytics from '../components/recurring/RecurringInvoiceAnalytics';
import RecurringInvoiceAutoGenerationTester_UI from '../components/recurring/RecurringInvoiceAutoGenerationTester_UI';
import RecurringInvoiceCycleHistory from '../components/recurring/RecurringInvoiceCycleHistory';

const statusStyles = {
    active: "bg-emerald-100 text-emerald-700",
    paused: "bg-amber-100 text-amber-700",
    ended: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
};

export default function RecurringInvoices() {
    const navigate = useNavigate();
    const [recurringInvoices, setRecurringInvoices] = useState([]);
    const [clients, setClients] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationResult, setGenerationResult] = useState(null);
    const [viewMode, setViewMode] = useState('cards');
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [selectedInvoiceForEdit, setSelectedInvoiceForEdit] = useState(null);
    const [selectedInvoiceForHistory, setSelectedInvoiceForHistory] = useState(null);
    const [isCycleHistoryOpen, setIsCycleHistoryOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const recurringFileInputRef = useRef(null);
    const { toast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [invoicesData, clientsData] = await Promise.all([
                RecurringInvoice.list("-created_date"),
                Client.list(),
            ]);
            setRecurringInvoices(invoicesData || []);
            setClients(clientsData || []);
        } catch (error) {
            console.error("Error loading data:", error);
        }
        setIsLoading(false);
    };

    const getClientName = (clientId) => {
        return clients.find(c => c.id === clientId)?.name || "N/A";
    };

    const handleGenerateDue = async () => {
        setIsGenerating(true);
        setGenerationResult(null);
        try {
            const generated = await RecurringInvoiceService.checkAndGenerateDueInvoices();
            setGenerationResult({ success: true, count: generated.length });
            await loadData(); // Refresh the list to show updated next_generation_date
        } catch (error) {
            console.error("Error generating invoices:", error);
            setGenerationResult({ success: false, error: "Failed to generate invoices." });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCreateSuccess = () => {
        setIsCreateDialogOpen(false);
        loadData();
    };

    const handleRefreshCard = () => {
        loadData();
    };

    const handleViewCycleHistory = (invoice) => {
        setSelectedInvoiceForHistory(invoice);
        setIsCycleHistoryOpen(true);
    };

    const handleExportRecurringInvoices = () => {
        if (recurringInvoices.length === 0) {
            toast({ title: 'No recurring invoices to export', variant: 'destructive' });
            return;
        }
        try {
            const csvContent = recurringInvoicesToCsv(recurringInvoices);
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `RecurringInvoice_export_${Date.now()}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: 'Export complete', description: `${recurringInvoices.length} recurring invoice(s) exported.`, variant: 'default' });
        } catch (error) {
            console.error('Export recurring invoices error:', error);
            toast({ title: 'Export failed', description: error?.message || 'Failed to export.', variant: 'destructive' });
        }
    };

    const handleImportRecurringInvoices = () => recurringFileInputRef.current?.click();

    const handleImportRecurringInvoicesFile = async (e) => {
        const file = e.target?.files?.[0];
        e.target.value = '';
        if (!file) return;
        setIsImporting(true);
        try {
            const text = await file.text();
            const { headers, rows } = parseRecurringInvoiceCsv(text);
            let created = 0;
            let skipped = 0;
            for (const row of rows) {
                const payload = csvRowToRecurringInvoicePayload(headers, row);
                if (!payload) {
                    skipped++;
                    continue;
                }
                try {
                    await RecurringInvoice.create(payload);
                    created++;
                } catch (err) {
                    console.warn('Import recurring invoice row failed:', payload.profile_name, err);
                    skipped++;
                }
            }
            await loadData();
            toast({
                title: 'Import complete',
                description: `${created} recurring invoice(s) imported${skipped ? `, ${skipped} skipped.` : '.'}`,
                variant: 'default',
            });
        } catch (error) {
            console.error('Import recurring invoices error:', error);
            toast({ title: 'Import failed', description: error?.message || 'Could not parse CSV.', variant: 'destructive' });
        }
        setIsImporting(false);
    };

    return (
        <div className="min-h-screen bg-background p-4 sm:p-6">
            <CreateRecurringInvoice
                isOpen={isCreateDialogOpen}
                onClose={() => setIsCreateDialogOpen(false)}
                onSuccess={handleCreateSuccess}
            />

            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-2 flex items-center gap-2 font-display">
                            <Zap className="w-6 h-6 text-primary" />
                            Recurring Invoices
                        </h1>
                        <p className="text-muted-foreground">Manage automated invoice templates and schedules.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="file"
                            ref={recurringFileInputRef}
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportRecurringInvoicesFile}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleImportRecurringInvoices}
                            disabled={isImporting}
                        >
                            <Upload className={`w-4 h-4 mr-2 ${isImporting ? 'animate-pulse' : ''}`} />
                            {isImporting ? 'Importing…' : 'Import CSV'}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportRecurringInvoices}
                            disabled={recurringInvoices.length === 0}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                        </Button>
                        <Button
                            onClick={handleGenerateDue}
                            disabled={isGenerating}
                            variant="outline"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Generate Due
                                </>
                            )}
                        </Button>
                        <Button
                            onClick={() => setIsCreateDialogOpen(true)}
                            className="bg-primary hover:bg-primary/90"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Template
                        </Button>
                    </div>
                </motion.div>

                {generationResult && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 mb-6 rounded-lg flex items-center gap-3 ${generationResult.success ? 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-200' : 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-200'}`}
                    >
                        {generationResult.success ? <CheckCircle className="w-5 h-5"/> : <AlertCircle className="w-5 h-5"/>}
                        <p>
                            {generationResult.success 
                                ? `${generationResult.count} invoice(s) generated successfully.`
                                : `Error: ${generationResult.error}`
                            }
                        </p>
                    </motion.div>
                )}

                {recurringInvoices.length === 0 && !isLoading ? (
                    <Card className="border-dashed border-border">
                        <CardContent className="pt-12 pb-12">
                            <div className="text-center">
                                <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <Repeat className="w-7 h-7 text-muted-foreground" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground mb-2 font-display">No recurring invoices yet</h3>
                                <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">Set up a template once and we’ll generate invoices automatically. Supports ZAR and all major currencies.</p>
                                <Button
                                    onClick={() => setIsCreateDialogOpen(true)}
                                    className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Create your first template
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Tabs defaultValue="templates" className="space-y-6">
                        <TabsList className="grid w-full max-w-md grid-cols-3">
                            <TabsTrigger value="templates" className="flex items-center gap-2">
                                <Zap className="w-4 h-4" />
                                Templates
                            </TabsTrigger>
                            <TabsTrigger value="analytics" className="flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" />
                                Analytics
                            </TabsTrigger>
                            <TabsTrigger value="testing" className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                Testing
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="templates" className="space-y-6">
                            {isLoading ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {[...Array(3)].map((_, idx) => (
                                        <Card key={idx}>
                                            <CardHeader>
                                                <div className="h-6 bg-muted rounded w-3/4" />
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-2">
                                                    <div className="h-4 bg-muted rounded w-1/2" />
                                                    <div className="h-4 bg-muted rounded" />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <>
                                    {/* Active Templates */}
                                    {recurringInvoices.some(ri => ri.status === 'active') && (
                                        <div className="space-y-4">
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                                    Active Templates
                                                </h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {recurringInvoices
                                                        .filter(ri => ri.status === 'active')
                                                        .map(ri => (
                                                            <RecurringInvoiceCard
                                                                key={ri.id}
                                                                recurringInvoice={ri}
                                                                clientName={getClientName(ri.client_id)}
                                                                onEdit={(invoice) => {
                                                                    navigate(createPageUrl("edit-recurring-invoice") + `?id=${invoice.id}`);
                                                                }}
                                                                onViewCycleHistory={handleViewCycleHistory}
                                                                onRefresh={handleRefreshCard}
                                                            />
                                                        ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Paused Templates */}
                                    {recurringInvoices.some(ri => ri.status === 'paused') && (
                                        <div className="space-y-4">
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                                    <AlertCircle className="w-5 h-5 text-amber-600" />
                                                    Paused Templates
                                                </h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {recurringInvoices
                                                        .filter(ri => ri.status === 'paused')
                                                        .map(ri => (
                                                            <RecurringInvoiceCard
                                                                key={ri.id}
                                                                recurringInvoice={ri}
                                                                clientName={getClientName(ri.client_id)}
                                                                onEdit={(invoice) => {
                                                                    navigate(createPageUrl("edit-recurring-invoice") + `?id=${invoice.id}`);
                                                                }}
                                                                onViewCycleHistory={handleViewCycleHistory}
                                                                onRefresh={handleRefreshCard}
                                                            />
                                                        ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Ended Templates */}
                                    {recurringInvoices.some(ri => ri.status === 'ended') && (
                                        <div className="space-y-4">
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                                    <AlertCircle className="w-5 h-5 text-gray-600" />
                                                    Ended Templates
                                                </h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {recurringInvoices
                                                        .filter(ri => ri.status === 'ended')
                                                        .map(ri => (
                                                            <RecurringInvoiceCard
                                                                key={ri.id}
                                                                recurringInvoice={ri}
                                                                clientName={getClientName(ri.client_id)}
                                                                onEdit={(invoice) => {
                                                                    navigate(createPageUrl("edit-recurring-invoice") + `?id=${invoice.id}`);
                                                                }}
                                                                onViewCycleHistory={handleViewCycleHistory}
                                                                onRefresh={handleRefreshCard}
                                                            />
                                                        ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </TabsContent>

                        <TabsContent value="analytics">
                            <RecurringInvoiceAnalytics recurringInvoices={recurringInvoices} />
                        </TabsContent>

                        <TabsContent value="testing">
                            <RecurringInvoiceAutoGenerationTester_UI />
                        </TabsContent>
                    </Tabs>
                )}
            </div>

            {/* Cycle History Dialog */}
            <Dialog open={isCycleHistoryOpen} onOpenChange={setIsCycleHistoryOpen}>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-primary" />
                            Cycle History: {selectedInvoiceForHistory?.template_name}
                        </DialogTitle>
                        <DialogDescription>
                            Track all invoices generated from this recurring template
                        </DialogDescription>
                    </DialogHeader>
                    {selectedInvoiceForHistory && (
                        <RecurringInvoiceCycleHistory 
                            recurringInvoiceId={selectedInvoiceForHistory.id} 
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}