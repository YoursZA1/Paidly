import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Save, PackageX } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Service } from "@/api/entities";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import {
    fetchServicesCatalog,
    invalidateServicesCatalog,
    SERVICES_CATALOG_QUERY_KEY,
} from "@/hooks/useServicesCatalogQuery";
import { formatCurrency } from "@/components/CurrencySelector";
import ServiceForm from "@/components/services/ServiceForm";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function EditCatalogItem() {
    const [searchParams] = useSearchParams();
    const rawId = searchParams.get("id");
    const itemId = rawId && UUID_RE.test(String(rawId).trim()) ? String(rawId).trim() : null;
    const isNew = !itemId;
    const invalidId = Boolean(String(rawId || "").trim()) && !itemId;
    const typeFromUrl = (searchParams.get("type") || "service").toLowerCase();
    const defaultType = typeFromUrl === "product" ? "product" : "service";

    const navigate = useNavigate();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const mountedRef = useRef(true);

    const [fetchedRow, setFetchedRow] = useState(null);
    const [fetchSettled, setFetchSettled] = useState(false);
    const [user, setUser] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formValid, setFormValid] = useState(false);

    const catalogQueryEnabled =
        Boolean(itemId) && Boolean(queryClient.getQueryData(SERVICES_CATALOG_QUERY_KEY));
    const { data: catalogRows = [] } = useQuery({
        queryKey: SERVICES_CATALOG_QUERY_KEY,
        queryFn: fetchServicesCatalog,
        enabled: catalogQueryEnabled,
        staleTime: 2 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

    const catalogMatch = useMemo(() => {
        if (!itemId || !Array.isArray(catalogRows)) return null;
        return catalogRows.find((r) => r.id === itemId) ?? null;
    }, [itemId, catalogRows]);

    const serviceForForm = !isNew ? fetchedRow ?? catalogMatch : null;

    const serviceDataKey = useMemo(() => {
        if (isNew) return "";
        if (fetchedRow) {
            return `full:${fetchedRow.id}:${fetchedRow.updated_at || fetchedRow.updated_date || ""}`;
        }
        if (catalogMatch) {
            return `cache:${catalogMatch.id}:${catalogMatch.updated_at || catalogMatch.updated_date || ""}`;
        }
        return "";
    }, [isNew, fetchedRow, catalogMatch]);

    const handleFormValidityChange = useCallback((valid) => {
        setFormValid(Boolean(valid));
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (isNew) {
            setFetchedRow(null);
            setFetchSettled(true);
            return;
        }
        if (!itemId) {
            setFetchedRow(null);
            setFetchSettled(true);
            return;
        }
        let cancelled = false;
        setFetchedRow(null);
        setFetchSettled(false);
        (async () => {
            try {
                const [profile, row] = await Promise.all([
                    User.me().catch(() => null),
                    withTimeoutRetry(() => Service.get(itemId), 12000, 1),
                ]);
                if (cancelled || !mountedRef.current) return;
                if (profile) setUser(profile);
                setFetchedRow(row || null);
            } catch (e) {
                console.error(e);
                if (!mountedRef.current) return;
                toast({
                    title: "Could not load item",
                    description: e?.message || "Open it from Products & services.",
                    variant: "destructive",
                });
                navigate(createPageUrl("Services"));
            } finally {
                if (!cancelled && mountedRef.current) setFetchSettled(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isNew, itemId, navigate, toast]);

    const catalogRouteRef = useRef(null);
    useEffect(() => {
        const next = { itemId, isNew, defaultType };
        const prev = catalogRouteRef.current;
        if (prev && (prev.itemId !== next.itemId || prev.isNew !== next.isNew || prev.defaultType !== next.defaultType)) {
            setFormValid(false);
        }
        catalogRouteRef.current = next;
    }, [itemId, isNew, defaultType]);

    const userCurrency = user?.currency || "ZAR";

    const title = useMemo(() => {
        if (!isNew && serviceForForm?.name) return serviceForForm.name;
        return defaultType === "product" ? "New product" : "New service";
    }, [isNew, serviceForForm, defaultType]);

    const subtitle = useMemo(() => {
        if (!isNew && serviceForForm) {
            const rate = serviceForForm.default_rate ?? serviceForForm.unit_price ?? 0;
            return `${formatCurrency(rate, userCurrency)} · ${serviceForForm.item_type || "service"}`;
        }
        return defaultType === "product"
            ? "Stock, SKU, and pricing for catalog and invoices."
            : "Rate, unit, and tax defaults for line items.";
    }, [isNew, serviceForForm, defaultType, userCurrency]);

    const handleSave = async (serviceData) => {
        setIsSaving(true);
        try {
            if (isNew) {
                await Service.create(serviceData);
                toast({
                    title: "Item created",
                    description: `${serviceData.name} is in your catalog.`,
                    variant: "success",
                });
            } else {
                await Service.update(itemId, serviceData);
                toast({ title: "Item updated", description: "Changes saved.", variant: "success" });
            }
            await invalidateServicesCatalog(queryClient);
            navigate(createPageUrl("Services"));
        } catch (error) {
            console.error(error);
            const errorMessage = error?.message || String(error);
            toast({
                title: "Could not save",
                description:
                    errorMessage.includes("organization")
                        ? "No organization found. Try signing out and back in."
                        : errorMessage.includes("permission") || errorMessage.includes("RLS")
                          ? "Permission denied."
                          : errorMessage.includes("duplicate") || errorMessage.includes("unique")
                            ? "An item with this name may already exist."
                            : errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (invalidId) {
        return <Navigate to={createPageUrl("Services")} replace />;
    }

    const showEditSkeleton = !isNew && !serviceForForm && !fetchSettled;

    if (showEditSkeleton) {
        return (
            <div className="min-h-screen bg-background p-4 sm:p-6">
                <div className="mx-auto max-w-6xl space-y-6">
                    <Skeleton className="h-10 w-48 bg-muted" />
                    <Skeleton className="h-4 w-full max-w-xl bg-muted" />
                    <div className="grid gap-6 lg:grid-cols-3">
                        <Skeleton className="h-[520px] bg-muted lg:col-span-2" />
                        <Skeleton className="h-64 bg-muted" />
                    </div>
                </div>
            </div>
        );
    }

    if (!isNew && fetchSettled && !fetchedRow && !catalogMatch) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-24">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
                        <PackageX className="h-7 w-7" aria-hidden />
                    </div>
                    <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Couldn&apos;t load this item</h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        It may have been removed, or the link is out of date. Open the catalog from the main list and try again.
                    </p>
                    <Button type="button" className="mt-8" onClick={() => navigate(createPageUrl("Services"))}>
                        Back to products & services
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
                <motion.div
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 flex flex-wrap items-start gap-4"
                >
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(createPageUrl("Services"))}
                        className="shrink-0 rounded-lg border border-border/60 text-muted-foreground hover:bg-muted/50"
                        aria-label="Back to catalog"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1">
                        <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                            {isNew ? title : "Edit item"}
                            {!isNew && serviceForForm?.name ? (
                                <span className="font-normal text-muted-foreground"> · {serviceForForm.name}</span>
                            ) : null}
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
                    </div>
                </motion.div>

                {isNew ? (
                    <div className="mb-6 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">
                        <span className="mt-0.5 text-primary" aria-hidden>
                            ●
                        </span>
                        <span>Required fields are marked in the form. You can refine optional details anytime.</span>
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
                    <aside className="order-1 space-y-4 lg:order-2 lg:col-span-1">
                        <div className="space-y-4 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm backdrop-blur-sm sm:p-5 lg:sticky lg:top-6">
                            <div>
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</h2>
                                <Separator className="my-3 bg-border/60" decorative />
                                <p className="text-sm leading-relaxed text-muted-foreground">
                                    Catalog items sync to invoices and quotes. Lock pricing if rates should stay fixed.
                                </p>
                            </div>
                            <div className="flex flex-col gap-2 pt-1">
                                <Button
                                    type="submit"
                                    form="catalog-item-editor-form"
                                    className="w-full justify-center gap-2"
                                    disabled={isSaving || !formValid}
                                    title={
                                        !formValid
                                            ? "Add a name, item type, default unit, and a valid rate (≥ 0) to save."
                                            : undefined
                                    }
                                >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                                    {isNew ? "Create item" : "Save changes"}
                                </Button>
                                <Button type="button" variant="outline" className="w-full justify-center" disabled={isSaving} onClick={() => navigate(createPageUrl("Services"))}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </aside>

                    <motion.div
                        initial={false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0 }}
                        className="order-2 min-w-0 lg:order-1 lg:col-span-2"
                    >
                        <div className="rounded-xl border border-border/60 bg-card/30 p-4 shadow-sm sm:p-5">
                            <ServiceForm
                                key={itemId || `new-${defaultType}`}
                                service={serviceForForm}
                                serviceDataKey={serviceDataKey}
                                defaultType={serviceForForm?.item_type || defaultType}
                                variant="dialog"
                                surface="editor"
                                formId="catalog-item-editor-form"
                                hideActions
                                isSaving={isSaving}
                                onValidityChange={handleFormValidityChange}
                                onSave={handleSave}
                                onCancel={() => navigate(createPageUrl("Services"))}
                            />
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
