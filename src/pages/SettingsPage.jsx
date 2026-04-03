import React, { useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import PageHeader from '@/components/dashboard/PageHeader';
import { ExternalLink } from 'lucide-react';
import TeamMembers from '@/components/settings/TeamMembers';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { getPermissions } from '@/lib/permissions';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { SystemSettingsService } from '@/services/SystemSettingsService';

function readAdminSettingsForm() {
  const s = SystemSettingsService.getSettings();
  const ap = s.affiliateProgram || {};
  const rawCommission = Number(ap.defaultCommissionPercent);
  const commission =
    Number.isFinite(rawCommission) && rawCommission >= 0 ? Math.min(100, rawCommission) : 15;
  return {
    platformName: String(s.system?.siteName ?? 'Paidly'),
    supportEmail: String(
      s.system?.supportEmail ?? s.system?.adminEmail ?? 'support@paidly.co.za'
    ),
    affiliateCommission: commission,
    autoApproveAffiliates: Boolean(ap.autoApproveApplications),
    maintenanceMode: Boolean(s.system?.maintenanceMode),
  };
}

export default function SettingsPage() {
  const { user: currentUser } = useCurrentUser();
  const perms = getPermissions(currentUser?.role);
  const [settings, setSettings] = useState(readAdminSettingsForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  const reloadFromStorage = useCallback(() => {
    setIsReloading(true);
    try {
      setSettings(readAdminSettingsForm());
      toast.success('Reloaded settings from storage');
    } finally {
      setIsReloading(false);
    }
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    try {
      const name = settings.platformName.trim() || 'Paidly';
      const email = settings.supportEmail.trim() || 'support@paidly.co.za';
      let commission = Number(settings.affiliateCommission);
      if (!Number.isFinite(commission) || commission < 0) commission = 0;
      if (commission > 100) commission = 100;

      SystemSettingsService.updateSection(
        'system',
        {
          siteName: name,
          supportEmail: email,
          maintenanceMode: settings.maintenanceMode,
        },
        currentUser?.id ?? null
      );
      SystemSettingsService.updateSection(
        'affiliateProgram',
        {
          defaultCommissionPercent: commission,
          autoApproveApplications: settings.autoApproveAffiliates,
        },
        currentUser?.id ?? null
      );

      setSettings((prev) => ({
        ...prev,
        platformName: name,
        supportEmail: email,
        affiliateCommission: commission,
      }));

      toast.success('Settings saved');
      logAction({
        actor: currentUser,
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        category: 'settings',
        description: `Updated platform settings (platform name: "${name}", support email: "${email}", default affiliate commission: ${commission}%)`,
        after: {
          platformName: name,
          supportEmail: email,
          affiliateCommission: commission,
          autoApproveAffiliates: settings.autoApproveAffiliates,
          maintenanceMode: settings.maintenanceMode,
        },
      });
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Could not save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure your Paidly admin dashboard"
        onRefresh={reloadFromStorage}
        isRefreshing={isReloading}
      />

      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-platform-name">Platform Name</Label>
              <Input
                id="settings-platform-name"
                value={settings.platformName}
                onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-support-email">Support Email</Label>
              <Input
                id="settings-support-email"
                type="email"
                autoComplete="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Affiliate Program</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-affiliate-commission">Default commission rate (%)</Label>
              <Input
                id="settings-affiliate-commission"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={settings.affiliateCommission}
                onChange={(e) =>
                  setSettings({ ...settings, affiliateCommission: Number(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Used as the admin default when reviewing applications; per-affiliate rates still apply in the
                Affiliates area.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Auto-approve affiliates</p>
                <p className="text-xs text-muted-foreground">
                  Stored for future automation; approvals still run through the admin queue today.
                </p>
              </div>
              <Switch
                checked={settings.autoApproveAffiliates}
                onCheckedChange={(v) => setSettings({ ...settings, autoApproveAffiliates: v })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Maintenance Mode</p>
                <p className="text-xs text-muted-foreground">
                  When on, components that read{' '}
                  <code className="rounded bg-muted px-0.5 text-[0.7rem]">SystemSettingsService</code> can treat the
                  app as in maintenance.
                </p>
              </div>
              <Switch
                checked={settings.maintenanceMode}
                onCheckedChange={(v) => setSettings({ ...settings, maintenanceMode: v })}
              />
            </div>
            <div className="pt-2">
              <a
                href="https://paidly.co.za"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Visit paidly.co.za <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-fit bg-primary hover:bg-primary/90"
          >
            {isSaving ? 'Saving…' : 'Save settings'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Persists to this browser via <code className="rounded bg-muted px-1">SystemSettingsService</code>{' '}
            (localStorage). Server-wide config stays in deployment environment variables.
          </p>
        </div>

        {perms.canManageTeam ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Team Members</CardTitle>
              <p className="text-sm text-muted-foreground">
                Invite internal Paidly staff with role-based access to this dashboard.
              </p>
            </CardHeader>
            <CardContent>
              <TeamMembers />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
