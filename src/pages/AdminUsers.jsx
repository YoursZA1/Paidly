/**
 * Admin Users Management
 * Platform-level admin dashboard for managing all users, tracking activity, and controlling access
 */

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Legend,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  Search, Download, Lock, Unlock, RotateCcw,
  AlertCircle, CheckCircle2, Clock, Users
} from 'lucide-react';
import UserManagementService from '@/services/UserManagementService';
import { exportDataAsJSON } from '@/services/AdminCommonService';
import {
  getStatusColor, getStatusLabel, getPlanColor, getPlanLabel,
  formatDate, formatRelativeTime, getUsageBarColor,
  getChartDataForUserStatus,
  getChartDataForUsersByPlan, getDaysUntilTrialExpiry,
  isTrialExpiringSoon
} from '@/utils/userUtils';

export default function AdminUsers() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [planChanges, setPlanChanges] = useState({});
  const [planUpdatingId, setPlanUpdatingId] = useState(null);

  const PLAN_OPTIONS = [
    { value: 'free', label: 'Free' },
    { value: 'starter', label: 'Starter' },
    { value: 'professional', label: 'Professional' },
    { value: 'enterprise', label: 'Enterprise' },
  ];

  // Data states
  const [statusBreakdown, setStatusBreakdown] = useState(null);
  const [usersPerPlan, setUsersPerPlan] = useState(null);
  const [loginHistory, setLoginHistory] = useState([]);
  const [activitySummary, setActivitySummary] = useState(null);
  const [dailyTrend, setDailyTrend] = useState([]);
  const [userUsageLimits, setUserUsageLimits] = useState({});

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    try {
      const allUsers = UserManagementService.getAllUsers();
      setUsers(allUsers);

      const status = UserManagementService.getUserStatus();
      setStatusBreakdown(status);

      const perPlan = UserManagementService.getUsersPerPlan();
      setUsersPerPlan(perPlan);

      const history = UserManagementService.getLoginHistory();
      setLoginHistory(history);

      const summary = UserManagementService.getUserActivitySummary();
      setActivitySummary(summary);

      const trend = UserManagementService.getDailyLoginTrend();
      setDailyTrend(trend);

      // Load usage limits for all users
      const limits = {};
      allUsers.forEach(user => {
        limits[user.id] = UserManagementService.getUserUsageLimits(user.id);
      });
      setUserUsageLimits(limits);
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSuspendUser = (userId) => {
    const user = users.find(u => u.id === userId);
    if (user && window.confirm(`Are you sure you want to suspend ${user.name}?`)) {
      UserManagementService.suspendUser(userId, 'Suspended by admin');
      loadData();
    }
  };

  const handleReactivateUser = (userId) => {
    const user = users.find(u => u.id === userId);
    if (user && window.confirm(`Are you sure you want to reactivate ${user.name}?`)) {
      UserManagementService.reactivateUser(userId, 'Reactivated by admin');
      loadData();
    }
  };

  const handleResetPassword = (userId) => {
    const user = users.find(u => u.id === userId);
    if (user && window.confirm(`Generate new password for ${user.name}? They will be required to change it on next login.`)) {
      const result = UserManagementService.resetPassword(userId);
      alert(`Temporary password: ${result.tempPassword}\nExpires in: ${result.expiresIn}`);
      loadData();
    }
  };

  const handleChangePlan = async (userId, newPlan) => {
    if (!userId || !newPlan) return;

    setPlanUpdatingId(userId);
    try {
      const result = await UserManagementService.changeUserPlan(userId, newPlan);
      if (result.success) {
        setPlanChanges((prev) => ({ ...prev, [userId]: newPlan }));
        loadData();
        alert(`Updated user plan to ${newPlan} successfully.`);
      } else {
        alert(`Unable to update plan: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating plan:', error);
      alert('Failed to update user plan. Check console for details.');
    } finally {
      setPlanUpdatingId(null);
    }
  };

  const handleExportUsers = () => {
    const data = UserManagementService.exportUsers();
    const timestamp = new Date().toISOString().split('T')[0];
    exportDataAsJSON(data, `admin_users_${timestamp}.json`);
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLoginHistory = loginHistory.filter(entry =>
    entry.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="p-8 text-center">Loading user data...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-slate-900">User Management</h1>
          <Button onClick={handleExportUsers} variant="outline" className="flex items-center gap-2">
            <Download size={18} /> Export Users
          </Button>
        </div>
        <p className="text-slate-600">Monitor and manage all platform users, access control, and usage limits</p>
      </div>

      {/* Key Metrics */}
      {activitySummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Users</p>
                  <p className="text-3xl font-bold text-slate-900">{activitySummary.totalUsers}</p>
                </div>
                <Users size={32} className="text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Active Today</p>
                  <p className="text-3xl font-bold text-green-600">{activitySummary.activeToday}</p>
                </div>
                <CheckCircle2 size={32} className="text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Active This Week</p>
                  <p className="text-3xl font-bold text-primary">{activitySummary.activeThisWeek}</p>
                </div>
                <Clock size={32} className="text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Suspended</p>
                  <p className="text-3xl font-bold text-red-600">{statusBreakdown?.suspended || 0}</p>
                </div>
                <AlertCircle size={32} className="text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="all-users">All Users</TabsTrigger>
          <TabsTrigger value="login-history">Login History</TabsTrigger>
          <TabsTrigger value="usage">Usage Metrics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Users by Plan */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Users by Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getChartDataForUsersByPlan(usersPerPlan)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getChartDataForUsersByPlan(usersPerPlan).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* User Status Distribution */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle>User Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getChartDataForUserStatus(statusBreakdown)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getChartDataForUserStatus(statusBreakdown).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Daily Login Trend */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Login Activity - Last 30 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="logins" stroke="#3b82f6" name="Total Logins" />
                  <Line type="monotone" dataKey="uniqueUsers" stroke="#10b981" name="Unique Users" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Status Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Active Users</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-green-600">{statusBreakdown?.active}</p>
                <p className="text-sm text-slate-600 mt-2">
                  {((statusBreakdown?.active / statusBreakdown?.total) * 100).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Trial Users</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-yellow-600">{statusBreakdown?.trial}</p>
                <p className="text-sm text-slate-600 mt-2">
                  {((statusBreakdown?.trial / statusBreakdown?.total) * 100).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Suspended Users</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-red-600">{statusBreakdown?.suspended}</p>
                <p className="text-sm text-slate-600 mt-2">
                  {((statusBreakdown?.suspended / statusBreakdown?.total) * 100).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* All Users Tab */}
        <TabsContent value="all-users" className="space-y-6">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Search Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3">
                <Search size={20} className="text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by name, email, or company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none outline-none py-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Users Table */}
          <Card className="bg-white border-0 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">User</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Company</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Plan</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Status</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Last Login</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900">{user.name}</p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{user.company}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <select
                            value={planChanges[user.id] || user.plan || 'free'}
                            onChange={(e) => setPlanChanges((prev) => ({ ...prev, [user.id]: e.target.value }))}
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                          >
                            {PLAN_OPTIONS.map((plan) => (
                              <option key={plan.value} value={plan.value}>
                                {plan.label}
                              </option>
                            ))}
                          </select>

                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleChangePlan(user.id, planChanges[user.id] || user.plan || 'free')}
                            disabled={planUpdatingId === user.id}
                          >
                            {planUpdatingId === user.id ? 'Saving...' : 'Save'}
                          </Button>
                        </div>
                        <div className="mt-1">
                          <Badge className={getPlanColor(user.plan)}>
                            {getPlanLabel(user.plan)}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={getStatusColor(user.status)}>
                          {getStatusLabel(user.status)}
                        </Badge>
                        {isTrialExpiringSoon(user.trialEndsAt) && (
                          <div className="text-xs text-red-600 mt-1">
                            Trial expires in {getDaysUntilTrialExpiry(user.trialEndsAt)} days
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatRelativeTime(user.lastLogin)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {user.status === 'active' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSuspendUser(user.id)}
                              title="Suspend user"
                              className="text-red-600 hover:bg-red-50"
                            >
                              <Lock size={16} />
                            </Button>
                          ) : user.status === 'suspended' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReactivateUser(user.id)}
                              title="Reactivate user"
                              className="text-green-600 hover:bg-green-50"
                            >
                              <Unlock size={16} />
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleResetPassword(user.id)}
                            title="Reset password"
                            className="text-primary hover:bg-primary/10"
                          >
                            <RotateCcw size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredUsers.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                No users found matching your search
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Login History Tab */}
        <TabsContent value="login-history" className="space-y-6">
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Search Login History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3">
                <Search size={20} className="text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by email or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none outline-none py-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Login Timeline */}
          <div className="space-y-4">
            {filteredLoginHistory.slice(0, 50).map((entry) => (
              <Card key={entry.id} className="bg-white border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-10 h-10 bg-primary/15 rounded-full flex items-center justify-center">
                        <Users size={20} className="text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{entry.userEmail}</p>
                        <p className="text-sm text-slate-600">{entry.browser} from {entry.location}</p>
                        <p className="text-xs text-slate-500 mt-1">IP: {entry.ipAddress}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">
                        {formatDate(entry.timestamp)}
                      </p>
                      <Badge className="mt-2 bg-green-100 text-green-800">
                        Login
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredLoginHistory.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No login history found
            </div>
          )}
        </TabsContent>

        {/* Usage Metrics Tab */}
        <TabsContent value="usage" className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            {filteredUsers.map((user) => {
              const limits = userUsageLimits[user.id];
              if (!limits) return null;

              return (
                <Card key={user.id} className="bg-white border-0 shadow-sm">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{user.name}</CardTitle>
                        <p className="text-sm text-slate-600">{user.email}</p>
                      </div>
                      <Badge className={getStatusColor(user.status)}>
                        {getStatusLabel(user.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Clients */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-700">Clients</p>
                        <p className="text-sm text-slate-600">
                          {limits.usage.clients} {limits.limits.clients > 0 ? `/ ${limits.limits.clients}` : '/ Unlimited'}
                        </p>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getUsageBarColor(limits.percentages.clients)}`}
                          style={{ width: `${Math.min(limits.percentages.clients, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Users */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-700">Team Members</p>
                        <p className="text-sm text-slate-600">
                          {limits.usage.users} {limits.limits.users > 0 ? `/ ${limits.limits.users}` : '/ Unlimited'}
                        </p>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getUsageBarColor(limits.percentages.users)}`}
                          style={{ width: `${Math.min(limits.percentages.users, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Documents */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-700">Documents</p>
                        <p className="text-sm text-slate-600">
                          {limits.usage.documents} {limits.limits.documents > 0 ? `/ ${limits.limits.documents}` : '/ Unlimited'}
                        </p>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getUsageBarColor(limits.percentages.documents)}`}
                          style={{ width: `${Math.min(limits.percentages.documents, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Storage */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-700">Storage</p>
                        <p className="text-sm text-slate-600">
                          {limits.usage.storage}GB {limits.limits.storage > 0 ? `/ ${limits.limits.storage}GB` : '/ Unlimited'}
                        </p>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getUsageBarColor(limits.percentages.storage)}`}
                          style={{ width: `${Math.min(limits.percentages.storage, 100)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No users found matching your search
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
