import React, { useState, useEffect, useRef, useMemo } from "react";
import { Invoice, Client, BankingDetail, User } from "@/api/entities";
import { useServicesCatalogQuery } from "@/hooks/useServicesCatalogQuery";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, ExternalLink, Send, Save, Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { appendHistory, createHistoryEntry, diffInvoiceFields } from "@/utils/invoiceHistory";
import { logInvoiceUpdated, logStatusChanged } from "@/utils/auditLogger";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { DEFAULT_INVOICE_TERMS_BODY } from "@/constants/invoiceTerms";
import { snapshotDocumentBrandForPersist } from "@/utils/documentBrandColors";

import ProjectDetails from "../components/invoice/ProjectDetails";
import { Skeleton } from "@/components/ui/skeleton";
import { sendInvoiceToClient } from "@/services/InvoiceSendService";
import InvoiceStatusBadge from "../components/invoice/InvoiceStatusBadge";
import { canEditInvoice } from "@/logic";
import { formatCurrency } from "@/utils/currencyCalculations";
import { Separator } from "@/components/ui/separator";

export default function EditInvoice() {
    const navigate = useNavigate();
    const location = useLocation();
    const { toast } = useToast();
    const [invoiceId, setInvoiceId] = useState(null);
    const [clients, setClients] = useState([]);
    const [bankingDetails, setBankingDetails] = useState([]);
    const { data: services = [], refetch: refetchCatalog } = useServicesCatalogQuery();
    const [isLoading, setIsLoading] = useState(true);
    const [invoiceData, setInvoiceData] = useState(null);
    const [originalStatus, setOriginalStatus] = useState(null);
    const [originalInvoiceData, setOriginalInvoiceData] = useState(null);
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
            const [invoice, clientsData, bankingData] = await withTimeoutRetry(
                () =>
                    Promise.all([
                        Invoice.get(id),
                        Client.list("-created_date"),
                        BankingDetail.list("-created_date"),
                    ]),
                15000,
                2
            );
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
                    title: "Cannot edit this invoice",
                    description: `This invoice is ${invoice.status?.replace('_', ' ')} and cannot be edited. Open the read-only view instead.`,
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

            const meForBrand = await User.me().catch(() => null);
            const brandPatch = meForBrand ? snapshotDocumentBrandForPersist(meForBrand) : {};
            await Invoice.update(invoiceId, { ...updatedInvoiceData, ...brandPatch });

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

            let emailSendFailed = false;
            if (originalStatus === 'draft' && newStatus === 'sent') {
                try {
                    await sendInvoiceToClient(invoiceId);
                } catch (sendError) {
                    console.error('Error sending invoice:', sendError);
                    emailSendFailed = true;
                }
            }

            if (emailSendFailed) {
                toast({
                    title: 'Invoice saved and marked sent',
                    description: `Invoice ${invoiceData.invoice_number} was updated, but the client email could not be sent. Use Open preview to resend from the invoice view, or try again.`,
                    variant: 'destructive',
                    duration: 10000,
                });
                const merged = { ...invoiceData, ...updatedInvoiceData };
                setInvoiceData(merged);
                setOriginalInvoiceData(merged);
                setOriginalStatus(newStatus);
                return;
            }

            toast({
                title: newStatus === 'draft' ? 'Draft saved' : 'Invoice updated',
                description:
                    newStatus === 'sent' && originalStatus === 'draft'
                        ? `Invoice ${invoiceData.invoice_number} was sent to the client.`
                        : `Invoice ${invoiceData.invoice_number} was updated successfully.`,
                variant: 'success',
            });

            setTimeout(() => {
                navigate(createPageUrl("Invoices"));
            }, 1500);
        } catch (error) {
            console.error("Error updating invoice:", error);
            toast({
                title: 'Could not save invoice',
                description: error?.message || 'Something went wrong. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const client = useMemo(
        () => (invoiceData ? clients.find((c) => c.id === invoiceData.client_id) : null),
        [clients, invoiceData]
    );

    const ownerCurrency = String(invoiceData?.owner_currency || invoiceData?.currency || "ZAR").trim() || "ZAR";

    const formIsComplete = useMemo(() => {
        if (!invoiceData) return false;
        const items = invoiceData.items || [];
        return (
            Boolean(invoiceData.client_id) &&
            Boolean(String(invoiceData.project_title || "").trim()) &&
            items.length > 0 &&
            items.every(
                (item) =>
                    String(item.service_name || "").trim() &&
                    Number(item.quantity) > 0 &&
                    Number(item.unit_price) >= 0
            ) &&
            Boolean(invoiceData.invoice_date) &&
            Boolean(invoiceData.delivery_date)
        );
    }, [invoiceData]);

    if (isLoading || !invoiceData) {
        return (
            <div className="min-h-screen bg-background p-4 sm:p-6">
                <div className="mx-auto max-w-6xl space-y-6">
                    <Skeleton className="h-10 w-48 bg-muted" />
                    <Skeleton className="h-4 w-full max-w-xl bg-muted" />
                    <div className="grid gap-6 lg:grid-cols-3">
                        <Skeleton className="h-96 bg-muted lg:col-span-2" />
                        <Skeleton className="h-72 bg-muted" />
                    </div>
                </div>
            </div>
        );
    }

    const isDraft = String(invoiceData.status || "").toLowerCase() === "draft";

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 flex flex-wrap items-start gap-4"
                >
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(createPageUrl("Invoices"))}
                        className="shrink-0 rounded-lg border border-border/60 text-muted-foreground hover:bg-muted/50"
                        aria-label="Back to invoices"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                                Edit invoice
                                <span className="text-muted-foreground font-normal"> #{invoiceData.invoice_number}</span>
                            </h1>
                            <InvoiceStatusBadge status={invoiceData.status || "draft"} />
                        </div>
                        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            {client?.name ? (
                                <span className="font-medium text-foreground/90">{client.name}</span>
                            ) : (
                                <span>No client selected</span>
                            )}
                            <span className="hidden text-border sm:inline" aria-hidden>
                                ·
                            </span>
                            <span>
                                Due{" "}
                                {invoiceData.delivery_date
                                    ? new Date(invoiceData.delivery_date).toLocaleDateString(undefined, {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                      })
                                    : "—"}
                            </span>
                            <span className="hidden text-border sm:inline" aria-hidden>
                                ·
                            </span>
                            <span>{(invoiceData.items || []).length} line items</span>
                            <span className="hidden text-border sm:inline" aria-hidden>
                                ·
                            </span>
                            <span className="tabular-nums">{formatCurrency(invoiceData.total_amount || 0, ownerCurrency)}</span>
                        </p>
                    </div>
                </motion.div>

                {isDraft ? (
                    <div className="mb-6 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <span>Draft — not sent yet. Save anytime, or send when the invoice is ready.</span>
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
                    <aside className="order-1 space-y-4 lg:order-2 lg:col-span-1">
                        <div className="lg:sticky lg:top-6 space-y-4 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm backdrop-blur-sm sm:p-5">
                            <div>
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</h2>
                                <Separator className="my-3 bg-border/60" decorative />
                                <dl className="space-y-2.5 text-sm">
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Subtotal</dt>
                                        <dd className="tabular-nums font-medium">{formatCurrency(invoiceData.subtotal || 0, ownerCurrency)}</dd>
                                    </div>
                                    {(invoiceData.discount_value || 0) > 0 ? (
                                        <div className="flex justify-between gap-3">
                                            <dt className="text-muted-foreground">
                                                Discount
                                                {invoiceData.discount_type === "percentage"
                                                    ? ` (${invoiceData.discount_value}%)`
                                                    : ""}
                                            </dt>
                                            <dd className="tabular-nums font-medium text-amber-600 dark:text-amber-400">
                                                −{formatCurrency(invoiceData.discount_amount || 0, ownerCurrency)}
                                            </dd>
                                        </div>
                                    ) : null}
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Tax</dt>
                                        <dd className="tabular-nums font-medium">{formatCurrency(invoiceData.tax_amount || 0, ownerCurrency)}</dd>
                                    </div>
                                </dl>
                                <Separator className="my-4 bg-border/60" decorative />
                                <div className="flex items-end justify-between gap-3">
                                    <span className="text-sm font-medium text-muted-foreground">Total</span>
                                    <span
                                        className="text-right text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl"
                                        style={{ fontFeatureSettings: '"tnum"' }}
                                    >
                                        {formatCurrency(invoiceData.total_amount || 0, ownerCurrency)}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 pt-1">
                                {isDraft ? (
                                    <>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="w-full justify-center gap-2"
                                            disabled={isSaving || !formIsComplete}
                                            onClick={() => handleUpdateInvoice(true)}
                                        >
                                            {isSaving ? (
                                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                            ) : (
                                                <Save className="h-4 w-4" aria-hidden />
                                            )}
                                            Save draft
                                        </Button>
                                        <Button
                                            type="button"
                                            className="w-full justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                                            disabled={isSaving || !formIsComplete}
                                            onClick={() => handleUpdateInvoice(false)}
                                        >
                                            {isSaving ? (
                                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                            ) : (
                                                <Send className="h-4 w-4" aria-hidden />
                                            )}
                                            Send invoice
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        type="button"
                                        className="w-full justify-center gap-2"
                                        disabled={isSaving || !formIsComplete}
                                        onClick={() => handleUpdateInvoice()}
                                    >
                                        {isSaving ? (
                                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                        ) : (
                                            <Save className="h-4 w-4" aria-hidden />
                                        )}
                                        Save changes
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-center gap-2 border-border/80"
                                    disabled={isSaving}
                                    onClick={() =>
                                        navigate(
                                            `${createPageUrl("ViewInvoice")}?id=${encodeURIComponent(invoiceId)}`
                                        )
                                    }
                                >
                                    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                                    Open preview
                                </Button>
                            </div>
                            {!formIsComplete ? (
                                <p className="text-center text-[11px] text-muted-foreground">Complete client, dates, and line items to save.</p>
                            ) : null}
                        </div>
                    </aside>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="order-2 min-w-0 lg:order-1 lg:col-span-2"
                    >
                        <ProjectDetails
                            invoiceData={invoiceData}
                            setInvoiceData={setInvoiceData}
                            clients={clients}
                            setClients={setClients}
                            bankingDetails={bankingDetails}
                            setBankingDetails={setBankingDetails}
                            services={services}
                            onNext={() => {}}
                            onRefreshCatalog={refetchCatalog}
                            showNextButton={false}
                            isEditorLayout
                        />
                    </motion.div>
                </div>
            </div>
        </div>
    );
}