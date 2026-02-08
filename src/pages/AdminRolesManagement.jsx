import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Shield,
  Users,
  Lock,
  ChevronRight,
  BarChart2,
  Check,
  X,
  Download,
  LifeBuoy
} from 'lucide-react';
import AdminRolesManager from '@/services/AdminRolesManager';

export default function AdminRolesManagement() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState('super_admin');
  const roleHierarchy = AdminRolesManager.getRoleHierarchy();

  const selectedRoleData = AdminRolesManager.getRole(selectedRole);
  const roleSummary = AdminRolesManager.getRoleSummary(selectedRole);

  const getRiskBadgeColor = (level) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'LOW':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const handleExportRoles = () => {
    const rolesData = AdminRolesManager.exportRoles();
    const blob = new Blob([rolesData], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-roles-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-slate-900">
                  Admin Roles Management
                </h1>
                <p className="text-slate-600">
                  Define and manage role-based access control with granular permissions
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleExportRoles}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Export Roles
              </Button>
              <Button 
                onClick={() => navigate('/admin/security-compliance')}
                className="gap-2 bg-amber-600 hover:bg-amber-700"
              >
                <Shield className="w-4 h-4" />
                Security & Compliance
              </Button>
              <Button 
                onClick={() => navigate('/admin/support-tools')}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
              >
                <LifeBuoy className="w-4 h-4" />
                Support & Admin Tools
              </Button>
              <Button
                onClick={() => navigate('/admin/admin-control')}
                variant="outline"
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Admin Control
              </Button>
            </div>
          </div>
        </div>

        {/* Role Hierarchy Overview */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5" />
              Role Hierarchy & Overview
            </CardTitle>
            <CardDescription>
              7 roles organized by tier, permissions, and access levels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {roleHierarchy.map((role) => (
                <div
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition ${
                    selectedRole === role.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl">{role.icon}</span>
                    <div>
                      <h4 className="font-semibold text-slate-900">
                        {role.name}
                        <span className="text-xs text-slate-500 ml-2">
                          (Tier {role.tier})
                        </span>
                      </h4>
                      <p className="text-sm text-slate-600">{role.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getRiskBadgeColor(role.riskLevel)}>
                      {role.riskLevel}
                    </Badge>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detailed Role View */}
        {selectedRoleData && roleSummary && (
          <Tabs defaultValue="permissions" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-8">
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="data-access">Data Access</TabsTrigger>
              <TabsTrigger value="restrictions">Restrictions</TabsTrigger>
            </TabsList>

            {/* Permissions Tab */}
            <TabsContent value="permissions">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>
                      {selectedRoleData.name} - Permissions
                    </span>
                    <Badge variant="secondary">
                      {roleSummary.permissionCount} permissions
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    System and administrative permissions granted to this role
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(selectedRoleData.systemPermissions).map(
                      ([permission, granted]) => (
                        <div
                          key={permission}
                          className={`flex items-center gap-3 p-3 rounded border ${
                            granted
                              ? 'bg-green-50 border-green-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          {granted ? (
                            <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                          ) : (
                            <X className="w-5 h-5 text-slate-400 flex-shrink-0" />
                          )}
                          <span className={`text-sm ${granted ? 'text-green-900' : 'text-slate-600'}`}>
                            {permission
                              .split('_')
                              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                              .join(' ')}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Features Tab */}
            <TabsContent value="features">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>
                      {selectedRoleData.name} - Feature Access
                    </span>
                    <Badge variant="secondary">
                      {roleSummary.featureCount} features
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Business features and capabilities available to this role
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(selectedRoleData.features).map(
                      ([feature, enabled]) => (
                        <div
                          key={feature}
                          className={`flex items-center gap-3 p-3 rounded border ${
                            enabled
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          {enabled ? (
                            <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                          ) : (
                            <X className="w-5 h-5 text-slate-400 flex-shrink-0" />
                          )}
                          <span className={`text-sm ${enabled ? 'text-blue-900' : 'text-slate-600'}`}>
                            {feature
                              .split('_')
                              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                              .join(' ')}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Data Access Tab */}
            <TabsContent value="data-access">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {selectedRoleData.name} - Data Access Levels
                  </CardTitle>
                  <CardDescription>
                    Access level to different types of business data
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(selectedRoleData.dataAccess).map(
                      ([dataType, accessLevel]) => (
                        <div
                          key={dataType}
                          className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-900">
                            {dataType
                              .split('_')
                              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                              .join(' ')}
                          </span>
                          <Badge
                            className={
                              accessLevel === 'full'
                                ? 'bg-green-100 text-green-800'
                                : accessLevel === 'read-only'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-red-100 text-red-800'
                            }
                          >
                            {accessLevel === 'full'
                              ? '✓ Full Access'
                              : accessLevel === 'read-only'
                              ? '👁️ Read-Only'
                              : '🔒 Restricted'}
                          </Badge>
                        </div>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Restrictions Tab */}
            <TabsContent value="restrictions">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {selectedRoleData.name} - Restrictions
                  </CardTitle>
                  <CardDescription>
                    Actions and access this role cannot perform
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedRoleData.restrictions.length === 0 ? (
                    <div className="text-center py-8">
                      <Check className="w-12 h-12 text-green-500 mx-auto mb-2" />
                      <p className="text-slate-600">No restrictions</p>
                      <p className="text-sm text-slate-500">
                        This role has full access
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedRoleData.restrictions.map((restriction, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg"
                        >
                          <Lock className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <span className="text-slate-900">{restriction}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Comparison Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5" />
              Quick Role Comparison
            </CardTitle>
            <CardDescription>
              Permissions summary across all roles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold">Role</th>
                    <th className="text-center py-2 px-2 font-semibold">Permissions</th>
                    <th className="text-center py-2 px-2 font-semibold">Features</th>
                    <th className="text-center py-2 px-2 font-semibold">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {roleHierarchy.map((role) => {
                    const summary = AdminRolesManager.getRoleSummary(role.id);
                    return (
                      <tr
                        key={role.id}
                        className="border-b border-slate-200 hover:bg-slate-50"
                      >
                        <td className="py-3 px-2">
                          <span className="mr-2">{role.icon}</span>
                          {role.name}
                        </td>
                        <td className="text-center py-3 px-2">
                          <Badge variant="outline">
                            {summary.permissionCount}
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-2">
                          <Badge variant="outline">
                            {summary.featureCount}
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-2">
                          <Badge className={getRiskBadgeColor(role.riskLevel)}>
                            {role.riskLevel}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Information Panel */}
        <Card className="mt-8 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-900">ℹ️ Role Assignment Guide</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-blue-800 space-y-3">
            <div>
              <strong>Super Administrator (👑)</strong> - Platform owners. Full access to everything including user management and system settings.
            </div>
            <div>
              <strong>Administrator (⚙️)</strong> - Daily admins. Most features except system configuration and user role management.
            </div>
            <div>
              <strong>Support Administrator (🤝)</strong> - Support teams. Can impersonate users and assist clients with limited data access.
            </div>
            <div>
              <strong>Read-Only Viewer (👁️)</strong> - Stakeholders. Can view data but cannot make any modifications.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
