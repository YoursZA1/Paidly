import React, { useState, useEffect } from 'react';
import { RecurringInvoice, Client } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, Repeat, AlertCircle, CheckCircle, Loader2, LayoutGrid, List, Zap, BarChart3, ArrowLeft } from 'lucide-react';
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
    ended: "bg-slate-100 text-slate-700",
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

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
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
                        <h1 className="text-2xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <Zap className="w-6 h-6 text-blue-600" />
                            Recurring Invoices
                        </h1>
                        <p className="text-gray-600">Manage automated invoice templates and schedules.</p>
                    </div>
                    <div className="flex gap-2">
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
                            className="bg-blue-600 hover:bg-blue-700"
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
                        className={`p-4 mb-6 rounded-lg flex items-center gap-3 ${generationResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
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
                    <Card className="border-dashed">
                        <CardContent className="pt-12 pb-12">
                            <div className="text-center">
                                <Repeat className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold text-gray-600 mb-2">No Recurring Invoices</h3>
                                <p className="text-gray-500 mb-6">Create your first recurring invoice template to automate your billing.</p>
                                <Button
                                    onClick={() => setIsCreateDialogOpen(true)}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Create Template
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
                                                <div className="h-6 bg-gray-200 rounded w-3/4" />
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-2">
                                                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                                                    <div className="h-4 bg-gray-200 rounded" />
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
                            <Zap className="w-5 h-5 text-blue-600" />
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