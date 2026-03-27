import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminRolesManagement from "./AdminRolesManagement";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/components/auth/AuthContext";
import SupportAdminService from "@/services/SupportAdminService";
import UserManagementService from "@/services/UserManagementService";
import AuditLogService from "@/services/AuditLogService";
import {
  Users, Eye, EyeOff, Activity, AlertTriangle, FileText, Download,
  Search, Filter, Clock, User, AlertCircle, CheckCircle, Pin, X,
  Play, Square, ChevronRight, Bug, Database, ArrowLeft, Shield, Trash
} from "lucide-react";
import { motion } from "framer-motion";

export default function SupportAdminTools() {
  const [activeTab, setActiveTab] = useState("admin-activity");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      // Generate sample data if needed
      if (SupportAdminService.getAllErrors().length === 0) {
        SupportAdminService.generateSampleData();
      }
    } catch (error) {
      console.error('Failed to load support tools:', error);
      toast({
        title: 'Support Tools Error',
        description: 'Failed to load support data. Try refreshing the page.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleExportAll = async () => {
    try {
      await SupportAdminService.downloadAllData();
      toast({
        title: "Export Started",
        description: "System data is being exported as CSV files.",
      });
    } catch (err) {
      console.error('Export error:', err);
      toast({
        title: "Export Failed",
        description: "Failed to export system data.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading support tools...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-slate-900">Support & Admin Tools</h1>
                  <p className="text-slate-600">Backend support and troubleshooting utilities</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={() => navigate('/admin/security-compliance')}
                className="gap-2 bg-amber-600 hover:bg-amber-700"
              >
                <Shield className="w-4 h-4" />
                Security & Compliance
              </Button>
              <Button 
                onClick={() => navigate('/admin/admin-control')}
                variant="outline"
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Admin Control
              </Button>
              <Button onClick={handleExportAll} className="gap-2">
                <Download className="w-4 h-4" />
                Export All Data
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 xl:grid-cols-8 bg-white shadow-sm">
            <TabsTrigger value="impersonation" className="gap-2">
              <Eye className="w-4 h-4" />
              Impersonation
            </TabsTrigger>
            <TabsTrigger value="admin-activity" className="gap-2">
              <Activity className="w-4 h-4" />
              Admin Activity
            </TabsTrigger>
            <TabsTrigger value="user-actions" className="gap-2">
              <User className="w-4 h-4" />
              User Actions
            </TabsTrigger>
            <TabsTrigger value="system-errors" className="gap-2">
              <AlertTriangle className="w-4 h-4" />
              System Errors
            </TabsTrigger>
            <TabsTrigger value="webhook-failures" className="gap-2">
              <AlertCircle className="w-4 h-4" />
              Webhook Failures
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              <FileText className="w-4 h-4" />
              Admin Notes
            </TabsTrigger>
            <TabsTrigger value="admin-roles" className="gap-2">
              <Shield className="w-4 h-4" />
              Admin Roles
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2">
              <Database className="w-4 h-4" />
              Data Export
            </TabsTrigger>
          </TabsList>

          {/* Impersonation Tab */}
          <TabsContent value="impersonation">
            <ImpersonationTab currentUser={user} toast={toast} />
          </TabsContent>

          {/* Admin Activity Tab */}
          <TabsContent value="admin-activity">
            <AdminActivityLogsTab toast={toast} />
          </TabsContent>

          {/* User Actions Tab */}
          <TabsContent value="user-actions">
            <UserActionsLogTab toast={toast} />
          </TabsContent>

          {/* System Errors Tab */}
          <TabsContent value="system-errors">
            <ErrorTrackingTab currentUser={user} toast={toast} />
          </TabsContent>

          {/* Webhook Failures Tab */}
          <TabsContent value="webhook-failures">
            <WebhookFailuresTab currentUser={user} toast={toast} />
          </TabsContent>

          {/* Admin Notes Tab */}
          <TabsContent value="notes">
            <AdminNotesTab currentUser={user} toast={toast} />
          </TabsContent>

          {/* Admin Roles Tab */}
          <TabsContent value="admin-roles">
            <div className="py-4">
              <AdminRolesManagement embedded />
            </div>
          </TabsContent>
          {/* Data Export Tab */}
          <TabsContent value="export">
            <DataExportTab toast={toast} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ==================== Impersonation Tab ====================
function ImpersonationTab({ currentUser, toast }) {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonationData, setImpersonationData] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [reason, setReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [impersonationHistory, setImpersonationHistory] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const allUsers = UserManagementService.getAllUsers();
    setUsers(allUsers);

    const current = SupportAdminService.getCurrentImpersonation();
    setIsImpersonating(!!current);
    setImpersonationData(current);

    const history = SupportAdminService.getImpersonationHistory();
    setImpersonationHistory(history);
  };

  const handleStartImpersonation = () => {
    if (!selectedUser || !reason.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a user and provide a reason.",
        variant: "destructive",
      });
      return;
    }

    const user = users.find(u => u.id === selectedUser);
    if (!user) return;

    SupportAdminService.startImpersonation(
      currentUser?.id || 'admin',
      currentUser?.full_name || 'Admin User',
      user.id,
      user.name,
      reason
    );

    toast({
      title: "Impersonation Started",
      description: `Now viewing as ${user.name} (VIEW-ONLY)`,
    });

    loadData();
    setSelectedUser("");
    setReason("");
  };

  const handleStopImpersonation = () => {
    SupportAdminService.stopImpersonation();
    toast({
      title: "Impersonation Ended",
      description: "Returned to admin view",
    });
    loadData();
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(u => 
      u.name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      u.company.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Current Impersonation Status */}
      {isImpersonating && impersonationData && (
        <Card className="border-2 border-purple-500 bg-purple-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                  <Eye className="w-5 h-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-purple-900">Active Impersonation</CardTitle>
                  <CardDescription>You are viewing as another user (VIEW-ONLY)</CardDescription>
                </div>
              </div>
              <Button onClick={handleStopImpersonation} variant="destructive" className="gap-2">
                <Square className="w-4 h-4" />
                Stop Impersonation
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-purple-600 font-medium">Target User:</p>
                <p className="text-purple-900 font-semibold">{impersonationData.targetUserName}</p>
              </div>
              <div>
                <p className="text-purple-600 font-medium">Admin:</p>
                <p className="text-purple-900">{impersonationData.adminName}</p>
              </div>
              <div>
                <p className="text-purple-600 font-medium">Started:</p>
                <p className="text-purple-900">{new Date(impersonationData.startedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-purple-600 font-medium">Reason:</p>
                <p className="text-purple-900">{impersonationData.reason}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Start Impersonation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5" />
            Start User Impersonation
          </CardTitle>
          <CardDescription>
            View the application as a specific user (view-only mode for support purposes)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="userSearch">Search Users</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                id="userSearch"
                placeholder="Search by name, email, or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetUser">Select User to Impersonate</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser} disabled={isImpersonating}>
              <SelectTrigger id="targetUser">
                <SelectValue placeholder="Choose a user..." />
              </SelectTrigger>
              <SelectContent>
                {filteredUsers.slice(0, 50).map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.email}) - {user.plan}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Impersonation</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Troubleshooting invoice generation issue reported by customer..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isImpersonating}
              rows={3}
            />
          </div>

          <Button 
            onClick={handleStartImpersonation} 
            disabled={isImpersonating || !selectedUser || !reason.trim()}
            className="w-full gap-2"
          >
            <Eye className="w-4 h-4" />
            Start Impersonation (View-Only)
          </Button>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">Important Security Notes:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>All impersonation sessions are <strong>view-only</strong></li>
                  <li>Actions are logged and audited for compliance</li>
                  <li>Cannot modify user data during impersonation</li>
                  <li>Session ends when you log out or manually stop</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Impersonation History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Impersonation History
          </CardTitle>
          <CardDescription>Recent impersonation sessions and audit trail</CardDescription>
        </CardHeader>
        <CardContent>
          {impersonationHistory.length > 0 ? (
            <div className="space-y-3">
              {impersonationHistory.slice(0, 20).map((entry, index) => (
                <div key={index} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        entry.type === 'IMPERSONATION_STARTED' ? 'bg-purple-100' : 'bg-slate-200'
                      }`}>
                        {entry.type === 'IMPERSONATION_STARTED' ? (
                          <Eye className="w-4 h-4 text-purple-600" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-slate-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{entry.action}</p>
                        <p className="text-sm text-slate-600 mt-1">
                          Admin: <strong>{entry.performedBy}</strong> → Target: <strong>{entry.targetUser}</strong>
                        </p>
                        {entry.reason && (
                          <p className="text-sm text-slate-500 mt-1">Reason: {entry.reason}</p>
                        )}
                        {entry.duration && (
                          <p className="text-xs text-slate-500 mt-1">Duration: {entry.duration}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm text-slate-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No impersonation history yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

ImpersonationTab.propTypes = {
  currentUser: PropTypes.object,
  toast: PropTypes.func.isRequired
};

// ==================== Admin Activity Logs Tab ====================
function AdminActivityLogsTab({ toast }) {
  const [activities, setActivities] = useState([]);
  const [filteredActivities, setFilteredActivities] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadActivities();
  }, []);

  useEffect(() => {
    let filtered = [...activities];

    if (searchQuery) {
      filtered = SupportAdminService.searchActivities(searchQuery);
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter(a => a.type === typeFilter);
    }

    if (severityFilter !== "all") {
      filtered = filtered.filter(a => a.severity === severityFilter);
    }

    setFilteredActivities(filtered);
  }, [activities, searchQuery, typeFilter, severityFilter]);

  const loadActivities = () => {
    const allActivities = SupportAdminService.getAllActivities();
    setActivities(allActivities);

    const activityStats = SupportAdminService.getActivityStats(30);
    setStats(activityStats);
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const handleExport = () => {
    const csv = SupportAdminService.exportActivitiesCSV();
    const timestamp = new Date().toISOString().split('T')[0];
    SupportAdminService.downloadCSV(csv, `activities_${timestamp}.csv`);
    toast({
      title: "Export Complete",
      description: "Activity logs exported successfully",
    });
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-sm text-slate-600 mt-1">Total Activities</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{stats.recent}</p>
                <p className="text-sm text-slate-600 mt-1">Last 30 Days</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">
                  {stats.byType?.IMPERSONATION_STARTED || 0}
                </p>
                <p className="text-sm text-slate-600 mt-1">Impersonations</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">
                  {stats.byType?.ERROR_LOGGED || 0}
                </p>
                <p className="text-sm text-slate-600 mt-1">Errors Logged</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Activity Log Filters</CardTitle>
            <Button onClick={handleExport} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="activitySearch">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="activitySearch"
                  placeholder="Search activities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="typeFilter">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger id="typeFilter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="IMPERSONATION_STARTED">Impersonation Started</SelectItem>
                  <SelectItem value="IMPERSONATION_ENDED">Impersonation Ended</SelectItem>
                  <SelectItem value="ADMIN_NOTE_CREATED">Note Created</SelectItem>
                  <SelectItem value="ERROR_LOGGED">Error Logged</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="severityFilter">Severity</Label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger id="severityFilter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity List */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Entries ({filteredActivities.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredActivities.length > 0 ? (
            <div className="space-y-3">
              {filteredActivities.slice(0, 100).map((activity) => (
                <div key={activity.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 bg-primary/15 rounded-full flex items-center justify-center">
                        <Activity className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-slate-900">{activity.action}</p>
                          {activity.severity && (
                            <Badge className={getSeverityColor(activity.severity)}>
                              {activity.severity}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-slate-600 space-y-1">
                          {activity.performedBy && (
                            <p>Performed by: <strong>{activity.performedBy}</strong></p>
                          )}
                          {activity.targetUser && (
                            <p>Target: <strong>{activity.targetUser}</strong></p>
                          )}
                          {activity.reason && (
                            <p className="text-slate-500">Reason: {activity.reason}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-sm text-slate-500">
                      {new Date(activity.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No activities found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

AdminActivityLogsTab.propTypes = {
  toast: PropTypes.func.isRequired
};

// ==================== User Actions Log Tab ====================
function UserActionsLogTab({ toast }) {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  useEffect(() => {
    setLogs(AuditLogService.getAllLogs());
  }, []);

  useEffect(() => {
    let filtered = [...logs];
    const query = searchQuery.toLowerCase();

    if (query) {
      filtered = filtered.filter((log) => {
        const detailsText = typeof log.details === 'string'
          ? log.details
          : (log.details?.message || JSON.stringify(log.details || {}));
        return (
          (log.action || '').toLowerCase().includes(query) ||
          (log.type || '').toLowerCase().includes(query) ||
          (log.userName || '').toLowerCase().includes(query) ||
          (log.entityName || '').toLowerCase().includes(query) ||
          detailsText.toLowerCase().includes(query)
        );
      });
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(log => log.type === typeFilter);
    }

    if (severityFilter !== 'all') {
      filtered = filtered.filter(log => log.severity === severityFilter);
    }

    setFilteredLogs(filtered);
  }, [logs, searchQuery, typeFilter, severityFilter]);

  const availableTypes = useMemo(() => (
    Array.from(new Set(logs.map(log => log.type).filter(Boolean)))
  ), [logs]);

  const availableSeverities = useMemo(() => (
    Array.from(new Set(logs.map(log => log.severity).filter(Boolean)))
  ), [logs]);

  const handleExport = () => {
    const headers = ['ID', 'Timestamp', 'Type', 'Action', 'User', 'Entity', 'Severity', 'Details'];
    const rows = filteredLogs.map((log) => {
      const detailsText = typeof log.details === 'string'
        ? log.details
        : (log.details?.message || JSON.stringify(log.details || {}));
      return [
        log.id,
        log.timestamp,
        log.type || '',
        log.action || '',
        log.userName || '',
        log.entityName || '',
        log.severity || '',
        detailsText
      ];
    });
    const csv = SupportAdminService.arrayToCSV([headers, ...rows]);
    const timestamp = new Date().toISOString().split('T')[0];
    SupportAdminService.downloadCSV(csv, `user_actions_${timestamp}.csv`);
    toast({
      title: "Export Complete",
      description: "User actions exported successfully",
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>User Actions Log</CardTitle>
            <Button onClick={handleExport} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="userActionsSearch">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="userActionsSearch"
                  placeholder="Search by user, action, or entity..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="userActionType">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger id="userActionType">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {availableTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="userActionSeverity">Severity</Label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger id="userActionSeverity">
                  <SelectValue placeholder="All Severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  {availableSeverities.map((severity) => (
                    <SelectItem key={severity} value={severity}>{severity}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries ({filteredLogs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLogs.length > 0 ? (
            <div className="space-y-3">
              {filteredLogs.slice(0, 120).map((log) => {
                const detailsText = typeof log.details === 'string'
                  ? log.details
                  : (log.details?.message || JSON.stringify(log.details || {}));
                return (
                  <div key={log.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 bg-primary/15 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="font-medium text-slate-900">{log.action || log.type}</p>
                            {log.severity && (
                              <Badge variant="outline">{log.severity}</Badge>
                            )}
                          </div>
                          <div className="text-sm text-slate-600 space-y-1">
                            {log.userName && <p>User: <strong>{log.userName}</strong></p>}
                            {log.entityName && <p>Entity: <strong>{log.entityName}</strong></p>}
                            {detailsText && <p className="text-slate-500">{detailsText}</p>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No user actions found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

UserActionsLogTab.propTypes = {
  toast: PropTypes.func.isRequired
};

// ==================== Error Tracking Tab ====================
function ErrorTrackingTab({ currentUser, toast }) {
  const [errors, setErrors] = useState([]);
  const [stats, setStats] = useState(null);
  const [filterResolved, setFilterResolved] = useState("unresolved");
  const [selectedError, setSelectedError] = useState(null);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    loadErrors();
  }, []);

  const loadErrors = () => {
    const allErrors = SupportAdminService.getAllErrors();
    setErrors(allErrors);

    const errorStats = SupportAdminService.getErrorStats();
    setStats(errorStats);
  };

  const filteredErrors = useMemo(() => {
    if (filterResolved === "all") return errors;
    if (filterResolved === "resolved") return errors.filter(e => e.resolved);
    return errors.filter(e => !e.resolved);
  }, [errors, filterResolved]);

  const handleResolveError = (errorId) => {
    SupportAdminService.updateError(
      errorId,
      { resolved: true },
      currentUser?.id || 'admin',
      currentUser?.full_name || 'Admin User'
    );
    toast({
      title: "Error Resolved",
      description: "Error has been marked as resolved",
    });
    loadErrors();
    setSelectedError(null);
  };

  const handleAddNote = () => {
    if (!selectedError || !noteText.trim()) return;

    SupportAdminService.addErrorNote(
      selectedError.id,
      noteText,
      currentUser?.id || 'admin',
      currentUser?.full_name || 'Admin User'
    );

    toast({
      title: "Note Added",
      description: "Note has been added to the error",
    });

    setNoteText("");
    loadErrors();
    
    // Refresh selected error
    const updatedErrors = SupportAdminService.getAllErrors();
    const updated = updatedErrors.find(e => e.id === selectedError.id);
    setSelectedError(updated);
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-white';
      case 'low':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-slate-500 text-white';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'payment':
        return 'bg-emerald-100 text-emerald-800';
      case 'invoice':
        return 'bg-primary/15 text-primary';
      case 'auth':
        return 'bg-purple-100 text-purple-800';
      case 'api':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-sm text-slate-600 mt-1">Total Errors</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">{stats.unresolved}</p>
                <p className="text-sm text-red-800 mt-1">Unresolved</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-orange-600">{stats.bySeverity.critical}</p>
                <p className="text-sm text-slate-600 mt-1">Critical</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-600">{stats.bySeverity.high}</p>
                <p className="text-sm text-slate-600 mt-1">High Priority</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-slate-400" />
            <div className="flex gap-2">
              <Button
                variant={filterResolved === "unresolved" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterResolved("unresolved")}
              >
                Unresolved
              </Button>
              <Button
                variant={filterResolved === "resolved" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterResolved("resolved")}
              >
                Resolved
              </Button>
              <Button
                variant={filterResolved === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterResolved("all")}
              >
                All
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error List */}
      <div className="grid grid-cols-2 gap-6">
        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle>Errors ({filteredErrors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredErrors.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {filteredErrors.map((error) => (
                  <div
                    key={error.id}
                    onClick={() => setSelectedError(error)}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedError?.id === error.id
                        ? 'border-primary bg-primary/10'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                          <Bug className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={getSeverityColor(error.severity)}>
                              {error.severity}
                            </Badge>
                            <Badge className={getTypeColor(error.type)}>
                              {error.type}
                            </Badge>
                            {error.resolved && (
                              <Badge className="bg-green-100 text-green-800">
                                Resolved
                              </Badge>
                            )}
                          </div>
                          <p className="font-medium text-slate-900 text-sm">{error.message}</p>
                          {error.userName && (
                            <p className="text-xs text-slate-500 mt-1">User: {error.userName}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(error.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                No errors found
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Error Details</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedError ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className={getSeverityColor(selectedError.severity)}>
                      {selectedError.severity}
                    </Badge>
                    <Badge className={getTypeColor(selectedError.type)}>
                      {selectedError.type}
                    </Badge>
                  </div>
                  <p className="font-medium text-slate-900">{selectedError.message}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {new Date(selectedError.timestamp).toLocaleString()}
                  </p>
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  {selectedError.userName && (
                    <div>
                      <p className="text-slate-600 font-medium">User:</p>
                      <p className="text-slate-900">{selectedError.userName}</p>
                    </div>
                  )}
                  {selectedError.component && (
                    <div>
                      <p className="text-slate-600 font-medium">Component:</p>
                      <p className="text-slate-900">{selectedError.component}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-slate-600 font-medium">Details:</p>
                    <pre className="bg-slate-100 p-3 rounded text-xs overflow-x-auto">
                      {JSON.stringify(selectedError.details, null, 2)}
                    </pre>
                  </div>
                </div>

                {selectedError.resolved && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                    <p className="text-green-800 font-medium">Resolved</p>
                    <p className="text-green-700">
                      By: {selectedError.resolvedBy} at {new Date(selectedError.resolvedAt).toLocaleString()}
                    </p>
                  </div>
                )}

                <Separator />

                {/* Notes */}
                <div>
                  <p className="font-medium text-slate-900 mb-2">Notes ({selectedError.notes?.length || 0})</p>
                  <div className="space-y-2 mb-3">
                    {selectedError.notes?.map((note) => (
                      <div key={note.id} className="bg-slate-50 border border-slate-200 rounded p-3 text-sm">
                        <p className="text-slate-900">{note.note}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {note.adminName} - {new Date(note.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Textarea
                      placeholder="Add a note..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={3}
                    />
                    <Button onClick={handleAddNote} size="sm" className="w-full">
                      Add Note
                    </Button>
                  </div>
                </div>

                {!selectedError.resolved && (
                  <>
                    <Separator />
                    <Button
                      onClick={() => handleResolveError(selectedError.id)}
                      className="w-full gap-2"
                      variant="default"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Mark as Resolved
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                Select an error to view details
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

ErrorTrackingTab.propTypes = {
  currentUser: PropTypes.object,
  toast: PropTypes.func.isRequired
};

// ==================== Webhook Failures Tab ====================
function WebhookFailuresTab({ currentUser, toast }) {
  const [failures, setFailures] = useState([]);
  const [stats, setStats] = useState(null);
  const [filterResolved, setFilterResolved] = useState("unresolved");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFailure, setSelectedFailure] = useState(null);

  useEffect(() => {
    loadFailures();
  }, []);

  const loadFailures = () => {
    setFailures(SupportAdminService.getWebhookFailures());
    setStats(SupportAdminService.getWebhookFailureStats());
  };

  const filteredFailures = useMemo(() => {
    let filtered = [...failures];

    if (filterResolved === "resolved") {
      filtered = filtered.filter(f => f.resolved);
    }

    if (filterResolved === "unresolved") {
      filtered = filtered.filter(f => !f.resolved);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(f => (
        f.webhookId?.toLowerCase().includes(query) ||
        f.eventType?.toLowerCase().includes(query) ||
        f.endpoint?.toLowerCase().includes(query) ||
        f.errorMessage?.toLowerCase().includes(query)
      ));
    }

    return filtered;
  }, [failures, filterResolved, searchQuery]);

  const handleResolve = (failureId) => {
    SupportAdminService.updateWebhookFailure(
      failureId,
      { resolved: true },
      currentUser?.id || 'admin',
      currentUser?.full_name || 'Admin User'
    );
    toast({
      title: "Webhook Updated",
      description: "Webhook failure marked as resolved",
    });
    loadFailures();
    setSelectedFailure(null);
  };

  const handleExport = () => {
    const csv = SupportAdminService.exportWebhookFailuresCSV();
    const timestamp = new Date().toISOString().split('T')[0];
    SupportAdminService.downloadCSV(csv, `webhook_failures_${timestamp}.csv`);
    toast({
      title: "Export Complete",
      description: "Webhook failures exported successfully",
    });
  };

  const handleRetry = (failure) => {
    const result = SupportAdminService.retryWebhookFailure(
      failure.id,
      currentUser?.id || 'admin',
      currentUser?.full_name || 'Admin User'
    );

    if (!result.success) {
      toast({
        title: "Retry Failed",
        description: result.message || "Unable to retry webhook",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Retry Queued",
      description: "Webhook retry has been queued",
    });
    loadFailures();
    setSelectedFailure(result.failure);
  };

  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-sm text-slate-600 mt-1">Total Failures</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">{stats.unresolved}</p>
                <p className="text-sm text-red-800 mt-1">Unresolved</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{stats.retryable}</p>
                <p className="text-sm text-slate-600 mt-1">Retryable</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-600">
                  {Object.keys(stats.byEventType || {}).length}
                </p>
                <p className="text-sm text-slate-600 mt-1">Event Types</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Webhook Failure Filters</CardTitle>
            <Button onClick={handleExport} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="webhookSearch">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="webhookSearch"
                  placeholder="Search by endpoint or event type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <fieldset className="space-y-2 border-0 p-0 m-0 min-w-0">
              <legend className="text-sm font-medium leading-none mb-2">Resolution</legend>
              <div className="flex gap-2">
                <Button
                  variant={filterResolved === "unresolved" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterResolved("unresolved")}
                >
                  Unresolved
                </Button>
                <Button
                  variant={filterResolved === "resolved" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterResolved("resolved")}
                >
                  Resolved
                </Button>
                <Button
                  variant={filterResolved === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterResolved("all")}
                >
                  All
                </Button>
              </div>
            </fieldset>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Failures ({filteredFailures.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredFailures.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {filteredFailures.map((failure) => (
                  <div
                    key={failure.id}
                    onClick={() => setSelectedFailure(failure)}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedFailure?.id === failure.id
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-amber-100 text-amber-800">{failure.eventType}</Badge>
                            {failure.resolved && (
                              <Badge className="bg-green-100 text-green-800">Resolved</Badge>
                            )}
                          </div>
                          <p className="font-medium text-slate-900 text-sm">{failure.endpoint}</p>
                          <p className="text-xs text-slate-500 mt-1">Status: {failure.statusCode || 'N/A'}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(failure.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                No webhook failures found
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Failure Details</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedFailure ? (
              <div className="space-y-4">
                <div>
                  <Badge className="bg-amber-100 text-amber-800 mb-2">{selectedFailure.eventType}</Badge>
                  <p className="font-medium text-slate-900">{selectedFailure.endpoint}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {new Date(selectedFailure.timestamp).toLocaleString()}
                  </p>
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-slate-600 font-medium">Webhook ID:</p>
                    <p className="text-slate-900">{selectedFailure.webhookId}</p>
                  </div>
                  <div>
                    <p className="text-slate-600 font-medium">Status Code:</p>
                    <p className="text-slate-900">{selectedFailure.statusCode || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-slate-600 font-medium">Attempts:</p>
                    <p className="text-slate-900">{selectedFailure.attempts}</p>
                  </div>
                  <div>
                    <p className="text-slate-600 font-medium">Retryable:</p>
                    <p className="text-slate-900">{selectedFailure.retryable ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-slate-600 font-medium">Error Message:</p>
                    <p className="text-slate-900">{selectedFailure.errorMessage}</p>
                  </div>
                  <div>
                    <p className="text-slate-600 font-medium">Payload:</p>
                    <pre className="bg-slate-100 p-3 rounded text-xs overflow-x-auto">
                      {JSON.stringify(selectedFailure.payload || {}, null, 2)}
                    </pre>
                  </div>
                </div>

                {!selectedFailure.resolved && (
                  <>
                    <Separator />
                    {selectedFailure.retryable && (
                      <Button
                        onClick={() => handleRetry(selectedFailure)}
                        variant="outline"
                        className="w-full gap-2"
                      >
                        <Play className="w-4 h-4" />
                        Retry Now
                      </Button>
                    )}
                    <Button
                      onClick={() => handleResolve(selectedFailure.id)}
                      className="w-full gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Mark as Resolved
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                Select a failure to view details
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

WebhookFailuresTab.propTypes = {
  currentUser: PropTypes.object,
  toast: PropTypes.func.isRequired
};

// ==================== Admin Notes Tab ====================
function AdminNotesTab({ currentUser, toast }) {
  const [notes, setNotes] = useState([]);
  const [users, setUsers] = useState([]);
  const [showAddNote, setShowAddNote] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newNote, setNewNote] = useState({
    targetType: "user",
    targetId: "",
    targetName: "",
    note: "",
    priority: "normal"
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const allNotes = SupportAdminService.getAllAdminNotes();
    setNotes(allNotes);

    const allUsers = UserManagementService.getAllUsers();
    setUsers(allUsers);
  };

  const handleAddNote = () => {
    if (!newNote.targetId || !newNote.note.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a target and enter a note",
        variant: "destructive",
      });
      return;
    }

    SupportAdminService.addAdminNote(
      newNote.targetType,
      newNote.targetId,
      newNote.targetName,
      newNote.note,
      currentUser?.id || 'admin',
      currentUser?.full_name || 'Admin User',
      newNote.priority
    );

    toast({
      title: "Note Added",
      description: "Admin note has been created",
    });

    setNewNote({
      targetType: "user",
      targetId: "",
      targetName: "",
      note: "",
      priority: "normal"
    });
    setShowAddNote(false);
    loadData();
  };

  const handleTogglePin = (noteId) => {
    const note = notes.find(n => n.id === noteId);
    if (note) {
      SupportAdminService.updateAdminNote(
        noteId,
        { pinned: !note.pinned },
        currentUser?.id || 'admin',
        currentUser?.full_name || 'Admin User'
      );
      loadData();
    }
  };

  const handleToggleResolved = (noteId) => {
    const note = notes.find(n => n.id === noteId);
    if (note) {
      SupportAdminService.updateAdminNote(
        noteId,
        { resolved: !note.resolved },
        currentUser?.id || 'admin',
        currentUser?.full_name || 'Admin User'
      );
      loadData();
    }
  };

  const handleDeleteNote = (noteId) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      SupportAdminService.deleteAdminNote(
        noteId,
        currentUser?.id || 'admin',
        currentUser?.full_name || 'Admin User'
      );
      toast({
        title: "Note Deleted",
        description: "Admin note has been removed",
      });
      loadData();
    }
  };

  const handleTargetChange = (userId) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setNewNote({
        ...newNote,
        targetId: user.id,
        targetName: user.name
      });
    }
  };

  const filteredNotes = useMemo(() => {
    if (!searchQuery) return notes;
    return SupportAdminService.searchNotes(searchQuery);
  }, [notes, searchQuery]);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'normal':
        return 'bg-primary/100 text-white';
      case 'low':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-slate-500 text-white';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => setShowAddNote(!showAddNote)} className="gap-2">
              {showAddNote ? <X className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              {showAddNote ? 'Cancel' : 'Add Note'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Note Form */}
      {showAddNote && (
        <Card className="border-primary/20 bg-primary/10">
          <CardHeader>
            <CardTitle>Add Admin Note</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="targetType">Target Type</Label>
                <Select 
                  value={newNote.targetType} 
                  onValueChange={(value) => setNewNote({...newNote, targetType: value})}
                >
                  <SelectTrigger id="targetType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="account">Account</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetUser">Select User</Label>
                <Select value={newNote.targetId} onValueChange={handleTargetChange}>
                  <SelectTrigger id="targetUser">
                    <SelectValue placeholder="Choose a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.slice(0, 50).map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select 
                value={newNote.priority} 
                onValueChange={(value) => setNewNote({...newNote, priority: value})}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="noteText">Note</Label>
              <Textarea
                id="noteText"
                placeholder="Enter admin note..."
                value={newNote.note}
                onChange={(e) => setNewNote({...newNote, note: e.target.value})}
                rows={4}
              />
            </div>

            <Button onClick={handleAddNote} className="w-full">
              Create Note
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Notes List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredNotes.length > 0 ? (
          filteredNotes.map((note) => (
            <Card key={note.id} className={note.pinned ? 'border-primary/30 bg-primary/10' : ''}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-10 h-10 bg-primary/15 rounded-full flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getPriorityColor(note.priority)}>
                          {note.priority}
                        </Badge>
                        <Badge variant="outline">{note.targetType}</Badge>
                        {note.pinned && (
                          <Badge className="bg-yellow-100 text-yellow-800">
                            <Pin className="w-3 h-3 mr-1" />
                            Pinned
                          </Badge>
                        )}
                        {note.resolved && (
                          <Badge className="bg-green-100 text-green-800">
                            Resolved
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium text-slate-900 mb-1">
                        {note.targetName} ({note.targetType})
                      </p>
                      <p className="text-slate-700 mb-2">{note.note}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>By: {note.adminName}</span>
                        <span>Created: {new Date(note.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTogglePin(note.id)}
                      title={note.pinned ? "Unpin" : "Pin"}
                    >
                      <Pin className={`w-4 h-4 ${note.pinned ? 'fill-current' : ''}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleResolved(note.id)}
                      title={note.resolved ? "Mark Unresolved" : "Mark Resolved"}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteNote(note.id)}
                      title="Delete"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="pt-12 pb-12 text-center text-slate-500">
              No admin notes found
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

AdminNotesTab.propTypes = {
  currentUser: PropTypes.object,
  toast: PropTypes.func.isRequired
};

// ==================== Data Export Tab ====================
function DataExportTab({ toast }) {
  const [retentionSettings, setRetentionSettings] = useState(
    SupportAdminService.getRetentionSettings()
  );
  const handleExport = (type) => {
    let csv, filename;
    const timestamp = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'users':
        csv = SupportAdminService.exportUsersCSV();
        filename = `users_${timestamp}.csv`;
        break;
      case 'activities':
        csv = SupportAdminService.exportActivitiesCSV();
        filename = `activities_${timestamp}.csv`;
        break;
      case 'errors':
        csv = SupportAdminService.exportErrorsCSV();
        filename = `errors_${timestamp}.csv`;
        break;
      case 'notes':
        csv = SupportAdminService.exportNotesCSV();
        filename = `admin_notes_${timestamp}.csv`;
        break;
      case 'impersonation':
        csv = SupportAdminService.exportImpersonationCSV();
        filename = `impersonation_${timestamp}.csv`;
        break;
      case 'userActions':
        csv = SupportAdminService.exportUserActionsCSV();
        filename = `user_actions_${timestamp}.csv`;
        break;
      case 'webhookFailures':
        csv = SupportAdminService.exportWebhookFailuresCSV();
        filename = `webhook_failures_${timestamp}.csv`;
        break;
      default:
        return;
    }

    if (csv) {
      SupportAdminService.downloadCSV(csv, filename);
      toast({
        title: "Export Complete",
        description: `${filename} downloaded successfully`,
      });
    }
  };

  const exportItems = [
    {
      id: 'users',
      title: 'Users Data',
      description: 'Export all user accounts with details',
      icon: User,
      color: 'blue'
    },
    {
      id: 'userActions',
      title: 'User Actions',
      description: 'Export unified audit logs of user activity',
      icon: Activity,
      color: 'emerald'
    },
    {
      id: 'activities',
      title: 'Activity Logs',
      description: 'Export complete activity log history',
      icon: Activity,
      color: 'indigo'
    },
    {
      id: 'errors',
      title: 'Error Tracking',
      description: 'Export all logged errors and issues',
      icon: Bug,
      color: 'red'
    },
    {
      id: 'notes',
      title: 'Admin Notes',
      description: 'Export all admin notes and comments',
      icon: FileText,
      color: 'purple'
    },
    {
      id: 'impersonation',
      title: 'Impersonation History',
      description: 'Export impersonation session logs',
      icon: Eye,
      color: 'pink'
    },
    {
      id: 'webhookFailures',
      title: 'Webhook Failures',
      description: 'Export failed webhook deliveries',
      icon: AlertTriangle,
      color: 'amber'
    }
  ];

  return (
    <div className="space-y-6">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Log Retention & Purge</CardTitle>
          <CardDescription>Configure how long logs are retained before purge</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="retentionActivities">Activity Logs (days)</Label>
              <Input
                id="retentionActivities"
                type="number"
                min="1"
                value={retentionSettings.activityDays}
                onChange={(e) => setRetentionSettings({
                  ...retentionSettings,
                  activityDays: Number(e.target.value)
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retentionErrors">System Errors (days)</Label>
              <Input
                id="retentionErrors"
                type="number"
                min="1"
                value={retentionSettings.errorDays}
                onChange={(e) => setRetentionSettings({
                  ...retentionSettings,
                  errorDays: Number(e.target.value)
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retentionWebhooks">Webhook Failures (days)</Label>
              <Input
                id="retentionWebhooks"
                type="number"
                min="1"
                value={retentionSettings.webhookDays}
                onChange={(e) => setRetentionSettings({
                  ...retentionSettings,
                  webhookDays: Number(e.target.value)
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retentionAudit">User Actions (days)</Label>
              <Input
                id="retentionAudit"
                type="number"
                min="1"
                value={retentionSettings.auditLogDays}
                onChange={(e) => setRetentionSettings({
                  ...retentionSettings,
                  auditLogDays: Number(e.target.value)
                })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                const next = SupportAdminService.updateRetentionSettings(retentionSettings);
                setRetentionSettings(next);
                toast({
                  title: "Retention Updated",
                  description: "Log retention settings saved",
                });
              }}
              className="gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Save Retention
            </Button>
            <Button
              onClick={() => {
                const result = SupportAdminService.purgeOldLogs(retentionSettings);
                toast({
                  title: "Purge Complete",
                  description: `Removed: activities ${result.activities.removed}, errors ${result.errors.removed}, webhooks ${result.webhookFailures.removed}, audit ${result.auditLogs.removed}`,
                });
              }}
              variant="outline"
              className="gap-2"
            >
              <Trash className="w-4 h-4" />
              Purge Now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Database className="w-5 h-5" />
            Data Export Center
          </CardTitle>
          <CardDescription className="text-primary">
            Export system data as CSV files for reporting, backup, or compliance purposes
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exportItems.map((item) => (
          <Card key={item.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className={`w-12 h-12 bg-${item.color}-100 rounded-lg flex items-center justify-center`}>
                    <item.icon className={`w-6 h-6 text-${item.color}-600`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 mb-1">{item.title}</h3>
                    <p className="text-sm text-slate-600">{item.description}</p>
                  </div>
                </div>
                <Button onClick={() => handleExport(item.id)} size="sm" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Export Information</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>• All exports are generated in CSV format for easy analysis in Excel or other tools</p>
          <p>• Files are named with timestamps for easy organization</p>
          <p>• Large datasets may take a moment to download</p>
          <p>• Exports include all historical data stored in localStorage</p>
          <p>• Use &quot;Export All Data&quot; button to download all datasets at once</p>
        </CardContent>
      </Card>
    </div>
  );
}

DataExportTab.propTypes = {
  toast: PropTypes.func.isRequired
};
