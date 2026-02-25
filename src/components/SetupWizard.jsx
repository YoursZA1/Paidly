import React, { useState } from "react";
import { uploadAndSaveLogo } from "./SetupWizard.uploadLogo";
import PropTypes from "prop-types";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * Simple SetupWizard modal placeholder.
 * Replace with your actual setup steps and UI as needed.
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
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  function handleChange(e) {
    const { name, value, type, checked, files } = e.target;
    setForm(f => ({
      ...f,
      [name]: type === "checkbox" ? checked : files ? files[0] : value
    }));
  }

  function next() {
    setStep(s => Math.min(s + 1, steps.length - 1));
  }
  function prev() {
    setStep(s => Math.max(s - 1, 0));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let logoUrl = form.logo_url;
      if (form.logo instanceof File) {
        logoUrl = await uploadAndSaveLogo(form.logo, form);
      }
      // Optionally update other profile fields here as needed
      setSubmitting(false);
      onComplete();
    } catch (err) {
      // Optionally show error to user
      setSubmitting(false);
      alert("Failed to save profile: " + (err.message || err));
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onComplete(); }}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-0 bg-transparent shadow-none">
      <form className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full" onSubmit={handleSubmit}>
        <div className="mb-6">
          <div className="text-xs text-gray-400 mb-1">Step {step + 1} of {steps.length}</div>
          <h2 className="text-2xl font-bold mb-2">{steps[step]}</h2>
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <input className="w-full border rounded p-2" name="businessName" placeholder="Business Name" value={form.businessName} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="registrationNumber" placeholder="Registration Number (optional)" value={form.registrationNumber} onChange={handleChange} />
            <input className="w-full border rounded p-2" name="vatNumber" placeholder="VAT / Tax Number" value={form.vatNumber} onChange={handleChange} />
            <input className="w-full border rounded p-2" name="industry" placeholder="Industry" value={form.industry} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="currency" placeholder="Currency (e.g. USD, ZAR)" value={form.currency} onChange={handleChange} required />
            <input className="w-full border rounded p-2" name="country" placeholder="Country" value={form.country} onChange={handleChange} required />
            <div>
              <label className="block text-xs text-gray-500 mb-1">Upload Logo (optional)</label>
              <input type="file" name="logo" accept="image/*" onChange={handleChange} />
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
            <div className="bg-gray-50 border rounded p-4 mb-2 text-sm">
              <div className="mb-2 font-semibold">Ready to send your first invoice?</div>
              <ul className="list-disc ml-5 text-gray-600">
                <li>Business: <span className="font-medium">{form.businessName || "-"}</span></li>
                <li>Client: <span className="font-medium">{form.clientName || "-"}</span></li>
                <li>Dummy item: <span className="font-medium">Consulting Service</span></li>
              </ul>
            </div>
            <button type="submit" className="w-full bg-cyan-600 text-white py-2 rounded-lg font-semibold hover:bg-cyan-700 transition" disabled={submitting}>
              {submitting ? "Sending..." : "Send Your First Invoice"}
            </button>
          </div>
        )}

        <div className="flex gap-2 mt-8">
          {step > 0 && (
            <button type="button" className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg font-semibold hover:bg-gray-200 transition" onClick={prev} disabled={submitting}>Back</button>
          )}
          {step < steps.length - 1 && (
            <button type="button" className="flex-1 bg-cyan-600 text-white py-2 rounded-lg font-semibold hover:bg-cyan-700 transition" onClick={next} disabled={submitting}>Next</button>
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
