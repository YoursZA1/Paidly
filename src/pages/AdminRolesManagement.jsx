import React, { useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
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
  LifeBuoy,
  Plus
} from 'lucide-react';
import AdminRolesManager from '@/services/AdminRolesManager';
import { renderIcon } from '@/utils/renderIcon';


import PropTypes from 'prop-types';

function AdminRolesManagement({ embedded = false }) {
  AdminRolesManagement.propTypes = {
    embedded: PropTypes.bool
  };

  
  AdminRolesManagement.propTypes = {
    embedded: PropTypes.bool
  };

  const { userRole } = useAuth();
  const canEdit = (userRole === 'super_admin' || userRole === 'admin') && !embedded;
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState('super_admin');
  const [editMode, setEditMode] = useState(false);
  const [editRoleData, setEditRoleData] = useState(null);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRole, setNewRole] = useState({ id: '', name: '', description: '', tier: 8, riskLevel: 'LOW', icon: Users, systemPermissions: {}, features: {}, dataAccess: {}, restrictions: [] });
  const roleHierarchy = AdminRolesManager.getRoleHierarchy();

  const selectedRoleData = AdminRolesManager.getRole(selectedRole);
  const roleSummary = AdminRolesManager.getRoleSummary(selectedRole);

  // Start editing selected role
  const handleEditRole = () => {
    setEditMode(true);
    setEditRoleData(JSON.parse(JSON.stringify(selectedRoleData)));
  };

  // Save edited role (for demo, just disables edit mode)
  const handleSaveRole = () => {
    // TODO: Integrate with AdminRolesManager to persist changes
    setEditMode(false);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditMode(false);
    setEditRoleData(null);
  };

  // Add new custom role (for demo, just disables add form)
  const handleAddRole = () => {
    // TODO: Integrate with AdminRolesManager to persist new role
    setShowAddRole(false);
    setNewRole({ id: '', name: '', description: '', tier: 8, riskLevel: 'LOW', icon: Users, systemPermissions: {}, features: {}, dataAccess: {}, restrictions: [] });
  };

  // Delete custom role (for demo, just disables edit mode)
  const handleDeleteRole = () => {
    // TODO: Integrate with AdminRolesManager to delete role
    setEditMode(false);
    setEditRoleData(null);
  };

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
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-[#ff7c00] rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-slate-900">
                  Admin Roles Management
                </h1>
                <p className="text-slate-600">
                  Define and manage role-based access control with granular permissions
                </p>
                {embedded && !canEdit && (
                  <div className="mt-2 p-2 bg-yellow-100 text-yellow-800 rounded text-sm">
                    <strong>View Only:</strong> Only Super Admins and Admins can edit roles. You have read-only access.
                  </div>
                )}
              </div>
            </div>
            {!embedded && (
              <div className="flex gap-2">
                <Button onClick={handleExportRoles} variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" /> Export Roles
                </Button>
                <Button onClick={() => setShowAddRole(true)} variant="outline" size="sm" className="gap-2">
                  <Plus className="w-4 h-4" /> Add Role
                </Button>
                <Button onClick={() => navigate('/admin/security-compliance')} className="gap-2 bg-amber-600 hover:bg-amber-700">
                  <Shield className="w-4 h-4" /> Security & Compliance
                </Button>
                <Button onClick={() => navigate('/admin/support-tools')} className="gap-2 bg-purple-600 hover:bg-purple-700">
                  <LifeBuoy className="w-4 h-4" /> Support & Admin Tools
                </Button>
                <Button onClick={() => navigate('/admin/admin-control')} variant="outline" className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back to Admin Control
                </Button>
              </div>
            )}
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
                      ? 'border-primary bg-primary/10'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-2xl inline-flex items-center">
                      {renderIcon(role.icon, { className: "w-6 h-6" })}
                    </span>
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
          <div className="mb-8">
            <div className="flex gap-2 mb-4">
              {canEdit && !editMode && (
                <Button onClick={handleEditRole} size="sm" variant="outline">Edit Role</Button>
              )}
              {canEdit && editMode && (
                <>
                  <Button onClick={handleSaveRole} size="sm" className="bg-green-600 hover:bg-green-700 text-white">Save</Button>
                  <Button onClick={handleCancelEdit} size="sm" variant="outline">Cancel</Button>
                  <Button onClick={handleDeleteRole} size="sm" variant="destructive">Delete</Button>
                </>
              )}
            </div>
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
                        {editMode ? (
                          <input className="font-bold text-lg border rounded px-2 py-1" value={editRoleData.name} onChange={e => setEditRoleData({ ...editRoleData, name: e.target.value })} />
                        ) : (
                          selectedRoleData.name
                        )} - Permissions
                      </span>
                      <Badge variant="secondary">{roleSummary.permissionCount} permissions</Badge>
                    </CardTitle>
                    <CardDescription>System and administrative permissions granted to this role</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(editMode ? editRoleData.systemPermissions : selectedRoleData.systemPermissions).map(
                        ([permission, granted]) => (
                          <div key={permission} className={`flex items-center gap-3 p-3 rounded border ${granted ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                            {canEdit && editMode ? (
                              <input type="checkbox" checked={granted} onChange={e => setEditRoleData({ ...editRoleData, systemPermissions: { ...editRoleData.systemPermissions, [permission]: e.target.checked } })} />
                            ) : granted ? (
                              <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                            ) : (
                              <X className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            )}
                            <span className={`text-sm ${granted ? 'text-green-900' : 'text-slate-600'}`}>{permission.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
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
                      <span>{editMode ? (<input className="font-bold text-lg border rounded px-2 py-1" value={editRoleData.name} onChange={e => setEditRoleData({ ...editRoleData, name: e.target.value })} />) : selectedRoleData.name} - Feature Access</span>
                      <Badge variant="secondary">{roleSummary.featureCount} features</Badge>
                    </CardTitle>
                    <CardDescription>Business features and capabilities available to this role</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(editMode ? editRoleData.features : selectedRoleData.features).map(
                        ([feature, enabled]) => (
                          <div key={feature} className={`flex items-center gap-3 p-3 rounded border ${enabled ? 'bg-primary/10 border-primary/20' : 'bg-slate-50 border-slate-200'}`}>
                            {canEdit && editMode ? (
                              <input type="checkbox" checked={enabled} onChange={e => setEditRoleData({ ...editRoleData, features: { ...editRoleData.features, [feature]: e.target.checked } })} />
                            ) : enabled ? (
                              <Check className="w-5 h-5 text-primary flex-shrink-0" />
                            ) : (
                              <X className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            )}
                            <span className={`text-sm ${enabled ? 'text-foreground' : 'text-slate-600'}`}>{feature.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
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
                    <CardTitle>{editMode ? (<input className="font-bold text-lg border rounded px-2 py-1" value={editRoleData.name} onChange={e => setEditRoleData({ ...editRoleData, name: e.target.value })} />) : selectedRoleData.name} - Data Access Levels</CardTitle>
                    <CardDescription>Access level to different types of business data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(editMode ? editRoleData.dataAccess : selectedRoleData.dataAccess).map(
                        ([dataType, accessLevel]) => (
                          <div key={dataType} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50">
                            <span className="font-medium text-slate-900">{dataType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                            {canEdit && editMode ? (
                              <select value={accessLevel} onChange={e => setEditRoleData({ ...editRoleData, dataAccess: { ...editRoleData.dataAccess, [dataType]: e.target.value } })} className="border rounded px-2 py-1">
                                <option value="full">Full</option>
                                <option value="read-only">Read-Only</option>
                                <option value="restricted">Restricted</option>
                              </select>
                            ) : (
                              <Badge className={accessLevel === 'full' ? 'bg-green-100 text-green-800' : accessLevel === 'read-only' ? 'bg-primary/15 text-primary' : 'bg-red-100 text-red-800'}>
                                {accessLevel === 'full' ? '✓ Full Access' : accessLevel === 'read-only' ? '👁️ Read-Only' : '🔒 Restricted'}
                              </Badge>
                            )}
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
                    <CardTitle>{editMode ? (<input className="font-bold text-lg border rounded px-2 py-1" value={editRoleData.name} onChange={e => setEditRoleData({ ...editRoleData, name: e.target.value })} />) : selectedRoleData.name} - Restrictions</CardTitle>
                    <CardDescription>Actions and access this role cannot perform</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {editMode ? (
                      <div className="space-y-2">
                        {editRoleData.restrictions.map((restriction, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <Lock className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <input className="flex-1 border rounded px-2 py-1" value={restriction} onChange={e => {
                              const updated = [...editRoleData.restrictions];
                              updated[idx] = e.target.value;
                              setEditRoleData({ ...editRoleData, restrictions: updated });
                            }} />
                            <Button size="xs" variant="destructive" onClick={() => {
                              const updated = editRoleData.restrictions.filter((_, i) => i !== idx);
                              setEditRoleData({ ...editRoleData, restrictions: updated });
                            }}>Remove</Button>
                          </div>
                        ))}
                        <Button size="sm" onClick={() => setEditRoleData({ ...editRoleData, restrictions: [...editRoleData.restrictions, ''] })}>Add Restriction</Button>
                      </div>
                    ) : selectedRoleData.restrictions.length === 0 ? (
                      <div className="text-center py-8">
                        <Check className="w-12 h-12 text-green-500 mx-auto mb-2" />
                        <p className="text-slate-600">No restrictions</p>
                        <p className="text-sm text-slate-500">This role has full access</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedRoleData.restrictions.map((restriction, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
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
          </div>
        )}

        {/* Add Role Modal (simple inline form for demo) */}
        {showAddRole && canEdit && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-lg">
              <h2 className="text-xl font-bold mb-4">Add New Role</h2>
              <input className="w-full border rounded px-2 py-1 mb-2" placeholder="Role ID (unique)" value={newRole.id} onChange={e => setNewRole({ ...newRole, id: e.target.value })} />
              <input className="w-full border rounded px-2 py-1 mb-2" placeholder="Role Name" value={newRole.name} onChange={e => setNewRole({ ...newRole, name: e.target.value })} />
              <input className="w-full border rounded px-2 py-1 mb-2" placeholder="Description" value={newRole.description} onChange={e => setNewRole({ ...newRole, description: e.target.value })} />
              <Button className="mr-2" onClick={handleAddRole}>Add</Button>
              <Button variant="outline" onClick={() => setShowAddRole(false)}>Cancel</Button>
            </div>
          </div>
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
                          <span className="mr-2 inline-flex items-center">
                            {renderIcon(role.icon, { className: "w-5 h-5" })}
                          </span>
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
        <Card className="mt-8 border-primary/20 bg-primary/10">
          <CardHeader>
            <CardTitle className="text-foreground">ℹ️ Role Assignment Guide</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-primary space-y-3">
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

AdminRolesManagement.propTypes = {
  embedded: PropTypes.bool
};

export default AdminRolesManagement;
