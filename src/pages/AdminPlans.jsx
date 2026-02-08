import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, CheckCircle2, Plus, RefreshCw, Save, Star, Trash2, Undo2 } from "lucide-react";
import PlanManagementService from "@/services/PlanManagementService";
import { FEATURE_CATALOG, createDefaultFeatures } from "@/data/planDefaults";
import { useAuth } from "@/components/auth/AuthContext";

const emptyPlan = {
  key: "",
  name: "",
  description: "",
  priceMonthly: 0,
  priceYearly: 0,
  userLimit: 1,
  users: 1,
  invoices_limit: 0,
  quotes_limit: 0,
  storage: "1GB",
  color: "bg-slate-100",
  nextTierName: "",
  recommended: false,
  status: "active",
  features: createDefaultFeatures()
};

const normalizeNumber = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
};

const roundPrice = (value) => {
  if (value === null || value === undefined || value === "") {
    return value;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return value;
  return Number(parsed.toFixed(2));
};

const isUnlimited = (value) => value === null || value === "Unlimited" || value === undefined;

export default function AdminPlans() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [form, setForm] = useState(emptyPlan);
  const [isCreating, setIsCreating] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [message, setMessage] = useState(null);
  const [history, setHistory] = useState([]);

  const updatedBy = user?.email || user?.full_name || "admin";

  const loadPlans = useCallback(() => {
    const list = PlanManagementService.getPlans();
    setPlans(list);

    if (!selectedKey && list.length > 0) {
      setSelectedKey(list[0].key);
    }
  }, [selectedKey]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (!selectedKey || isCreating) return;
    const plan = PlanManagementService.getPlan(selectedKey);
    if (plan) {
      setForm({
        ...plan,
        userLimit: isUnlimited(plan.userLimit) ? "" : plan.userLimit,
        invoices_limit: isUnlimited(plan.invoices_limit) ? "" : plan.invoices_limit,
        quotes_limit: isUnlimited(plan.quotes_limit) ? "" : plan.quotes_limit
      });
      setHistory(PlanManagementService.getPlanHistory(selectedKey));
      setChangeNote("");
    }
  }, [selectedKey, isCreating]);

  const selectedPlan = useMemo(() => {
    return plans.find((plan) => plan.key === selectedKey) || null;
  }, [plans, selectedKey]);

  const handleSelectPlan = (key) => {
    setIsCreating(false);
    setSelectedKey(key);
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setSelectedKey(null);
    setForm({ ...emptyPlan, key: "", name: "", recommended: false, status: "active" });
    setHistory([]);
    setChangeNote("");
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => {
      const next = {
        ...prev,
        [field]: value
      };

      if (field === "priceMonthly") {
        const monthly = Number(value);
        if (!Number.isNaN(monthly)) {
          next.priceYearly = roundPrice(monthly * 11);
        }
      }

      if (field === "priceYearly") {
        const yearly = Number(value);
        if (!Number.isNaN(yearly)) {
          next.priceMonthly = roundPrice(yearly / 11);
        }
      }

      return next;
    });
  };

  const handleFeatureToggle = (featureKey, enabled) => {
    setForm((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [featureKey]: enabled
      }
    }));
  };

  const handleSave = () => {
    try {
      const payload = {
        ...form,
        userLimit: form.userLimit === "" ? null : normalizeNumber(form.userLimit),
        invoices_limit: form.invoices_limit === "" ? "Unlimited" : normalizeNumber(form.invoices_limit),
        quotes_limit: form.quotes_limit === "" ? "Unlimited" : normalizeNumber(form.quotes_limit),
        users: form.userLimit === "" ? "Unlimited" : normalizeNumber(form.userLimit)
      };

      if (isCreating) {
        PlanManagementService.createPlan(payload, { updatedBy, changeNote: changeNote || "Plan created" });
        setMessage({ type: "success", text: "Plan created successfully." });
        setIsCreating(false);
      } else if (selectedKey) {
        PlanManagementService.updatePlan(selectedKey, payload, { updatedBy, changeNote: changeNote || "Plan updated" });
        setMessage({ type: "success", text: "Plan updated successfully." });
      }

      setChangeNote("");
      loadPlans();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to save plan." });
    }
  };

  const handleSetRecommended = (enabled) => {
    if (!selectedKey) return;
    try {
      PlanManagementService.setRecommendedPlan(selectedKey, enabled, {
        updatedBy,
        changeNote: enabled ? "Set as recommended" : "Removed recommended flag"
      });
      loadPlans();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to update recommended plan." });
    }
  };

  const handleArchive = () => {
    if (!selectedKey) return;
    if (!window.confirm("Archive this plan?")) return;

    try {
      PlanManagementService.archivePlan(selectedKey, { updatedBy, changeNote: "Plan archived" });
      loadPlans();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to archive plan." });
    }
  };

  const handleRestoreVersion = (version) => {
    if (!selectedKey) return;
    if (!window.confirm(`Restore version ${version}?`)) return;

    try {
      PlanManagementService.restorePlanVersion(selectedKey, version, {
        updatedBy,
        changeNote: `Restored version ${version}`
      });
      loadPlans();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to restore plan." });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Packages & Plans</h1>
          <p className="text-slate-600 mt-2">Create, edit, and control plan limits and feature access.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadPlans}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Plan
          </Button>
        </div>
      </div>

      {message && (
        <Card className={message.type === "error" ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}>
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            {message.type === "error" ? (
              <AlertCircle className="h-4 w-4 text-red-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            <span className={message.type === "error" ? "text-red-700" : "text-green-700"}>{message.text}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="space-y-4">
          {plans.map((plan) => (
            <Card
              key={plan.key}
              className={`cursor-pointer transition-all ${selectedKey === plan.key && !isCreating ? "border-indigo-500 shadow-lg" : "hover:border-slate-300"}`}
              onClick={() => handleSelectPlan(plan.key)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {plan.name}
                    {plan.recommended && <Star className="h-4 w-4 text-amber-500" />}
                  </CardTitle>
                  <Badge variant="secondary" className="capitalize">{plan.status || "active"}</Badge>
                </div>
                <p className="text-sm text-slate-500">{plan.description}</p>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 space-y-2">
                <div className="flex items-center justify-between">
                  <span>Users</span>
                  <span className="font-medium">{plan.userLimit === null ? "Unlimited" : plan.userLimit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Invoices</span>
                  <span className="font-medium">{plan.invoices_limit || "Unlimited"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Quotes</span>
                  <span className="font-medium">{plan.quotes_limit || "Unlimited"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Price (monthly)</span>
                  <span className="font-medium">R {plan.priceMonthly || 0}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="xl:col-span-2">
          <Card className="shadow-sm">
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{isCreating ? "Create Plan" : selectedPlan?.name || "Plan Details"}</CardTitle>
                  <p className="text-sm text-slate-500">Manage pricing, limits, and feature access.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!isCreating && selectedKey && (
                    <Button variant="outline" onClick={() => handleSetRecommended(!selectedPlan?.recommended)}>
                      <Star className="h-4 w-4 mr-2" />
                      {selectedPlan?.recommended ? "Unmark" : "Recommend"}
                    </Button>
                  )}
                  {!isCreating && selectedKey && (
                    <Button variant="outline" onClick={handleArchive}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Archive
                    </Button>
                  )}
                  <Button onClick={handleSave}>
                    <Save className="h-4 w-4 mr-2" />
                    {isCreating ? "Create" : "Save"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="plan-name">Plan Name</Label>
                    <Input
                      id="plan-name"
                      value={form.name}
                      onChange={(e) => handleFormChange("name", e.target.value)}
                      placeholder="Starter"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan-key">Plan Key</Label>
                    <Input
                      id="plan-key"
                      value={form.key}
                      onChange={(e) => handleFormChange("key", e.target.value)}
                      placeholder="starter"
                      disabled={!isCreating}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="plan-description">Description</Label>
                    <Input
                      id="plan-description"
                      value={form.description}
                      onChange={(e) => handleFormChange("description", e.target.value)}
                      placeholder="Short description for this plan"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price-monthly">Price Monthly</Label>
                    <Input
                      id="price-monthly"
                      type="number"
                      value={form.priceMonthly}
                      onChange={(e) => handleFormChange("priceMonthly", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price-yearly">Price Yearly</Label>
                    <Input
                      id="price-yearly"
                      type="number"
                      value={form.priceYearly}
                      onChange={(e) => handleFormChange("priceYearly", e.target.value)}
                    />
                  </div>
                </div>

                <Tabs defaultValue="limits" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="limits">Limits</TabsTrigger>
                    <TabsTrigger value="features">Features</TabsTrigger>
                    <TabsTrigger value="versions">Versions</TabsTrigger>
                  </TabsList>

                  <TabsContent value="limits" className="space-y-4 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="user-limit">User Limit</Label>
                        <Input
                          id="user-limit"
                          type="number"
                          value={form.userLimit}
                          onChange={(e) => handleFormChange("userLimit", e.target.value)}
                          placeholder="Unlimited"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="storage">Storage</Label>
                        <Input
                          id="storage"
                          value={form.storage}
                          onChange={(e) => handleFormChange("storage", e.target.value)}
                          placeholder="10GB"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invoice-limit">Invoice Limit</Label>
                        <Input
                          id="invoice-limit"
                          value={form.invoices_limit}
                          onChange={(e) => handleFormChange("invoices_limit", e.target.value)}
                          placeholder="Unlimited"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="quote-limit">Quote Limit</Label>
                        <Input
                          id="quote-limit"
                          value={form.quotes_limit}
                          onChange={(e) => handleFormChange("quotes_limit", e.target.value)}
                          placeholder="Unlimited"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="plan-status">Plan Status</Label>
                        <Input
                          id="plan-status"
                          value={form.status}
                          onChange={(e) => handleFormChange("status", e.target.value)}
                          placeholder="active"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="change-note">Change Note</Label>
                        <Input
                          id="change-note"
                          value={changeNote}
                          onChange={(e) => setChangeNote(e.target.value)}
                          placeholder="Describe the change"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="features" className="mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {FEATURE_CATALOG.map((feature) => (
                        <div key={feature.key} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{feature.label}</p>
                            <p className="text-xs text-slate-500">{feature.description}</p>
                          </div>
                          <Switch
                            checked={Boolean(form.features?.[feature.key])}
                            onCheckedChange={(checked) => handleFeatureToggle(feature.key, checked)}
                          />
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="versions" className="mt-4 space-y-3">
                    {history.length === 0 && (
                      <p className="text-sm text-slate-500">No version history yet.</p>
                    )}
                    {history.slice().reverse().map((entry) => (
                      <div key={`${entry.version}-${entry.timestamp}`} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">Version {entry.version}</p>
                          <p className="text-xs text-slate-500">{entry.timestamp} • {entry.updatedBy || "system"}</p>
                          {entry.changeNote && (
                            <p className="text-xs text-slate-600">{entry.changeNote}</p>
                          )}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleRestoreVersion(entry.version)}>
                          <Undo2 className="h-4 w-4 mr-2" />
                          Restore
                        </Button>
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
