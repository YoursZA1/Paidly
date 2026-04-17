import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CurrencySelector from "@/components/CurrencySelector";
import { User } from "@/api/entities";
import { createPageUrl, clearQuickSetupEligible } from "@/utils";
import { useAuth } from "@/contexts/AuthContext";

function normalizeOnboardingBusiness(profile = {}) {
  const business = profile?.business && typeof profile.business === "object" ? profile.business : {};
  const onboarding = business?.onboarding_v2 && typeof business.onboarding_v2 === "object" ? business.onboarding_v2 : {};
  return {
    business_name: profile?.company_name || "",
    industry: onboarding?.industry || business?.industry || "",
    currency: profile?.currency || "ZAR",
    goal: onboarding?.goal || "",
    status: onboarding?.status || "welcome",
  };
}

const GOAL_OPTIONS = [
  { id: "create_invoice", label: "Create invoice", route: createPageUrl("CreateInvoice") + "?onboarding=1" },
  { id: "track_income", label: "Track income", route: createPageUrl("CashFlow") + "?openAddExpense=1&onboarding=1" },
  { id: "setup_business", label: "Set up business", route: createPageUrl("Settings") + "?tab=profile&onboarding=1" },
];

export default function FastActivationOnboarding({ isOpen, profile, onClose, onProfileRefresh }) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
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

  const persistDraft = async (patch = {}) => {
    const next = { ...form, ...patch };
    setSaving(true);
    try {
      await User.updateMyUserData({
        company_name: next.business_name?.trim(),
        currency: next.currency || "ZAR",
        business: {
          industry: next.industry || "",
          onboarding_v2: {
            status: next.status || step,
            goal: next.goal || "",
            industry: next.industry || "",
            updated_at: new Date().toISOString(),
          },
        },
      });
      onProfileRefresh?.();
    } finally {
      setSaving(false);
    }
  };

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
  }, [isOpen, step, form.business_name, form.industry, form.currency, form.goal]);

  const selectedGoal = useMemo(() => GOAL_OPTIONS.find((o) => o.id === form.goal) || null, [form.goal]);

  const goNext = async () => {
    if (step === "welcome") {
      setStep("business");
      return;
    }
    if (step === "business") {
      if (!form.business_name.trim()) return;
      await persistDraft({ status: "goal" });
      setStep("goal");
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
    await User.updateMyUserData({
      business: {
        onboarding_v2: {
          status: "completed",
          completed_at: new Date().toISOString(),
          goal: form.goal || "",
          industry: form.industry || "",
        },
      },
    });
    clearQuickSetupEligible(authUser?.id);
    onProfileRefresh?.();
    onClose?.();
    navigate(createPageUrl("Dashboard"));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="sm:max-w-xl">
        {step === "welcome" && (
          <>
            <DialogHeader>
              <DialogTitle>Get Paid Faster. Stay in Control.</DialogTitle>
              <DialogDescription>
                Complete a quick setup and get to your first meaningful action in under 2 minutes.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={goNext}>Start Setup</Button>
            </DialogFooter>
          </>
        )}

        {step === "business" && (
          <>
            <DialogHeader>
              <DialogTitle>Business setup</DialogTitle>
              <DialogDescription>Tell us a bit about your business so we can prefill your workflow.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="onboarding-business-name">Business name</Label>
                <Input
                  id="onboarding-business-name"
                  value={form.business_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, business_name: e.target.value }))}
                  placeholder="Your business name"
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
