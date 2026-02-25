import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Lock,
  Shield,
  ArrowLeft,
  FileText,
  HardDrive,
  AlertTriangle,
  Users,
  LogOut,
  Download,
  Trash2,
  Plus,
  Clock,
  Search,
  Server,
  LifeBuoy,
  Key
} from 'lucide-react';
import { SecurityComplianceService } from '@/services/SecurityComplianceService';
import AuditLogService, { SEVERITY_LEVELS } from '@/services/AuditLogService';
import { useAuth } from '@/components/auth/AuthContext';
import PropTypes from 'prop-types';

const {
  AdminRolesManager,
  DataAccessManager,
  BackupRecoveryManager
} = SecurityComplianceService;

export default function SecurityCompliance() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('roles');

  // Initialize service
  useEffect(() => {
    SecurityComplianceService.initialize();
  }, []);

  const handleNavigateToAdmin = () => {
    navigate('/admin/admin-control');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-slate-900">
                  Security & Compliance
                </h1>
                <p className="text-slate-600">
                  Role-based access control, audit logs, data access policies, and backup management
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Access is enforced by Supabase Row Level Security (RLS) and admin role checks. See docs: SECURITY_AND_COMPLIANCE.md, SUPABASE_SECURITY.md
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => navigate('/admin/roles-management')}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                <Key className="w-4 h-4" />
                Admin Roles
              </Button>
              <Button 
                onClick={() => navigate('/admin/support-tools')}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
              >
                <LifeBuoy className="w-4 h-4" />
                Support & Admin Tools
              </Button>
              <Button 
                onClick={handleNavigateToAdmin}
                variant="outline"
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Admin Control
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="roles" className="gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Admin Roles</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Audit Logs</span>
            </TabsTrigger>
            <TabsTrigger value="access" className="gap-2">
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Data Access</span>
            </TabsTrigger>
            <TabsTrigger value="backup" className="gap-2">
              <HardDrive className="w-4 h-4" />
              <span className="hidden sm:inline">Backup Recovery</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Role-Based Admin Access */}
          <TabsContent value="roles" className="space-y-6">
            <RoleBasedAccessTab currentUser={currentUser} />
          </TabsContent>

          {/* Tab 2: Audit Logs */}
          <TabsContent value="audit" className="space-y-6">
            <AuditLogsTab />
          </TabsContent>

          {/* Tab 3: Data Access Control */}
          <TabsContent value="access" className="space-y-6">
            <DataAccessControlTab />
          </TabsContent>

          {/* Tab 4: Backup & Recovery */}
          <TabsContent value="backup" className="space-y-6">
            <BackupRecoveryTab currentUser={currentUser} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ==================== Tab 1: Role-Based Access Control ====================
function RoleBasedAccessTab({ currentUser }) {
  const [admins, setAdmins] = useState([]);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [formData, setFormData] = useState({
    userId: '',
    userName: '',
    role: 'admin',
    reason: ''
  });

  useEffect(() => {
    const adminList = AdminRolesManager.getAllAdmins();
    setAdmins(adminList);
  }, []);

  const handleAssignRole = () => {
    if (!formData.userId.trim() || !formData.userName.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      AdminRolesManager.assignAdminRole(
        formData.userId,
        formData.userName,
        formData.role,
        currentUser.full_name,
        formData.reason
      );

      const updated = AdminRolesManager.getAllAdmins();
      setAdmins(updated);

      setFormData({ userId: '', userName: '', role: 'admin', reason: '' });
      setShowAssignForm(false);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleRevokeRole = (userId) => {
    if (!confirm('Are you sure you want to revoke this admin role?')) return;

    try {
      AdminRolesManager.revokeAdminRole(userId, currentUser.full_name);

      const updated = AdminRolesManager.getAllAdmins();
      setAdmins(updated);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Role Definitions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Available Admin Roles
          </CardTitle>
          <CardDescription>
            Define permissions for each admin role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(AdminRolesManager.ADMIN_ROLES).map(([key, role]) => (
              <div
                key={key}
                className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-slate-900">{role.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">{role.description}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      role.risk_level === 'critical'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : role.risk_level === 'high'
                        ? 'bg-orange-50 text-orange-700 border-orange-200'
                        : role.risk_level === 'medium'
                        ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        : 'bg-green-50 text-green-700 border-green-200'
                    }
                  >
                    {role.risk_level}
                  </Badge>
                </div>
                <div className="mt-3 text-xs text-slate-600">
                  <p className="font-medium mb-1">Permissions ({role.permissions.length}):</p>
                  <div className="space-y-0.5">
                    {role.permissions.slice(0, 3).map((perm, i) => (
                      <p key={i}>• {perm}</p>
                    ))}
                    {role.permissions.length > 3 && (
                      <p>• +{role.permissions.length - 3} more</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Admins */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Current Admins ({admins.length})
            </CardTitle>
            <CardDescription>
              Manage admin role assignments
            </CardDescription>
          </div>
          <Button
            onClick={() => setShowAssignForm(!showAssignForm)}
            size="sm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Assign Role
          </Button>
        </CardHeader>
        <CardContent>
          {showAssignForm && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-4">
              <h4 className="font-semibold text-blue-900">Assign Admin Role</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">User ID</Label>
                  <Input
                    placeholder="user_123"
                    value={formData.userId}
                    onChange={(e) =>
                      setFormData({ ...formData, userId: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">User Name</Label>
                  <Input
                    placeholder="John Doe"
                    value={formData.userName}
                    onChange={(e) =>
                      setFormData({ ...formData, userName: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Role</Label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2"
                >
                  {Object.entries(AdminRolesManager.ADMIN_ROLES).map(([key, role]) => (
                    <option key={key} value={key}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-sm font-medium">Reason (Optional)</Label>
                <Input
                  placeholder="Why is this role being assigned?"
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowAssignForm(false)}
                  size="sm"
                >
                  Cancel
                </Button>
                <Button onClick={handleAssignRole} size="sm">
                  Assign Role
                </Button>
              </div>
            </div>
          )}

          {admins.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500">No admins assigned yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {admins.map((admin) => (
                <div
                  key={admin.userId}
                  className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <div className="flex-1">
                    <h4 className="font-medium text-slate-900">{admin.userName}</h4>
                    <p className="text-sm text-slate-600">ID: {admin.userId}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="secondary">
                        {AdminRolesManager.getRole(admin.role)?.name || admin.role}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        Assigned {new Date(admin.assignedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {admin.reason && (
                      <p className="text-xs text-slate-600 mt-1">
                        <strong>Reason:</strong> {admin.reason}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => handleRevokeRole(admin.userId)}
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== Tab 2: Audit Logs ====================
function AuditLogsTab() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [filterType, setFilterType] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const auditLogs = AuditLogService.getLogs({
      type: filterType || undefined,
      severity: filterSeverity || undefined
    });
    setLogs(auditLogs);

    const statistics = AuditLogService.getStatistics();
    setStats(statistics);
  }, [filterType, filterSeverity]);

  const filtered = useMemo(() => {
    return logs.filter(
      (log) =>
        log.id.includes(searchTerm) ||
        log.type?.includes(searchTerm) ||
        log.action?.includes(searchTerm) ||
        (log.performedBy || '').includes(searchTerm) ||
        (log.targetUserName || '').includes(searchTerm)
    );
  }, [logs, searchTerm]);

  const handleExportCSV = () => {
    const result = AuditLogService.downloadLogs('csv', {
      type: filterType || undefined,
      severity: filterSeverity || undefined
    });
    
    if (!result.success) {
      alert('Failed to export logs');
    }
  };

  const getSeverityBadgeColor = (severity) => {
    switch (severity) {
      case SEVERITY_LEVELS.CRITICAL:
        return 'bg-red-100 text-red-800 border-red-200';
      case SEVERITY_LEVELS.HIGH:
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case SEVERITY_LEVELS.MEDIUM:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Total Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {stats.totalEvents}
              </div>
              <p className="text-xs text-slate-600 mt-1">Last 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Critical Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {stats.bySeverity[SEVERITY_LEVELS.CRITICAL] || 0}
              </div>
              <p className="text-xs text-slate-600 mt-1">Requires attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                High Severity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">
                {stats.bySeverity[SEVERITY_LEVELS.HIGH] || 0}
              </div>
              <p className="text-xs text-slate-600 mt-1">Monitor closely</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Event Types
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {Object.keys(stats.byType).length}
              </div>
              <p className="text-xs text-slate-600 mt-1">Different types</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Type</Label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              >
                <option value="">All Types</option>
                <option value="role_assignment">Role Assignment</option>
                <option value="backup_management">Backup Management</option>
                <option value="access_policy">Access Policy</option>
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">Severity</Label>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              >
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Audit Logs ({filtered.length})
          </CardTitle>
          <Button onClick={handleExportCSV} size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500">No audit logs found</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filtered.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 bg-slate-50 rounded border border-slate-200 hover:bg-slate-100 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{log.type || 'event'}</Badge>
                      <Badge
                        variant="outline"
                        className={getSeverityBadgeColor(log.severity)}
                      >
                        {log.severity}
                      </Badge>
                      <span className="text-xs text-slate-600">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 mt-1">
                      {log.action}
                    </p>
                    <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                      {log.performedBy && <p>By: {log.performedBy}</p>}
                      {log.targetUserName && <p>Target: {log.targetUserName}</p>}
                      {log.description && <p>{log.description}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== Tab 3: Data Access Control ====================
function DataAccessControlTab() {
  const [policies, setPolicies] = useState([]);
  const [report, setReport] = useState(null);
  const [showNewPolicyForm, setShowNewPolicyForm] = useState(false);
  const [formData, setFormData] = useState({
    policyName: '',
    dataType: '',
    dataClassification: 'internal',
    allowedRoles: [],
    description: ''
  });

  useEffect(() => {
    const accessPolicies = DataAccessManager.getPolicies();
    setPolicies(accessPolicies);

    const accessReport = DataAccessManager.getAccessReport();
    setReport(accessReport);
  }, []);

  const handleToggleRole = (role) => {
    setFormData((prev) => {
      const roles = prev.allowedRoles.includes(role)
        ? prev.allowedRoles.filter((r) => r !== role)
        : [...prev.allowedRoles, role];
      return { ...prev, allowedRoles: roles };
    });
  };

  const handleCreatePolicy = () => {
    if (
      !formData.policyName.trim() ||
      !formData.dataType.trim() ||
      formData.allowedRoles.length === 0
    ) {
      alert('Please fill in all required fields');
      return;
    }

    DataAccessManager.createAccessPolicy(
      formData.policyName,
      formData.dataType,
      formData.dataClassification,
      formData.allowedRoles,
      formData.description
    );

    const updated = DataAccessManager.getPolicies();
    setPolicies(updated);

    setFormData({
      policyName: '',
      dataType: '',
      dataClassification: 'internal',
      allowedRoles: [],
      description: ''
    });
    setShowNewPolicyForm(false);
  };

  const getClassificationColor = (classification) => {
    switch (classification) {
      case 'public':
        return 'bg-green-100 text-green-800';
      case 'internal':
        return 'bg-blue-100 text-blue-800';
      case 'confidential':
        return 'bg-yellow-100 text-yellow-800';
      case 'restricted':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Access Report */}
      {report && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Total Policies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {report.totalPolicies}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {report.activePolicies} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Data Types
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {report.dataTypes.length}
              </div>
              <p className="text-xs text-slate-600 mt-1">Protected resources</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Classifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {report.classifications.length}
              </div>
              <p className="text-xs text-slate-600 mt-1">Sensitivity levels</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Policy Form */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Data Access Policies</CardTitle>
          <Button
            onClick={() => setShowNewPolicyForm(!showNewPolicyForm)}
            size="sm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            New Policy
          </Button>
        </CardHeader>
        <CardContent>
          {showNewPolicyForm && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-4">
              <h4 className="font-semibold text-blue-900">Create New Policy</h4>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Policy Name</Label>
                  <Input
                    placeholder="e.g., User Accounts Policy"
                    value={formData.policyName}
                    onChange={(e) =>
                      setFormData({ ...formData, policyName: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium">Data Type</Label>
                  <Input
                    placeholder="e.g., user_accounts, invoices, payments"
                    value={formData.dataType}
                    onChange={(e) =>
                      setFormData({ ...formData, dataType: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium">Classification</Label>
                  <select
                    value={formData.dataClassification}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        dataClassification: e.target.value
                      })
                    }
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  >
                    <option value="public">Public</option>
                    <option value="internal">Internal</option>
                    <option value="confidential">Confidential</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    Allowed Roles
                  </Label>
                  <div className="space-y-2">
                    {Object.entries(AdminRolesManager.ADMIN_ROLES).map(
                      ([key, role]) => (
                        <label key={key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.allowedRoles.includes(key)}
                            onChange={() => handleToggleRole(key)}
                            className="rounded"
                          />
                          <span className="text-sm">{role.name}</span>
                        </label>
                      )
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Description</Label>
                  <Input
                    placeholder="Policy description..."
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowNewPolicyForm(false)}
                  size="sm"
                >
                  Cancel
                </Button>
                <Button onClick={handleCreatePolicy} size="sm">
                  Create Policy
                </Button>
              </div>
            </div>
          )}

          {policies.length === 0 ? (
            <div className="text-center py-8">
              <Lock className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500">No policies configured yet</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {policies.map((policy) => (
                <div
                  key={policy.id}
                  className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Lock className="w-5 h-5 text-slate-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-slate-900">{policy.name}</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Data Type: <code className="bg-slate-100 px-2 py-1 rounded text-xs">
                        {policy.dataType}
                      </code>
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge className={getClassificationColor(policy.dataClassification)}>
                        {policy.dataClassification}
                      </Badge>
                      <span className="text-xs text-slate-600">
                        {policy.allowedRoles.length} roles
                      </span>
                    </div>
                    {policy.description && (
                      <p className="text-xs text-slate-600 mt-2">
                        {policy.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== Tab 4: Backup & Recovery ====================
function BackupRecoveryTab({ currentUser }) {
  const [backups, setBackups] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const backupList = BackupRecoveryManager.getBackups();
    setBackups(backupList);

    const backupStats = BackupRecoveryManager.getStatistics();
    setStats(backupStats);
  }, []);

  const handleDeleteBackup = (backupId) => {
    if (!confirm('Are you sure you want to delete this backup?')) return;

    try {
      BackupRecoveryManager.deleteBackup(backupId, currentUser.full_name);

      const updated = BackupRecoveryManager.getBackups();
      setBackups(updated);

      const updatedStats = BackupRecoveryManager.getStatistics();
      setStats(updatedStats);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleCreateBackup = () => {
    const backupName = prompt('Backup name:', `backup_${new Date().toLocaleDateString()}`);
    if (!backupName) return;

    try {
      BackupRecoveryManager.recordBackup(
        backupName,
        ['users', 'invoices', 'payments', 'settings'],
        currentUser.full_name
      );

      const updated = BackupRecoveryManager.getBackups();
      setBackups(updated);

      const updatedStats = BackupRecoveryManager.getStatistics();
      setStats(updatedStats);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Total Backups
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {stats.totalBackups}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {stats.completedBackups} completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Latest Backup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-slate-900">
                {stats.latestBackup
                  ? new Date(stats.latestBackup).toLocaleDateString()
                  : 'Never'}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {stats.latestBackup
                  ? new Date(stats.latestBackup).toLocaleTimeString()
                  : 'No backups yet'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Avg Interval
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {stats.averageInterval || '-'}
              </div>
              <p className="text-xs text-slate-600 mt-1">Hours between backups</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Coverage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {stats.backupCoverage.length}
              </div>
              <p className="text-xs text-slate-600 mt-1">Data types covered</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Backup History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            Backup History
          </CardTitle>
          <Button onClick={handleCreateBackup} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Create Backup
          </Button>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="text-center py-8">
              <HardDrive className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500">No backups yet</p>
              <p className="text-sm text-slate-400 mt-1">
                Create your first backup to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Server className="w-5 h-5 text-slate-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-slate-900">{backup.name}</h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(backup.createdAt).toLocaleString()}
                      </span>
                      <span>•</span>
                      <span>By: {backup.createdBy}</span>
                      <span>•</span>
                      <Badge variant="outline" className="text-xs">
                        {backup.status}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {backup.dataTypes.map((dt) => (
                        <Badge key={dt} variant="secondary" className="text-xs">
                          {dt}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Retention: {new Date(backup.retentionDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      title="Download backup"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      onClick={() => handleDeleteBackup(backup.id)}
                      variant="destructive"
                      size="sm"
                      className="gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recovery Information */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <CardTitle className="text-blue-900">Recovery Procedures</CardTitle>
              <CardDescription className="text-blue-800">
                Important information about backup and recovery
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <div>
            <strong>• Backup Creation:</strong> Weekly automated backups are
            recommended for system stability
          </div>
          <div>
            <strong>• Data Retention:</strong> Backups are retained for 90 days
            by default
          </div>
          <div>
            <strong>• Recovery Point:</strong> RTO &lt; 1 hour, RPO &lt; 1 day
            for critical data
          </div>
          <div>
            <strong>• Testing:</strong> Test recovery procedures quarterly to
            ensure effectiveness
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// PropTypes
RoleBasedAccessTab.propTypes = {
  currentUser: PropTypes.shape({
    full_name: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired
  }).isRequired
};

BackupRecoveryTab.propTypes = {
  currentUser: PropTypes.shape({
    full_name: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired
  }).isRequired
};
