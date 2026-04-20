import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import PageHeader from '@/components/dashboard/PageHeader';
import { Brain, ExternalLink, TrendingUp, Users, Wrench } from 'lucide-react';
import TeamMembers from '@/components/settings/TeamMembers';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { getPermissions } from '@/lib/permissions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { supabase } from '@/lib/supabaseClient';

function readAdminSettingsForm() {
  const s = {
    system: {
      siteName: 'Paidly',
      supportEmail: 'support@paidly.co.za',
      maintenanceMode: false,
    },
    affiliateProgram: {
      defaultCommissionPercent: 15,
      autoApproveApplications: false,
    },
  };
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
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(readAdminSettingsForm);
  const [isSaving, setIsSaving] = useState(false);
  const [savingScope, setSavingScope] = useState('all');
  const [isReloading, setIsReloading] = useState(false);
  const [isEditingAffiliateCommission, setIsEditingAffiliateCommission] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);
  const [systemHealthLoading, setSystemHealthLoading] = useState(false);
  const [systemHealthError, setSystemHealthError] = useState(null);
  const [dangerAction, setDangerAction] = useState('');
  const environment = import.meta.env.PROD ? 'Production' : 'Development';
  const configuredApiBase = String(import.meta.env.VITE_SERVER_URL ?? '').trim();
  const apiStatus = configuredApiBase ? 'Configured' : 'Same-origin';
  const version = String(import.meta.env.VITE_APP_VERSION ?? '1.0.0');

  const { data: adminSettingsFromServer, isLoading: adminSettingsLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || json?.message || `Settings load failed (${res.status})`);
      }
      return json?.settings || null;
    },
    staleTime: 30000,
  });

  useEffect(() => {
    if (!adminSettingsFromServer || typeof adminSettingsFromServer !== 'object') return;
    const system = adminSettingsFromServer.system || {};
    const ap = adminSettingsFromServer.affiliateProgram || {};
    const rawCommission = Number(ap.defaultCommissionPercent);
    const commission =
      Number.isFinite(rawCommission) && rawCommission >= 0 ? Math.min(100, rawCommission) : 15;
    setSettings({
      platformName: String(system.siteName ?? 'Paidly'),
      supportEmail: String(system.supportEmail ?? system.adminEmail ?? 'support@paidly.co.za'),
      affiliateCommission: commission,
      autoApproveAffiliates: Boolean(ap.autoApproveApplications),
      maintenanceMode: Boolean(system.maintenanceMode),
    });
  }, [adminSettingsFromServer]);

  const { data: serverAuditLogs = [] } = useQuery({
    queryKey: ['settings-activity-log'],
    queryFn: async () => paidly.entities.AuditLog.list('-created_date', 5),
    refetchInterval: 45000,
    staleTime: 30000,
  });

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const loadSystemHealth = async () => {
      if (!cancelled) {
        setSystemHealthLoading(true);
        setSystemHealthError(null);
      }
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('Not authenticated');
        const res = await fetch('/api/admin/system-health', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || json?.message || `Health check failed (${res.status})`);
        }
        if (!cancelled) {
          setSystemHealth(json?.summary || null);
        }
      } catch (e) {
        if (!cancelled) {
          setSystemHealthError(e?.message || 'Failed to load system health');
        }
      } finally {
        if (!cancelled) setSystemHealthLoading(false);
      }
    };

    void loadSystemHealth();
    timer = window.setInterval(() => {
      void loadSystemHealth();
    }, 45000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  const healthRows = useMemo(() => {
    if (!systemHealth) {
      return [
        { id: 'api', label: 'API', status: 'warn', text: 'Checking…' },
        { id: 'email', label: 'Email', status: 'warn', text: 'Checking…' },
        { id: 'payments', label: 'Payments', status: 'warn', text: 'Checking…' },
      ];
    }
    return [
      {
        id: 'api',
        label: 'API',
        status: String(systemHealth.api?.status || 'warn'),
        text: String(systemHealth.api?.label || 'Unknown'),
      },
      {
        id: 'email',
        label: 'Email',
        status: String(systemHealth.email?.status || 'warn'),
        text: String(systemHealth.email?.label || 'Unknown'),
      },
      {
        id: 'payments',
        label: 'Payments',
        status: String(systemHealth.payments?.status || 'warn'),
        text: String(systemHealth.payments?.label || 'Unknown'),
      },
    ];
  }, [systemHealth]);

  const recentActivityItems = useMemo(() => {
    if (serverAuditLogs.length > 0) {
      return serverAuditLogs.map((entry, idx) => ({
        id: `${entry.id || 'log'}-${idx}`,
        label: entry.description || String(entry.action || 'settings_updated').replaceAll('_', ' '),
      }));
    }
    return [{ id: 'no-events', label: 'No authoritative activity events found yet.' }];
  }, [serverAuditLogs]);

  const reloadFromStorage = useCallback(async () => {
    setIsReloading(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      toast.success('Reloaded settings from server');
    } finally {
      setIsReloading(false);
    }
  }, [queryClient]);

  const handleSave = async (scope = 'all') => {
    setIsSaving(true);
    setSavingScope(scope);
    try {
      const name = settings.platformName.trim() || 'Paidly';
      const email = settings.supportEmail.trim() || 'support@paidly.co.za';
      let commission = Number(settings.affiliateCommission);
      if (!Number.isFinite(commission) || commission < 0) commission = 0;
      if (commission > 100) commission = 100;

      const payload = { settings: {} };
      if (scope === 'all' || scope === 'platform') {
        payload.settings.system = {
          siteName: name,
          supportEmail: email,
          maintenanceMode: settings.maintenanceMode,
        };
      }
      if (scope === 'all' || scope === 'growth') {
        payload.settings.affiliateProgram = {
          defaultCommissionPercent: commission,
          autoApproveApplications: settings.autoApproveAffiliates,
        };
      }

      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || json?.message || `Settings save failed (${res.status})`);
      }

      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });

      setSettings((prev) => ({
        ...prev,
        platformName: name,
        supportEmail: email,
        affiliateCommission: commission,
      }));

      toast.success('Saved successfully');
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Could not save settings');
    } finally {
      setIsSaving(false);
      setSavingScope('all');
    }
  };

  const handleDisablePlatform = () => {
    const reason = window.prompt('Type CONFIRM to disable platform and enter optional reason after a colon (e.g. CONFIRM: maintenance window).');
    if (!reason || !reason.toUpperCase().startsWith('CONFIRM')) return;
    const parsedReason = reason.includes(':') ? reason.split(':').slice(1).join(':').trim() : '';
    void runDangerWorkflow('maintenance', { enabled: true, reason: parsedReason }, 'disable-platform');
  };

  const handleResetSettings = () => {
    const reason = window.prompt('Type CONFIRM to execute backend system reset. Optional reason after colon (CONFIRM: reason).');
    if (!reason || !reason.toUpperCase().startsWith('CONFIRM')) return;
    const parsedReason = reason.includes(':') ? reason.split(':').slice(1).join(':').trim() : '';
    void runDangerWorkflow('reset', { reason: parsedReason }, 'reset-settings');
  };

  const handleRemoveAffiliates = () => {
    if (!window.confirm('Remove affiliates configuration? This resets affiliate defaults.')) return;
    void (async () => {
      setDangerAction('remove-affiliates');
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('Not authenticated');
        const res = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            settings: {
              affiliateProgram: {
                defaultCommissionPercent: 0,
                autoApproveApplications: false,
              },
            },
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || json?.message || `Settings save failed (${res.status})`);
        }
        await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
        toast.success('Saved successfully');
      } catch (e) {
        toast.error(e?.message || 'Could not remove affiliates');
      } finally {
        setDangerAction('');
      }
    })();
  };

  const runDangerWorkflow = async (action, payload, actionKey) => {
    setDangerAction(actionKey);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`/api/admin/system/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          confirmation: 'CONFIRM',
          ...payload,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || json?.message || `Workflow failed (${res.status})`);
      }

      if (action === 'maintenance') {
        const enabled = Boolean(payload?.enabled);
        setSettings((prev) => ({ ...prev, maintenanceMode: enabled }));
      } else if (action === 'reset') {
        const defaults = {
          platformName: 'Paidly',
          supportEmail: 'support@paidly.co.za',
          affiliateCommission: 15,
          autoApproveAffiliates: false,
          maintenanceMode: false,
        };
        setSettings(defaults);
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });

      toast.success('Saved successfully');
    } catch (e) {
      toast.error(e?.message || 'Danger zone workflow failed');
    } finally {
      setDangerAction('');
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Command your Paidly platform with high-impact controls first"
        onRefresh={reloadFromStorage}
        isRefreshing={isReloading}
      />

      <div className="grid max-w-6xl gap-8 lg:grid-cols-10">
        <div className="space-y-8 lg:col-span-7">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Wrench className="h-5 w-5 text-orange-600" />
                  <span>Platform Control</span>
                </CardTitle>
                <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-orange-700">
                  Top Priority
                </span>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSave('platform')}
                  disabled={isSaving}
                >
                  {isSaving && savingScope === 'platform' ? 'Saving…' : 'Save Section'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Core switches that define how Paidly appears and operates.
              </p>
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
              <div className="flex items-center justify-between gap-4 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                <div>
                  <p className="text-sm font-medium">Maintenance Mode</p>
                  <p className="text-xs text-muted-foreground">
                    When enabled, Paidly can be treated as unavailable for normal usage flows.
                  </p>
                </div>
                <Switch
                  checked={settings.maintenanceMode}
                  onCheckedChange={(v) => setSettings({ ...settings, maintenanceMode: v })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="h-5 w-5 text-violet-600" />
                <span>Growth &amp; Monetization</span>
              </CardTitle>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSave('growth')}
                  disabled={isSaving}
                >
                  {isSaving && savingScope === 'growth' ? 'Saving…' : 'Save Section'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Levers that influence partner activation and recurring acquisition.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-sm font-semibold">Affiliate Program</p>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Commission</p>
                    <p className="text-base font-semibold">{settings.affiliateCommission}%</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingAffiliateCommission((prev) => !prev)}
                  >
                    {isEditingAffiliateCommission ? 'Done' : 'Edit'}
                  </Button>
                </div>
                {isEditingAffiliateCommission ? (
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="settings-affiliate-commission">Default Commission %</Label>
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
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Auto-Approve</p>
                    <p className="text-base font-semibold">
                      {settings.autoApproveAffiliates ? 'ON' : 'OFF'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSettings((prev) => ({
                          ...prev,
                          autoApproveAffiliates: !prev.autoApproveAffiliates,
                        }))
                      }
                    >
                      Toggle
                    </Button>
                    <Switch
                      checked={settings.autoApproveAffiliates}
                      onCheckedChange={(v) => setSettings({ ...settings, autoApproveAffiliates: v })}
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Affects all new affiliates.</p>
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-4 z-10 rounded-lg border bg-background/95 p-3 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => handleSave('all')}
                disabled={isSaving}
                className="w-fit bg-primary hover:bg-primary/90"
              >
                {isSaving && savingScope === 'all' ? 'Saving…' : 'Save Settings'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Persists to the backend via <code className="rounded bg-muted px-1">/api/admin/settings</code> with
                role checks and audit logging.
              </p>
            </div>
          </div>

          {perms.canManageTeam ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Users className="h-5 w-5 text-blue-600" />
                  <span>Team &amp; Permissions</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Control who can operate Paidly and what level of authority they hold.
                </p>
                <div className="space-y-1 pt-1 text-xs text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Invite Team Members:</span> onboard internal
                    operators into your command layer.
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Roles:</span> assign responsibilities by function and
                    ownership level.
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Permissions:</span> enforce operational boundaries
                    for critical actions.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <TeamMembers />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-8 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Brain className="h-5 w-5 text-sky-600" />
                <span>System Health</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="space-y-2">
                  {healthRows.map((row) => {
                    const dotTone =
                      row.status === 'ok'
                        ? 'bg-emerald-500'
                        : row.status === 'error'
                          ? 'bg-red-500'
                          : 'bg-amber-500';
                    return (
                      <p key={row.id} className="flex items-center gap-2 text-sm font-medium">
                        <span className={`h-2 w-2 rounded-full ${dotTone}`} aria-hidden="true" /> {row.label}:{' '}
                        {row.text}
                      </p>
                    );
                  })}
                </div>
                {systemHealthLoading ? (
                  <p className="text-xs text-muted-foreground">Refreshing health checks…</p>
                ) : null}
                {systemHealthError ? (
                  <p className="text-xs text-red-600">Health check error: {systemHealthError}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Environment</p>
                  <p className="mt-1 text-sm font-semibold">{environment}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">API Status</p>
                  <p className="mt-1 text-sm font-semibold">{apiStatus}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Version</p>
                  <p className="mt-1 text-sm font-semibold">{version}</p>
                </div>
              </div>

              {configuredApiBase ? (
                <p className="text-xs text-muted-foreground">
                  API base: <code className="rounded bg-muted px-1">{configuredApiBase}</code>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  API base: <code className="rounded bg-muted px-1">same-origin /api</code>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Activity Log</CardTitle>
              <p className="text-sm text-muted-foreground">Recent Activity</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {recentActivityItems.map((item) => (
                  <li key={item.id} className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    - {item.label}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <a
                href="https://paidly.co.za"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/40"
              >
                <span>Visit Live Site</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href="/admin-v2/audit-log"
                className="inline-flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted/40"
              >
                <span>Open Admin Logs</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </CardContent>
          </Card>

        </div>
      </div>

      <div className="mt-8 max-w-6xl">
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-lg text-red-700">⚠️ Danger Zone</CardTitle>
            <p className="text-sm text-muted-foreground">
              High-impact operations. Use only when operationally necessary.
            </p>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDisablePlatform}
              disabled={dangerAction !== ''}
            >
              {dangerAction === 'disable-platform' ? 'Processing…' : 'Disable platform'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleResetSettings}
              disabled={dangerAction !== ''}
            >
              {dangerAction === 'reset-settings' ? 'Processing…' : 'Reset settings'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleRemoveAffiliates}
              disabled={dangerAction !== ''}
            >
              {dangerAction === 'remove-affiliates' ? 'Processing…' : 'Remove affiliates'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
