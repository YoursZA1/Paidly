import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { User, BankingDetail } from "@/api/entities";
import {
  uploadLogo,
  validateLogoFile,
  LOGO_CONSTRAINTS,
  logoMaxSizeLabel,
} from "@/lib/logoUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Settings as SettingsIcon, Image as ImageIcon, UploadCloud, CreditCard, Plus, Bell, Award, Check, FileText, DollarSign, User as UserIcon, Users, Building2, Trash2, Download, Upload, ChevronDown, Landmark, Star, MoreVertical, Edit, ChevronRight, Loader2, Plug } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { selectProfileByUserId } from "@/api/auth/profileSelect";
import { getStableSession } from "@/core/auth/SessionCoordinator";
import SettingsLogoPreviews from "@/components/settings/SettingsLogoPreviews";
import { mergeProfileLogo, resolveProfileLogoUrl } from "@/lib/profileLogo";
import AssetService from "@/services/AssetService";
import { clearLogoUrlDiskCacheForSrc } from "@/lib/logoUrlDiskCache";

import HelpTooltip from "@/components/shared/HelpTooltip";
import BankingForm from "@/components/banking/BankingForm";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteMyAccount } from "@/api/accountApi";
import CurrencySelector from "@/components/CurrencySelector";
import PaymentReminderSettings from "@/components/reminders/PaymentReminderSettings";
import QuoteReminderSettings from "@/components/reminders/QuoteReminderSettings";
import ReminderDashboard from "@/components/reminders/ReminderDashboard";
import SubscriptionSettings from "@/components/subscription/SubscriptionSettings";
import PosIntegrationSettings from "@/components/settings/PosIntegrationSettings";
import TwoFactorSettings from "@/components/settings/TwoFactorSettings";
import CompanyOverviewPanel from "@/components/dashboard/CompanyOverviewPanel";
import RoleBasedDashboardPanel from "@/components/dashboard/RoleBasedDashboardPanel";
import CompanyTeamMembersPanel from "@/components/company/CompanyTeamMembersPanel";
import OrgBrandsSettings from "@/components/settings/OrgBrandsSettings";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import CurrencyConfiguration from "@/components/currency/CurrencyConfiguration";
import { bankingDetailsToCsv, parseBankingCsv, csvRowToBankingDetailPayload } from "@/utils/bankingCsvMapping";
import { createPageUrl } from "@/utils";
import { writeInvoiceDraft } from "@/utils/invoiceDraftStorage";
import { DEFAULT_INVOICE_TEMPLATE } from "@/utils/invoiceTemplateData";
import {
  parseDocumentBrandHex,
  DEFAULT_DOCUMENT_BRAND_PRIMARY,
  DEFAULT_DOCUMENT_BRAND_SECONDARY,
} from "@/utils/documentBrandColors";

const SettingsCard = ({ title, description, children }) => (
    <section className="bg-card border border-border rounded-2xl p-4 sm:p-7 mb-4 sm:mb-5 shadow-sm min-w-0 overflow-x-hidden">
        <div className="mb-5 pb-4 border-b border-border/60">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {children}
    </section>
);

const DOCUMENT_TEMPLATES = [
    {
        id: "document",
        name: "Paidly Document",
        description: "Current invoice & quote layout — PDF and on-screen",
        colors: ["#0f172a", "#ffffff", "#f24e00"],
    },
    {
        id: "classic",
        name: "Classic",
        description: "Traditional layout with clean sections",
        colors: ["#1e293b", "#f1f5f9", "#3b82f6"]
    },
    {
        id: "modern",
        name: "Modern",
        description: "Gradient header with bold accents",
        colors: ["#7c3aed", "#faf5ff", "#a855f7"]
    },
    {
        id: "minimal",
        name: "Minimal",
        description: "Minimalist style with high readability",
        colors: ["#18181b", "#ffffff", "#71717a"]
    },
    {
        id: "bold",
        name: "Bold",
        description: "Strong contrast with confident headings",
        colors: ["#0f766e", "#f0fdfa", "#14b8a6"]
    },
    {
        id: "paidlypro",
        name: "Paidly Pro",
        description: "Future nostalgic — Geist, cards, refined footer",
        colors: ["#ea580c", "#f8fafc", "#0f172a"]
    }
];

function businessFieldsFromProfile(b) {
    if (!b || typeof b !== "object") {
        return { bank_name: "", account_name: "", account_number: "", branch_code: "" };
    }
    return {
        bank_name: b.bank_name || "",
        account_name: b.account_name || "",
        account_number: b.account_number || "",
        branch_code: b.branch_code || "",
    };
}

function compactBusinessForProfile(fd) {
    const o = {
        bank_name: (fd.business_bank_name || "").trim(),
        account_name: (fd.business_account_name || "").trim(),
        account_number: (fd.business_account_number || "").trim(),
        branch_code: (fd.business_branch_code || "").trim(),
    };
    const out = {};
    if (o.bank_name) out.bank_name = o.bank_name;
    if (o.account_name) out.account_name = o.account_name;
    if (o.account_number) out.account_number = o.account_number;
    if (o.branch_code) out.branch_code = o.branch_code;
    return Object.keys(out).length ? out : null;
}

function CompanyProfileSettings() {
    const { user: authUser, refreshUser } = useAuth();
    const { toast } = useToast();

    // Use Auth session metadata as initial state so Name/Email aren't empty on load
    const [formData, setFormData] = useState(() => ({
        display_name: authUser?.full_name || authUser?.display_name || "",
        email: authUser?.email || "",
        company_name: "",
        company_address: "",
        phone: "",
        company_website: "",
        logo_url: "",
        currency: "USD",
        country: "",
        timezone: "",
        invoice_template: DEFAULT_INVOICE_TEMPLATE,
        invoice_header: "",
        document_brand_primary: "",
        document_brand_secondary: "",
        business_bank_name: "",
        business_account_name: "",
        business_account_number: "",
        business_branch_code: "",
    }));
    const [logoFile, setLogoFile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);

    // Sync Name/Email from auth as soon as authUser is available
    useEffect(() => {
        if (!authUser) return;
        setFormData(prev => ({
            ...prev,
            display_name: authUser.full_name || authUser.display_name || prev.display_name || "",
            email: authUser.email || prev.email || ""
        }));
    }, [authUser?.id, authUser?.full_name, authUser?.display_name, authUser?.email]);

    // Sync company fields when authUser updates (e.g. Realtime from another tab or after save)
    useEffect(() => {
        if (!authUser?.id) return;
        const b = businessFieldsFromProfile(authUser.business);
        setFormData(prev => ({
            ...prev,
            company_name: authUser.company_name ?? prev.company_name,
            company_address: authUser.company_address ?? prev.company_address,
            phone: authUser.phone ?? prev.phone ?? "",
            company_website: authUser.company_website ?? prev.company_website ?? "",
            logo_url: mergeProfileLogo(prev.logo_url, authUser),
            currency: authUser.currency || prev.currency || "USD",
            timezone: authUser.timezone ?? prev.timezone,
            invoice_template: authUser.invoice_template || prev.invoice_template || DEFAULT_INVOICE_TEMPLATE,
            invoice_header: authUser.invoice_header ?? prev.invoice_header,
            document_brand_primary: authUser.document_brand_primary ?? prev.document_brand_primary ?? "",
            document_brand_secondary: authUser.document_brand_secondary ?? prev.document_brand_secondary ?? "",
            business_bank_name: b.bank_name,
            business_account_name: b.account_name,
            business_account_number: b.account_number,
            business_branch_code: b.branch_code,
        }));
    }, [
        authUser?.id,
        authUser?.company_name,
        authUser?.company_address,
        authUser?.phone,
        authUser?.company_website,
        authUser?.logo_url,
        authUser?.currency,
        authUser?.timezone,
        authUser?.invoice_template,
        authUser?.invoice_header,
        authUser?.document_brand_primary,
        authUser?.document_brand_secondary,
        authUser?.business,
    ]);

    // Load Company Profile fields from DB (select only needed columns to reduce payload)
    useEffect(() => {
        if (!authUser?.id) {
            setIsLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            setIsLoading(true);
            try {
                const { data } = await selectProfileByUserId(supabase, authUser.id);

                if (cancelled) return;
                if (data) {
                    const b = businessFieldsFromProfile(data.business);
                    setFormData(prev => ({
                        ...prev,
                        display_name: data.full_name || prev.display_name,
                        email: data.email || prev.email,
                        company_name: data.company_name || "",
                        company_address: data.company_address || "",
                        phone: data.phone || "",
                        company_website: data.company_website || "",
                        logo_url: mergeProfileLogo(prev.logo_url, data),
                        currency: data.currency || "USD",
                        timezone: data.timezone || "",
                        invoice_template: data.invoice_template || DEFAULT_INVOICE_TEMPLATE,
                        invoice_header: data.invoice_header || "",
                        document_brand_primary: data.document_brand_primary || "",
                        document_brand_secondary: data.document_brand_secondary || "",
                        business_bank_name: b.bank_name,
                        business_account_name: b.account_name,
                        business_account_number: b.account_number,
                        business_branch_code: b.branch_code,
                    }));
                }
                // Upsert if profile empty but we have auth data
                const { data: { user: su } } = await supabase.auth.getUser();
                const profileEmpty = !data || (!data.full_name && !data.email);
                if (!cancelled && profileEmpty && (su?.email || su?.user_metadata?.full_name) && su?.id) {
                    try {
                        await User.updateMyUserData({
                            full_name: su.user_metadata?.full_name || su.email?.split("@")[0] || "",
                            email: su.email || ""
                        });
                        await refreshUser();
                    } catch (upsertErr) {
                        console.warn("Profile upsert fallback failed:", upsertErr);
                    }
                }
            } catch (error) {
                if (!cancelled) console.error("Error loading user data:", error);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [authUser?.id]);

    // Cleanup blob URLs on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            if (formData.logo_url && formData.logo_url.startsWith('blob:')) {
                URL.revokeObjectURL(formData.logo_url);
            }
        };
    }, [formData.logo_url]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleLogoChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const validation = validateLogoFile(file);
            if (!validation.valid) {
                toast({
                    title: "Invalid logo",
                    description: validation.message,
                    variant: "destructive"
                });
                return;
            }
            // Revoke old blob URL if it exists to prevent memory leaks
            if (formData.logo_url && formData.logo_url.startsWith('blob:')) {
                URL.revokeObjectURL(formData.logo_url);
            }
            
            // Create preview URL
            const previewUrl = URL.createObjectURL(file);
            setFormData(prev => ({ ...prev, logo_url: previewUrl }));
            setLogoFile(file);
            
            // Show success message
            toast({
                title: "✓ Logo selected",
                description: `${file.name} is ready to upload. Click "Save Changes" to apply.`,
                variant: "success"
            });
        }
    };

    const handleRemoveLogo = () => {
        if (formData.logo_url && formData.logo_url.startsWith('blob:')) {
            URL.revokeObjectURL(formData.logo_url);
        }
        setFormData(prev => ({ ...prev, logo_url: "" }));
        setLogoFile(null);
        toast({
            title: "Logo removed",
            description: "Click \"Save Changes\" to confirm removal.",
            variant: "default"
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        let updatedData = { ...formData };

        try {
            if (logoFile) {
                console.log("Uploading logo file:", logoFile.name);
                // Revoke previous preview URL if it exists
                if (formData.logo_url && formData.logo_url.startsWith('blob:')) {
                    URL.revokeObjectURL(formData.logo_url);
                }
                try {
                    const userId = authUser?.id;
                    if (!userId) {
                        toast({
                            title: "Not signed in",
                            description: "You must be signed in to update profile. Please sign in and try again.",
                            variant: "destructive"
                        });
                        return;
                    }
                    const storedLogoPath = await uploadLogo(logoFile, userId);
                    updatedData.logo_url = storedLogoPath;
                } catch (uploadError) {
                    console.error("Logo upload error:", uploadError);
                    toast({
                        title: "✗ Upload Failed",
                        description: `Failed to upload logo: ${uploadError.message || 'Unknown error'}`,
                        variant: "destructive"
                    });
                    return;
                }
            }
            
            // Map display_name to full_name for Supabase profile (saved per user, restored on login)
            const payload = {
                company_name: updatedData.company_name,
                company_address: updatedData.company_address,
                phone: (updatedData.phone || "").trim(),
                company_website: (updatedData.company_website || "").trim(),
                logo_url: updatedData.logo_url,
                currency: updatedData.currency || "USD",
                timezone: updatedData.timezone || "",
                invoice_template: updatedData.invoice_template || DEFAULT_INVOICE_TEMPLATE,
                invoice_header: updatedData.invoice_header ?? "",
                document_brand_primary:
                  updatedData.document_brand_primary?.trim?.() === ""
                    ? null
                    : parseDocumentBrandHex(updatedData.document_brand_primary) ?? null,
                document_brand_secondary:
                  updatedData.document_brand_secondary?.trim?.() === ""
                    ? null
                    : parseDocumentBrandHex(updatedData.document_brand_secondary) ?? null,
                business: compactBusinessForProfile(updatedData),
            };
            await User.updateMyUserData(payload);
            // Defense in depth: always upsert current profile row so settings are replaced even when
            // local auth state/SDK write helpers are stale.
            if (authUser?.id) {
                const directProfilePayload = {
                    id: authUser.id,
                    ...payload,
                    updated_at: new Date().toISOString(),
                };
                const { error: directSaveError } = await supabase
                    .from("profiles")
                    .upsert(directProfilePayload, { onConflict: "id" });
                if (directSaveError) {
                    throw directSaveError;
                }
            }
            setFormData((prev) => ({
                ...prev,
                ...payload,
                document_brand_primary: payload.document_brand_primary || "",
                document_brand_secondary: payload.document_brand_secondary || "",
                business_bank_name: updatedData.business_bank_name,
                business_account_name: updatedData.business_account_name,
                business_account_number: updatedData.business_account_number,
                business_branch_code: updatedData.business_branch_code,
            }));
            setLogoFile(null);
            if (payload.logo_url) {
                clearLogoUrlDiskCacheForSrc(payload.logo_url);
                AssetService.clearLogoSessionCache();
            }
            await refreshUser();
            toast({
                title: "✓ Settings Saved",
                description: "Your company profile has been updated successfully.",
                variant: "success"
            });
        } catch (error) {
            console.error("Error saving settings:", error);
            toast({
                title: "✗ Error",
                description: `Failed to save settings: ${error.message || 'Please try again.'}`,
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };
    
    if (isLoading) {
        return (
            <div className="animate-pulse space-y-6">
                <div className="h-12 bg-muted rounded-xl w-full" />
                <div className="h-12 bg-muted rounded-xl w-full" />
                <div className="h-28 bg-muted rounded-xl w-full" />
                <div className="h-28 bg-muted rounded-xl w-full" />
                <div className="h-32 bg-muted rounded-xl w-full" />
            </div>
        );
    }
    
    // Check if branding is complete
    const isBrandingComplete =
        formData.company_name && formData.company_address && resolveProfileLogoUrl(formData);

    /**
     * Open a sample invoice PDF in a new tab. Pass a templateId to preview a
     * specific template without changing the saved selection; omit it to
     * preview the currently selected template.
     */
    const handlePreviewTemplate = (templateIdOverride) => {
        const previewTemplateId =
            (typeof templateIdOverride === "string" && templateIdOverride) ||
            formData.invoice_template ||
            DEFAULT_INVOICE_TEMPLATE;
        const previewBusiness = compactBusinessForProfile(formData);
        const draftUser = {
            id: authUser?.id,
            full_name: formData.display_name,
            company_name: formData.company_name || "Your Company",
            company_address: formData.company_address || "",
            email: formData.email || authUser?.email || "",
            phone: (formData.phone || "").trim(),
            company_website: (formData.company_website || "").trim(),
            logo_url: resolveProfileLogoUrl(formData),
            currency: formData.currency || "ZAR",
            invoice_template: previewTemplateId,
            invoice_header: formData.invoice_header || "",
            document_brand_primary: parseDocumentBrandHex(formData.document_brand_primary) ?? null,
            document_brand_secondary: parseDocumentBrandHex(formData.document_brand_secondary) ?? null,
            ...(previewBusiness ? { business: previewBusiness } : {}),
        };
        const sampleDraft = {
            invoiceData: {
                reference_number: "PREVIEW-001",
                invoice_number: "PREVIEW-001",
                delivery_date: new Date().toISOString().split("T")[0],
                invoice_date: new Date().toISOString().split("T")[0],
                items: [{ name: "Sample Service", description: "Preview item", quantity: 1, unit_price: 1000, total_price: 1000 }],
                subtotal: 1000,
                tax_rate: 15,
                tax_amount: 150,
                total_amount: 1150,
                notes: "",
                terms_conditions: ""
            },
            client: { name: "Sample Client", email: "client@example.com", address: "123 Client St" },
            user: draftUser,
            bankingDetail: null
        };
        try {
            writeInvoiceDraft(sampleDraft);
            window.open(createPageUrl("InvoicePDF") + "?draft=1", "_blank", "noopener,noreferrer");
        } catch (e) {
            console.error("Preview failed:", e);
        }
    };

    /**
     * Persist only the document template + accent colours, without saving the whole
     * profile form. Lets the user lock in a template choice immediately from the picker.
     */
    const handleSaveInvoiceTemplate = async () => {
        if (isSavingTemplate) return;
        const userId = authUser?.id;
        if (!userId) {
            toast({
                title: "Not signed in",
                description: "You must be signed in to save your template.",
                variant: "destructive",
            });
            return;
        }
        setIsSavingTemplate(true);
        try {
            const templatePayload = {
                invoice_template: formData.invoice_template || DEFAULT_INVOICE_TEMPLATE,
                document_brand_primary:
                    formData.document_brand_primary?.trim?.() === ""
                        ? null
                        : parseDocumentBrandHex(formData.document_brand_primary) ?? null,
                document_brand_secondary:
                    formData.document_brand_secondary?.trim?.() === ""
                        ? null
                        : parseDocumentBrandHex(formData.document_brand_secondary) ?? null,
            };
            await User.updateMyUserData(templatePayload);
            const { error: directSaveError } = await supabase
                .from("profiles")
                .upsert(
                    { id: userId, ...templatePayload, updated_at: new Date().toISOString() },
                    { onConflict: "id" }
                );
            if (directSaveError) throw directSaveError;
            setFormData((prev) => ({
                ...prev,
                ...templatePayload,
                document_brand_primary: templatePayload.document_brand_primary || "",
                document_brand_secondary: templatePayload.document_brand_secondary || "",
            }));
            await refreshUser();
            const templateName =
                DOCUMENT_TEMPLATES.find((t) => t.id === templatePayload.invoice_template)?.name ||
                "Template";
            toast({
                title: "✓ Template saved",
                description: `"${templateName}" is now your document template for invoices and quotes.`,
                variant: "success",
            });
        } catch (error) {
            console.error("Error saving template:", error);
            toast({
                title: "✗ Error",
                description: `Failed to save template: ${error.message || "Please try again."}`,
                variant: "destructive",
            });
        } finally {
            setIsSavingTemplate(false);
        }
    };

    return (
        <>
        <form onSubmit={handleSave} className="space-y-6">
            <SettingsCard
                title="Company Profile"
                description="This information appears on your invoices and dashboard greeting."
            >
                <div className="flex items-center gap-3 mb-4">
                    {isBrandingComplete && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <Check className="w-3.5 h-3.5" />
                            Branding complete
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 mb-5">
                    {[
                        { label: "Company name", done: !!formData.company_name },
                        { label: "Address", done: !!formData.company_address },
                        { label: "Logo", done: !!formData.logo_url },
                    ].map(({ label, done }) => (
                        <span key={label} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            done
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                                : "bg-muted text-muted-foreground border border-border"
                        }`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${done ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                            {label}
                        </span>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <Label htmlFor="company_name" className="text-sm font-medium text-foreground flex items-center gap-2">
                            Company Name
                            <HelpTooltip content="Your official business name on invoices and quotes." />
                        </Label>
                        <Input
                            id="company_name"
                            value={formData.company_name}
                            onChange={(e) => handleInputChange("company_name", e.target.value)}
                            placeholder="e.g., Brandcafe"
                            className="h-11 rounded-lg"
                        />
                        {!formData.company_name && (
                            <p className="text-xs text-amber-600 dark:text-amber-500">Required for professional invoices.</p>
                        )}
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                        <Label htmlFor="company_address" className="text-sm font-medium text-foreground flex items-center gap-2">
                            Company Address
                            <HelpTooltip content="Adds credibility; often required for VAT invoices." />
                        </Label>
                        <Textarea
                            id="company_address"
                            value={formData.company_address}
                            onChange={(e) => handleInputChange("company_address", e.target.value)}
                            placeholder="123 Anderson Street, Cape Town, 8001"
                            className="min-h-24 rounded-lg resize-none text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="company_phone" className="text-sm font-medium text-foreground flex items-center gap-2">
                            Business phone
                            <HelpTooltip content="Shown on invoice and quote documents under From." />
                        </Label>
                        <Input
                            id="company_phone"
                            value={formData.phone}
                            onChange={(e) => handleInputChange("phone", e.target.value)}
                            placeholder="e.g., +27 21 123 4567"
                            className="h-11 rounded-lg"
                            inputMode="tel"
                            autoComplete="tel"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="company_website" className="text-sm font-medium text-foreground flex items-center gap-2">
                            Company website
                            <HelpTooltip content="Optional. Shown on documents when set. You can enter example.com or https://example.com" />
                        </Label>
                        <Input
                            id="company_website"
                            value={formData.company_website}
                            onChange={(e) => handleInputChange("company_website", e.target.value)}
                            placeholder="https://yourcompany.com"
                            className="h-11 rounded-lg"
                            inputMode="url"
                            autoComplete="url"
                        />
                    </div>
                    <div className="md:col-span-2 space-y-4 text-left">
                        <div>
                            <p className="text-sm font-semibold text-foreground">Default bank details</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Shown on PDFs when an invoice does not use a saved bank account. Invoice-specific accounts still take priority.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="business_bank_name" className="text-sm font-medium text-foreground">Bank</Label>
                                <Input
                                    id="business_bank_name"
                                    value={formData.business_bank_name}
                                    onChange={(e) => handleInputChange("business_bank_name", e.target.value)}
                                    placeholder="e.g., FNB"
                                    className="h-11 rounded-lg"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="business_account_name" className="text-sm font-medium text-foreground">Account name</Label>
                                <Input
                                    id="business_account_name"
                                    value={formData.business_account_name}
                                    onChange={(e) => handleInputChange("business_account_name", e.target.value)}
                                    placeholder="Business name on account"
                                    className="h-11 rounded-lg"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="business_account_number" className="text-sm font-medium text-foreground">Account number</Label>
                                <Input
                                    id="business_account_number"
                                    value={formData.business_account_number}
                                    onChange={(e) => handleInputChange("business_account_number", e.target.value)}
                                    placeholder="Account number"
                                    className="h-11 rounded-lg"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="business_branch_code" className="text-sm font-medium text-foreground">Branch code</Label>
                                <Input
                                    id="business_branch_code"
                                    value={formData.business_branch_code}
                                    onChange={(e) => handleInputChange("business_branch_code", e.target.value)}
                                    placeholder="e.g., 250655"
                                    className="h-11 rounded-lg"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="settings-default-currency" className="text-sm font-medium text-foreground">Default Currency</Label>
                        <CurrencySelector
                            id="settings-default-currency"
                            label=""
                            value={formData.currency}
                            onChange={(v) => handleInputChange("currency", v)}
                            className="h-11 rounded-lg"
                        />
                        <p className="text-xs text-muted-foreground">Used for new invoices.</p>
                    </div>
                </div>
            </SettingsCard>

            <SettingsCard
                title="Logo & Branding"
                description="Upload your high-res logo for professional document headers."
            >
                <div className="flex flex-col md:flex-row items-center gap-8 p-6 bg-muted/50 rounded-2xl border border-dashed border-border">
                    <SettingsLogoPreviews logoUrl={formData.logo_url} />
                    <div className="flex-1 space-y-2 text-center md:text-left">
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                            <label
                                htmlFor="logo-upload"
                                className="cursor-pointer inline-flex items-center justify-center gap-2 px-6 py-2 bg-background border border-border rounded-xl font-bold text-foreground hover:bg-muted/60 transition-colors"
                            >
                                <UploadCloud className="w-4 h-4" />
                                {logoFile ? logoFile.name : (formData.logo_url ? "Change Image" : "Upload Image")}
                            </label>
                            {formData.logo_url && (
                                <Button type="button" variant="outline" size="sm" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={handleRemoveLogo}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                        <input
                          id="logo-upload"
                          name="logo-upload"
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/svg+xml"
                          className="hidden"
                          onChange={handleLogoChange}
                        />
                        <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                            One logo for profile, invoices, and quotes — saved to your profile and loaded from storage on each visit.
                        </p>
                        <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                            JPEG, PNG, or SVG (SVG scales best in PDFs). Max {logoMaxSizeLabel()}. Width under {LOGO_CONSTRAINTS.RECOMMENDED_WIDTH_PX}px.
                        </p>
                        {logoFile && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-500 flex items-center gap-1 justify-center md:justify-start">
                                <Check className="w-3 h-3" /> Ready: {logoFile.name}
                            </p>
                        )}
                    </div>
                </div>
            </SettingsCard>

            <SettingsCard
                title="Branding & Documents"
                description="These options apply to invoices and quotes."
            >
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="invoice_header" className="text-sm font-medium text-foreground flex items-center gap-2">
                            Invoice Header Message
                            <HelpTooltip content="e.g. 'Tax Invoice' or your slogan." />
                        </Label>
                        <Textarea
                            id="invoice_header"
                            value={formData.invoice_header}
                            onChange={(e) => handleInputChange("invoice_header", e.target.value)}
                            placeholder="e.g., Thank you for your business!"
                            className="min-h-16 rounded-lg resize-none text-sm border-border"
                        />
                    </div>

                    {/* Document Template */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                            Document Template
                            <HelpTooltip content="Applies to PDF exports for invoices and quotes." />
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-w-0" role="radiogroup" aria-label="Document templates">
                            {DOCUMENT_TEMPLATES.map((template) => {
                                const isSelected = formData.invoice_template === template.id;
                                const selectTemplate = () => handleInputChange("invoice_template", template.id);
                                return (
                                <div
                                    key={template.id}
                                    role="radio"
                                    tabIndex={0}
                                    aria-checked={isSelected}
                                    aria-label={`${template.name} template`}
                                    onClick={selectTemplate}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            selectTemplate();
                                        }
                                    }}
                                    className={`relative cursor-pointer text-left rounded-xl border-2 p-3 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
                                        isSelected
                                            ? "border-orange-500 ring-2 ring-orange-500/30"
                                            : "border-border hover:border-primary/40"
                                    }`}
                                >
                                    {isSelected && (
                                        <div className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center z-10">
                                            <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
                                        </div>
                                    )}
                                    <div
                                        className="aspect-[3/4] rounded-lg mb-2 overflow-hidden border border-border"
                                        style={{ backgroundColor: template.colors[1] }}
                                    >
                                        <div className="h-1/4 p-2" style={{ backgroundColor: template.colors[0] }}>
                                            <div className="w-6 h-1.5 rounded-full bg-white/80 mb-1" />
                                            <div className="w-10 h-1 rounded-full bg-white/50" />
                                        </div>
                                        <div className="p-2 space-y-1.5">
                                            <div className="flex gap-1">
                                                <div className="w-8 h-1 rounded-full bg-border" />
                                                <div className="w-6 h-1 rounded-full bg-border" />
                                            </div>
                                            <div className="w-full h-0.5 bg-border rounded-full" />
                                            <div className="w-full h-0.5 bg-border rounded-full" />
                                            <div className="w-3/4 h-0.5 bg-border rounded-full" />
                                            <div className="mt-2 flex justify-end">
                                                <div className="w-8 h-2 rounded" style={{ backgroundColor: template.colors[2] }} />
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm font-medium text-foreground text-center">{template.name}</p>
                                    <p className="text-[11px] text-muted-foreground text-center mt-0.5">{template.description}</p>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handlePreviewTemplate(template.id);
                                        }}
                                        className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        Preview
                                    </button>
                                </div>
                                );
                            })}
                        </div>

                        <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-3">
                            <div>
                                <Label className="text-sm font-medium text-foreground">Document accent colours</Label>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Used for the Paidly Document layout (bars, highlights, totals). Leave as default for Paidly orange, or pick your brand hex colours.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="document_brand_primary" className="text-xs text-muted-foreground">
                                        Primary accent
                                    </Label>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            id="document_brand_primary"
                                            type="color"
                                            className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background p-0.5"
                                            value={
                                                parseDocumentBrandHex(formData.document_brand_primary) ||
                                                DEFAULT_DOCUMENT_BRAND_PRIMARY
                                            }
                                            onChange={(e) => handleInputChange("document_brand_primary", e.target.value)}
                                            aria-label="Primary document accent colour"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs h-9"
                                            onClick={() => handleInputChange("document_brand_primary", "")}
                                        >
                                            Paidly default
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="document_brand_secondary" className="text-xs text-muted-foreground">
                                        Secondary accent
                                    </Label>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            id="document_brand_secondary"
                                            type="color"
                                            className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background p-0.5"
                                            value={
                                                parseDocumentBrandHex(formData.document_brand_secondary) ||
                                                DEFAULT_DOCUMENT_BRAND_SECONDARY
                                            }
                                            onChange={(e) => handleInputChange("document_brand_secondary", e.target.value)}
                                            aria-label="Secondary document accent colour"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs h-9"
                                            onClick={() => handleInputChange("document_brand_secondary", "")}
                                        >
                                            Paidly default
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleSaveInvoiceTemplate}
                                disabled={isSavingTemplate}
                                className="bg-gradient-to-r from-primary to-[#ff7c00] hover:from-primary/90 hover:to-[#ff7c00] text-white disabled:opacity-70"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {isSavingTemplate ? "Saving..." : "Save template"}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handlePreviewTemplate}
                                className="border-border text-muted-foreground hover:bg-muted/60"
                            >
                                <FileText className="w-4 h-4 mr-2" />
                                Preview with my data
                            </Button>
                            {(authUser?.invoice_template || DEFAULT_INVOICE_TEMPLATE) !==
                                (formData.invoice_template || DEFAULT_INVOICE_TEMPLATE) && (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                    Unsaved template change
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </SettingsCard>

            <div className="flex justify-end pt-2">
                <Button
                    type="submit"
                    disabled={isSaving}
                    className={`${
                        logoFile 
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 animate-pulse' 
                            : 'bg-gradient-to-r from-primary to-[#ff7c00] hover:from-primary/90 hover:to-[#ff7c00]'
                    } text-white px-8 py-3 rounded-xl shadow-lg transition-all`}
                >
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? "Saving..." : logoFile ? "Save Changes (Logo Ready)" : "Save Changes"}
                </Button>
            </div>
        </form>
        </>
    );
}

function ResetAppSection() {
    const { hardResetApp } = useAuth();
    const [open, setOpen] = useState(false);

    return (
        <SettingsCard
            title="This device"
            description="If Paidly acts strangely only in this browser, reset local data and sign in again."
        >
            <p className="text-sm text-muted-foreground">
                Supabase keeps auth in <span className="font-medium">session</span> storage for this tab (not mixed with
                long-lived local storage used for things like theme). Reset clears{" "}
                <span className="font-medium">all</span> site data in this browser and opens sign-in.
            </p>
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" className="mt-4 border-border text-foreground">
                        Reset app
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset this browser&apos;s Paidly data?</AlertDialogTitle>
                        <AlertDialogDescription className="text-left">
                            You will be signed out. Local theme, drafts, and other cached data for this site are removed.
                            Your data in the cloud is not deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                                setOpen(false);
                                hardResetApp();
                            }}
                        >
                            Reset and go to sign in
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </SettingsCard>
    );
}

function DeleteAccountSection() {
    const { logout } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);

    const handleDelete = async () => {
        if (typed !== "DELETE") return;
        setBusy(true);
        try {
            const session = await getStableSession();
            const token = session?.access_token;
            if (!token) {
                throw new Error("Authentication required. Sign in again.");
            }
            await deleteMyAccount(token);
            toast({
                title: "Account deleted",
                description: "Your account and owned data have been removed.",
                variant: "success",
            });
            setOpen(false);
            setTyped("");
            await logout();
            navigate(createPageUrl("Login"));
        } catch (e) {
            toast({
                title: "Could not delete account",
                description:
                    e?.message ||
                    "Ensure the Paidly API is deployed and VITE_SERVER_URL is set, or contact support.",
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsCard
            title="Danger zone"
            description="Permanently delete your Paidly account and data tied to it."
        >
            <p className="text-sm text-muted-foreground">
                Deletes your auth account, profile, and every organization you own (invoices, clients, quotes, services,
                banking details, and related records). Uploaded logos in storage are removed. Platform subscription and
                waitlist rows for your email are cleared. If you only belong to someone else&apos;s organization, that
                organization is unchanged and your membership is removed.
            </p>
            <AlertDialog
                open={open}
                onOpenChange={(next) => {
                    setOpen(next);
                    if (!next) setTyped("");
                }}
            >
                <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" className="mt-4">
                        Delete my account
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete account permanently?</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3 text-left">
                            <span className="block">
                                This cannot be undone. Type <strong>DELETE</strong> below to confirm.
                            </span>
                            <Input
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                                placeholder="DELETE"
                                autoComplete="off"
                                aria-label="Type DELETE to confirm"
                                className="font-mono"
                            />
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={busy || typed !== "DELETE"}
                            onClick={() => void handleDelete()}
                        >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete forever"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </SettingsCard>
    );
}

function PaymentMethodsSettings() {
    const { user: authUser, refreshUser } = useAuth();
    const [bankingDetails, setBankingDetails] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingDetail, setEditingDetail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [isSavingDefaults, setIsSavingDefaults] = useState(false);
    const [defaultBankForm, setDefaultBankForm] = useState({
        business_bank_name: "",
        business_account_name: "",
        business_account_number: "",
        business_branch_code: "",
    });
    const bankingFileInputRef = useRef(null);
    const { toast } = useToast();

    useEffect(() => {
        loadBankingDetails();
    }, []);

    useEffect(() => {
        const b = businessFieldsFromProfile(authUser?.business);
        setDefaultBankForm({
            business_bank_name: b.bank_name || "",
            business_account_name: b.account_name || "",
            business_account_number: b.account_number || "",
            business_branch_code: b.branch_code || "",
        });
    }, [authUser?.id, authUser?.business]);

    const loadBankingDetails = async () => {
        setIsLoading(true);
        try {
            const detailsData = await BankingDetail.list("-created_date");
            setBankingDetails(detailsData || []);
        } catch (error) {
            console.error("Error loading banking details:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveDetail = async (detailData) => {
        try {
            if (editingDetail) {
                await BankingDetail.update(editingDetail.id, detailData);
                toast({ title: "✓ Banking Details Updated", description: "Your banking information has been updated.", variant: "success" });
            } else {
                await BankingDetail.create(detailData);
                toast({ title: "✓ Banking Details Added", description: "New banking information has been added.", variant: "success" });
            }
            setShowForm(false);
            setEditingDetail(null);
            loadBankingDetails();
        } catch (error) {
            console.error("Error saving banking detail:", error);
            toast({ title: "✗ Error", description: "Failed to save banking details.", variant: "destructive" });
        }
    };

    const handleEditDetail = (detail) => {
        setEditingDetail(detail);
        setShowForm(true);
    };

    const handleSetDefault = async (detailId) => {
        try {
            await Promise.all(bankingDetails.map((d) => BankingDetail.update(d.id, { ...d, is_default: d.id === detailId })));
            const selected = bankingDetails.find((d) => d.id === detailId);
            if (selected) {
                await User.updateMyUserData({
                    business: {
                        bank_name: selected.bank_name || "",
                        account_name: selected.account_name || "",
                        account_number: selected.account_number || "",
                        branch_code: selected.routing_number || "",
                    },
                });
                await refreshUser();
            }
            loadBankingDetails();
            toast({ title: "✓ Default Updated", description: "Default payment method and profile bank defaults updated.", variant: "success" });
        } catch (error) {
            console.error("Error setting default:", error);
            toast({ title: "✗ Error", description: "Failed to update default.", variant: "destructive" });
        }
    };

    const handleDefaultBankInputChange = (field, value) => {
        setDefaultBankForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaveProfileDefaults = async () => {
        setIsSavingDefaults(true);
        try {
            const payload = {
                business: compactBusinessForProfile(defaultBankForm),
            };
            await User.updateMyUserData(payload);

            // If there are no saved payment methods yet, create one from defaults so invoices can select it.
            const normalized = compactBusinessForProfile(defaultBankForm);
            const canCreateSavedMethod = Boolean(normalized.bank_name && normalized.account_name);
            if (bankingDetails.length === 0 && canCreateSavedMethod) {
                await BankingDetail.create({
                    bank_name: normalized.bank_name,
                    account_name: normalized.account_name,
                    account_number: normalized.account_number || "",
                    routing_number: normalized.branch_code || "",
                    payment_method: "bank_transfer",
                    additional_info: "Auto-created from Default Bank Details",
                    is_default: true,
                });
                await loadBankingDetails();
            }

            await refreshUser();
            toast({
                title: "✓ Default bank details updated",
                description:
                    bankingDetails.length === 0 && canCreateSavedMethod
                        ? "Profile defaults saved and added as your first payment method. Invoice-specific methods still override defaults."
                        : "Profile defaults saved. Invoice-specific payment methods still override these values.",
                variant: "success",
            });
        } catch (error) {
            console.error("Error saving profile default bank details:", error);
            toast({
                title: "✗ Error",
                description: error?.message || "Failed to save default bank details.",
                variant: "destructive",
            });
        } finally {
            setIsSavingDefaults(false);
        }
    };

    const handleRemoveDetail = async (detail) => {
        const label = detail.account_name || detail.bank_name || "this payment method";
        if (!window.confirm(`Remove ${label}? Invoices already using it will keep the saved details.`)) return;
        try {
            await BankingDetail.delete(detail.id);
            setBankingDetails((prev) => prev.filter((d) => d.id !== detail.id));
            toast({ title: "✓ Removed", description: "Payment method removed.", variant: "success" });
        } catch (error) {
            console.error("Error removing payment method:", error);
            toast({ title: "✗ Error", description: "Failed to remove payment method.", variant: "destructive" });
        }
    };

    const handleExportBanking = () => {
        try {
            const csvContent = bankingDetailsToCsv(bankingDetails);
            const blob = new Blob([csvContent], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `BankingDetail_export_${Date.now()}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: "Export complete", description: `${bankingDetails.length} payment method(s) exported.`, variant: "default" });
        } catch (error) {
            toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" });
        }
    };

    const handleImportBanking = () => bankingFileInputRef.current?.click();

    const handleImportBankingFile = async (e) => {
        const file = e.target?.files?.[0];
        e.target.value = "";
        if (!file) return;
        setIsImporting(true);
        try {
            const text = await file.text();
            const { headers, rows } = parseBankingCsv(text);
            let created = 0;
            let skipped = 0;
            for (const row of rows) {
                const payload = csvRowToBankingDetailPayload(headers, row);
                if (!payload) continue;
                try {
                    await BankingDetail.create(payload);
                    created++;
                } catch {
                    skipped++;
                }
            }
            await loadBankingDetails();
            toast({ title: "Import complete", description: `${created} imported${skipped ? `, ${skipped} skipped.` : "."}`, variant: "default" });
        } catch (error) {
            toast({ title: "Import failed", description: error?.message || "Could not parse CSV.", variant: "destructive" });
        } finally {
            setIsImporting(false);
        }
    };

    const maskAccount = (num) => (num && num.length >= 4 ? `****${num.slice(-4)}` : "****");

    const formatAddedDate = (d) => {
        if (!d) return "";
        const date = typeof d === "string" ? new Date(d) : d;
        return date.toLocaleDateString("en-ZA", { day: "numeric", month: "numeric", year: "numeric" });
    };

    return (
        <div className="max-w-6xl mx-auto">
            <input
                type="file"
                name="banking_details_import_csv"
                ref={bankingFileInputRef}
                accept=".csv"
                className="hidden"
                onChange={handleImportBankingFile}
            />

            {/* Header Actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div>
                    <h2 className="text-2xl font-black text-foreground">Payment Methods</h2>
                    <p className="text-muted-foreground mt-1">Manage where clients deposit your hard-earned money.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={handleImportBanking} disabled={isImporting} className="flex items-center gap-2 px-4 py-2 border-border rounded-xl font-bold text-muted-foreground hover:bg-muted/60">
                        <Upload className="w-4 h-4" />
                        {isImporting ? "Importing…" : "Import CSV"}
                    </Button>
                    <Button variant="outline" onClick={handleExportBanking} disabled={bankingDetails.length === 0} className="flex items-center gap-2 px-4 py-2 border-border rounded-xl font-bold text-muted-foreground hover:bg-muted/60">
                        <Download className="w-4 h-4" />
                        Export CSV
                    </Button>
                    <Button
                        onClick={() => setShowForm(true)}
                        data-testid="bank-add-method"
                        className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-100 dark:shadow-orange-900/30"
                    >
                        <Plus className="w-5 h-5" />
                        Add Payment Method
                    </Button>
                </div>
            </div>

            <SettingsCard
                title="Default Bank Details"
                description="Shown on PDFs when an invoice does not use a saved bank account. Invoice-specific payment methods still take priority."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="pm_default_bank_name" className="text-sm font-medium text-foreground">Bank</Label>
                        <Input
                            id="pm_default_bank_name"
                            value={defaultBankForm.business_bank_name}
                            onChange={(e) => handleDefaultBankInputChange("business_bank_name", e.target.value)}
                            placeholder="e.g., FNB"
                            className="h-11 rounded-lg"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="pm_default_account_name" className="text-sm font-medium text-foreground">Account name</Label>
                        <Input
                            id="pm_default_account_name"
                            value={defaultBankForm.business_account_name}
                            onChange={(e) => handleDefaultBankInputChange("business_account_name", e.target.value)}
                            placeholder="Business name on account"
                            className="h-11 rounded-lg"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="pm_default_account_number" className="text-sm font-medium text-foreground">Account number</Label>
                        <Input
                            id="pm_default_account_number"
                            value={defaultBankForm.business_account_number}
                            onChange={(e) => handleDefaultBankInputChange("business_account_number", e.target.value)}
                            placeholder="Account number"
                            className="h-11 rounded-lg"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="pm_default_branch_code" className="text-sm font-medium text-foreground">Branch code</Label>
                        <Input
                            id="pm_default_branch_code"
                            value={defaultBankForm.business_branch_code}
                            onChange={(e) => handleDefaultBankInputChange("business_branch_code", e.target.value)}
                            placeholder="e.g., 250655"
                            className="h-11 rounded-lg"
                        />
                    </div>
                </div>
                <div className="mt-4 flex justify-end">
                    <Button
                        type="button"
                        onClick={handleSaveProfileDefaults}
                        disabled={isSavingDefaults}
                        className="bg-gradient-to-r from-primary to-[#ff7c00] hover:from-primary/90 hover:to-[#ff7c00] text-white"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {isSavingDefaults ? "Saving..." : "Save Default Bank Details"}
                    </Button>
                </div>
            </SettingsCard>

            {showForm && (
                <BankingForm
                    detail={editingDetail}
                    onSave={handleSaveDetail}
                    onCancel={() => { setShowForm(false); setEditingDetail(null); }}
                />
            )}

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-[280px] rounded-[32px] bg-muted animate-pulse" />
                    ))}
                </div>
            ) : bankingDetails.length === 0 && !showForm ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 rounded-3xl border-2 border-dashed border-border bg-muted/30">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                        <CreditCard className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">No payment methods yet</h3>
                    <p className="text-muted-foreground mb-6 text-center">Add your banking details to get paid.</p>
                    <Button onClick={() => setShowForm(true)} data-testid="bank-add-method-empty" className="bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-100">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Your First Payment Method
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {bankingDetails.map((detail) => (
                        <div
                            key={detail.id}
                            className="group relative bg-background border border-border rounded-[32px] p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                        >
                            {/* Top Row: Logo & Menu */}
                            <div className="flex justify-between items-start mb-8">
                                <div className="w-14 h-14 bg-orange-50 dark:bg-orange-950/50 rounded-2xl flex items-center justify-center border border-orange-100 dark:border-orange-900/50">
                                    <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                                        <Landmark className="w-5 h-5 text-white" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {detail.is_default && (
                                        <div className="bg-amber-100 dark:bg-amber-900/50 p-1.5 rounded-full ring-4 ring-amber-50 dark:ring-amber-800/30">
                                            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                        </div>
                                    )}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="p-2 text-muted-foreground/40 hover:text-foreground">
                                                <MoreVertical className="w-5 h-5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => handleEditDetail(detail)}>
                                                <Edit className="w-4 h-4 mr-2" />
                                                Edit
                                            </DropdownMenuItem>
                                            {!detail.is_default && (
                                                <DropdownMenuItem onClick={() => handleSetDefault(detail.id)}>
                                                    <Star className="w-4 h-4 mr-2" />
                                                    Set as Default
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => handleRemoveDetail(detail)}
                                                className="text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                Remove payment method
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            {/* Account Details */}
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Account Holder</p>
                                <h3 className="text-lg font-black text-foreground truncate">{detail.account_name || "—"}</h3>
                            </div>

                            <div className="mt-6 flex justify-between items-end">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Account Number</p>
                                    <p className="text-xl font-bold text-foreground tracking-tighter tabular-nums">{maskAccount(detail.account_number)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Bank</p>
                                    <p className="text-sm font-bold text-muted-foreground">{detail.bank_name || "—"}</p>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="mt-8 pt-6 border-t border-border/50 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-muted-foreground">ADDED {formatAddedDate(detail.created_date || detail.created_at)}</span>
                                <button
                                    onClick={() => handleEditDetail(detail)}
                                    className="text-[10px] font-bold text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    EDIT DETAILS <ChevronRight className="w-3 h-3 inline" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Add New Placeholder */}
                    <button
                        onClick={() => setShowForm(true)}
                        className="border-2 border-dashed border-border rounded-[32px] p-6 flex flex-col items-center justify-center gap-4 text-muted-foreground hover:border-orange-300 dark:hover:border-orange-700 hover:text-orange-500 transition-all min-h-[280px]"
                    >
                        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center border border-border group-hover:bg-orange-50 dark:group-hover:bg-orange-950/30">
                            <Plus className="w-6 h-6" />
                        </div>
                        <span className="font-bold text-sm">Add New Account</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function PersonalAccountSettings() {
    const { user: authUser, refreshUser } = useAuth();
    const { toast } = useToast();
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!authUser?.id) {
            setIsLoading(false);
            return;
        }
        setDisplayName(authUser.full_name || authUser.display_name || "");
        setEmail(authUser.email || "");
    }, [authUser?.id, authUser?.full_name, authUser?.display_name, authUser?.email]);

    useEffect(() => {
        if (!authUser?.id) {
            setIsLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            setIsLoading(true);
            try {
                const { data } = await selectProfileByUserId(supabase, authUser.id);
                if (cancelled || !data) return;
                setDisplayName(data.full_name || authUser.full_name || authUser.display_name || "");
                setEmail(data.email || authUser.email || "");
            } catch {
                /* profile load optional */
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authUser?.id]);

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const full_name = displayName.trim();
            await User.updateMyUserData({ full_name });
            if (authUser?.id) {
                const { error } = await supabase
                    .from("profiles")
                    .upsert(
                        { id: authUser.id, full_name, updated_at: new Date().toISOString() },
                        { onConflict: "id" }
                    );
                if (error) throw error;
            }
            await refreshUser();
            toast({
                title: "Account updated",
                description: "Your personal details were saved.",
                variant: "success",
            });
        } catch (error) {
            toast({
                title: "Could not save",
                description: error?.message || "Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="animate-pulse space-y-6">
                <div className="h-12 bg-muted rounded-xl w-full" />
                <div className="h-12 bg-muted rounded-xl w-full" />
                <div className="h-28 bg-muted rounded-xl w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <form onSubmit={handleSave}>
                <SettingsCard
                    title="My account"
                    description="Personal details used for your dashboard greeting and account identity."
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <Label htmlFor="account_display_name" className="text-sm font-medium text-foreground">
                                Display name
                            </Label>
                            <Input
                                id="account_display_name"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="e.g., Mando Mavelele"
                                className="h-11 rounded-lg"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="account_email" className="text-sm font-medium text-foreground">
                                Email
                            </Label>
                            <Input
                                id="account_email"
                                value={email}
                                readOnly
                                disabled
                                className="h-11 rounded-lg bg-muted/50"
                            />
                            <p className="text-xs text-muted-foreground">Contact support to change your sign-in email.</p>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                        <Button
                            type="submit"
                            disabled={isSaving}
                            className="bg-gradient-to-r from-primary to-[#ff7c00] hover:from-primary/90 hover:to-[#ff7c00] text-white px-8 py-3 rounded-xl shadow-lg"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {isSaving ? "Saving…" : "Save changes"}
                        </Button>
                    </div>
                </SettingsCard>
            </form>
            <SettingsCard title="Security" description="Protect your account with two-factor authentication.">
                <TwoFactorSettings />
            </SettingsCard>
            <ResetAppSection />
            <DeleteAccountSection />
        </div>
    );
}

const SETTINGS_TABS = [
    { value: "account", label: "My Account", icon: UserIcon, permission: PERMISSIONS.VIEW_OWN_PROFILE },
    { value: "profile", label: "Company Profile", icon: SettingsIcon, permission: PERMISSIONS.MANAGE_COMPANY_SETTINGS },
    { value: "brands", label: "Brands", icon: Building2, permission: PERMISSIONS.VIEW_OWN_PROFILE },
    { value: "team", label: "Team Members", icon: Users, permission: PERMISSIONS.VIEW_TEAM_MEMBERS },
    { value: "company-team", label: "Company Team", icon: Building2, permission: PERMISSIONS.VIEW_TEAM_MEMBERS },
    { value: "currency", label: "Currency", icon: DollarSign, permission: PERMISSIONS.MANAGE_COMPANY_SETTINGS },
    { value: "payments", label: "Payment Methods", icon: CreditCard, permission: PERMISSIONS.MANAGE_COMPANY_SETTINGS },
    { value: "integrations", label: "Integrations", icon: Plug, permission: PERMISSIONS.MANAGE_COMPANY_SETTINGS },
    { value: "reminders", label: "Reminders", icon: Bell, permission: PERMISSIONS.MANAGE_COMPANY_SETTINGS },
    { value: "subscription", label: "Subscription", icon: Award, permission: PERMISSIONS.MANAGE_COMPANY_SETTINGS },
];

function SettingsTabPanels({ activeTab }) {
    switch (activeTab) {
        case "account":
            return <PersonalAccountSettings />;
        case "profile":
            return <CompanyProfileSettings />;
        case "brands":
            return (
                <SettingsCard
                    title="Company / brand"
                    description="Trading names and logos for invoices. This is not a separate Paidly account."
                >
                    <OrgBrandsSettings />
                </SettingsCard>
            );
        case "team":
            return (
                <SettingsCard title="Team Members" description="Invite teammates and manage who belongs to your company.">
                    <CompanyTeamMembersPanel />
                </SettingsCard>
            );
        case "company-team":
            return (
                <SettingsCard title="Company Team" description="HR and team tools for your organization — role-based for each member.">
                    <CompanyOverviewPanel />
                    <RoleBasedDashboardPanel />
                </SettingsCard>
            );
        case "currency":
            return (
                <SettingsCard title="Currency" description="Configure your default currency and multi-currency preferences.">
                    <CurrencyConfiguration />
                </SettingsCard>
            );
        case "payments":
            return (
                <SettingsCard title="Payment Methods" description="Add banking details for clients to pay your invoices.">
                    <PaymentMethodsSettings />
                </SettingsCard>
            );
        case "integrations":
            return (
                <SettingsCard title="POS integrations" description="Connect your point of sale to sync sales and update inventory automatically.">
                    <PosIntegrationSettings />
                </SettingsCard>
            );
        case "reminders":
            return (
                <SettingsCard title="Reminders" description="Set up payment reminders and follow-up notifications.">
                    <div className="space-y-8">
                        <PaymentReminderSettings />
                        <QuoteReminderSettings />
                        <ReminderDashboard />
                    </div>
                </SettingsCard>
            );
        case "subscription":
            return (
                <SettingsCard title="Subscription" description="Manage your plan and billing.">
                    <SubscriptionSettings />
                </SettingsCard>
            );
        default:
            return null;
    }
}

function resolveSettingsTab(tabParam, allowedTabIds, fallbackTab) {
    if (tabParam && allowedTabIds.has(tabParam)) return tabParam;
    return fallbackTab;
}

export default function Settings() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { hasPermission, loading: companyLoading, companyRole, companyRoleLabel } = useCompanyContext();
    const visibleTabs = useMemo(() => {
        if (companyLoading) return [];
        // Solo business owners without company RBAC context see full settings.
        if (!companyRole) return SETTINGS_TABS;
        return SETTINGS_TABS.filter((tab) => hasPermission(tab.permission));
    }, [companyLoading, hasPermission, companyRole]);
    const defaultTab =
        visibleTabs.find((t) => t.value === "profile")?.value ||
        visibleTabs.find((t) => t.value === "account")?.value ||
        visibleTabs[0]?.value ||
        "profile";
    const visibleTabIds = useMemo(() => new Set(visibleTabs.map((t) => t.value)), [visibleTabs]);
    const activeTab = resolveSettingsTab(searchParams.get("tab"), visibleTabIds, defaultTab);
    const isEmployeeSettings = companyRole === "employee";

    useEffect(() => {
        const raw = searchParams.get("tab");
        if (companyLoading) return;
        if (raw === "security") {
            const next = new URLSearchParams(searchParams);
            next.set("tab", "account");
            setSearchParams(next, { replace: true });
            return;
        }
        if (raw && !visibleTabIds.has(raw)) {
            const next = new URLSearchParams(searchParams);
            next.delete("tab");
            setSearchParams(next, { replace: true });
        }
    }, [searchParams, setSearchParams, visibleTabIds, companyLoading]);

    const setActiveTab = (value) => {
        const next = new URLSearchParams(searchParams);
        if (value === defaultTab) {
            next.delete("tab");
        } else {
            next.set("tab", value);
        }
        setSearchParams(next, { replace: true });
    };

    if (companyLoading) {
        return (
            <div className="w-full min-w-0 mobile-page overflow-x-hidden">
                <div className="max-w-5xl mx-auto py-6 sm:py-10 px-4 sm:px-6 lg:px-8 min-w-0 pb-[max(6rem,calc(4rem+env(safe-area-inset-bottom,0px)))] lg:pb-16">
                    <div className="flex min-h-[40vh] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading settings" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-w-0 mobile-page overflow-x-hidden">
            <div className="max-w-5xl mx-auto py-6 sm:py-10 px-4 sm:px-6 lg:px-8 min-w-0 pb-[max(6rem,calc(4rem+env(safe-area-inset-bottom,0px)))] lg:pb-16">
                <header className="mb-6 sm:mb-8">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Settings</h1>
                        {companyRole ? (
                            <Badge variant="outline" className="capitalize font-normal">
                                Company {companyRoleLabel}
                            </Badge>
                        ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isEmployeeSettings
                            ? "Manage your personal account and security."
                            : "Manage your account and business preferences."}
                    </p>
                </header>

                {/* Mobile: compact dropdown selector */}
                {visibleTabs.length > 1 ? (
                <div className="md:hidden mb-4">
                    <div className="relative">
                        <select
                            value={activeTab}
                            onChange={(e) => setActiveTab(e.target.value)}
                            className="w-full h-11 appearance-none rounded-xl border border-border bg-background pl-4 pr-10 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            aria-label="Select settings section"
                        >
                            {visibleTabs.map((tab) => (
                                <option key={tab.value} value={tab.value}>{tab.label}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                </div>
                ) : null}

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex flex-col md:flex-row md:gap-8 md:items-start">
                        {visibleTabs.length > 1 ? (
                        <TabsList
                            className="hidden md:flex w-44 shrink-0 flex-col h-auto gap-0.5 bg-transparent p-0 items-stretch justify-start"
                            aria-label="Settings sections"
                        >
                            {visibleTabs.map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <TabsTrigger
                                        key={tab.value}
                                        value={tab.value}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 justify-start
                                            data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:ring-0
                                            data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/60"
                                    >
                                        <Icon className="w-4 h-4 shrink-0" />
                                        {tab.label}
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                        ) : null}

                        <div className="min-w-0 flex-1 w-full">
                            <SettingsTabPanels activeTab={activeTab} />
                        </div>
                    </div>
                </Tabs>
            </div>
        </div>
    );
}