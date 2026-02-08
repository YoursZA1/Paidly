import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/components/auth/AuthContext";
import SystemSettingsService from "@/services/SystemSettingsService";
import { 
  Mail, FileText, DollarSign, Zap, Shield, 
  Bell, Link2, Palette, Save, RotateCcw, Download, Upload,
  AlertTriangle, CheckCircle, Globe, Server, Wrench
} from "lucide-react";
import { motion } from "framer-motion";

export default function PlatformSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("system");
  const { toast } = useToast();
  const { currentUser } = useAuth();

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
      const updated = SystemSettingsService.updateSection(section, data, currentUser?.id);
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
        const imported = SystemSettingsService.importSettings(e.target.result, currentUser?.id);
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="container mx-auto max-w-7xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Wrench className="h-8 w-8 text-primary" />
              Platform Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure system-wide settings and platform behavior
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => document.getElementById('import-file').click()}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <input
              id="import-file"
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>

        {settings?.system?.maintenanceMode && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span className="font-semibold text-amber-900">Maintenance Mode Active</span>
          </div>
        )}
      </motion.div>

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 lg:grid-cols-9 gap-2">
          <TabsTrigger value="system" className="flex items-center gap-1">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">System</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Documents</span>
          </TabsTrigger>
          <TabsTrigger value="defaults" className="flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Defaults</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-1">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Features</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-1">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">Integrations</span>
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-1">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Branding</span>
          </TabsTrigger>
        </TabsList>

        {/* System Settings Tab */}
        <TabsContent value="system">
          <SystemSettingsTab 
            settings={settings?.system} 
            onSave={(data) => handleSaveSection('system', data)}
            saving={saving}
          />
        </TabsContent>

        {/* Email Templates Tab */}
        <TabsContent value="email">
          <EmailTemplatesTab 
            templates={settings?.emailTemplates}
            onSave={(data) => handleSaveSection('emailTemplates', data)}
            saving={saving}
          />
        </TabsContent>

        {/* Document Numbering Tab */}
        <TabsContent value="documents">
          <DocumentNumberingTab 
            numbering={settings?.documentNumbering}
            onSave={(data) => handleSaveSection('documentNumbering', data)}
            saving={saving}
          />
        </TabsContent>

        {/* Defaults Tab */}
        <TabsContent value="defaults">
          <DefaultSettingsTab 
            defaults={settings?.defaults}
            onSave={(data) => handleSaveSection('defaults', data)}
            saving={saving}
          />
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features">
          <FeaturesTab 
            features={settings?.features}
            onSave={(data) => handleSaveSection('features', data)}
            saving={saving}
          />
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <SecurityTab 
            security={settings?.security}
            onSave={(data) => handleSaveSection('security', data)}
            saving={saving}
          />
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <NotificationsTab 
            notifications={settings?.notifications}
            onSave={(data) => handleSaveSection('notifications', data)}
            saving={saving}
          />
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          <IntegrationsTab 
            integrations={settings?.integrations}
            onSave={(data) => handleSaveSection('integrations', data)}
            saving={saving}
          />
        </TabsContent>

        {/* Branding Tab */}
        <TabsContent value="branding">
          <BrandingTab 
            branding={settings?.branding}
            onSave={(data) => handleSaveSection('branding', data)}
            saving={saving}
          />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

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
                placeholder="Invoice Breek"
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
                <Label className="text-base">Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Disable access to the platform for non-admin users
                </p>
              </div>
              <Switch
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
                <Label className="text-base">Allow User Registration</Label>
                <p className="text-sm text-muted-foreground">
                  Allow new users to sign up
                </p>
              </div>
              <Switch
                checked={formData.allowUserRegistration || false}
                onCheckedChange={(checked) => setFormData({ ...formData, allowUserRegistration: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Require Email Verification</Label>
                <p className="text-sm text-muted-foreground">
                  Users must verify their email before accessing the platform
                </p>
              </div>
              <Switch
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
          <Label>Select Template</Label>
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger>
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
          <Label>Document Type</Label>
          <Select value={selectedDoc} onValueChange={setSelectedDoc}>
            <SelectTrigger>
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
              <SelectTrigger>
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
              <SelectTrigger>
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
            <Label className="text-base">Include Client Initials</Label>
            <p className="text-sm text-muted-foreground">
              Add client initials to document number
            </p>
          </div>
          <Switch
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
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                  <Label className="text-base">Enable Tax</Label>
                  <p className="text-sm text-muted-foreground">
                    Apply tax to invoices by default
                  </p>
                </div>
                <Switch
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
                <Label className="text-base">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
              </div>
              <div className="flex items-center gap-2">
                {enabled && <Badge variant="secondary" className="text-xs">Beta</Badge>}
                <Switch
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
                <Label className="text-base">{key.replace(/([A-Z])/g, ' $1').trim()}</Label>
              </div>
              <Switch
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
                <Label>Require Uppercase Letters</Label>
                <Switch
                  checked={formData.passwordRequireUppercase || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, passwordRequireUppercase: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Require Lowercase Letters</Label>
                <Switch
                  checked={formData.passwordRequireLowercase || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, passwordRequireLowercase: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Require Numbers</Label>
                <Switch
                  checked={formData.passwordRequireNumbers || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, passwordRequireNumbers: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Require Special Characters</Label>
                <Switch
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
                  <Label className="text-base">Two-Factor Authentication</Label>
                  <p className="text-sm text-muted-foreground">Enable 2FA for all users</p>
                </div>
                <Switch
                  checked={formData.twoFactorEnabled || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, twoFactorEnabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Secure Sessions</Label>
                  <p className="text-sm text-muted-foreground">Use secure session tokens</p>
                </div>
                <Switch
                  checked={formData.sessionSecure || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, sessionSecure: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">CSRF Protection</Label>
                  <p className="text-sm text-muted-foreground">Cross-site request forgery protection</p>
                </div>
                <Switch
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
              <Label>Email Notifications</Label>
              <Switch
                checked={formData.emailNotificationsEnabled || false}
                onCheckedChange={(checked) => setFormData({ ...formData, emailNotificationsEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Push Notifications</Label>
              <Switch
                checked={formData.pushNotificationsEnabled || false}
                onCheckedChange={(checked) => setFormData({ ...formData, pushNotificationsEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>SMS Notifications</Label>
              <Switch
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
                <Label>New Invoice Created</Label>
                <Switch
                  checked={formData.notifyOnNewInvoice || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, notifyOnNewInvoice: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Payment Received</Label>
                <Switch
                  checked={formData.notifyOnPaymentReceived || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, notifyOnPaymentReceived: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Invoice Overdue</Label>
                <Switch
                  checked={formData.notifyOnOverdueInvoice || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, notifyOnOverdueInvoice: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>New User Registration</Label>
                <Switch
                  checked={formData.notifyOnNewUser || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, notifyOnNewUser: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>User Login (Admin only)</Label>
                <Switch
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
                <Label>Daily Report</Label>
                <Switch
                  checked={formData.dailyReportEnabled || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, dailyReportEnabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Weekly Report</Label>
                <Switch
                  checked={formData.weeklyReportEnabled || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, weeklyReportEnabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Monthly Report</Label>
                <Switch
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
    { value: 'stripe', label: 'Stripe', icon: '💳' },
    { value: 'paypal', label: 'PayPal', icon: '💰' },
    { value: 'quickbooks', label: 'QuickBooks', icon: '📊' },
    { value: 'xero', label: 'Xero', icon: '📈' },
    { value: 'mailgun', label: 'Mailgun', icon: '✉️' },
    { value: 'sendgrid', label: 'SendGrid', icon: '📧' }
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
          <Label>Select Integration</Label>
          <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {integrationsList.map(int => (
                <SelectItem key={int.value} value={int.value}>
                  {int.icon} {int.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Enable Integration</Label>
            <p className="text-sm text-muted-foreground">
              Activate {integrationsList.find(i => i.value === selectedIntegration)?.label}
            </p>
          </div>
          <Switch
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
                <Label htmlFor={key}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</Label>
                <Input
                  id={key}
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
              placeholder="© 2024 Invoice Breek. All rights reserved."
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
