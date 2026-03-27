import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import TaxService from '@/services/TaxService';
import PropTypes from 'prop-types';

export default function TaxConfiguration({ user, onSave }) {
  const [region, setRegion] = useState(user?.tax_region || 'US');
  const [defaultTaxRate, setDefaultTaxRate] = useState(user?.default_tax_rate || 0);
  const [customTaxProfiles, setCustomTaxProfiles] = useState(user?.tax_profiles || []);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newProfile, setNewProfile] = useState({ name: '', rate: 0, type: 'standard', description: '' });

  const presets = TaxService.getTaxPresetsForRegion(region);

  const handleAddProfile = () => {
    if (!newProfile.name || newProfile.rate < 0 || newProfile.rate > 100) {
      alert('Please enter a valid tax profile');
      return;
    }

    const profile = TaxService.createTaxProfile(
      newProfile.name,
      newProfile.rate,
      newProfile.type,
      newProfile.description
    );

    setCustomTaxProfiles([...customTaxProfiles, profile]);
    setNewProfile({ name: '', rate: 0, type: 'standard', description: '' });
    setShowAddDialog(false);
  };

  const handleDeleteProfile = (profileId) => {
    if (window.confirm('Delete this tax profile?')) {
      setCustomTaxProfiles(customTaxProfiles.filter(p => p.id !== profileId));
    }
  };

  const handleSaveConfiguration = () => {
    onSave({
      tax_region: region,
      default_tax_rate: parseFloat(defaultTaxRate) || 0,
      tax_profiles: customTaxProfiles
    });
  };

  return (
    <div className="space-y-6">
      {/* Region Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Tax Region</CardTitle>
          <CardDescription>Select your primary tax region to get relevant tax presets</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tax-config-region" className="text-sm font-semibold">Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger id="tax-config-region" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="EU">European Union</SelectItem>
                <SelectItem value="UK">United Kingdom</SelectItem>
                <SelectItem value="CA">Canada</SelectItem>
                <SelectItem value="AU">Australia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Default Tax Rate */}
      <Card>
        <CardHeader>
          <CardTitle>Default Tax Rate</CardTitle>
          <CardDescription>Applied to new invoices by default</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tax-config-default-rate" className="text-sm font-semibold">Default Rate (%)</Label>
            <Input
              id="tax-config-default-rate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={defaultTaxRate}
              onChange={(e) => setDefaultTaxRate(e.target.value)}
              placeholder="0"
              className="h-10"
            />
            <p className="text-xs text-slate-500">This rate will be pre-filled on new invoices</p>
          </div>
        </CardContent>
      </Card>

      {/* Region Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Tax Presets for {region}</CardTitle>
          <CardDescription>Standard tax rates for your region</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {presets.map((preset, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">{preset.name}</p>
                  <p className="text-xs text-slate-500">{preset.type}</p>
                </div>
                <span className="font-semibold text-slate-900">{preset.rate}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Custom Tax Profiles */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Custom Tax Profiles</CardTitle>
              <CardDescription>Create custom tax rates for specific needs</CardDescription>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Profile
                </Button>
              </DialogTrigger>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>Create Tax Profile</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="tax-profile-new-name">Profile Name</Label>
                    <Input
                      id="tax-profile-new-name"
                      value={newProfile.name}
                      onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                      placeholder="e.g., Exempted Services"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax-profile-new-rate">Tax Rate (%)</Label>
                    <Input
                      id="tax-profile-new-rate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={newProfile.rate}
                      onChange={(e) => setNewProfile({ ...newProfile, rate: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax-profile-new-type">Type</Label>
                    <Select value={newProfile.type} onValueChange={(value) => setNewProfile({ ...newProfile, type: value })}>
                      <SelectTrigger id="tax-profile-new-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="reduced">Reduced</SelectItem>
                        <SelectItem value="super_reduced">Super Reduced</SelectItem>
                        <SelectItem value="zero">Zero</SelectItem>
                        <SelectItem value="exempted">Exempted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax-profile-new-description">Description (Optional)</Label>
                    <Input
                      id="tax-profile-new-description"
                      value={newProfile.description}
                      onChange={(e) => setNewProfile({ ...newProfile, description: e.target.value })}
                      placeholder="e.g., For digital services"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                    <Button onClick={handleAddProfile}>Create Profile</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {customTaxProfiles.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No custom profiles yet. Create one to get started.</p>
          ) : (
            <div className="space-y-2">
              {customTaxProfiles.map((profile) => (
                <div key={profile.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">{profile.name}</p>
                    {profile.description && <p className="text-xs text-slate-500">{profile.description}</p>}
                    <p className="text-xs text-slate-400">{profile.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{profile.rate}%</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteProfile(profile.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSaveConfiguration} className="px-6">
          Save Tax Configuration
        </Button>
      </div>
    </div>
  );
}

TaxConfiguration.propTypes = {
  user: PropTypes.shape({
    tax_region: PropTypes.string,
    default_tax_rate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    tax_profiles: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        rate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        type: PropTypes.string,
        description: PropTypes.string,
      })
    ),
  }),
  onSave: PropTypes.func.isRequired,
};
