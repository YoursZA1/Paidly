import React, { useState, useEffect, useRef } from "react";
import { Invoice, Client, BankingDetail, User } from "@/api/entities";
import { useServicesCatalogQuery } from "@/hooks/useServicesCatalogQuery";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { appendHistory, createHistoryEntry, diffInvoiceFields } from "@/utils/invoiceHistory";
import { logInvoiceUpdated, logStatusChanged } from "@/utils/auditLogger";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { DEFAULT_INVOICE_TERMS_BODY } from "@/constants/invoiceTerms";

import ProjectDetails from "../components/invoice/ProjectDetails";
import PaymentBreakdown from "../components/invoice/PaymentBreakdown";
import InvoicePreview from "../components/invoice/InvoicePreview";
import DraftInvoiceInfo from "../components/invoice/DraftInvoiceInfo";
import { Skeleton } from "@/components/ui/skeleton";
import { sendInvoiceToClient } from "@/services/InvoiceSendService";
import InvoiceStatusBadge from "../components/invoice/InvoiceStatusBadge";
import { canEditInvoice } from "@/logic";

export default function EditInvoice() {
    const navigate = useNavigate();
    const location = useLocation();
    const { toast } = useToast();
    const [invoiceId, setInvoiceId] = useState(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [clients, setClients] = useState([]);
    const [bankingDetails, setBankingDetails] = useState([]);
    const { data: services = [], refetch: refetchCatalog } = useServicesCatalogQuery();
    const [isLoading, setIsLoading] = useState(true);
    const [invoiceData, setInvoiceData] = useState(null);
    const [originalStatus, setOriginalStatus] = useState(null);
    const [originalInvoiceData, setOriginalInvoiceData] = useState(null);
    const [user, setUser] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        const params = new URLSearchParams(location.search);
        const id = params.get('id');
        if (id) {
            setInvoiceId(id);
            loadInitialData(id);
        } else {
            navigate(createPageUrl("Invoices"));
        }
        return () => { mountedRef.current = false; };
    }, [location]);
    
    const loadInitialData = async (id) => {
        setIsLoading(true);
        try {
            const [invoice, clientsData, bankingData, userData] = await withTimeoutRetry(() => Promise.all([
                Invoice.get(id),
                Client.list("-created_date"),
                BankingDetail.list("-created_date"),
                User.me().catch(() => null)
            ]), 15000, 2);
            if (!mountedRef.current) return;

            // Ensure invoice_date is set from created_date if not present
            const invoiceWithDate = {
                ...invoice,
                invoice_date: invoice.invoice_date || invoice.created_date || new Date().toISOString().split('T')[0],
                terms_conditions: (invoice.terms_conditions || "").trim()
                    ? invoice.terms_conditions
                    : DEFAULT_INVOICE_TERMS_BODY,
            };
            
            // Restrict editing for paid, partially paid, or cancelled invoices
            if (!canEditInvoice(invoice)) {
                toast({
                    title: "⚠️ Cannot Edit Invoice",
                    description: `This invoice is ${invoice.status?.replace('_', ' ')} and cannot be edited. View the invoice instead.`,
                    variant: "destructive",
                    duration: 5000
                });
                navigate(createPageUrl("ViewInvoice") + `?id=${id}`);
                return;
            }
            
            setInvoiceData(invoiceWithDate);
            setOriginalStatus(invoice.status);
            setOriginalInvoiceData(invoiceWithDate);
            setClients(clientsData);
            setBankingDetails(bankingData);
            setUser(userData || null);
        } catch (error) {
            if (!mountedRef.current) return;
            console.error("Error loading data:", error);
            navigate(createPageUrl("Invoices"));
        } finally {
            if (mountedRef.current) setIsLoading(false);
        }
    };

    const calculatePayments = (totalAmount) => {
        const upfront = totalAmount * 0.5;
        const remaining = totalAmount - upfront;
        const milestone = remaining * 0.5;
        const final = remaining * 0.5;
        
        return { upfront, milestone, final };
    };

    const handleNext = () => {
        if (currentStep < 3) setCurrentStep(currentStep + 1);
    };

    const handlePrevious = () => {
        if (currentStep > 1) setCurrentStep(currentStep - 1);
    };

    const handleUpdateInvoice = async (saveAsDraft = null) => {
        setIsSaving(true);
        try {
            const payments = calculatePayments(invoiceData.total_amount);
            const invoiceDate = new Date(invoiceData.invoice_date || invoiceData.created_date);
            const deliveryDate = new Date(invoiceData.delivery_date);
            const milestoneDate = new Date(deliveryDate);
            milestoneDate.setDate(milestoneDate.getDate() - 30);
            const finalDate = new Date(deliveryDate);
            finalDate.setDate(finalDate.getDate() + 30);

            // Determine the status based on saveAsDraft parameter
            let newStatus = invoiceData.status;
            if (saveAsDraft !== null) {
                newStatus = saveAsDraft ? 'draft' : 'sent';
            }

            const trackedFields = [
                'client_id',
                'project_title',
                'project_description',
                'items',
                'subtotal',
                'tax_rate',
                'tax_amount',
                'total_amount',
                'invoice_date',
                'delivery_date',
                'delivery_address',
                'banking_detail_id',
                'notes',
                'terms_conditions',
                'status',
                'owner_currency'
            ];

            const updatedInvoiceData = {
                ...invoiceData,
                created_date: invoiceDate.toISOString().split('T')[0],
                upfront_payment: payments.upfront,
                milestone_payment: payments.milestone,
                final_payment: payments.final,
                milestone_date: milestoneDate.toISOString().split('T')[0],
                final_date: finalDate.toISOString().split('T')[0],
                status: newStatus,
                sent_date: (newStatus === 'sent' && originalStatus === 'draft') ? new Date().toISOString() : invoiceData.sent_date,
                last_modified_date: new Date().toISOString(),
            };

            const changes = diffInvoiceFields(originalInvoiceData, updatedInvoiceData, trackedFields);
            const historyEntry = createHistoryEntry({
                action: newStatus === 'draft' ? 'draft_update' : 'update',
                summary: newStatus === 'sent' && originalStatus === 'draft'
                    ? 'Draft updated and sent'
                    : 'Invoice updated',
                changes,
                meta: {
                    fromStatus: originalStatus,
                    toStatus: newStatus,
                },
            });

            updatedInvoiceData.version_history = appendHistory(invoiceData.version_history, historyEntry);
            
            await Invoice.update(invoiceId, updatedInvoiceData);

            // Log the invoice update
            const clientName = clients.find(c => c.id === invoiceData.client_id)?.name || "Unknown";
            const currentUser = await User.me();
            const changesDescription = changes.map(c => `${c.field}: ${c.before} → ${c.after}`).join(', ');
            logInvoiceUpdated(
              invoiceId,
              invoiceData.invoice_number,
              clientName,
              changesDescription || 'Invoice updated',
              currentUser?.id || 'system',
              currentUser?.full_name || 'System'
            );

            // Log status change if status was changed
            if (originalStatus !== newStatus) {
              logStatusChanged(
                invoiceId,
                invoiceData.invoice_number,
                clientName,
                originalStatus,
                newStatus,
                currentUser?.id || 'system',
                currentUser?.full_name || 'System'
              );
            }

            // Send email if converting from draft to sent
            if (originalStatus === 'draft' && newStatus === 'sent') {
                try {
                    await sendInvoiceToClient(invoiceId);
                } catch (sendError) {
                    console.error('Error sending invoice:', sendError);
                }
            }

            toast({
                title: newStatus === 'draft' ? "✓ Draft Updated" : "✓ Invoice Updated",
                description: newStatus === 'sent' && originalStatus === 'draft'
                    ? `Invoice ${invoiceData.invoice_number} has been sent to client.`
                    : `Invoice ${invoiceData.invoice_number} has been updated successfully.`,
                variant: "success"
            });

            setTimeout(() => {
                navigate(createPageUrl("Invoices"));
            }, 1500);
        } catch (error) {
            console.error("Error updating invoice:", error);
            toast({
                title: "✗ Error",
                description: "Failed to update invoice. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };

    const steps = [
        { number: 1, title: "Project Details", description: "Services, items, and project information" },
        { number: 2, title: "Payment Breakdown", description: "Review payment schedule" },
        { number: 3, title: "Preview & Save", description: "Final review before saving changes" }
    ];
    
    if (isLoading || !invoiceData) {
        return (
            <div className="min-h-screen bg-slate-100 p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                    <Skeleton className="h-12 w-1/2" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-96 w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4 mb-8"
                >
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => navigate(createPageUrl("Invoices"))}
                        className="rounded-lg border-gray-200 hover:bg-gray-50"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Edit Invoice #{invoiceData.invoice_number}</h1>
                            <InvoiceStatusBadge status={invoiceData.status || 'draft'} />
                        </div>
                        <p className="text-sm sm:text-base text-gray-600 mt-1">Update details for this invoice.</p>
                    </div>
                </motion.div>

                {/* Draft Warning Banner */}
                {invoiceData.status === 'draft' && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Alert className="mb-6 border-primary/20 bg-primary/10">
                            <AlertCircle className="h-4 w-4 text-primary" />
                            <AlertTitle className="text-foreground">Draft Invoice</AlertTitle>
                            <AlertDescription className="text-primary">
                                This invoice is still a draft and hasn't been sent to the client yet. 
                                You can continue editing and send it when ready.
                            </AlertDescription>
                        </Alert>
                    </motion.div>
                )}

                {/* Invoice Info Card */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    className="mb-6"
                >
                    <DraftInvoiceInfo 
                        invoice={invoiceData} 
                        client={clients.find(c => c.id === invoiceData.client_id)} 
                    />
                </motion.div>
                
                {/* Step Content */}
                <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    {currentStep === 1 && (
                        <ProjectDetails
                            invoiceData={invoiceData}
                            setInvoiceData={setInvoiceData}
                            clients={clients}
                            setClients={setClients}
                            bankingDetails={bankingDetails}
                            setBankingDetails={setBankingDetails}
                            services={services}
                            onNext={handleNext}
                            onRefreshCatalog={refetchCatalog}
                        />
                    )}
                    
                    {currentStep === 2 && (
                        <PaymentBreakdown
                            invoiceData={invoiceData}
                            setInvoiceData={setInvoiceData}
                            onNext={handleNext}
                            onPrevious={handlePrevious}
                        />
                    )}
                    
                    {currentStep === 3 && (
                        <InvoicePreview
                            invoiceData={invoiceData}
                            clients={clients}
                            user={user}
                            bankingDetail={bankingDetails?.find(b => b.id === invoiceData?.banking_detail_id) ?? null}
                            onPrevious={handlePrevious}
                            onCreate={handleUpdateInvoice}
                            loading={isSaving}
                        />
                    )}
                </motion.div>
            </div>
        </div>
    );
}