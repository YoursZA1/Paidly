import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CurrencySelector from "@/components/CurrencySelector";
import { User } from "@/api/entities";
import { createPageUrl, clearQuickSetupEligible } from "@/utils";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyContext from "@/hooks/useCompanyContext";
import { updateOrganizationProfile } from "@/services/OrganizationProfileService";

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function normalizeOnboardingBusiness(profile = {}) {
  const business = profile?.business && typeof profile.business === "object" ? profile.business : {};
  const onboarding = business?.onboarding_v2 && typeof business.onboarding_v2 === "object" ? business.onboarding_v2 : {};
  const nameParts = splitName(profile?.full_name || profile?.display_name || "");
  return {
    business_name: profile?.company_name || "",
    registration_number: onboarding?.registration_number || "",
    industry: onboarding?.industry || business?.industry || "",
    address: profile?.company_address || onboarding?.address || "",
    currency: profile?.currency || "ZAR",
    full_name: profile?.full_name || profile?.display_name || "",
    first_name: profile?.first_name || nameParts.first_name,
    last_name: profile?.last_name || nameParts.last_name,
    phone: profile?.phone || "",
    department: profile?.department || onboarding?.department || "",
    job_title: profile?.job_title || onboarding?.job_title || "",
    tax_info: onboarding?.tax_info || "",
    goal: onboarding?.goal || "",
    status: onboarding?.status || "welcome",
  };
}

const GOAL_OPTIONS = [
  { id: "create_invoice", label: "Create invoice", route: createPageUrl("CreateInvoice") + "?onboarding=1" },
  { id: "track_income", label: "Track income", route: createPageUrl("CashFlow") + "?openAddExpense=1&onboarding=1" },
  { id: "setup_business", label: "Set up business", route: createPageUrl("Settings") + "?tab=profile&onboarding=1" },
];

/**
 * Post-signup activation onboarding.
 * @param {{ isOpen: boolean, isCompanyAdmin?: boolean, profile?: object, onClose?: () => void, onProfileRefresh?: () => void }} props
 *   isCompanyAdmin distinguishes org-owner signup (extended company-details form) from
 *   invited employees/managers (standard personal-profile form). Resolved from Supabase
 *   user_company_roles via useOnboardingRole / get_my_onboarding_context RPC.
 */
export default function FastActivationOnboarding({ isOpen, isCompanyAdmin = true, profile, onClose, onProfileRefresh }) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { companyId } = useCompanyContext();
  const [step, setStep] = useState("welcome");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => normalizeOnboardingBusiness(profile));
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const initial = normalizeOnboardingBusiness(profile);
    setForm(initial);
    setStep(initial.status === "completed" ? "success" : "welcome");
  }, [isOpen, profile]);

  const getBaseOnboarding = () => {
    const business =
      profile?.business && typeof profile.business === "object" ? profile.business : {};
    const ob =
      business?.onboarding_v2 && typeof business.onboarding_v2 === "object"
        ? business.onboarding_v2
        : {};
    return ob;
  };

  const persistDraft = useCallback(
    async (patch = {}) => {
      const next = { ...form, ...patch };
      setSaving(true);
      try {
        const baseOnboarding = getBaseOnboarding();
        const onboardingPayload = {
          ...baseOnboarding,
          status: next.status || step,
          goal: next.goal || "",
          industry: isCompanyAdmin ? next.industry || "" : baseOnboarding?.industry || "",
          updated_at: new Date().toISOString(),
        };

        if (isCompanyAdmin) {
          await User.updateMyUserData({
            company_name: next.business_name?.trim(),
            company_address: next.address?.trim() || undefined,
            phone: next.phone?.trim() || undefined,
            currency: next.currency || "ZAR",
            business: {
              industry: next.industry || "",
              onboarding_v2: {
                ...onboardingPayload,
                registration_number: next.registration_number || "",
                address: next.address || "",
                tax_info: next.tax_info || "",
              },
            },
          });
          if (companyId) {
            await updateOrganizationProfile(companyId, {
              name: next.business_name?.trim(),
              registration_number: next.registration_number?.trim() || null,
              industry: next.industry?.trim() || null,
              address: next.address?.trim() || null,
              phone: next.phone?.trim() || null,
              company_email: authUser?.email || null,
              tax_info: next.tax_info?.trim() ? { notes: next.tax_info.trim() } : {},
            }).catch(() => {});
          }
        } else {
          const userPayload = { business: { onboarding_v2: onboardingPayload } };
          const first = (next.first_name || "").trim();
          const last = (next.last_name || "").trim();
          const display = [first, last].filter(Boolean).join(" ");
          if (display) userPayload.full_name = display;
          if (first) userPayload.first_name = first;
          if (last) userPayload.last_name = last;
          if (next.phone?.trim()) userPayload.phone = next.phone.trim();
          if (next.department?.trim()) userPayload.department = next.department.trim();
          if (next.job_title?.trim()) userPayload.job_title = next.job_title.trim();
          await User.updateMyUserData(userPayload);
        }
        onProfileRefresh?.();
      } finally {
        setSaving(false);
      }
    },
    [form, step, isCompanyAdmin, companyId, authUser?.email, profile, onProfileRefresh]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    if (step !== "business" && step !== "goal") return undefined;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistDraft({ status: step }).catch(() => {});
    }, 450);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isOpen, step, persistDraft]);

  const selectedGoal = useMemo(() => GOAL_OPTIONS.find((o) => o.id === form.goal) || null, [form.goal]);

  const goNext = async () => {
    if (step === "welcome") {
      setStep("business");
      return;
    }
    if (step === "business") {
      if (isCompanyAdmin) {
        if (!form.business_name.trim()) return;
        await persistDraft({ status: "goal" });
        setStep("goal");
        return;
      }
      // Invited employee: profile-only setup, then straight to the dashboard.
      if (!form.first_name.trim()) return;
      await persistDraft({ status: "success" });
      setStep("success");
      return;
    }
    if (step === "goal") {
      if (!form.goal) return;
      await persistDraft({ status: "guided_action" });
      setStep("guided_action");
    }
  };

  const launchGuidedAction = async () => {
    if (!selectedGoal) return;
    await persistDraft({ status: "success" });
    clearQuickSetupEligible(authUser?.id);
    navigate(selectedGoal.route);
    setStep("success");
  };

  const completeAndGoDashboard = async () => {
    const baseOnboarding = getBaseOnboarding();
    const prevChecklist =
      baseOnboarding?.checklist && typeof baseOnboarding.checklist === "object"
        ? baseOnboarding.checklist
        : {};
    await User.updateMyUserData({
      business: {
        onboarding_v2: {
          ...baseOnboarding,
          status: "completed",
          completed_at: new Date().toISOString(),
          goal: form.goal || "",
          industry: form.industry || "",
          checklist: {
            ...prevChecklist,
            setup_business: true,
          },
          updated_at: new Date().toISOString(),
        },
      },
    });
    if (isCompanyAdmin && companyId) {
      await updateOrganizationProfile(companyId, {
        onboarding_completed_at: new Date().toISOString(),
      }).catch(() => {});
    }
    clearQuickSetupEligible(authUser?.id);
    onProfileRefresh?.();
    onClose?.();
    navigate(isCompanyAdmin ? createPageUrl("Dashboard") : createPageUrl("EmployeeDashboard"));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="sm:max-w-xl">
        {step === "welcome" && (
          <>
            <DialogHeader>
              <DialogTitle>{isCompanyAdmin ? "Get Paid Faster. Stay in Control." : "Welcome to the team."}</DialogTitle>
              <DialogDescription>
                {isCompanyAdmin
                  ? "Complete a quick setup and get to your first meaningful action in under 2 minutes."
                  : "Let's confirm your profile so your team workspace is ready. Takes under a minute."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={goNext}>Start Setup</Button>
            </DialogFooter>
          </>
        )}

        {step === "business" && isCompanyAdmin && (
          <>
            <DialogHeader>
              <DialogTitle>Business setup</DialogTitle>
              <DialogDescription>Tell us a bit about your business so we can prefill your workflow.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label htmlFor="onboarding-business-name">Company name</Label>
                <Input
                  id="onboarding-business-name"
                  value={form.business_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, business_name: e.target.value }))}
                  placeholder="Your company name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-reg">Registration number</Label>
                <Input
                  id="onboarding-reg"
                  value={form.registration_number}
                  onChange={(e) => setForm((prev) => ({ ...prev, registration_number: e.target.value }))}
                  placeholder="Company / tax registration"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-industry">Industry</Label>
                <Input
                  id="onboarding-industry"
                  value={form.industry}
                  onChange={(e) => setForm((prev) => ({ ...prev, industry: e.target.value }))}
                  placeholder="e.g. Consulting"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-address">Address</Label>
                <Input
                  id="onboarding-address"
                  value={form.address}
                  onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Business address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-admin-phone">Contact number</Label>
                <Input
                  id="onboarding-admin-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="+27 123 456 7890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-tax">Tax information (optional)</Label>
                <Input
                  id="onboarding-tax"
                  value={form.tax_info}
                  onChange={(e) => setForm((prev) => ({ ...prev, tax_info: e.target.value }))}
                  placeholder="VAT number or tax notes"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-currency">Currency</Label>
                <CurrencySelector
                  id="onboarding-currency"
                  label=""
                  value={form.currency || "ZAR"}
                  onChange={(value) => setForm((prev) => ({ ...prev, currency: value || "ZAR" }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={goNext} disabled={!form.business_name.trim() || saving}>
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "business" && !isCompanyAdmin && (
          <>
            <DialogHeader>
              <DialogTitle>Your profile</DialogTitle>
              <DialogDescription>Confirm your details. Your admin manages company-wide settings.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="onboarding-first-name">First name</Label>
                  <Input
                    id="onboarding-first-name"
                    value={form.first_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onboarding-last-name">Last name</Label>
                  <Input
                    id="onboarding-last-name"
                    value={form.last_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-phone">Phone number</Label>
                <Input
                  id="onboarding-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="+27 123 456 7890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-department">Department</Label>
                <Input
                  id="onboarding-department"
                  value={form.department}
                  onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
                  placeholder="e.g. Sales"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-job-title">Job title</Label>
                <Input
                  id="onboarding-job-title"
                  value={form.job_title}
                  onChange={(e) => setForm((prev) => ({ ...prev, job_title: e.target.value }))}
                  placeholder="e.g. Account Manager"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={goNext} disabled={!form.first_name.trim() || saving}>
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "goal" && (
          <>
            <DialogHeader>
              <DialogTitle>What do you want to do first?</DialogTitle>
              <DialogDescription>Choose your first action and we will guide you there instantly.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {GOAL_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  onClick={() => setForm((prev) => ({ ...prev, goal: option.id }))}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${
                    form.goal === option.id ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={goNext} disabled={!form.goal || saving}>
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "guided_action" && (
          <>
            <DialogHeader>
              <DialogTitle>Guided action ready</DialogTitle>
              <DialogDescription>
                We will take you to <strong>{selectedGoal?.label || "your selected flow"}</strong> with defaults prefilled.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={launchGuidedAction}>Open action</Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle>You are ready to roll.</DialogTitle>
              <DialogDescription>Your onboarding setup is saved. Head to the dashboard to continue.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={completeAndGoDashboard}>Go to Dashboard</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
