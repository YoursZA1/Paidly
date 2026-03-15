import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { User, BankingDetail } from "@/api/entities";
import { uploadLogo, validateLogoFile, LOGO_CONSTRAINTS } from "@/lib/logoUpload";
import { Loader2, UploadCloud, CheckCircle, ArrowRight, Building, CreditCard, Image as ImageIcon, X } from "lucide-react";
import CurrencySelector from "@/components/CurrencySelector";
import { motion, AnimatePresence } from "framer-motion";

export default function SetupWizard({ isOpen, onComplete }) {
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [logoFile, setLogoFile] = useState(null);
    
    const [formData, setFormData] = useState({
        full_name: "",
        company_name: "",
        company_address: "",
        logo_url: "",
        currency: "ZAR",
        bank_name: "",
        account_name: "",
        account_number: "",
        branch_code: "",
        payment_method: "bank_transfer"
    });

    useEffect(() => {
        if (isOpen) {
            loadInitialData();
        }
    }, [isOpen]);

    const loadInitialData = async () => {
        try {
            const user = await User.me();
            setFormData(prev => ({
                ...prev,
                full_name: user.full_name || user.display_name || "",
                company_name: user.company_name || "",
                company_address: user.company_address || "",
                logo_url: user.logo_url || "",
                currency: user.currency || "ZAR"
            }));
        } catch (error) {
            console.error("Error loading user data", error);
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleLogoChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const validation = validateLogoFile(file);
            if (validation.valid) {
                setLogoFile(file);
            }
            // If invalid, do not set (user can pick another file); uploadLogo will also validate on submit
        }
    };

    const handleNext = async () => {
        if (step === 3) {
            await handleFinish();
        } else {
            setStep(step + 1);
        }
    };

    const handleBack = () => {
        setStep(step - 1);
    };

    const handleFinish = async () => {
        setIsLoading(true);
        try {
            const user = await User.me();
            const userId = user?.id;
            if (!userId) {
                console.error("Setup: no user id (not authenticated)");
                setIsLoading(false);
                return;
            }
            let finalLogoUrl = formData.logo_url;
            if (logoFile) {
                finalLogoUrl = await uploadLogo(logoFile, userId);
            }

            // Save to Supabase profiles table (one row per user, keyed by auth user id)
            await User.updateMyUserData({
                full_name: formData.full_name?.trim() || user.full_name || user.display_name,
                company_name: formData.company_name,
                company_address: formData.company_address,
                logo_url: finalLogoUrl,
                currency: formData.currency,
                onboarding_completed: true
            });

            // Create Banking Detail if filled
            if (formData.bank_name && formData.account_number) {
                await BankingDetail.create({
                    bank_name: formData.bank_name,
                    account_name: formData.account_name || formData.company_name,
                    account_number: formData.account_number,
                    branch_code: formData.branch_code, // Assuming branch_code maps to routing_number or similar in BankingDetail entity
                    routing_number: formData.branch_code,
                    payment_method: "bank_transfer",
                    is_default: true
                });
            }

            setIsLoading(false);
            onComplete();
        } catch (error) {
            console.error("Error saving setup data:", error);
            setIsLoading(false);
        }
    };

    const StepIndicator = ({ currentStep }) => (
        <div className="flex items-center justify-center mb-8 gap-2">
            {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        s <= currentStep ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                        {s < currentStep ? <CheckCircle className="w-5 h-5" /> : s}
                    </div>
                    {s < 3 && (
                        <div className={`w-12 h-1 mx-2 rounded-full ${
                            s < currentStep ? 'bg-primary' : 'bg-slate-100'
                        }`} />
                    )}
                </div>
            ))}
        </div>
    );

    return (
        <Dialog open={isOpen} onOpenChange={() => {}}>
            <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-white">
                <div className="bg-primary p-6 text-white text-center">
                    <DialogTitle className="text-2xl font-bold">Welcome to Paidly!</DialogTitle>
                    <DialogDescription className="text-primary/90 mt-2">
                        Get your professional profile set up in just a few steps.
                    </DialogDescription>
                </div>
                
                <div className="p-6">
                    <StepIndicator currentStep={step} />

                    <div className="min-h-[320px]">
                        <AnimatePresence mode="wait">
                            {step === 1 && (
                                <motion.div
                                    key="step1"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-4"
                                >
                                    <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                                        <Building className="w-5 h-5 text-primary" /> Your profile & company
                                    </h3>

                                    <div className="space-y-2">
                                        <Label>Display name</Label>
                                        <Input 
                                            value={formData.full_name} 
                                            onChange={(e) => handleInputChange('full_name', e.target.value)}
                                            placeholder="Your name (for invoices and dashboard)"
                                        />
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <Label>Company name</Label>
                                        <Input 
                                            value={formData.company_name} 
                                            onChange={(e) => handleInputChange('company_name', e.target.value)}
                                            placeholder="Your Business Name"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Address</Label>
                                        <Textarea 
                                            value={formData.company_address} 
                                            onChange={(e) => handleInputChange('company_address', e.target.value)}
                                            placeholder="123 Business St, City, Country"
                                            className="h-20 resize-none"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Default currency</Label>
                                        <CurrencySelector 
                                            value={formData.currency} 
                                            onChange={(val) => handleInputChange('currency', val)}
                                        />
                                    </div>
                                </motion.div>
                            )}

                            {step === 2 && (
                                <motion.div
                                    key="step2"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-4"
                                >
                                    <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                                        <ImageIcon className="w-5 h-5 text-primary" /> Branding
                                    </h3>

                                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-8 bg-slate-50">
                                        {logoFile || formData.logo_url ? (
                                            <div className="relative w-32 h-32 mb-4">
                                                <img 
                                                    src={logoFile ? URL.createObjectURL(logoFile) : formData.logo_url} 
                                                    alt="Logo" 
                                                    className="w-full h-full object-contain rounded-lg"
                                                />
                                                <Button 
                                                    size="sm" 
                                                    variant="destructive" 
                                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                                                    onClick={() => {
                                                        setLogoFile(null);
                                                        handleInputChange('logo_url', '');
                                                    }}
                                                >
                                                    <X className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="w-24 h-24 bg-primary/15 rounded-full flex items-center justify-center mb-4 text-primary">
                                                <ImageIcon className="w-10 h-10" />
                                            </div>
                                        )}
                                        
                                        <Label htmlFor="logo-upload" className="cursor-pointer">
                                            <div className="flex flex-col items-center gap-2">
                                                <span className="bg-white border border-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
                                                    <UploadCloud className="w-4 h-4" />
                                                    {logoFile || formData.logo_url ? "Change Logo" : "Upload Logo"}
                                                </span>
                                                <span className="text-xs text-slate-400">PNG or SVG (SVG for sharp PDFs). Max {Math.round(LOGO_CONSTRAINTS.MAX_SIZE_BYTES / 1024)}KB. Width under {LOGO_CONSTRAINTS.RECOMMENDED_WIDTH_PX}px.</span>
                                            </div>
                                            <Input 
                                                id="logo-upload" 
                                                type="file" 
                                                accept="image/png,image/svg+xml" 
                                                className="hidden" 
                                                onChange={handleLogoChange}
                                            />
                                        </Label>
                                    </div>
                                </motion.div>
                            )}

                            {step === 3 && (
                                <motion.div
                                    key="step3"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-4"
                                >
                                    <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                                        <CreditCard className="w-5 h-5 text-primary" /> Banking Details
                                    </h3>
                                    <p className="text-sm text-slate-500 mb-4">Add your primary bank account so clients know where to send payments. You can add more later.</p>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2 col-span-2">
                                            <Label>Bank Name</Label>
                                            <Input 
                                                value={formData.bank_name} 
                                                onChange={(e) => handleInputChange('bank_name', e.target.value)}
                                                placeholder="e.g. First National Bank"
                                            />
                                        </div>
                                        <div className="space-y-2 col-span-2">
                                            <Label>Account Holder</Label>
                                            <Input 
                                                value={formData.account_name} 
                                                onChange={(e) => handleInputChange('account_name', e.target.value)}
                                                placeholder="Account Name"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Account Number</Label>
                                            <Input 
                                                value={formData.account_number} 
                                                onChange={(e) => handleInputChange('account_number', e.target.value)}
                                                placeholder="123456789"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Branch Code / Routing</Label>
                                            <Input 
                                                value={formData.branch_code} 
                                                onChange={(e) => handleInputChange('branch_code', e.target.value)}
                                                placeholder="Code"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <DialogFooter className="flex justify-between items-center mt-6 sm:justify-between">
                        <Button variant="ghost" onClick={handleBack} disabled={step === 1 || isLoading}>
                            Back
                        </Button>
                        <Button 
                            onClick={handleNext} 
                            disabled={isLoading}
                            className="bg-primary hover:bg-primary/90 text-white min-w-[120px]"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                <>
                                    {step === 3 ? "Finish Setup" : "Next"}
                                    {step !== 3 && <ArrowRight className="w-4 h-4 ml-2" />}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}