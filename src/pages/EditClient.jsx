import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Save, UserX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Client } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import ClientForm from "@/components/clients/ClientForm";
import { queueUpdateClient } from "@/lib/syncQueueActions";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function EditClient() {
    const [searchParams] = useSearchParams();
    const rawId = searchParams.get("id");
    const trimmedId = String(rawId || "").trim();
    const clientId = UUID_RE.test(trimmedId) ? trimmedId : null;
    const isNew = !trimmedId;
    const invalidId = Boolean(trimmedId) && !clientId;

    const navigate = useNavigate();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const mountedRef = useRef(true);

    const [client, setClient] = useState(null);
    const [isLoading, setIsLoading] = useState(Boolean(clientId));
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (isNew) {
            setClient(null);
            setIsLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            setIsLoading(true);
            try {
                const row = await withTimeoutRetry(() => Client.get(clientId), 15000, 2);
                if (cancelled || !mountedRef.current) return;
                setClient(row || null);
            } catch (e) {
                console.error(e);
                if (!mountedRef.current) return;
                setClient(null);
                toast({
                    title: "Could not load client",
                    description: e?.message || "Try again from the Clients list.",
                    variant: "destructive",
                });
                navigate(createPageUrl("Clients"));
            } finally {
                if (mountedRef.current) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [clientId, isNew, navigate, toast]);

    const handleSave = async (clientData) => {
        if (!clientData.name?.trim()) {
            toast({ title: "Validation", description: "Client name is required.", variant: "destructive" });
            return;
        }
        if (!clientData.email?.trim()) {
            toast({ title: "Validation", description: "Email is required.", variant: "destructive" });
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(clientData.email.trim())) {
            toast({ title: "Validation", description: "Enter a valid email address.", variant: "destructive" });
            return;
        }

        setIsSaving(true);
        try {
            if (isNew) {
                const created = await Client.create(clientData);
                queryClient.invalidateQueries({ queryKey: ["clients", "list"], exact: false });
                toast({
                    title: "Client added",
                    description: `${clientData.name} is ready to invoice.`,
                    variant: "success",
                });
                navigate(`${createPageUrl("ClientDetail")}?id=${encodeURIComponent(created.id)}`);
            } else {
                queueUpdateClient(clientId, clientData, { source: "edit-client", label: clientData.name });
                queryClient.invalidateQueries({ queryKey: ["clients", "list"], exact: false });
                toast({
                    title: "Client update queued",
                    description: "Changes will sync in the background.",
                    variant: "default",
                });
                navigate(`${createPageUrl("ClientDetail")}?id=${encodeURIComponent(clientId)}`);
            }
        } catch (error) {
            console.error(error);
            toast({
                title: "Could not save",
                description: error?.message || "Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (invalidId) {
        return <Navigate to={createPageUrl("Clients")} replace />;
    }

    if (!isNew && isLoading) {
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

    if (!isNew && !isLoading && !client) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-24">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
                        <UserX className="h-7 w-7" aria-hidden />
                    </div>
                    <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Couldn&apos;t load this client</h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        This client may have been removed, or the link is out of date. Open them from your client list.
                    </p>
                    <Button type="button" className="mt-8" onClick={() => navigate(createPageUrl("Clients"))}>
                        Back to clients
                    </Button>
                </div>
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
                        onClick={() => navigate(createPageUrl("Clients"))}
                        className="shrink-0 rounded-lg border border-border/60 text-muted-foreground hover:bg-muted/50"
                        aria-label="Back to clients"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1">
                        <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                            {isNew ? "New client" : "Edit client"}
                            {!isNew && client?.name ? (
                                <span className="text-muted-foreground font-normal"> · {client.name}</span>
                            ) : null}
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {isNew
                                ? "Add contact details and defaults for invoices and quotes."
                                : "Update profile, billing defaults, and notes."}
                        </p>
                    </div>
                </motion.div>

                {isNew ? (
                    <div className="mb-6 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">
                        <span className="mt-0.5 text-primary" aria-hidden>
                            ●
                        </span>
                        <span>Required: name and a valid email so you can send documents.</span>
                    </div>
                ) : null}

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
                    <aside className="order-1 space-y-4 lg:order-2 lg:col-span-1">
                        <div className="space-y-4 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm backdrop-blur-sm sm:p-5 lg:sticky lg:top-6">
                            <div>
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</h2>
                                <Separator className="my-3 bg-border/60" decorative />
                                {isNew ? (
                                    <p className="text-sm leading-relaxed text-muted-foreground">
                                        Name and email are required. Optional fields help with invoices and reminders.
                                    </p>
                                ) : (
                                    <dl className="space-y-2.5 text-sm">
                                        <div>
                                            <dt className="text-muted-foreground">Email</dt>
                                            <dd className="mt-0.5 break-all font-medium text-foreground">{client?.email || "—"}</dd>
                                        </div>
                                        {client?.phone ? (
                                            <div>
                                                <dt className="text-muted-foreground">Phone</dt>
                                                <dd className="mt-0.5 font-medium text-foreground">{client.phone}</dd>
                                            </div>
                                        ) : null}
                                    </dl>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 pt-1">
                                <Button
                                    type="submit"
                                    form="client-editor-form"
                                    className="w-full justify-center gap-2"
                                    disabled={isSaving}
                                >
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                    ) : (
                                        <Save className="h-4 w-4" aria-hidden />
                                    )}
                                    {isNew ? "Save client" : "Save changes"}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-center"
                                    disabled={isSaving}
                                    onClick={() => navigate(isNew ? createPageUrl("Clients") : `${createPageUrl("ClientDetail")}?id=${encodeURIComponent(clientId)}`)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </aside>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="order-2 min-w-0 lg:order-1 lg:col-span-2"
                    >
                        <ClientForm
                            key={clientId || "new"}
                            client={client}
                            layout="page"
                            onSave={handleSave}
                            onCancel={() =>
                                navigate(isNew ? createPageUrl("Clients") : `${createPageUrl("ClientDetail")}?id=${encodeURIComponent(clientId)}`)
                            }
                        />
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
