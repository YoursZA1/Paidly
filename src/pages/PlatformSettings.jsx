import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/components/auth/AuthContext";
import SystemSettingsService from "@/services/SystemSettingsService";
import PlanManagementService from "@/services/PlanManagementService";
import { 
  Mail, FileText, DollarSign, Zap, Shield, 
  Bell, Link2, Palette, Save, RotateCcw, Download, Upload,
  CheckCircle, Globe, Server, Search, Lock,
  CreditCard, BarChart3, LineChart, MailCheck
} from "lucide-react";
import { renderIcon } from "@/utils/renderIcon";


export default function PlatformSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    loadSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSettings = () => {
    setLoading(true);
    try {
      const loadedSettings = SystemSettingsService.getSettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: "Error",
        description: "Failed to load system settings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSection = async (section, data) => {
    setSaving(true);
    try {
      const updated = SystemSettingsService.updateSection(section, data, user?.id);
      setSettings(updated);
      toast({
        title: "Success",
        description: "Settings saved successfully",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    try {
      const json = SystemSettingsService.exportSettings();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system-settings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Settings exported successfully",
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Error",
        description: "Failed to export settings",
        variant: "destructive"
      });
    }
  };

  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = SystemSettingsService.importSettings(e.target.result, user?.id);
        setSettings(imported);
        toast({
          title: "Success",
          description: "Settings imported successfully",
        });
      } catch (error) {
        console.error('Import error:', error);
        toast({
          title: "Error",
          description: "Failed to import settings. Invalid format.",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      const defaults = SystemSettingsService.resetToDefaults();
      setSettings(defaults);
      toast({
        title: "Reset Complete",
        description: "All settings have been reset to defaults",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Server className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading platform settings...</p>
        </div>
      </div>
    );
  }

  const isRestrictedAdmin = ["super_admin", "founder"].includes(user?.role);

  if (!isRestrictedAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Lock className="h-5 w-5" />
              Restricted Settings
            </CardTitle>
            <CardDescription>
              Only founders and super administrators can access this area.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              If you need access, contact a founder or super admin to update your role.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSaveSystem = (data) => {
    handleSaveSection('system', data);
  };

  const handleSaveBranding = (data) => {
    handleSaveSection('branding', data);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <Tabs defaultValue="restricted" className="max-w-6xl mx-auto">
        <TabsList className="mb-6 grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="restricted">Restricted settings</TabsTrigger>
          <TabsTrigger value="system">System & branding</TabsTrigger>
        </TabsList>
        <TabsContent value="restricted">
          <RestrictedSettingsView
            settings={settings}
            saving={saving}
            onSaveSection={handleSaveSection}
            onExport={handleExport}
            onImport={handleImport}
            onReset={handleReset}
            updatedBy={user?.email || user?.full_name || "admin"}
          />
        </TabsContent>
        <TabsContent value="system" className="space-y-6">
          <SystemSettingsTab
            settings={settings?.system}
            onSave={handleSaveSystem}
            saving={saving}
          />
          <BrandingTab
            branding={settings?.branding}
            onSave={handleSaveBranding}
            saving={saving}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RestrictedSettingsView({
  settings,
  saving,
  onSaveSection,
  onExport,
  onImport,
  onReset,
  updatedBy
}) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [plans, setPlans] = useState([]);
  const [planDrafts, setPlanDrafts] = useState([]);
  const [defaultsDraft, setDefaultsDraft] = useState(settings?.defaults || {});
  const [numberingDraft, setNumberingDraft] = useState(settings?.documentNumbering || {});
  const [featuresDraft, setFeaturesDraft] = useState(settings?.features || {});
  const [supportedCurrencies, setSupportedCurrencies] = useState(
    Array.isArray(settings?.defaults?.supportedCurrencies)
      ? settings.defaults.supportedCurrencies.join(', ')
      : (settings?.defaults?.supportedCurrencies || '')
  );

  useEffect(() => {
    const list = PlanManagementService.getPlans();
    setPlans(list);
    setPlanDrafts(list.map(plan => ({
      ...plan,
      userLimit: plan.userLimit === null ? "" : plan.userLimit,
      invoices_limit: plan.invoices_limit === "Unlimited" ? "" : plan.invoices_limit,
      quotes_limit: plan.quotes_limit === "Unlimited" ? "" : plan.quotes_limit
    })));
  }, []);

  useEffect(() => {
    setDefaultsDraft(settings?.defaults || {});
    setNumberingDraft(settings?.documentNumbering || {});
    setFeaturesDraft(settings?.features || {});
    if (Array.isArray(settings?.defaults?.supportedCurrencies)) {
      setSupportedCurrencies(settings.defaults.supportedCurrencies.join(', '));
    } else {
      setSupportedCurrencies(settings?.defaults?.supportedCurrencies || '');
    }
  }, [settings]);

  const searchLower = searchQuery.trim().toLowerCase();
  const matches = (value) => {
    if (!searchLower) return true;
    return (value || '').toLowerCase().includes(searchLower);
  };

  const formatLabel = (value) =>
    (value || '')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const normalizeNumber = (value) => {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  };

  const normalizeUnlimited = (value) => {
    if (value === "" || value === null || value === undefined) return null;
    if (value === "Unlimited") return null;
    return normalizeNumber(value);
  };

  const getPlanPayload = (draft) => ({
    priceMonthly: normalizeNumber(draft.priceMonthly) || 0,
    priceYearly: normalizeNumber(draft.priceYearly) || 0,
    userLimit: draft.userLimit === "" ? null : normalizeNumber(draft.userLimit),
    invoices_limit: draft.invoices_limit === "" ? "Unlimited" : normalizeNumber(draft.invoices_limit),
    quotes_limit: draft.quotes_limit === "" ? "Unlimited" : normalizeNumber(draft.quotes_limit),
    recommended: Boolean(draft.recommended),
    status: draft.status || "active"
  });

  const hasPlanChanged = (original, draft) => {
    const payload = getPlanPayload(draft);
    return (
      normalizeNumber(original.priceMonthly) !== normalizeNumber(payload.priceMonthly) ||
      normalizeNumber(original.priceYearly) !== normalizeNumber(payload.priceYearly) ||
      normalizeUnlimited(original.userLimit) !== normalizeUnlimited(payload.userLimit) ||
      normalizeUnlimited(original.invoices_limit) !== normalizeUnlimited(payload.invoices_limit) ||
      normalizeUnlimited(original.quotes_limit) !== normalizeUnlimited(payload.quotes_limit) ||
      Boolean(original.recommended) !== Boolean(payload.recommended) ||
      (original.status || "active") !== payload.status
    );
  };

  const handlePlanChange = (key, field, value) => {
    setPlanDrafts((prev) => prev.map((plan) => (
      plan.key === key ? { ...plan, [field]: value } : plan
    )));
  };

  const handleSavePlans = () => {
    planDrafts.forEach((draft) => {
      const original = plans.find((plan) => plan.key === draft.key);
      if (!original || !hasPlanChanged(original, draft)) return;
      PlanManagementService.updatePlan(draft.key, getPlanPayload(draft), {
        updatedBy,
        changeNote: "Restricted settings update"
      });
    });

    const refreshed = PlanManagementService.getPlans();
    setPlans(refreshed);
    setPlanDrafts(refreshed.map(plan => ({
      ...plan,
      userLimit: plan.userLimit === null ? "" : plan.userLimit,
      invoices_limit: plan.invoices_limit === "Unlimited" ? "" : plan.invoices_limit,
      quotes_limit: plan.quotes_limit === "Unlimited" ? "" : plan.quotes_limit
    })));
    toast({
      title: "Plans Updated",
      description: "Pricing and limits saved",
    });
  };

  const handleSaveDefaults = () => {
    const supportedList = supportedCurrencies
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    onSaveSection('defaults', {
      ...defaultsDraft,
      supportedCurrencies: supportedList
    });
  };

  const handleSaveNumbering = () => {
    onSaveSection('documentNumbering', numberingDraft);
  };

  const handleSaveFeatures = () => {
    onSaveSection('features', featuresDraft);
  };

  const matchingPlans = planDrafts.filter((plan) => (
    matches(`${plan.name} ${plan.key}`)
  ));

  const featureEntries = Object.entries(featuresDraft.enabled || {})
    .filter(([key]) => matches(key))
    .map(([key, value]) => ({ key, value, scope: 'enabled' }));

  const betaEntries = Object.entries(featuresDraft.beta || {})
    .filter(([key]) => matches(key))
    .map(([key, value]) => ({ key, value, scope: 'beta' }));

  const showPlans = matches('plans pricing invoices quotes limits') || matchingPlans.length > 0;
  const showTax = matches('tax defaults vat') || matches(defaultsDraft?.taxName || '');
  const showCurrency = matches('currency support') || matches(defaultsDraft?.currency || '') || matches(supportedCurrencies);
  const showNumbering = matches('invoice numbering document') || matches(numberingDraft?.invoice?.prefix || '');
  const showFeatures = matches('feature rollout toggles') || featureEntries.length > 0 || betaEntries.length > 0;

  const visibleSections = [showPlans, showTax, showCurrency, showNumbering, showFeatures].some(Boolean);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Restricted Settings</h1>
              <p className="text-sm text-slate-600">Founder-only configuration for pricing, tax, and rollout controls.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => document.getElementById('restricted-import').click()}>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <input
                id="restricted-import"
                type="file"
                accept=".json"
                onChange={onImport}
                className="hidden"
              />
              <Button variant="outline" size="sm" onClick={onReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              id="restricted-settings-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plans, currencies, tax, numbering, or features..."
              className="pl-10"
              aria-label="Search restricted settings"
            />
          </div>
        </div>

        {!visibleSections && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              No settings match your search.
            </CardContent>
          </Card>
        )}

        {showPlans && (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Plans & Pricing</CardTitle>
              <CardDescription>Adjust pricing and usage limits. Entrepreneur plan is highlighted.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Plan</th>
                      <th className="py-2">Monthly</th>
                      <th className="py-2">Yearly</th>
                      <th className="py-2">Users</th>
                      <th className="py-2">Invoices</th>
                      <th className="py-2">Quotes</th>
                      <th className="py-2">Recommended</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    {matchingPlans.map((plan) => {
                      const isEntrepreneur = plan.key === 'professional' || plan.name?.toLowerCase().includes('entrepreneur');
                      return (
                        <tr key={plan.key} className={isEntrepreneur ? 'bg-amber-50 border border-amber-200' : 'border-b border-slate-100'}>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900">{plan.name}</span>
                              {isEntrepreneur && (
                                <Badge className="bg-amber-100 text-amber-800">Entrepreneur</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2 pr-3">
                            <Input
                              type="number"
                              value={plan.priceMonthly}
                              onChange={(e) => handlePlanChange(plan.key, 'priceMonthly', e.target.value)}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <Input
                              type="number"
                              value={plan.priceYearly}
                              onChange={(e) => handlePlanChange(plan.key, 'priceYearly', e.target.value)}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <Input
                              value={plan.userLimit}
                              onChange={(e) => handlePlanChange(plan.key, 'userLimit', e.target.value)}
                              placeholder="Unlimited"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <Input
                              value={plan.invoices_limit}
                              onChange={(e) => handlePlanChange(plan.key, 'invoices_limit', e.target.value)}
                              placeholder="Unlimited"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <Input
                              value={plan.quotes_limit}
                              onChange={(e) => handlePlanChange(plan.key, 'quotes_limit', e.target.value)}
                              placeholder="Unlimited"
                            />
                          </td>
                          <td className="py-2">
                            <Switch
                              checked={Boolean(plan.recommended)}
                              onCheckedChange={(checked) => handlePlanChange(plan.key, 'recommended', checked)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSavePlans} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Plans
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showTax && (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Tax Defaults</CardTitle>
              <CardDescription>Set default tax behavior for all invoices.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ps-tax-name">Tax Name</Label>
                  <Input
                    id="ps-tax-name"
                    value={defaultsDraft.taxName || ''}
                    onChange={(e) => setDefaultsDraft({ ...defaultsDraft, taxName: e.target.value })}
                    placeholder="VAT"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ps-tax-rate">Tax Rate (%)</Label>
                  <Input
                    id="ps-tax-rate"
                    type="number"
                    value={defaultsDraft.taxRate ?? ''}
                    onChange={(e) => setDefaultsDraft({ ...defaultsDraft, taxRate: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ps-tax-number">Tax Number</Label>
                  <Input
                    id="ps-tax-number"
                    value={defaultsDraft.taxNumber || ''}
                    onChange={(e) => setDefaultsDraft({ ...defaultsDraft, taxNumber: e.target.value })}
                    placeholder="123456789"
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                  <div>
                    <Label htmlFor="ps-tax-enabled">Tax Enabled</Label>
                    <p className="text-xs text-slate-500">Apply tax by default</p>
                  </div>
                  <Switch
                    id="ps-tax-enabled"
                    checked={Boolean(defaultsDraft.taxEnabled)}
                    onCheckedChange={(checked) => setDefaultsDraft({ ...defaultsDraft, taxEnabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                  <div>
                    <Label htmlFor="ps-tax-inclusive">Tax Inclusive</Label>
                    <p className="text-xs text-slate-500">Prices include tax</p>
                  </div>
                  <Switch
                    id="ps-tax-inclusive"
                    checked={Boolean(defaultsDraft.taxInclusive)}
                    onCheckedChange={(checked) => setDefaultsDraft({ ...defaultsDraft, taxInclusive: checked })}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveDefaults} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Tax Defaults
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showCurrency && (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Currency Support</CardTitle>
              <CardDescription>Define supported currencies and formatting defaults.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ps-default-currency">Default Currency</Label>
                  <Input
                    id="ps-default-currency"
                    value={defaultsDraft.currency || ''}
                    onChange={(e) => setDefaultsDraft({ ...defaultsDraft, currency: e.target.value.toUpperCase() })}
                    placeholder="ZAR"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ps-currency-symbol">Currency Symbol</Label>
                  <Input
                    id="ps-currency-symbol"
                    value={defaultsDraft.currencySymbol || ''}
                    onChange={(e) => setDefaultsDraft({ ...defaultsDraft, currencySymbol: e.target.value })}
                    placeholder="R"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ps-decimal-places">Decimal Places</Label>
                  <Input
                    id="ps-decimal-places"
                    type="number"
                    value={defaultsDraft.decimalPlaces ?? 2}
                    onChange={(e) => setDefaultsDraft({ ...defaultsDraft, decimalPlaces: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ps-thousands-separator">Thousands Separator</Label>
                  <Input
                    id="ps-thousands-separator"
                    value={defaultsDraft.thousandsSeparator || ','}
                    onChange={(e) => setDefaultsDraft({ ...defaultsDraft, thousandsSeparator: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ps-decimal-separator">Decimal Separator</Label>
                  <Input
                    id="ps-decimal-separator"
                    value={defaultsDraft.decimalSeparator || '.'}
                    onChange={(e) => setDefaultsDraft({ ...defaultsDraft, decimalSeparator: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ps-supported-currencies">Supported Currencies</Label>
                  <Input
                    id="ps-supported-currencies"
                    value={supportedCurrencies}
                    onChange={(e) => setSupportedCurrencies(e.target.value)}
                    placeholder="ZAR, USD, EUR"
                  />
                  <p className="text-xs text-slate-500">Comma-separated ISO codes.</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveDefaults} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Currency Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showNumbering && (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Invoice Numbering</CardTitle>
              <CardDescription>Standardize prefixes and sequencing rules.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Document</th>
                      <th className="py-2">Prefix</th>
                      <th className="py-2">Format</th>
                      <th className="py-2">Start</th>
                      <th className="py-2">Padding</th>
                      <th className="py-2">Reset</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    {Object.entries(numberingDraft || {}).map(([docKey, doc]) => (
                      <tr key={docKey} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-medium text-slate-900">{formatLabel(docKey)}</td>
                        <td className="py-2 pr-3">
                          <Input
                            value={doc.prefix || ''}
                            onChange={(e) => setNumberingDraft({
                              ...numberingDraft,
                              [docKey]: { ...doc, prefix: e.target.value }
                            })}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            value={doc.format || ''}
                            onChange={(e) => setNumberingDraft({
                              ...numberingDraft,
                              [docKey]: { ...doc, format: e.target.value }
                            })}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            type="number"
                            value={doc.startNumber ?? ''}
                            onChange={(e) => setNumberingDraft({
                              ...numberingDraft,
                              [docKey]: { ...doc, startNumber: Number(e.target.value) }
                            })}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            type="number"
                            value={doc.padding ?? ''}
                            onChange={(e) => setNumberingDraft({
                              ...numberingDraft,
                              [docKey]: { ...doc, padding: Number(e.target.value) }
                            })}
                          />
                        </td>
                        <td className="py-2">
                          <Input
                            value={doc.resetPeriod || ''}
                            onChange={(e) => setNumberingDraft({
                              ...numberingDraft,
                              [docKey]: { ...doc, resetPeriod: e.target.value }
                            })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveNumbering} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Numbering
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showFeatures && (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Feature Rollout Toggles</CardTitle>
              <CardDescription>Control availability of platform features.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">Released Features</p>
                  {featureEntries.map((feature) => (
                    <div key={feature.key} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{formatLabel(feature.key)}</p>
                        <p className="text-xs text-slate-500">Enabled</p>
                      </div>
                      <Switch
                        checked={Boolean(feature.value)}
                        onCheckedChange={(checked) => setFeaturesDraft({
                          ...featuresDraft,
                          enabled: { ...featuresDraft.enabled, [feature.key]: checked }
                        })}
                      />
                    </div>
                  ))}
                  {featureEntries.length === 0 && (
                    <p className="text-sm text-slate-500">No released features match your search.</p>
                  )}
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">Rollout (Beta)</p>
                  {betaEntries.map((feature) => (
                    <div key={feature.key} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{formatLabel(feature.key)}</p>
                        <p className="text-xs text-slate-500">Beta</p>
                      </div>
                      <Switch
                        checked={Boolean(feature.value)}
                        onCheckedChange={(checked) => setFeaturesDraft({
                          ...featuresDraft,
                          beta: { ...featuresDraft.beta, [feature.key]: checked }
                        })}
                      />
                    </div>
                  ))}
                  {betaEntries.length === 0 && (
                    <p className="text-sm text-slate-500">No beta features match your search.</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveFeatures} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Feature Toggles
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

RestrictedSettingsView.propTypes = {
  settings: PropTypes.object,
  saving: PropTypes.bool,
  onSaveSection: PropTypes.func.isRequired,
  onExport: PropTypes.func.isRequired,
  onImport: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  updatedBy: PropTypes.string
};

// System Settings Tab Component
function SystemSettingsTab({ settings, onSave, saving }) {
  const [formData, setFormData] = useState(settings || {});

  useEffect(() => {
    setFormData(settings || {});
  }, [settings]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          System Configuration
        </CardTitle>
        <CardDescription>
          Configure core system settings and maintenance options
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="siteName">Site Name</Label>
              <Input
                id="siteName"
                value={formData.siteName || ''}
                onChange={(e) => setFormData({ ...formData, siteName: e.target.value })}
                placeholder="Paidly"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminEmail">Admin Email</Label>
              <Input
                id="adminEmail"
                type="email"
                value={formData.adminEmail || ''}
                onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                placeholder="admin@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input
                id="supportEmail"
                type="email"
                value={formData.supportEmail || ''}
                onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })}
                placeholder="support@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeZone">Time Zone</Label>
              <Select value={formData.timeZone} onValueChange={(value) => setFormData({ ...formData, timeZone: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Africa/Johannesburg">South Africa (SAST)</SelectItem>
                  <SelectItem value="America/New_York">New York (EST)</SelectItem>
                  <SelectItem value="Europe/London">London (GMT)</SelectItem>
                  <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
              <Input
                id="sessionTimeout"
                type="number"
                value={formData.sessionTimeout || 30}
                onChange={(e) => setFormData({ ...formData, sessionTimeout: parseInt(e.target.value) })}
                min="5"
                max="240"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxLoginAttempts">Max Login Attempts</Label>
              <Input
                id="maxLoginAttempts"
                type="number"
                value={formData.maxLoginAttempts || 5}
                onChange={(e) => setFormData({ ...formData, maxLoginAttempts: parseInt(e.target.value) })}
                min="3"
                max="10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="siteDescription">Site Description</Label>
            <Textarea
              id="siteDescription"
              value={formData.siteDescription || ''}
              onChange={(e) => setFormData({ ...formData, siteDescription: e.target.value })}
              placeholder="Professional Invoice Management Platform"
              rows={2}
            />
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="system-maintenance-mode" className="text-base">Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Disable access to the platform for non-admin users
                </p>
              </div>
              <Switch
                id="system-maintenance-mode"
                checked={formData.maintenanceMode || false}
                onCheckedChange={(checked) => setFormData({ ...formData, maintenanceMode: checked })}
              />
            </div>

            {formData.maintenanceMode && (
              <div className="space-y-2 pl-6">
                <Label htmlFor="maintenanceMessage">Maintenance Message</Label>
                <Textarea
                  id="maintenanceMessage"
                  value={formData.maintenanceMessage || ''}
                  onChange={(e) => setFormData({ ...formData, maintenanceMessage: e.target.value })}
                  placeholder="We are currently performing scheduled maintenance..."
                  rows={3}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="system-allow-registration" className="text-base">Allow User Registration</Label>
                <p className="text-sm text-muted-foreground">
                  Allow new users to sign up
                </p>
              </div>
              <Switch
                id="system-allow-registration"
                checked={formData.allowUserRegistration || false}
                onCheckedChange={(checked) => setFormData({ ...formData, allowUserRegistration: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="system-require-email-verify" className="text-base">Require Email Verification</Label>
                <p className="text-sm text-muted-foreground">
                  Users must verify their email before accessing the platform
                </p>
              </div>
              <Switch
                id="system-require-email-verify"
                checked={formData.requireEmailVerification || false}
                onCheckedChange={(checked) => setFormData({ ...formData, requireEmailVerification: checked })}
              />
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save System Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

SystemSettingsTab.propTypes = {
  settings: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired
};

// Email Templates Tab Component
function EmailTemplatesTab({ templates, onSave, saving }) {
  const [selectedTemplate, setSelectedTemplate] = useState('welcome');
  const [formData, setFormData] = useState(templates || {});

  useEffect(() => {
    setFormData(templates || {});
  }, [templates]);

  const currentTemplate = formData[selectedTemplate] || { subject: '', body: '' };

  const handleSave = () => {
    onSave(formData);
  };

  const templateOptions = [
    { value: 'welcome', label: 'Welcome Email' },
    { value: 'invoiceCreated', label: 'Invoice Created' },
    { value: 'invoiceReminder', label: 'Payment Reminder' },
    { value: 'invoiceOverdue', label: 'Invoice Overdue' },
    { value: 'paymentReceived', label: 'Payment Received' },
    { value: 'passwordReset', label: 'Password Reset' },
    { value: 'accountDisabled', label: 'Account Disabled' }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Templates
        </CardTitle>
        <CardDescription>
          Customize email templates for system notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email-template-select">Select Template</Label>
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger id="email-template-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templateOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject">Subject Line</Label>
          <Input
            id="subject"
            value={currentTemplate.subject || ''}
            onChange={(e) => setFormData({
              ...formData,
              [selectedTemplate]: { ...currentTemplate, subject: e.target.value }
            })}
            placeholder="Email subject"
          />
          <p className="text-xs text-muted-foreground">
            Available variables: {'{'}{'{'} siteName {'}'}{'}'},  {'{'}{'{'} userName {'}'}{'}'},  {'{'}{'{'} invoiceNumber {'}'}{'}'},  {'{'}{'{'} clientName {'}'}{'}'},  {'{'}{'{'} amount {'}'}{'}'},  {'{'}{'{'} dueDate {'}'}{'}'} 
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="body">Email Body</Label>
          <Textarea
            id="body"
            value={currentTemplate.body || ''}
            onChange={(e) => setFormData({
              ...formData,
              [selectedTemplate]: { ...currentTemplate, body: e.target.value }
            })}
            placeholder="Email body content"
            rows={12}
            className="font-mono text-sm"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Email Templates'}
        </Button>
      </CardContent>
    </Card>
  );
}

EmailTemplatesTab.propTypes = {
  templates: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired
};

// Document Numbering Tab Component
function DocumentNumberingTab({ numbering, onSave, saving }) {
  const [selectedDoc, setSelectedDoc] = useState('invoice');
  const [formData, setFormData] = useState(numbering || {});

  useEffect(() => {
    setFormData(numbering || {});
  }, [numbering]);

  const currentDoc = formData[selectedDoc] || {};

  const handleSave = () => {
    onSave(formData);
  };

  const docTypes = [
    { value: 'invoice', label: 'Invoice' },
    { value: 'quote', label: 'Quote' },
    { value: 'receipt', label: 'Receipt' },
    { value: 'creditNote', label: 'Credit Note' }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Document Numbering Rules
        </CardTitle>
        <CardDescription>
          Configure automatic numbering for different document types
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="document-numbering-doc-type">Document Type</Label>
          <Select value={selectedDoc} onValueChange={setSelectedDoc}>
            <SelectTrigger id="document-numbering-doc-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {docTypes.map(doc => (
                <SelectItem key={doc.value} value={doc.value}>
                  {doc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="prefix">Prefix</Label>
            <Input
              id="prefix"
              value={currentDoc.prefix || ''}
              onChange={(e) => setFormData({
                ...formData,
                [selectedDoc]: { ...currentDoc, prefix: e.target.value.toUpperCase() }
              })}
              placeholder="INV"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="separator">Separator</Label>
            <Input
              id="separator"
              value={currentDoc.separator || '-'}
              onChange={(e) => setFormData({
                ...formData,
                [selectedDoc]: { ...currentDoc, separator: e.target.value }
              })}
              placeholder="-"
              maxLength={1}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="startNumber">Start Number</Label>
            <Input
              id="startNumber"
              type="number"
              value={currentDoc.startNumber || 1}
              onChange={(e) => setFormData({
                ...formData,
                [selectedDoc]: { ...currentDoc, startNumber: parseInt(e.target.value) }
              })}
              min="1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="padding">Number Padding</Label>
            <Input
              id="padding"
              type="number"
              value={currentDoc.padding || 3}
              onChange={(e) => setFormData({
                ...formData,
                [selectedDoc]: { ...currentDoc, padding: parseInt(e.target.value) }
              })}
              min="1"
              max="10"
            />
            <p className="text-xs text-muted-foreground">Digits: 001, 002, etc.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="format">Format</Label>
            <Select 
              value={currentDoc.format} 
              onValueChange={(value) => setFormData({
                ...formData,
                [selectedDoc]: { ...currentDoc, format: value }
              })}
            >
              <SelectTrigger id="format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PREFIX-SEQ">PREFIX-001</SelectItem>
                <SelectItem value="PREFIX-YYYYMMDD-SEQ">PREFIX-20240101-001</SelectItem>
                <SelectItem value="PREFIX-YYYYMMDD-INITIALS-SEQ">PREFIX-20240101-AB-001</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resetPeriod">Reset Period</Label>
            <Select 
              value={currentDoc.resetPeriod} 
              onValueChange={(value) => setFormData({
                ...formData,
                [selectedDoc]: { ...currentDoc, resetPeriod: value }
              })}
            >
              <SelectTrigger id="resetPeriod">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="include-client-initials" className="text-base">Include Client Initials</Label>
            <p className="text-sm text-muted-foreground">
              Add client initials to document number
            </p>
          </div>
          <Switch
            id="include-client-initials"
            checked={currentDoc.includeClientInitials || false}
            onCheckedChange={(checked) => setFormData({
              ...formData,
              [selectedDoc]: { ...currentDoc, includeClientInitials: checked }
            })}
          />
        </div>

        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm font-medium mb-2">Preview:</p>
          <p className="font-mono text-lg">
            {currentDoc.prefix || 'INV'}{currentDoc.separator || '-'}
            {currentDoc.format?.includes('YYYYMMDD') && `20240205${currentDoc.separator || '-'}`}
            {currentDoc.format?.includes('INITIALS') && `AB${currentDoc.separator || '-'}`}
            {'001'.padStart(currentDoc.padding || 3, '0')}
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Numbering Rules'}
        </Button>
      </CardContent>
    </Card>
  );
}

DocumentNumberingTab.propTypes = {
  numbering: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired
};

// Default Settings Tab Component (Currency & Tax)
function DefaultSettingsTab({ defaults, onSave, saving }) {
  const [formData, setFormData] = useState(defaults || {});

  useEffect(() => {
    setFormData(defaults || {});
  }, [defaults]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Default Currency & Tax Settings
        </CardTitle>
        <CardDescription>
          Configure default currency, tax, and payment settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
          <div>
            <h3 className="font-semibold mb-3">Currency Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Default Currency</Label>
                <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ZAR">ZAR (South African Rand)</SelectItem>
                    <SelectItem value="USD">USD (US Dollar)</SelectItem>
                    <SelectItem value="EUR">EUR (Euro)</SelectItem>
                    <SelectItem value="GBP">GBP (British Pound)</SelectItem>
                    <SelectItem value="AED">AED (UAE Dirham)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currencySymbol">Currency Symbol</Label>
                <Input
                  id="currencySymbol"
                  value={formData.currencySymbol || ''}
                  onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })}
                  placeholder="R"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currencyPosition">Symbol Position</Label>
                <Select 
                  value={formData.currencyPosition} 
                  onValueChange={(value) => setFormData({ ...formData, currencyPosition: value })}
                >
                  <SelectTrigger id="currencyPosition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before">Before (R 100)</SelectItem>
                    <SelectItem value="after">After (100 R)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="decimalPlaces">Decimal Places</Label>
                <Input
                  id="decimalPlaces"
                  type="number"
                  value={formData.decimalPlaces || 2}
                  onChange={(e) => setFormData({ ...formData, decimalPlaces: parseInt(e.target.value) })}
                  min="0"
                  max="4"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="thousandsSeparator">Thousands Separator</Label>
                <Input
                  id="thousandsSeparator"
                  value={formData.thousandsSeparator || ','}
                  onChange={(e) => setFormData({ ...formData, thousandsSeparator: e.target.value })}
                  placeholder=","
                  maxLength={1}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="decimalSeparator">Decimal Separator</Label>
                <Input
                  id="decimalSeparator"
                  value={formData.decimalSeparator || '.'}
                  onChange={(e) => setFormData({ ...formData, decimalSeparator: e.target.value })}
                  placeholder="."
                  maxLength={1}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold mb-3">Tax Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="default-enable-tax" className="text-base">Enable Tax</Label>
                  <p className="text-sm text-muted-foreground">
                    Apply tax to invoices by default
                  </p>
                </div>
                <Switch
                  id="default-enable-tax"
                  checked={formData.taxEnabled || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, taxEnabled: checked })}
                />
              </div>

              {formData.taxEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                  <div className="space-y-2">
                    <Label htmlFor="taxName">Tax Name</Label>
                    <Input
                      id="taxName"
                      value={formData.taxName || ''}
                      onChange={(e) => setFormData({ ...formData, taxName: e.target.value })}
                      placeholder="VAT"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="taxRate">Tax Rate (%)</Label>
                    <Input
                      id="taxRate"
                      type="number"
                      value={formData.taxRate || 0}
                      onChange={(e) => setFormData({ ...formData, taxRate: parseFloat(e.target.value) })}
                      step="0.01"
                      min="0"
                      max="100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="taxNumber">Tax Number</Label>
                    <Input
                      id="taxNumber"
                      value={formData.taxNumber || ''}
                      onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                      placeholder="4123456789"
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-7">
                    <Switch
                      id="taxInclusive"
                      checked={formData.taxInclusive || false}
                      onCheckedChange={(checked) => setFormData({ ...formData, taxInclusive: checked })}
                    />
                    <Label htmlFor="taxInclusive">Tax Inclusive</Label>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold mb-3">Payment Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentTerms">Default Payment Terms (days)</Label>
                <Input
                  id="paymentTerms"
                  type="number"
                  value={formData.paymentTerms || 30}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: parseInt(e.target.value) })}
                  min="0"
                  max="365"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="latePaymentFee">Late Payment Fee (%)</Label>
                <Input
                  id="latePaymentFee"
                  type="number"
                  value={formData.latePaymentFee || 0}
                  onChange={(e) => setFormData({ ...formData, latePaymentFee: parseFloat(e.target.value) })}
                  step="0.01"
                  min="0"
                  max="100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="latePaymentFeeAfterDays">Apply Fee After (days)</Label>
                <Input
                  id="latePaymentFeeAfterDays"
                  type="number"
                  value={formData.latePaymentFeeAfterDays || 30}
                  onChange={(e) => setFormData({ ...formData, latePaymentFeeAfterDays: parseInt(e.target.value) })}
                  min="0"
                  max="365"
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Default Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

DefaultSettingsTab.propTypes = {
  defaults: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired
};

// Features Tab Component
function FeaturesTab({ features, onSave, saving }) {
  const [formData, setFormData] = useState(features || {});

  useEffect(() => {
    setFormData(features || {});
  }, [features]);

  const handleToggle = (type, feature, value) => {
    setFormData({
      ...formData,
      [type]: {
        ...formData[type],
        [feature]: value
      }
    });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Beta Features
          </CardTitle>
          <CardDescription>
            Features in testing - may have limited functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(formData.beta || {}).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor={`feature-beta-${key}`} className="text-base">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
              </div>
              <div className="flex items-center gap-2">
                {enabled && <Badge variant="secondary" className="text-xs">Beta</Badge>}
                <Switch
                  id={`feature-beta-${key}`}
                  checked={enabled}
                  onCheckedChange={(checked) => handleToggle('beta', key, checked)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Released Features
          </CardTitle>
          <CardDescription>
            Production-ready features available to users
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(formData.enabled || {}).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor={`feature-enabled-${key}`} className="text-base">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
              </div>
              <Switch
                id={`feature-enabled-${key}`}
                checked={enabled}
                onCheckedChange={(checked) => handleToggle('enabled', key, checked)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={() => onSave(formData)} disabled={saving} className="w-full">
        <Save className="h-4 w-4 mr-2" />
        {saving ? 'Saving...' : 'Save Feature Toggles'}
      </Button>
    </div>
  );
}

FeaturesTab.propTypes = {
  features: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired
};

// Security Tab Component
function SecurityTab({ security, onSave, saving }) {
  const [formData, setFormData] = useState(security || {});

  useEffect(() => {
    setFormData(security || {});
  }, [security]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Security Settings
        </CardTitle>
        <CardDescription>
          Configure password policies and security features
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
          <div>
            <h3 className="font-semibold mb-3">Password Requirements</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="passwordMinLength">Minimum Length</Label>
                <Input
                  id="passwordMinLength"
                  type="number"
                  value={formData.passwordMinLength || 8}
                  onChange={(e) => setFormData({ ...formData, passwordMinLength: parseInt(e.target.value) })}
                  min="6"
                  max="32"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sec-pwd-upper">Require Uppercase Letters</Label>
                <Switch
                  id="sec-pwd-upper"
                  checked={formData.passwordRequireUppercase || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, passwordRequireUppercase: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sec-pwd-lower">Require Lowercase Letters</Label>
                <Switch
                  id="sec-pwd-lower"
                  checked={formData.passwordRequireLowercase || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, passwordRequireLowercase: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sec-pwd-numbers">Require Numbers</Label>
                <Switch
                  id="sec-pwd-numbers"
                  checked={formData.passwordRequireNumbers || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, passwordRequireNumbers: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sec-pwd-special">Require Special Characters</Label>
                <Switch
                  id="sec-pwd-special"
                  checked={formData.passwordRequireSpecialChars || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, passwordRequireSpecialChars: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passwordExpiryDays">Password Expiry (days, 0 = never)</Label>
                <Input
                  id="passwordExpiryDays"
                  type="number"
                  value={formData.passwordExpiryDays || 0}
                  onChange={(e) => setFormData({ ...formData, passwordExpiryDays: parseInt(e.target.value) })}
                  min="0"
                  max="365"
                />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold mb-3">Additional Security</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sec-two-factor" className="text-base">Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">Enable 2FA for all users</p>
                </div>
                <Switch
                  id="sec-two-factor"
                  checked={formData.twoFactorEnabled || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, twoFactorEnabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sec-secure-sessions" className="text-base">Secure Sessions</Label>
                  <p className="text-sm text-muted-foreground">Use secure session tokens</p>
                </div>
                <Switch
                  id="sec-secure-sessions"
                  checked={formData.sessionSecure || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, sessionSecure: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sec-csrf" className="text-base">CSRF Protection</Label>
                  <p className="text-sm text-muted-foreground">Cross-site request forgery protection</p>
                </div>
                <Switch
                  id="sec-csrf"
                  checked={formData.csrfProtection || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, csrfProtection: checked })}
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Security Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

SecurityTab.propTypes = {
  security: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired
};

// Notifications Tab Component
function NotificationsTab({ notifications, onSave, saving }) {
  const [formData, setFormData] = useState(notifications || {});

  useEffect(() => {
    setFormData(notifications || {});
  }, [notifications]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Settings
        </CardTitle>
        <CardDescription>
          Configure system notifications and reports
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="notif-email">Email Notifications</Label>
              <Switch
                id="notif-email"
                checked={formData.emailNotificationsEnabled || false}
                onCheckedChange={(checked) => setFormData({ ...formData, emailNotificationsEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notif-push">Push Notifications</Label>
              <Switch
                id="notif-push"
                checked={formData.pushNotificationsEnabled || false}
                onCheckedChange={(checked) => setFormData({ ...formData, pushNotificationsEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notif-sms">SMS Notifications</Label>
              <Switch
                id="notif-sms"
                checked={formData.smsNotificationsEnabled || false}
                onCheckedChange={(checked) => setFormData({ ...formData, smsNotificationsEnabled: checked })}
              />
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold mb-3">Event Notifications</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-new-invoice">New Invoice Created</Label>
                <Switch
                  id="notif-new-invoice"
                  checked={formData.notifyOnNewInvoice || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, notifyOnNewInvoice: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="notif-payment">Payment Received</Label>
                <Switch
                  id="notif-payment"
                  checked={formData.notifyOnPaymentReceived || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, notifyOnPaymentReceived: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="notif-overdue">Invoice Overdue</Label>
                <Switch
                  id="notif-overdue"
                  checked={formData.notifyOnOverdueInvoice || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, notifyOnOverdueInvoice: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="notif-new-user">New User Registration</Label>
                <Switch
                  id="notif-new-user"
                  checked={formData.notifyOnNewUser || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, notifyOnNewUser: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="notif-user-login">User Login (Admin only)</Label>
                <Switch
                  id="notif-user-login"
                  checked={formData.notifyOnUserLogin || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, notifyOnUserLogin: checked })}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-semibold mb-3">Scheduled Reports</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-report-daily">Daily Report</Label>
                <Switch
                  id="notif-report-daily"
                  checked={formData.dailyReportEnabled || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, dailyReportEnabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="notif-report-weekly">Weekly Report</Label>
                <Switch
                  id="notif-report-weekly"
                  checked={formData.weeklyReportEnabled || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, weeklyReportEnabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="notif-report-monthly">Monthly Report</Label>
                <Switch
                  id="notif-report-monthly"
                  checked={formData.monthlyReportEnabled || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, monthlyReportEnabled: checked })}
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Notification Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

NotificationsTab.propTypes = {
  notifications: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired
};

// Integrations Tab Component
function IntegrationsTab({ integrations, onSave, saving }) {
  const [formData, setFormData] = useState(integrations || {});
  const [selectedIntegration, setSelectedIntegration] = useState('stripe');

  useEffect(() => {
    setFormData(integrations || {});
  }, [integrations]);

  const integrationsList = [
    { value: 'stripe', label: 'Stripe', icon: CreditCard },
    { value: 'paypal', label: 'PayPal', icon: DollarSign },
    { value: 'quickbooks', label: 'QuickBooks', icon: BarChart3 },
    { value: 'xero', label: 'Xero', icon: LineChart },
    { value: 'mailgun', label: 'Mailgun', icon: Mail },
    { value: 'sendgrid', label: 'SendGrid', icon: MailCheck }
  ];

  const currentIntegration = formData[selectedIntegration] || {};

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Third-Party Integrations
        </CardTitle>
        <CardDescription>
          Configure API keys and credentials for external services
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="integration-select">Select Integration</Label>
          <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
            <SelectTrigger id="integration-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {integrationsList.map(int => (
                <SelectItem key={int.value} value={int.value}>
                  <span className="inline-flex items-center gap-2">
                    {renderIcon(int.icon, { className: "w-4 h-4" })}
                    <span>{int.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="integration-enabled" className="text-base">Enable Integration</Label>
            <p className="text-sm text-muted-foreground">
              Activate {integrationsList.find(i => i.value === selectedIntegration)?.label}
            </p>
          </div>
          <Switch
            id="integration-enabled"
            checked={currentIntegration.enabled || false}
            onCheckedChange={(checked) => setFormData({
              ...formData,
              [selectedIntegration]: { ...currentIntegration, enabled: checked }
            })}
          />
        </div>

        {currentIntegration.enabled && (
          <div className="space-y-4 pt-2">
            {Object.keys(currentIntegration).filter(key => key !== 'enabled').map(key => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`integration-${selectedIntegration}-${key}`}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</Label>
                <Input
                  id={`integration-${selectedIntegration}-${key}`}
                  type="password"
                  value={currentIntegration[key] || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    [selectedIntegration]: {
                      ...currentIntegration,
                      [key]: e.target.value
                    }
                  })}
                  placeholder={`Enter ${key}`}
                />
              </div>
            ))}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save Integration Settings'}
        </Button>
      </CardContent>
    </Card>
  );
}

IntegrationsTab.propTypes = {
  integrations: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired
};

// Branding Tab Component
function BrandingTab({ branding, onSave, saving }) {
  const [formData, setFormData] = useState(branding || {});

  useEffect(() => {
    setFormData(branding || {});
  }, [branding]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Branding & Customization
        </CardTitle>
        <CardDescription>
          Customize the look and feel of your platform
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="primaryColor"
                  type="color"
                  value={formData.primaryColor || '#3b82f6'}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  className="w-20"
                />
                <Input
                  value={formData.primaryColor || '#3b82f6'}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  placeholder="#3b82f6"
                  aria-label="Primary color hex value"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondaryColor">Secondary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="secondaryColor"
                  type="color"
                  value={formData.secondaryColor || '#1e293b'}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  className="w-20"
                />
                <Input
                  value={formData.secondaryColor || '#1e293b'}
                  onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                  placeholder="#1e293b"
                  aria-label="Secondary color hex value"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accentColor">Accent Color</Label>
              <div className="flex gap-2">
                <Input
                  id="accentColor"
                  type="color"
                  value={formData.accentColor || '#10b981'}
                  onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                  className="w-20"
                />
                <Input
                  value={formData.accentColor || '#10b981'}
                  onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                  placeholder="#10b981"
                  aria-label="Accent color hex value"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                value={formData.logoUrl || ''}
                onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="faviconUrl">Favicon URL</Label>
              <Input
                id="faviconUrl"
                value={formData.faviconUrl || ''}
                onChange={(e) => setFormData({ ...formData, faviconUrl: e.target.value })}
                placeholder="https://example.com/favicon.ico"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="footerText">Footer Text</Label>
            <Input
              id="footerText"
              value={formData.footerText || ''}
              onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
              placeholder="© 2024 Paidly. All rights reserved."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="termsOfServiceUrl">Terms of Service URL</Label>
              <Input
                id="termsOfServiceUrl"
                value={formData.termsOfServiceUrl || ''}
                onChange={(e) => setFormData({ ...formData, termsOfServiceUrl: e.target.value })}
                placeholder="https://example.com/terms"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="privacyPolicyUrl">Privacy Policy URL</Label>
              <Input
                id="privacyPolicyUrl"
                value={formData.privacyPolicyUrl || ''}
                onChange={(e) => setFormData({ ...formData, privacyPolicyUrl: e.target.value })}
                placeholder="https://example.com/privacy"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customCss">Custom CSS</Label>
            <Textarea
              id="customCss"
              value={formData.customCss || ''}
              onChange={(e) => setFormData({ ...formData, customCss: e.target.value })}
              placeholder="/* Custom CSS */&#10;.my-class { color: red; }"
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Branding Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

BrandingTab.propTypes = {
  branding: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool.isRequired
};
