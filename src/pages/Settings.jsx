import React, { useState, useEffect, useRef } from "react";
import { User, BankingDetail } from "@/api/entities";
import SupabaseStorageService from "@/services/SupabaseStorageService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Settings as SettingsIcon, Image as ImageIcon, UploadCloud, CreditCard, Plus, Globe, Bell, Award, Check, FileText, DollarSign, User as UserIcon, Trash2, Download, Upload } from "lucide-react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/components/auth/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import LogoImage from "@/components/shared/LogoImage";

import BankingCard from "@/components/banking/BankingCard";
import HelpTooltip from "@/components/shared/HelpTooltip";
import BankingForm from "@/components/banking/BankingForm";
import CurrencySelector from "@/components/CurrencySelector";
import PaymentReminderSettings from "@/components/reminders/PaymentReminderSettings";
import SubscriptionSettings from "@/components/subscription/SubscriptionSettings";
import CurrencyConfiguration from "@/components/currency/CurrencyConfiguration";
import { bankingDetailsToCsv, parseBankingCsv, csvRowToBankingDetailPayload } from "@/utils/bankingCsvMapping";

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
            
            // Validate file type (match bucket allowed types: jpeg, png, gif, webp, svg)
            const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
            if (!validTypes.includes(file.type)) {
                toast({
                    title: "Invalid file type",
                    description: "Please upload a PNG, JPG, GIF, WebP, or SVG image.",
                    variant: "destructive"
                });
                return;
            }
            
            // Validate file size (2MB max)
            const maxSize = 2 * 1024 * 1024; // 2MB in bytes
            if (file.size > maxSize) {
                toast({
                    title: "File too large",
                    description: "Please upload an image smaller than 2MB.",
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
                    const publicUrl = await SupabaseStorageService.uploadProfileLogo(logoFile, userId);
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

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {/* Branding Status Card */}
            <div className={`p-5 rounded-xl border-2 ${isBrandingComplete ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-300' : 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300'}`}>
                <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isBrandingComplete ? 'bg-green-500' : 'bg-amber-500'}`}>
                        {isBrandingComplete ? (
                            <Check className="w-7 h-7 text-white" />
                        ) : (
                            <ImageIcon className="w-7 h-7 text-white" />
                        )}
                    </div>
                    <div className="flex-1">
                        <h3 className={`font-bold text-lg mb-1 ${isBrandingComplete ? 'text-status-paid' : 'text-foreground'}`}>
                            {isBrandingComplete ? '✓ Professional Branding Complete!' : '⚠️ Complete Your Branding'}
                        </h3>
                        <p className={`text-sm mb-3 ${isBrandingComplete ? 'text-status-paid' : 'text-muted-foreground'}`}>
                            {isBrandingComplete 
                                ? 'Your invoices will look professional with your logo, company name, and address.' 
                                : 'Add your logo, company name, and address to create professional, credible invoices.'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${formData.company_name ? 'bg-status-paid/10 text-status-paid' : 'bg-muted text-muted-foreground'}`}>
                                {formData.company_name ? '✓' : '○'} Company Name
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${formData.company_address ? 'bg-status-paid/10 text-status-paid' : 'bg-muted text-muted-foreground'}`}>
                                {formData.company_address ? '✓' : '○'} Address
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${formData.logo_url ? 'bg-status-paid/10 text-status-paid' : 'bg-muted text-muted-foreground'}`}>
                                {formData.logo_url ? '✓' : '○'} Logo
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="display_name" className="text-sm font-semibold text-foreground">Dashboard Display Name</Label>
                <Input
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => handleInputChange('display_name', e.target.value)}
                    placeholder="How you want to be greeted (e.g., John, Boss, etc.)"
                    className="h-12 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                    This name will be shown on your dashboard greeting.
                </p>
            </div>

            {/* Company Name - Enhanced */}
            <div className="space-y-2">
                <Label htmlFor="company_name" className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <SettingsIcon className="w-4 h-4" />
                    Company Name (Required for Professional Invoices)
                    <HelpTooltip content="This is your official business name that appears on all invoices and quotes." />
                </Label>
                <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => handleInputChange('company_name', e.target.value)}
                    placeholder="e.g., Acme Corp, John's Consulting LLC, Your Business Name"
                    className="h-12 rounded-xl"
                />
                {!formData.company_name && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                        <span>⚠️</span>
                        <span>Company name is required for professional invoices. It appears prominently in PDF headers.</span>
                    </p>
                )}
                {formData.company_name && (
                    <p className="text-xs text-status-paid">
                        ✓ Will appear on all invoices {formData.logo_url ? "(below your logo)" : "(as main heading)"}
                    </p>
                )}
            </div>
            
            {/* Company Address - Enhanced */}
            <div className="space-y-2">
                <Label htmlFor="company_address" className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Company Address (Highly Recommended)
                    <HelpTooltip content="Your business address adds credibility and is often legally required on invoices." />
                </Label>
                <Textarea
                    id="company_address"
                    value={formData.company_address}
                    onChange={(e) => handleInputChange('company_address', e.target.value)}
                    placeholder="Example:&#10;123 Business Street, Suite 100&#10;Cape Town, Western Cape 8001&#10;South Africa"
                    className="min-h-28 rounded-xl resize-none font-mono text-sm"
                />
                {!formData.company_address && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                        <span>⚠️</span>
                        <span>Address recommended for credibility and legal compliance (especially for VAT invoices).</span>
                    </p>
                )}
                {formData.company_address && (
                    <p className="text-xs text-status-paid">
                        ✓ Address will appear in invoice headers for professional presentation
                    </p>
                )}
            </div>

            <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Default Currency
                </Label>
                <CurrencySelector
                    value={formData.currency}
                    onChange={(value) => handleInputChange('currency', value)}
                    className="h-12 rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                    This currency will be used for all new invoices. You can still change it per invoice if needed.
                </p>
            </div>
            
            {/* Logo & Profile Picture Section - Unified */}
            <div className="space-y-3">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Logo & Profile Picture
                    <HelpTooltip content="Upload one image that serves as both your company logo (on invoices) and profile picture (in the app)." />
                </Label>
                
                {/* Combined Preview & Upload */}
                <div className="p-5 bg-gradient-to-br from-muted to-primary/5 rounded-xl border border-border space-y-4">
                    {/* Dual Preview */}
                    <div className="flex items-center gap-6">
                        {/* Profile Preview (Circular) */}
                        <div className="text-center">
                            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center border-2 border-border shadow-sm overflow-hidden mb-2">
                                {formData.logo_url ? (
                                    formData.logo_url.startsWith('blob:') ? (
                                        <img src={formData.logo_url} alt="Profile" className="object-cover w-full h-full" />
                                    ) : (
                                        <LogoImage src={formData.logo_url} alt="Profile" className="object-cover w-full h-full" />
                                    )
                                ) : (
                                    <UserIcon className="w-10 h-10 text-muted-foreground" />
                                )}
                            </div>
                            <p className="text-[10px] font-semibold text-muted-foreground">Profile</p>
                        </div>

                        {/* Logo Preview (Square) */}
                        <div className="text-center">
                            <div className="w-28 h-20 rounded-lg bg-white flex items-center justify-center border-2 border-dashed border-border shadow-sm mb-2">
                                {formData.logo_url ? (
                                    formData.logo_url.startsWith('blob:') ? (
                                        <img src={formData.logo_url} alt="Logo" className="object-contain w-full h-full p-2" />
                                    ) : (
                                        <LogoImage src={formData.logo_url} alt="Logo" className="object-contain w-full h-full p-2" />
                                    )
                                ) : (
                                    <div className="text-center">
                                        <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto" />
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] font-semibold text-muted-foreground">Invoice Logo</p>
                        </div>

                        {/* Upload Button & Remove */}
                        <div className="flex-1 flex flex-col gap-2">
                            <div className="flex gap-2">
                                <label htmlFor="logo-upload" className="cursor-pointer flex-1 bg-card border-2 border-primary/50 rounded-xl px-5 py-3 text-sm font-semibold text-primary hover:bg-primary/10 hover:border-primary flex items-center justify-center gap-2 transition-all shadow-sm">
                                    <UploadCloud className="w-5 h-5" />
                                    <span>{logoFile ? logoFile.name : (formData.logo_url ? "Change Image" : "Upload Image")}</span>
                                </label>
                                {formData.logo_url && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="default"
                                        className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50"
                                        onClick={handleRemoveLogo}
                                    >
                                        <Trash2 className="w-4 h-4 mr-1" />
                                        Remove
                                    </Button>
                                )}
                            </div>
                            <input 
                                id="logo-upload" 
                                type="file" 
                                accept="image/png,image/jpeg,image/jpg,image/svg+xml" 
                                className="hidden" 
                                onChange={handleLogoChange}
                            />
                            <p className="text-xs text-muted-foreground">PNG, JPG or SVG, max 2MB</p>
                            {logoFile && (
                                <p className="text-xs text-status-paid flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    Ready to save: {logoFile.name}
                                </p>
                            )}
                        </div>
                    </div>
                    
                    {/* Guidelines */}
                    <div className="bg-white rounded-lg p-3 border border-primary/20">
                        <p className="text-xs font-semibold text-foreground mb-2">📐 Image Guidelines:</p>
                        <ul className="text-xs text-muted-foreground space-y-1">
                            <li className="flex items-start gap-1.5">
                                <span className="text-status-paid font-bold mt-0.5">✓</span>
                                <span><strong>Format:</strong> Square (400×400px+), PNG with transparent background recommended</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                                <span className="text-status-paid font-bold mt-0.5">✓</span>
                                <span><strong>Usage:</strong> Appears as profile picture (circular) and invoice logo (full)</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                                <span className="text-primary font-bold mt-0.5">ℹ</span>
                                <span><strong>Size:</strong> Keep under 2MB for optimal performance</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Branding & documents */}
            <h3 className="text-base font-semibold text-foreground pt-2 border-t border-border mt-6">Branding & documents</h3>
            <p className="text-xs text-muted-foreground -mt-1 mb-2">These options apply to invoices and quotes.</p>

            {/* Invoice Header Message */}
            <div className="space-y-2">
                <Label htmlFor="invoice_header" className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Invoice Header Message
                    <HelpTooltip content="A standard message displayed near the top of every invoice, e.g., 'Tax Invoice' or your slogan." />
                </Label>
                <Textarea
                    id="invoice_header"
                    value={formData.invoice_header}
                    onChange={(e) => handleInputChange('invoice_header', e.target.value)}
                    placeholder="Add a custom message that appears at the top of your invoices (e.g., 'Thank you for your business!')"
                    className="min-h-20 rounded-xl resize-none"
                />
                <p className="text-xs text-muted-foreground">
                    This message will appear on all your invoices below the header.
                </p>
            </div>

            {/* Invoice Template Selection */}
            <div className="space-y-3">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Document Template
                    <HelpTooltip content="This template design will apply to all your PDF exports for both Invoices and Quotes." />
                </Label>
                <p className="text-xs text-muted-foreground mb-3">
                    Choose a template style for your invoices and quotes
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="radiogroup" aria-label="Document templates">
                    {DOCUMENT_TEMPLATES.map((template) => (
                        <button
                            type="button"
                            key={template.id}
                            onClick={() => handleInputChange('invoice_template', template.id)}
                            aria-checked={formData.invoice_template === template.id}
                            role="radio"
                            className={`relative text-left rounded-xl border-2 p-3 transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                formData.invoice_template === template.id
                                    ? 'border-primary ring-2 ring-primary/20'
                                    : 'border-border hover:border-border'
                            }`}
                        >
                            {formData.invoice_template === template.id && (
                                <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                    <Check className="w-4 h-4 text-white" />
                                </div>
                            )}
                            {/* Template Preview */}
                            <div 
                                className="aspect-[3/4] rounded-lg mb-2 overflow-hidden border border-border"
                                style={{ backgroundColor: template.colors[1] }}
                            >
                                {/* Header */}
                                <div 
                                    className="h-1/4 p-2"
                                    style={{ backgroundColor: template.colors[0] }}
                                >
                                    <div className="w-6 h-1.5 rounded-full bg-white/80 mb-1"></div>
                                    <div className="w-10 h-1 rounded-full bg-white/50"></div>
                                </div>
                                {/* Content */}
                                <div className="p-2 space-y-1.5">
                                    <div className="flex gap-1">
                                        <div className="w-8 h-1 rounded-full bg-muted"></div>
                                        <div className="w-6 h-1 rounded-full bg-muted"></div>
                                    </div>
                                    <div className="w-full h-0.5 bg-muted rounded-full"></div>
                                    <div className="w-full h-0.5 bg-muted rounded-full"></div>
                                    <div className="w-3/4 h-0.5 bg-muted rounded-full"></div>
                                    <div className="mt-2 flex justify-end">
                                        <div 
                                            className="w-8 h-2 rounded"
                                            style={{ backgroundColor: template.colors[2] }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                            <p className="text-sm font-medium text-foreground text-center">{template.name}</p>
                            <p className="text-[11px] text-muted-foreground text-center mt-1">{template.description}</p>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-end pt-4">
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
            setBankingDetails(detailsData);
        } catch (error) {
            console.error("Error loading banking details:", error);
        }
        setIsLoading(false);
    };

    const handleSaveDetail = async (detailData) => {
        try {
            if (editingDetail) {
                await BankingDetail.update(editingDetail.id, detailData);
                toast({
                    title: "✓ Banking Details Updated",
                    description: "Your banking information has been updated successfully.",
                    variant: "success"
                });
            } else {
                await BankingDetail.create(detailData);
                toast({
                    title: "✓ Banking Details Added",
                    description: "New banking information has been added successfully.",
                    variant: "success"
                });
            }
            setShowForm(false);
            setEditingDetail(null);
            loadBankingDetails();
        } catch (error) {
            console.error("Error saving banking detail:", error);
            toast({
                title: "✗ Error",
                description: "Failed to save banking details. Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleEditDetail = (detail) => {
        setEditingDetail(detail);
        setShowForm(true);
    };

    const handleSetDefault = async (detailId) => {
        try {
            const updatePromises = bankingDetails.map(detail => 
                BankingDetail.update(detail.id, { ...detail, is_default: false })
            );
            await Promise.all(updatePromises);
            
            const detailToUpdate = bankingDetails.find(d => d.id === detailId);
            await BankingDetail.update(detailId, { ...detailToUpdate, is_default: true });
            
            loadBankingDetails();
            toast({
                title: "✓ Default Updated",
                description: "Default banking method has been updated.",
                variant: "success"
            });
        } catch (error) {
            console.error("Error setting default:", error);
            toast({
                title: "✗ Error",
                description: "Failed to update default banking method.",
                variant: "destructive"
            });
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
            console.error("Export banking error:", error);
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
                if (!payload) {
                    skipped++;
                    continue;
                }
                try {
                    await BankingDetail.create(payload);
                    created++;
                } catch (err) {
                    console.warn("Import banking row failed:", payload.bank_name, err);
                    skipped++;
                }
            }
            await loadBankingDetails();
            toast({
                title: "Import complete",
                description: `${created} payment method(s) imported${skipped ? `, ${skipped} skipped.` : "."}`,
                variant: "default"
            });
        } catch (error) {
            console.error("Import banking error:", error);
            toast({ title: "Import failed", description: error?.message || "Could not parse CSV.", variant: "destructive" });
        }
        setIsImporting(false);
    };

    return (
        <div>
            <input
                type="file"
                ref={bankingFileInputRef}
                accept=".csv"
                className="hidden"
                onChange={handleImportBankingFile}
            />
            <div className="flex flex-wrap justify-end gap-2 mb-6">
                <Button
                    variant="outline"
                    onClick={handleImportBanking}
                    disabled={isImporting}
                >
                    <Upload className={`w-4 h-4 mr-2 ${isImporting ? "animate-pulse" : ""}`} />
                    {isImporting ? "Importing…" : "Import CSV"}
                </Button>
                <Button variant="outline" onClick={handleExportBanking} disabled={bankingDetails.length === 0}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                </Button>
                <Button
                    onClick={() => setShowForm(true)}
                    className="bg-primary hover:bg-primary/90 text-white"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Payment Method
                </Button>
            </div>

            {showForm && (
                <BankingForm
                    detail={editingDetail}
                    onSave={handleSaveDetail}
                    onCancel={() => {
                        setShowForm(false);
                        setEditingDetail(null);
                    }}
                />
            )}
            
            {isLoading ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array(3).fill(0).map((_, i) => (
                        <Card key={i} className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                            <CardContent className="p-6"><div className="animate-pulse space-y-4"><div className="h-4 bg-muted rounded w-3/4"></div><div className="h-3 bg-muted rounded w-1/2"></div><div className="h-3 bg-muted rounded w-2/3"></div></div></CardContent>
                        </Card>
                    ))}
                </div>
            ) : bankingDetails.length === 0 && !showForm ? (
                 <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                    <CardContent className="p-8 md:p-12 text-center">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4"><CreditCard className="w-8 h-8 text-muted-foreground" /></div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">No payment methods yet</h3>
                        <p className="text-muted-foreground mb-6">Add your banking details to get paid.</p>
                        <Button onClick={() => setShowForm(true)} className="bg-primary hover:bg-primary/90 text-white"><Plus className="w-4 h-4 mr-2" />Add Your First Payment Method</Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {bankingDetails.map((detail, index) => (
                        <BankingCard
                            key={detail.id}
                            detail={detail}
                            onEdit={handleEditDetail}
                            onSetDefault={handleSetDefault}
                            delay={index * 0.1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function Settings() {
    // Parse URL params to check for tab
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab') || 'profile';

    return (
        <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-2xl sm:text-3xl font-semibold text-foreground font-display">Settings</h1>
                    <p className="text-muted-foreground mt-1">Manage your company branding, payment details, and subscription.</p>
                </motion.div>

                <Tabs defaultValue={initialTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-2">
                        <TabsTrigger value="profile">
                            <SettingsIcon className="w-4 h-4 mr-2" />
                            Company Profile
                        </TabsTrigger>
                        <TabsTrigger value="currency">
                            <DollarSign className="w-4 h-4 mr-2" />
                            Currency
                        </TabsTrigger>
                        <TabsTrigger value="payments">
                            <CreditCard className="w-4 h-4 mr-2" />
                            Payment Methods
                        </TabsTrigger>
                        <TabsTrigger value="reminders">
                            <Bell className="w-4 h-4 mr-2" />
                            Reminders
                        </TabsTrigger>
                        <TabsTrigger value="subscription">
                            <Award className="w-4 h-4 mr-2" />
                            Subscription
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="profile">
                        <Card className="bg-white border-0 shadow-sm mt-4">
                            <CardContent className="p-6 md:p-8">
                                <CompanyProfileSettings />
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="currency">
                        <Card className="bg-white border-0 shadow-sm mt-4">
                            <CardContent className="p-6 md:p-8">
                                <CurrencyConfiguration />
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="payments">
                        <Card className="bg-white border-0 shadow-sm mt-4">
                             <CardContent className="p-6 md:p-8">
                                <PaymentMethodsSettings />
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="reminders">
                        <div className="mt-4">
                            <PaymentReminderSettings />
                        </div>
                    </TabsContent>
                    <TabsContent value="subscription">
                        <Card className="bg-white border-0 shadow-sm mt-4">
                             <CardContent className="p-4 sm:p-6 md:p-8">
                                <SubscriptionSettings />
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}