import React, { useState } from 'react';
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

export default function SettingsPage() {
  const { user: currentUser } = useCurrentUser();
  const perms = getPermissions(currentUser?.role);
  const [settings, setSettings] = useState({
    platformName: 'Paidly',
    supportEmail: 'support@paidly.co.za',
    affiliateCommission: 15,
    autoApproveAffiliates: false,
    maintenanceMode: false,
  });

  const handleSave = () => {
    toast.success('Settings saved');
    logAction({
      actor: currentUser,
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      category: 'settings',
      description: `Updated platform settings (platform name: "${settings.platformName}", support email: "${settings.supportEmail}", affiliate commission: ${settings.affiliateCommission}%)`,
      after: {
        platformName: settings.platformName,
        supportEmail: settings.supportEmail,
        affiliateCommission: settings.affiliateCommission,
        autoApproveAffiliates: settings.autoApproveAffiliates,
        maintenanceMode: settings.maintenanceMode,
      },
    });
  };

  return (
    <div>
      <PageHeader title="Settings" description="Configure your Paidly admin dashboard" />

      <div className="grid gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Platform Name</Label>
              <Input value={settings.platformName} onChange={e => setSettings({...settings, platformName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Support Email</Label>
              <Input value={settings.supportEmail} onChange={e => setSettings({...settings, supportEmail: e.target.value})} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Affiliate Program</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Commission Rate (%)</Label>
              <Input type="number" value={settings.affiliateCommission} onChange={e => setSettings({...settings, affiliateCommission: Number(e.target.value)})} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-approve affiliates</p>
                <p className="text-xs text-muted-foreground">Automatically approve new affiliate applications</p>
              </div>
              <Switch checked={settings.autoApproveAffiliates} onCheckedChange={v => setSettings({...settings, autoApproveAffiliates: v})} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Maintenance Mode</p>
                <p className="text-xs text-muted-foreground">Temporarily disable public access</p>
              </div>
              <Switch checked={settings.maintenanceMode} onCheckedChange={v => setSettings({...settings, maintenanceMode: v})} />
            </div>
            <div className="pt-2">
              <a href="https://paidly.co.za" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                Visit paidly.co.za <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 w-fit">Save Settings</Button>

        {/* Team Members — only visible to admin & management */}
        {perms.canManageTeam ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Team Members</CardTitle>
              <p className="text-sm text-muted-foreground">Invite internal Paidly staff with role-based access to this dashboard.</p>
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
