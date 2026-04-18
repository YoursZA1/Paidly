import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Quote, Client, User } from "@/api/entities";
import { snapshotDocumentBrandForPersist } from "@/utils/documentBrandColors";
import { useServicesCatalogQuery } from "@/hooks/useServicesCatalogQuery";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Save, Loader2, FileInput, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { createPageUrl, createViewDocumentUrl } from "@/utils";
import { motion } from "framer-motion";
import ProjectDetails from "../components/invoice/ProjectDetails";
import QuoteStatusBadge from "../components/quote/QuoteStatusBadge";
import { useToast } from "@/components/ui/use-toast";
import { documentSendSuccessDescription } from "@/components/shared/DocumentSendSuccessToast";
import { sendQuoteToClient } from "@/services/InvoiceSendService";
import { formatCurrency } from "@/utils/currencyCalculations";
import { Separator } from "@/components/ui/separator";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { cn } from "@/lib/utils";

function issueDateFromQuote(q) {
    if (q.invoice_date) return q.invoice_date;
    if (typeof q.created_date === "string") return q.created_date.split("T")[0];
    if (typeof q.created_at === "string") return q.created_at.split("T")[0];
    return new Date().toISOString().split("T")[0];
}

/** Shape expected by ProjectDetails (maps valid_until ↔ delivery_date). */
function quoteToInvoiceShape(q) {
    return {
        ...q,
        invoice_date: issueDateFromQuote(q),
        delivery_date: q.valid_until || q.delivery_date || "",
    };
}

/** Strip UI-only keys before Quote.update */
function sanitizeQuotePayload(data) {
    const { invoice_date, delivery_date, ...rest } = data;
    return {
        ...rest,
        valid_until: delivery_date || rest.valid_until || null,
    };
}

/** Quotes that cannot be edited in this flow (use read-only view). */
const TERMINAL_STATUSES = new Set(["rejected", "declined"]);

export default function EditQuote() {
    const [quoteData, setQuoteData] = useState(null);
    const [originalStatus, setOriginalStatus] = useState(null);
    const [clients, setClients] = useState([]);
    const { data: services = [], refetch: refetchCatalog } = useServicesCatalogQuery();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { toast } = useToast();
    const quoteId = new URLSearchParams(location.search).get("id");
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (quoteId) {
            loadInitialData(quoteId);
        } else {
            setError("Quote ID not found");
            setIsLoading(false);
        }
    }, [quoteId]);

    const loadInitialData = async (id) => {
        setIsLoading(true);
        try {
            const [quote, clientsData] = await withTimeoutRetry(
                () => Promise.all([Quote.get(id), Client.list("-created_date")]),
                15000,
                2
            );
            if (!mountedRef.current) return;
            if (!quote) throw new Error("Quote not found");

            const status = String(quote.status || "").toLowerCase();
            if (TERMINAL_STATUSES.has(status)) {
                toast({
                    title: "This quote is closed",
                    description: "Open the read-only view to review or convert from the quotes list.",
                    variant: "default",
                });
                navigate(createViewDocumentUrl("quote", id));
                return;
            }

            setQuoteData({
                ...quote,
                invoice_date: issueDateFromQuote(quote),
            });
            setOriginalStatus(quote.status);
            setClients(clientsData);
        } catch (err) {
            if (!mountedRef.current) return;
            console.error("Error loading data:", err);
            setError(err.message || "Failed to load data");
        } finally {
            if (mountedRef.current) setIsLoading(false);
        }
    };

    const invoiceShape = useMemo(() => (quoteData ? quoteToInvoiceShape(quoteData) : null), [quoteData]);

    const setInvoiceData = useCallback((updater) => {
        setQuoteData((prev) => {
            if (!prev) return prev;
            const shaped = quoteToInvoiceShape(prev);
            const merged = typeof updater === "function" ? updater({ ...shaped }) : { ...shaped, ...updater };
            const { invoice_date, delivery_date, ...rest } = merged;
            return {
                ...rest,
                valid_until: delivery_date || null,
                invoice_date: invoice_date || issueDateFromQuote(rest),
            };
        });
    }, []);

    const ownerCurrency = String(quoteData?.owner_currency || quoteData?.currency || "ZAR").trim() || "ZAR";

    const client = useMemo(
        () => (quoteData ? clients.find((c) => c.id === quoteData.client_id) : null),
        [clients, quoteData]
    );

    const formIsComplete = useMemo(() => {
        if (!invoiceShape) return false;
        const items = invoiceShape.items || [];
        return (
            Boolean(invoiceShape.client_id) &&
            Boolean(String(client?.email || "").trim()) &&
            Boolean(String(invoiceShape.project_title || "").trim()) &&
            items.length > 0 &&
            items.every(
                (item) =>
                    String(item.service_name || "").trim() &&
                    Number(item.quantity) > 0 &&
                    Number(item.unit_price) >= 0
            ) &&
            Boolean(invoiceShape.delivery_date)
        );
    }, [invoiceShape, client]);

    const persistQuote = async (payload) => {
        const me = await User.me().catch(() => null);
        const brandPatch = me ? snapshotDocumentBrandForPersist(me) : {};
        await Quote.update(quoteId, { ...sanitizeQuotePayload(payload), ...brandPatch });
    };

    const handleSaveDraft = async () => {
        if (!quoteData) return;
        setIsSaving(true);
        try {
            await persistQuote({ ...quoteData, status: "draft" });
            setOriginalStatus("draft");
            toast({ title: "Draft saved", description: `Quote ${quoteData.quote_number} was updated.`, variant: "success" });
        } catch (e) {
            console.error(e);
            toast({
                title: "Could not save",
                description: e?.message || "Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSendQuote = async () => {
        if (!quoteData || !formIsComplete) return;
        setIsSaving(true);
        let emailSendFailed = false;
        try {
            const wasDraft = String(originalStatus || "").toLowerCase() === "draft";
            const sentDate = wasDraft ? new Date().toISOString() : quoteData.sent_date || null;
            await persistQuote({ ...quoteData, status: "sent", sent_date: sentDate });
            setQuoteData((q) => ({ ...q, status: "sent", sent_date: sentDate }));
            setOriginalStatus("sent");
            try {
                await sendQuoteToClient(quoteId);
            } catch (sendErr) {
                console.error(sendErr);
                emailSendFailed = true;
            }
            if (emailSendFailed) {
                toast({
                    title: "Quote saved and marked sent",
                    description: `Quote ${quoteData.quote_number} was updated, but delivery could not be confirmed. Use Open preview to share the link.`,
                    variant: "destructive",
                    duration: 10000,
                });
            } else {
                toast({
                    title: "Quote sent",
                    description: documentSendSuccessDescription({
                        mode: "quote",
                        recipientEmail: String(client?.email || "").trim(),
                    }),
                    variant: "success",
                    duration: 6500,
                });
            }
        } catch (e) {
            console.error(e);
            toast({
                title: "Could not send quote",
                description: e?.message || "Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveChanges = async () => {
        if (!quoteData) return;
        setIsSaving(true);
        try {
            await persistQuote({ ...quoteData, status: quoteData.status || originalStatus || "draft" });
            toast({
                title: "Quote updated",
                description: `Quote ${quoteData.quote_number} was saved.`,
                variant: "success",
            });
        } catch (e) {
            console.error(e);
            toast({
                title: "Could not save",
                description: e?.message || "Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const goConvertToInvoice = () => {
        navigate(`${createPageUrl("CreateDocument/invoice")}?quoteId=${encodeURIComponent(quoteId)}`);
    };

    const statusLabel = String(quoteData?.status || "draft").toLowerCase();
    const isDraft = statusLabel === "draft";
    const validUntilLabel = quoteData?.valid_until
        ? new Date(quoteData.valid_until).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
          })
        : "—";

    const expired =
        quoteData?.valid_until &&
        new Date(quoteData.valid_until).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0) &&
        statusLabel !== "accepted";

    if (isLoading || !quoteData || !invoiceShape) {
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

    if (error) {
        return (
            <div className="min-h-screen bg-background p-8 text-destructive">
                <p>{error}</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate(createPageUrl("Quotes"))}>
                    Back to quotes
                </Button>
            </div>
        );
    }

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
                        onClick={() => navigate(createPageUrl("Quotes"))}
                        className="shrink-0 rounded-lg border border-border/60 text-muted-foreground hover:bg-muted/50"
                        aria-label="Back to quotes"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                                Quote
                                <span className="text-muted-foreground font-normal"> #{quoteData.quote_number}</span>
                            </h1>
                            <QuoteStatusBadge status={quoteData.status || "draft"} />
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
                                Valid until <span className="tabular-nums">{validUntilLabel}</span>
                            </span>
                            <span className="hidden text-border sm:inline" aria-hidden>
                                ·
                            </span>
                            <span className="tabular-nums font-medium text-foreground">
                                {formatCurrency(quoteData.total_amount || 0, ownerCurrency)}
                            </span>
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {statusLabel === "viewed" ? (
                                <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5">Client opened the quote link</span>
                            ) : null}
                            {statusLabel === "accepted" ? (
                                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
                                    Accepted — use Convert to invoice below
                                </span>
                            ) : null}
                            {expired ? (
                                <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-800 dark:text-amber-200">
                                    Past valid-until date — update validity or resend
                                </span>
                            ) : null}
                        </div>
                    </div>
                </motion.div>

                {isDraft ? (
                    <div className="mb-6 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">
                        <span className="mt-0.5 text-primary" aria-hidden>
                            ●
                        </span>
                        <span>Draft — save anytime, then send when you are ready to close the deal.</span>
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
                    <aside className="order-1 space-y-4 lg:order-2 lg:col-span-1">
                        <div className="space-y-4 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm backdrop-blur-sm sm:p-5 lg:sticky lg:top-6">
                            <div>
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</h2>
                                <Separator className="my-3 bg-border/60" decorative />
                                <dl className="space-y-2.5 text-sm">
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Subtotal</dt>
                                        <dd className="tabular-nums font-medium">{formatCurrency(quoteData.subtotal || 0, ownerCurrency)}</dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Tax</dt>
                                        <dd className="tabular-nums font-medium">{formatCurrency(quoteData.tax_amount || 0, ownerCurrency)}</dd>
                                    </div>
                                </dl>
                                <Separator className="my-4 bg-border/60" decorative />
                                <div className="flex items-end justify-between gap-3">
                                    <span className="text-sm font-medium text-muted-foreground">Total</span>
                                    <span
                                        className="text-right text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl"
                                        style={{ fontFeatureSettings: '"tnum"' }}
                                    >
                                        {formatCurrency(quoteData.total_amount || 0, ownerCurrency)}
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
                                            onClick={handleSaveDraft}
                                        >
                                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                                            Save draft
                                        </Button>
                                        <Button
                                            type="button"
                                            className="w-full justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                                            disabled={isSaving || !formIsComplete}
                                            onClick={handleSendQuote}
                                        >
                                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                                            Send quote
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        type="button"
                                        className="w-full justify-center gap-2"
                                        disabled={isSaving || !formIsComplete}
                                        onClick={handleSaveChanges}
                                    >
                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                                        Save changes
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    variant="default"
                                    className={cn("w-full justify-center gap-2", !formIsComplete && "opacity-60")}
                                    disabled={!formIsComplete}
                                    onClick={goConvertToInvoice}
                                >
                                    <FileInput className="h-4 w-4 shrink-0" aria-hidden />
                                    Convert to invoice
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-center gap-2 border-border/80"
                                    disabled={isSaving}
                                    onClick={() => navigate(createViewDocumentUrl("quote", quoteId))}
                                >
                                    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                                    Open preview
                                </Button>
                            </div>
                            {!formIsComplete ? (
                                <p className="text-center text-[11px] text-muted-foreground">
                                    Add a client with an email, title, valid-until date, and line items to send.
                                </p>
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
                            invoiceData={invoiceShape}
                            setInvoiceData={setInvoiceData}
                            clients={clients}
                            setClients={setClients}
                            bankingDetails={[]}
                            setBankingDetails={() => {}}
                            services={services}
                            onNext={() => {}}
                            onRefreshCatalog={refetchCatalog}
                            showNextButton={false}
                            isEditorLayout
                            documentKind="quote"
                            omitPaymentDetails
                        />
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
