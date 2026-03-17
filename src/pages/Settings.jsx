import { useState, useEffect, useRef } from "react";
import { User, BankingDetail } from "@/api/entities";
import { uploadLogo, validateLogoFile, LOGO_CONSTRAINTS } from "@/lib/logoUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Settings as SettingsIcon, Image as ImageIcon, UploadCloud, CreditCard, Plus, Bell, Award, Check, FileText, DollarSign, User as UserIcon, Trash2, Download, Upload, ChevronDown, Landmark, Star, MoreVertical, Edit, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/components/auth/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import LogoImage from "@/components/shared/LogoImage";

import HelpTooltip from "@/components/shared/HelpTooltip";
import BankingForm from "@/components/banking/BankingForm";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import CurrencySelector from "@/components/CurrencySelector";
import PaymentReminderSettings from "@/components/reminders/PaymentReminderSettings";
import SubscriptionSettings from "@/components/subscription/SubscriptionSettings";
import CurrencyConfiguration from "@/components/currency/CurrencyConfiguration";
import { bankingDetailsToCsv, parseBankingCsv, csvRowToBankingDetailPayload } from "@/utils/bankingCsvMapping";
import { createPageUrl } from "@/utils";

const SettingsCard = ({ title, description, children }) => (
    <section className="bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-3xl p-8 mb-6 shadow-sm">
        <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
        </div>
        {children}
    </section>
);

const DOCUMENT_TEMPLATES = [
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
    }
];

const PROFILE_COLUMNS = "full_name,email,company_name,company_address,logo_url,currency,timezone,invoice_template,invoice_header";

function CompanyProfileSettings() {
    const { user: authUser, refreshUser } = useAuth();
    const { toast } = useToast();

    // Use Auth session metadata as initial state so Name/Email aren't empty on load
    const [formData, setFormData] = useState(() => ({
        display_name: authUser?.full_name || authUser?.display_name || "",
        email: authUser?.email || "",
        company_name: "",
        company_address: "",
        logo_url: "",
        currency: "USD",
        country: "",
        timezone: "",
        invoice_template: "classic",
        invoice_header: ""
    }));
    const [logoFile, setLogoFile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

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
        setFormData(prev => ({
            ...prev,
            company_name: authUser.company_name ?? prev.company_name,
            company_address: authUser.company_address ?? prev.company_address,
            logo_url: authUser.logo_url ?? prev.logo_url,
            currency: authUser.currency || prev.currency || "USD",
            timezone: authUser.timezone ?? prev.timezone,
            invoice_template: authUser.invoice_template || prev.invoice_template || "classic",
            invoice_header: authUser.invoice_header ?? prev.invoice_header
        }));
    }, [
        authUser?.id,
        authUser?.company_name,
        authUser?.company_address,
        authUser?.logo_url,
        authUser?.currency,
        authUser?.timezone,
        authUser?.invoice_template,
        authUser?.invoice_header
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
                const { data } = await supabase
                    .from("profiles")
                    .select(PROFILE_COLUMNS)
                    .eq("id", authUser.id)
                    .maybeSingle();

                if (cancelled) return;
                if (data) {
                    setFormData(prev => ({
                        ...prev,
                        display_name: data.full_name || prev.display_name,
                        email: data.email || prev.email,
                        company_name: data.company_name || "",
                        company_address: data.company_address || "",
                        logo_url: data.logo_url || "",
                        currency: data.currency || "USD",
                        timezone: data.timezone || "",
                        invoice_template: data.invoice_template || "classic",
                        invoice_header: data.invoice_header || ""
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
                        setIsSaving(false);
                        return;
                    }
                    const publicUrl = await uploadLogo(logoFile, userId);
                    updatedData.logo_url = publicUrl;
                } catch (uploadError) {
                    console.error("Logo upload error:", uploadError);
                    toast({
                        title: "✗ Upload Failed",
                        description: `Failed to upload logo: ${uploadError.message || 'Unknown error'}`,
                        variant: "destructive"
                    });
                    setIsSaving(false);
                    return;
                }
            }
            
            // Map display_name to full_name for Supabase profile (saved per user, restored on login)
            const payload = {
                full_name: updatedData.display_name ?? updatedData.full_name,
                company_name: updatedData.company_name,
                company_address: updatedData.company_address,
                logo_url: updatedData.logo_url,
                currency: updatedData.currency || "USD",
                timezone: updatedData.timezone || "",
                invoice_template: updatedData.invoice_template || "classic",
                invoice_header: updatedData.invoice_header ?? "",
            };
            await User.updateMyUserData(payload);
            setFormData(prev => ({ ...prev, ...payload, display_name: payload.full_name }));
            setLogoFile(null);
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
        }
        setIsSaving(false);
    };
    
    if (isLoading) {
        return (
            <div className="animate-pulse space-y-6">
                <div className="h-12 bg-slate-100 dark:bg-slate-800 rounded-xl w-full" />
                <div className="h-12 bg-slate-100 dark:bg-slate-800 rounded-xl w-full" />
                <div className="h-28 bg-slate-100 dark:bg-slate-800 rounded-xl w-full" />
                <div className="h-28 bg-slate-100 dark:bg-slate-800 rounded-xl w-full" />
                <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-xl w-full" />
            </div>
        );
    }
    
    // Check if branding is complete
    const isBrandingComplete = formData.company_name && formData.company_address && formData.logo_url;

    const handlePreviewTemplate = () => {
        const draftUser = {
            id: authUser?.id,
            full_name: formData.display_name,
            company_name: formData.company_name || "Your Company",
            company_address: formData.company_address || "",
            logo_url: formData.logo_url || "",
            currency: formData.currency || "ZAR",
            invoice_template: formData.invoice_template || "classic",
            invoice_header: formData.invoice_header || ""
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
            sessionStorage.setItem("invoiceDraft", JSON.stringify(sampleDraft));
            window.open(createPageUrl("InvoicePDF") + "?draft=1", "_blank", "noopener,noreferrer");
        } catch (e) {
            console.error("Preview failed:", e);
        }
    };

    return (
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
                    <span className={`px-2.5 py-1 rounded-md text-xs ${formData.company_name ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" : "bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500"}`}>
                        {formData.company_name ? "✓" : "○"} Company
                    </span>
                    <span className={`px-2.5 py-1 rounded-md text-xs ${formData.company_address ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" : "bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500"}`}>
                        {formData.company_address ? "✓" : "○"} Address
                    </span>
                    <span className={`px-2.5 py-1 rounded-md text-xs ${formData.logo_url ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" : "bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500"}`}>
                        {formData.logo_url ? "✓" : "○"} Logo
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <Label htmlFor="display_name" className="text-sm font-medium text-foreground">Dashboard Display Name</Label>
                        <Input
                            id="display_name"
                            value={formData.display_name}
                            onChange={(e) => handleInputChange("display_name", e.target.value)}
                            placeholder="e.g., Mando Mavelele"
                            className="h-11 rounded-lg border-slate-200 dark:border-slate-700"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400">Shown on your dashboard greeting.</p>
                    </div>
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
                            className="h-11 rounded-lg border-slate-200 dark:border-slate-700"
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
                            className="min-h-24 rounded-lg resize-none text-sm border-slate-200 dark:border-slate-700"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-foreground">Default Currency</Label>
                        <CurrencySelector
                            value={formData.currency}
                            onChange={(v) => handleInputChange("currency", v)}
                            className="h-11 rounded-lg"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400">Used for new invoices.</p>
                    </div>
                </div>
            </SettingsCard>

            <SettingsCard
                title="Logo & Branding"
                description="Upload your high-res logo for professional document headers."
            >
                <div className="flex flex-col md:flex-row items-center gap-8 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <div className="flex gap-4">
                        <div className="text-center">
                            <div className="w-20 h-20 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                                {formData.logo_url ? (
                                    formData.logo_url.startsWith("blob:") ? (
                                        <img src={formData.logo_url} alt="Profile" className="object-cover w-full h-full" />
                                    ) : (
                                        <LogoImage src={formData.logo_url} alt="Profile" className="object-cover w-full h-full" />
                                    )
                                ) : (
                                    <UserIcon className="w-10 h-10 text-slate-400" />
                                )}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">Profile</p>
                        </div>
                        <div className="text-center">
                            <div className="w-20 h-20 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                                {formData.logo_url ? (
                                    formData.logo_url.startsWith("blob:") ? (
                                        <img src={formData.logo_url} alt="Logo" className="object-contain w-12 h-12" />
                                    ) : (
                                        <LogoImage src={formData.logo_url} alt="Logo" className="object-contain w-12 h-12" />
                                    )
                                ) : (
                                    <ImageIcon className="w-6 h-6 text-slate-400" />
                                )}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">Invoice</p>
                        </div>
                    </div>
                    <div className="flex-1 space-y-2 text-center md:text-left">
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                            <label
                                htmlFor="logo-upload"
                                className="cursor-pointer inline-flex items-center justify-center gap-2 px-6 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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
                        <input id="logo-upload" name="logo-upload" type="file" accept="image/png,image/svg+xml" className="hidden" onChange={handleLogoChange} />
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            PNG or SVG (SVG preferred for sharp PDFs). Max {Math.round(LOGO_CONSTRAINTS.MAX_SIZE_BYTES / 1024)}KB. Width under {LOGO_CONSTRAINTS.RECOMMENDED_WIDTH_PX}px.
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
                            className="min-h-16 rounded-lg resize-none text-sm border-slate-200 dark:border-slate-700"
                        />
                    </div>

                    {/* Document Template */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                            Document Template
                            <HelpTooltip content="Applies to PDF exports for invoices and quotes." />
                        </Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="radiogroup" aria-label="Document templates">
                            {DOCUMENT_TEMPLATES.map((template) => (
                                <button
                                    type="button"
                                    key={template.id}
                                    onClick={() => handleInputChange("invoice_template", template.id)}
                                    aria-checked={formData.invoice_template === template.id}
                                    role="radio"
                                    className={`relative text-left rounded-xl border-2 p-3 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
                                        formData.invoice_template === template.id
                                            ? "border-orange-500 ring-2 ring-orange-500/30"
                                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                                    }`}
                                >
                                    {formData.invoice_template === template.id && (
                                        <div className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                                            <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
                                        </div>
                                    )}
                                    <div
                                        className="aspect-[3/4] rounded-lg mb-2 overflow-hidden border border-slate-200 dark:border-slate-700"
                                        style={{ backgroundColor: template.colors[1] }}
                                    >
                                        <div className="h-1/4 p-2" style={{ backgroundColor: template.colors[0] }}>
                                            <div className="w-6 h-1.5 rounded-full bg-white/80 mb-1" />
                                            <div className="w-10 h-1 rounded-full bg-white/50" />
                                        </div>
                                        <div className="p-2 space-y-1.5">
                                            <div className="flex gap-1">
                                                <div className="w-8 h-1 rounded-full bg-slate-200 dark:bg-slate-600" />
                                                <div className="w-6 h-1 rounded-full bg-slate-200 dark:bg-slate-600" />
                                            </div>
                                            <div className="w-full h-0.5 bg-slate-200 dark:bg-slate-600 rounded-full" />
                                            <div className="w-full h-0.5 bg-slate-200 dark:bg-slate-600 rounded-full" />
                                            <div className="w-3/4 h-0.5 bg-slate-200 dark:bg-slate-600 rounded-full" />
                                            <div className="mt-2 flex justify-end">
                                                <div className="w-8 h-2 rounded" style={{ backgroundColor: template.colors[2] }} />
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm font-medium text-foreground text-center">{template.name}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center mt-0.5">{template.description}</p>
                                </button>
                            ))}
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handlePreviewTemplate}
                            className="mt-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            Preview with my data
                        </Button>
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
    );
}

function PaymentMethodsSettings() {
    const [bankingDetails, setBankingDetails] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingDetail, setEditingDetail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const bankingFileInputRef = useRef(null);
    const { toast } = useToast();

    useEffect(() => {
        loadBankingDetails();
    }, []);

    const loadBankingDetails = async () => {
        setIsLoading(true);
        try {
            const detailsData = await BankingDetail.list("-created_date");
            setBankingDetails(detailsData || []);
        } catch (error) {
            console.error("Error loading banking details:", error);
        }
        setIsLoading(false);
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
            loadBankingDetails();
            toast({ title: "✓ Default Updated", description: "Default payment method updated.", variant: "success" });
        } catch (error) {
            console.error("Error setting default:", error);
            toast({ title: "✗ Error", description: "Failed to update default.", variant: "destructive" });
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
        }
        setIsImporting(false);
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
                    <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">Payment Methods</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage where clients deposit your hard-earned money.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={handleImportBanking} disabled={isImporting} className="flex items-center gap-2 px-4 py-2 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
                        <Upload className="w-4 h-4" />
                        {isImporting ? "Importing…" : "Import CSV"}
                    </Button>
                    <Button variant="outline" onClick={handleExportBanking} disabled={bankingDetails.length === 0} className="flex items-center gap-2 px-4 py-2 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
                        <Download className="w-4 h-4" />
                        Export CSV
                    </Button>
                    <Button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-100 dark:shadow-orange-900/30">
                        <Plus className="w-5 h-5" />
                        Add Payment Method
                    </Button>
                </div>
            </div>

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
                        <div key={i} className="h-[280px] rounded-[32px] bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                </div>
            ) : bankingDetails.length === 0 && !showForm ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <CreditCard className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">No payment methods yet</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-6 text-center">Add your banking details to get paid.</p>
                    <Button onClick={() => setShowForm(true)} className="bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-100">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Your First Payment Method
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {bankingDetails.map((detail) => (
                        <div
                            key={detail.id}
                            className="group relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[32px] p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
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
                                            <Button variant="ghost" size="icon" className="p-2 text-slate-300 hover:text-slate-600 dark:hover:text-slate-400">
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
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Account Holder</p>
                                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 truncate">{detail.account_name || "—"}</h3>
                            </div>

                            <div className="mt-6 flex justify-between items-end">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Account Number</p>
                                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tighter tabular-nums">{maskAccount(detail.account_number)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Bank</p>
                                    <p className="text-sm font-bold text-slate-600 dark:text-slate-400">{detail.bank_name || "—"}</p>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="mt-8 pt-6 border-t border-slate-50 dark:border-slate-800 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-400">ADDED {formatAddedDate(detail.created_date || detail.created_at)}</span>
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
                        className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[32px] p-6 flex flex-col items-center justify-center gap-4 text-slate-400 hover:border-orange-300 dark:hover:border-orange-700 hover:text-orange-500 transition-all min-h-[280px]"
                    >
                        <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center border border-slate-100 dark:border-slate-700 group-hover:bg-orange-50 dark:group-hover:bg-orange-950/30">
                            <Plus className="w-6 h-6" />
                        </div>
                        <span className="font-bold text-sm">Add New Account</span>
                    </button>
                </div>
            )}
        </div>
    );
}

const SETTINGS_TABS = [
    { value: "profile", label: "Company Profile", icon: SettingsIcon },
    { value: "currency", label: "Currency", icon: DollarSign },
    { value: "payments", label: "Payment Methods", icon: CreditCard },
    { value: "reminders", label: "Reminders", icon: Bell },
    { value: "subscription", label: "Subscription", icon: Award },
];

export default function Settings() {
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get("tab") || "profile";
    const [activeTab, setActiveTab] = useState(initialTab);

    return (
        <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto py-10 px-6">
                <header className="mb-10">
                    <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100">Settings</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Tailor Paidly to your business needs.</p>
                </header>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    {/* Mobile: Dropdown for quick section switching */}
                    <div className="md:hidden mb-4">
                        <div className="relative">
                            <select
                                value={activeTab}
                                onChange={(e) => setActiveTab(e.target.value)}
                                className="w-full h-12 appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-4 pr-10 text-base font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                aria-label="Select settings section"
                            >
                                {SETTINGS_TABS.map((tab) => (
                                    <option key={tab.value} value={tab.value}>
                                        {tab.label}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Desktop: Horizontal tabs */}
                    <TabsList className="hidden md:grid w-full grid-cols-5 gap-2">
                        {SETTINGS_TABS.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <TabsTrigger key={tab.value} value={tab.value}>
                                    <Icon className="w-4 h-4 mr-2" />
                                    {tab.label}
                                </TabsTrigger>
                            );
                        })}
                    </TabsList>
                    <TabsContent value="profile" className="mt-6">
                        <CompanyProfileSettings />
                    </TabsContent>
                    <TabsContent value="currency" className="mt-6">
                        <SettingsCard title="Currency" description="Configure your default currency and multi-currency preferences.">
                            <CurrencyConfiguration />
                        </SettingsCard>
                    </TabsContent>
                    <TabsContent value="payments" className="mt-6">
                        <SettingsCard title="Payment Methods" description="Add banking details for clients to pay your invoices.">
                            <PaymentMethodsSettings />
                        </SettingsCard>
                    </TabsContent>
                    <TabsContent value="reminders" className="mt-6">
                        <SettingsCard title="Reminders" description="Set up payment reminders and follow-up notifications.">
                            <PaymentReminderSettings />
                        </SettingsCard>
                    </TabsContent>
                    <TabsContent value="subscription" className="mt-6">
                        <SettingsCard title="Subscription" description="Manage your plan and billing.">
                            <SubscriptionSettings />
                        </SettingsCard>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}