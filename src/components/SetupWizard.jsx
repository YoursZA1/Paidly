import { useState, useEffect } from "react";
import { uploadAndSaveLogo } from "./SetupWizard.uploadLogo";
import PropTypes from "prop-types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { User, BankingDetail } from "@/api/entities";
import { logoMaxSizeLabel } from "@/lib/logoUpload";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Setup wizard (Step 1 of 5 = Business Profile). Data is loaded from and saved to
 * the current user's Supabase profile so it is backed up and restored correctly.
 */

const initialState = {
  businessName: "",
  registrationNumber: "",
  vatNumber: "",
  industry: "",
  currency: "",
  country: "",
  logo: null,
  logo_url: "",
  businessEmail: "",
  phone: "",
  bankName: "",
  accountNumber: "",
  accountHolder: "",
  branchCode: "",
  paymentInstructions: "",
  defaultTerms: "7",
  defaultTaxRate: "",
  defaultCurrency: "",
  invoicePrefix: "",
  startingInvoiceNumber: "",
  lateFee: false,
  reminders: false,
  clientName: "",
  clientEmail: "",
  clientCompany: "",
  clientTax: ""
};

const steps = [
  "Business Profile",
  "Contact & Banking",
  "Invoice Defaults",
  "First Client",
  "Finish",
];

export default function SetupWizard({ isOpen, onComplete }) {
  const { profile, authUserId } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Load current user profile when wizard opens so Step 1 is pre-filled and data is for correct user
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingProfile(true);
    (async () => {
      try {
        const user = profile;
        if (cancelled || !user) return;
        setForm(f => ({
          ...f,
          businessName: user.company_name || "",
          currency: user.currency || "",
          country: user.company_address || "",
          logo_url: user.logo_url || "",
          businessEmail: user.email || ""
        }));
      } catch {
        if (!cancelled) setForm(initialState);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, profile]);

  if (!isOpen) return null;

  function handleChange(e) {
    const { name, value, type, checked, files } = e.target;
    setForm(f => ({
      ...f,
      [name]: type === "checkbox" ? checked : files ? files[0] : value
    }));
  }

  /** Persist Step 1 (Business Profile) to current user's Supabase profile. */
  async function saveBusinessProfileStep() {
    const user = profile;
    if (!user?.id) return;
    let logoUrl = form.logo_url;
    if (form.logo instanceof File) {
      logoUrl = await uploadAndSaveLogo(form.logo, form, authUserId || user.id);
    }
    await User.updateMyUserData({
      company_name: (form.businessName || "").trim() || user.company_name,
      company_address: (form.country || "").trim() || user.company_address,
      currency: (form.currency || "").trim() || user.currency,
      logo_url: logoUrl || user.logo_url
    });
  }

  async function next() {
    if (step === 0) {
      setSubmitting(true);
      try {
        await saveBusinessProfileStep();
      } catch (err) {
        alert("Failed to save business profile: " + (err?.message || err));
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
    }
    setStep(s => Math.min(s + 1, steps.length - 1));
  }

  function prev() {
    setStep(s => Math.max(s - 1, 0));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = profile;
      if (!user?.id) {
        alert("Please sign in to save.");
        setSubmitting(false);
        return;
      }
      // Save Step 1 (Business Profile) to Supabase for this user
      await saveBusinessProfileStep();
      // Step 2: banking — persist if filled
      if (form.bankName && form.accountNumber) {
        await BankingDetail.create({
          bank_name: form.bankName,
          account_name: form.accountHolder || form.businessName,
          account_number: form.accountNumber,
          branch_code: form.branchCode || undefined,
          payment_method: "bank_transfer",
          is_default: true
        }).catch(() => {});
      }
      setSubmitting(false);
      onComplete();
    } catch (err) {
      setSubmitting(false);
      alert("Failed to save profile: " + (err?.message || err));
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onComplete(); }}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-0 bg-transparent shadow-none" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Setup wizard</DialogTitle>
      <form className="bg-card border border-border rounded-xl shadow-lg p-8 max-w-lg w-full" onSubmit={handleSubmit}>
        <div className="mb-6">
          <div className="text-xs text-muted-foreground mb-1">Step {step + 1} of {steps.length}</div>
          <h2 className="text-2xl font-bold text-foreground mb-2 font-display">{steps[step]}</h2>
        </div>

        {step === 0 && (
          <div className="space-y-3">
            {loadingProfile && (
              <p className="text-sm text-muted-foreground">Loading your profile…</p>
            )}
            <input className="w-full border rounded p-2" name="businessName" placeholder="Business Name" value={form.businessName} onChange={handleChange} required disabled={loadingProfile} />
            <input className="w-full border rounded p-2" name="registrationNumber" placeholder="Registration Number (optional)" value={form.registrationNumber} onChange={handleChange} />
            <input className="w-full border rounded p-2" name="vatNumber" placeholder="VAT / Tax Number" value={form.vatNumber} onChange={handleChange} />
            <input className="w-full border rounded p-2" name="industry" placeholder="Industry" value={form.industry} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="currency" placeholder="Currency (e.g. USD, ZAR)" value={form.currency} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="country" placeholder="Country" value={form.country} onChange={handleChange} required />
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Upload Logo (optional)</label>
              <input type="file" name="logo" accept="image/jpeg,image/jpg,image/png,image/svg+xml" onChange={handleChange} title={`JPEG, PNG, or SVG, max ${logoMaxSizeLabel()}`} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <input className="w-full border rounded p-2" name="businessEmail" placeholder="Business Email" value={form.businessEmail} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="phone" placeholder="Phone" value={form.phone} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="bankName" placeholder="Bank Name" value={form.bankName} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="accountNumber" placeholder="Account Number" value={form.accountNumber} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="accountHolder" placeholder="Account Holder" value={form.accountHolder} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="branchCode" placeholder="Branch Code (if relevant)" value={form.branchCode} onChange={handleChange} />
            <textarea className="w-full border rounded p-2" name="paymentInstructions" placeholder="Payment instructions (optional)" value={form.paymentInstructions} onChange={handleChange} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <select className="w-full border rounded p-2" name="defaultTerms" value={form.defaultTerms} onChange={handleChange} required>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
            <input className="w-full border rounded p-2" name="defaultTaxRate" placeholder="Default Tax Rate (%)" value={form.defaultTaxRate} onChange={handleChange} />
            <input className="w-full border rounded p-2" name="defaultCurrency" placeholder="Default Currency (e.g. USD, ZAR)" value={form.defaultCurrency} onChange={handleChange} />
            <input className="w-full border rounded p-2" name="invoicePrefix" placeholder="Invoice Prefix (e.g. INV-)" value={form.invoicePrefix} onChange={handleChange} />
            <input className="w-full border rounded p-2" name="startingInvoiceNumber" placeholder="Starting Invoice Number" value={form.startingInvoiceNumber} onChange={handleChange} />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="lateFee" checked={form.lateFee} onChange={handleChange} /> Late fee</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reminders" checked={form.reminders} onChange={handleChange} /> Reminders</label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <input className="w-full border rounded p-2" name="clientName" placeholder="Client Name" value={form.clientName} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="clientEmail" placeholder="Client Email" value={form.clientEmail} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="clientCompany" placeholder="Company Name" value={form.clientCompany} onChange={handleChange} />
            <input className="w-full border rounded p-2" name="clientTax" placeholder="Tax/VAT Number" value={form.clientTax} onChange={handleChange} />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <div className="bg-muted border border-border rounded-lg p-4 mb-2 text-sm">
              <div className="mb-2 font-semibold text-foreground">Ready to send your first invoice?</div>
              <ul className="list-disc ml-5 text-muted-foreground">
                <li>Business: <span className="font-medium">{form.businessName || "-"}</span></li>
                <li>Client: <span className="font-medium">{form.clientName || "-"}</span></li>
                <li>Dummy item: <span className="font-medium">Consulting Service</span></li>
              </ul>
            </div>
            <button type="submit" className="w-full bg-primary text-primary-foreground py-2 rounded-lg font-semibold hover:bg-primary/90 transition" disabled={submitting}>
              {submitting ? "Sending..." : "Send Your First Invoice"}
            </button>
          </div>
        )}

        <div className="flex gap-2 mt-8">
          {step > 0 && (
            <button type="button" className="flex-1 bg-muted text-muted-foreground py-2 rounded-lg font-semibold hover:bg-muted/80 transition" onClick={prev} disabled={submitting}>Back</button>
          )}
          {step < steps.length - 1 && (
            <button type="button" className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-70" onClick={next} disabled={submitting || loadingProfile}>{submitting ? "Saving…" : "Next"}</button>
          )}
        </div>
      </form>
      </DialogContent>
    </Dialog>
  );
}

SetupWizard.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onComplete: PropTypes.func.isRequired,
};
