import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Users, Shield, MoreVertical, Search, Download, Mail, 
  CheckCircle, Lock, Eye, Edit, Trash2, TrendingUp, FileText, Zap, Check, LifeBuoy, Key
} from "lucide-react";
import { PLANS } from "@/data/planLimits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { logAdminAction } from "@/utils/auditLogger";
import { useAuth } from "@/components/auth/AuthContext";
import { getEnrichedUsers, getPlatformStatistics } from "@/utils/adminDataAggregator";
import { subscribeToAdminDataChanges } from "@/services/AdminCommonService";

const STORAGE_KEY = "breakapi_users";

// View All Users Sub-Component
function ViewAllUsersSection() {
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [sortBy, setSortBy] = useState("created");
  const [selectedUsers, setSelectedUsers] = useState([]);

  useEffect(() => {
    const loadUsers = () => {
      try {
        // Load enriched users with their statistics
        const enrichedUsers = getEnrichedUsers();
        console.log('📊 Loaded enriched users:', enrichedUsers);
        setUsers(enrichedUsers);
      } catch (error) {
        console.error('Error loading users:', error);
      }
    };
    loadUsers();

    // Subscribe to data changes from other admin pages
    const unsubscribe = subscribeToAdminDataChanges((data) => {
      console.log('🔄 AdminControl: Data changed, reloading users', data);
      loadUsers();
    });

    return () => unsubscribe();
  }, []);

  // Filtering logic
  const filteredUsers = useMemo(() => {
    let result = [...users];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(u =>
        u.full_name?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query)
      );
    }

    // Role filter
    if (filterRole !== "all") {
      result = result.filter(u => u.role === filterRole);
    }

    // Status filter
    if (filterStatus !== "all") {
      result = result.filter(u => u.status === filterStatus);
    }

    // Plan filter
    if (filterPlan !== "all") {
      result = result.filter(u => (u.plan || "free") === filterPlan);
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (a.full_name || "").localeCompare(b.full_name || "");
        case "email":
          return (a.email || "").localeCompare(b.email || "");
        case "plan":
          return (a.plan || "free").localeCompare(b.plan || "free");
        case "created":
        default:
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
    });

    return result;
  }, [users, searchQuery, filterRole, filterStatus, filterPlan, sortBy]);

  // Statistics
  const statistics = useMemo(() => {
    const platformStats = getPlatformStatistics();
    return {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.status === "active").length,
      disabledUsers: users.filter(u => u.status === "disabled" || u.status === "suspended").length,
      adminUsers: users.filter(u => u.role === "admin").length,
      byPlan: {
        free: users.filter(u => (u.plan || "free") === "free").length,
        basic: users.filter(u => u.plan === "basic").length,
        premium: users.filter(u => u.plan === "premium").length,
        enterprise: users.filter(u => u.plan === "enterprise").length
      },
      totalInvoices: platformStats.totalInvoices,
      totalClients: platformStats.totalClients,
      totalRevenue: platformStats.totalRevenue,
      paidRevenue: platformStats.paidRevenue,
      outstandingRevenue: platformStats.outstandingRevenue
    };
  }, [users]);

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleAllUsers = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(u => u.id));
    }
  };

  const exportUsersData = () => {
    const data = filteredUsers.map(u => ({
      Name: u.full_name,
      Email: u.email,
      Role: u.role,
      Plan: PLANS[u.plan || "free"]?.name || "Free",
      Status: u.status,
      Created: new Date(u.created_at).toLocaleDateString()
    }));

    const csv = [
      Object.keys(data[0]).join(","),
      ...data.map(row => Object.values(row).map(v => `"${v}"`).join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Total Users</p>
                <p className="text-2xl font-bold text-slate-900">{statistics.totalUsers}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600 opacity-30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Active Users</p>
                <p className="text-2xl font-bold text-slate-900">{statistics.activeUsers}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600 opacity-30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Disabled Users</p>
                <p className="text-2xl font-bold text-slate-900">{statistics.disabledUsers}</p>
              </div>
              <Lock className="w-8 h-8 text-red-600 opacity-30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Admin Users</p>
                <p className="text-2xl font-bold text-slate-900">{statistics.adminUsers}</p>
              </div>
              <Shield className="w-8 h-8 text-purple-600 opacity-30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Enterprise</p>
                <p className="text-2xl font-bold text-slate-900">{statistics.byPlan.enterprise}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-indigo-600 opacity-30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Data Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-teal-100 border-emerald-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Total Invoices</p>
                <p className="text-2xl font-bold text-slate-900">{statistics.totalInvoices || 0}</p>
                <p className="text-xs text-slate-500 mt-1">Across all users</p>
              </div>
              <FileText className="w-8 h-8 text-emerald-600 opacity-30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-cyan-50 to-sky-100 border-cyan-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Total Clients</p>
                <p className="text-2xl font-bold text-slate-900">{statistics.totalClients || 0}</p>
                <p className="text-xs text-slate-500 mt-1">Platform-wide</p>
              </div>
              <Users className="w-8 h-8 text-cyan-600 opacity-30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-yellow-100 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Total Revenue</p>
                <p className="text-2xl font-bold text-slate-900">R {(statistics.totalRevenue || 0).toFixed(2)}</p>
                <p className="text-xs text-slate-500 mt-1">All invoices</p>
              </div>
              <TrendingUp className="w-8 h-8 text-amber-600 opacity-30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-lime-50 to-green-100 border-lime-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">Paid Revenue</p>
                <p className="text-2xl font-bold text-slate-900">R {(statistics.paidRevenue || 0).toFixed(2)}</p>
                <p className="text-xs text-green-600 mt-1">✓ Collected</p>
              </div>
              <Check className="w-8 h-8 text-lime-600 opacity-30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="text-lg">Search & Filter Users</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Role Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Role</Label>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              {/* Plan Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Plan</Label>
                <select
                  value={filterPlan}
                  onChange={(e) => setFilterPlan(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="all">All Plans</option>
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              {/* Sort */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Sort By</Label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="created">Newest First</option>
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                  <option value="plan">Plan</option>
                </select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">All Users ({filteredUsers.length})</CardTitle>
            {selectedUsers.length > 0 && (
              <p className="text-sm text-slate-600 mt-1">{selectedUsers.length} selected</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={exportUsersData}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                      onChange={toggleAllUsers}
                      className="rounded border-slate-300"
                    />
                  </TableHead>
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Email</TableHead>
                  <TableHead className="font-semibold">Role</TableHead>
                  <TableHead className="font-semibold">Plan</TableHead>
                  <TableHead className="font-semibold">Invoices</TableHead>
                  <TableHead className="font-semibold">Clients</TableHead>
                  <TableHead className="font-semibold">Revenue</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Created</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-slate-500">
                      No users found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map(user => (
                    <TableRow
                      key={user.id}
                      className={`hover:bg-slate-50 ${
                        user.status === "disabled" ? "opacity-60" : ""
                      }`}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                          className="rounded border-slate-300"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        {user.full_name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <div className="flex items-center gap-2">
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.role === "admin" ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {user.role || "user"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {PLANS[user.plan || "free"]?.name || "Free"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium text-slate-700">
                          {user.statistics?.totalInvoices || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium text-slate-700">
                          {user.statistics?.totalClients || 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="font-medium text-green-700">
                            R {(user.statistics?.paidRevenue || 0).toFixed(2)}
                          </span>
                          {user.statistics?.outstandingRevenue > 0 && (
                            <span className="text-xs text-slate-500 block">
                              +R {(user.statistics?.outstandingRevenue || 0).toFixed(2)} pending
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.status === "active" ? "default" : "destructive"}
                          className="capitalize"
                        >
                          {user.status === "active" ? "Active" : "Suspended"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="font-semibold">
                              Actions
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="flex items-center gap-2">
                              <Eye className="w-4 h-4" />
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2">
                              <Edit className="w-4 h-4" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2">
                              <Mail className="w-4 h-4" />
                              Send Email
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="flex items-center gap-2 text-red-600 focus:bg-red-50 focus:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Plan Distribution */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="text-lg">Users by Plan</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Object.entries(statistics.byPlan).map(([plan, count]) => (
              <div
                key={plan}
                className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
              >
                <p className="text-sm font-medium text-slate-600 capitalize mb-2">{plan} Plan</p>
                <p className="text-3xl font-bold text-slate-900">{count}</p>
                <p className="text-xs text-slate-500 mt-2">
                  {((count / statistics.totalUsers) * 100).toFixed(1)}% of users
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// View User Invoices Sub-Component
function ViewUserInvoicesSection() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userInvoices, setUserInvoices] = useState([]);
  const [invoiceFilter, setInvoiceFilter] = useState("all");

  useEffect(() => {
    const loadUsers = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setUsers(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    };
    loadUsers();
  }, []);

  const handleUserSelect = (userId) => {
    setSelectedUserId(userId);
    // Load invoices for this user
    try {
      const stored = localStorage.getItem("breakapi_invoices");
      if (stored) {
        const invoices = JSON.parse(stored);
        const filtered = invoices.filter(inv => inv.client_id === userId || inv.user_id === userId);
        setUserInvoices(filtered);
      }
    } catch {
      setUserInvoices([]);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  const filteredInvoices = useMemo(() => {
    let result = [...userInvoices];
    if (invoiceFilter !== "all") {
      result = result.filter(inv => inv.status === invoiceFilter);
    }
    return result.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [userInvoices, invoiceFilter]);

  const invoiceStats = useMemo(() => {
    return {
      total: userInvoices.length,
      draft: userInvoices.filter(i => i.status === "draft").length,
      sent: userInvoices.filter(i => i.status === "sent").length,
      paid: userInvoices.filter(i => i.status === "paid").length,
      overdue: userInvoices.filter(i => i.status === "overdue").length
    };
  }, [userInvoices]);

  return (
    <div className="space-y-6">
      {/* User Selection */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="text-lg">Select User</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Label htmlFor="user-select" className="text-sm font-medium mb-2 block">
            Choose a user to view their invoices
          </Label>
          <select
            id="user-select"
            value={selectedUserId}
            onChange={(e) => handleUserSelect(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">-- Select a user --</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.full_name} ({user.email})
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {selectedUser && (
        <>
          {/* User Info */}
          <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 font-medium mb-1">Selected User</p>
                  <p className="text-xl font-bold text-slate-900">{selectedUser.full_name}</p>
                  <p className="text-sm text-slate-600">{selectedUser.email}</p>
                  <div className="flex gap-2 mt-3">
                    <Badge variant="secondary">{PLANS[selectedUser.plan || "free"]?.name || "Free"}</Badge>
                    <Badge variant={selectedUser.status === "active" ? "default" : "destructive"}>
                      {selectedUser.status === "active" ? "Active" : "Suspended"}
                    </Badge>
                  </div>
                </div>
                <FileText className="w-12 h-12 text-indigo-400 opacity-20" />
              </div>
            </CardContent>
          </Card>

          {/* Invoice Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 font-medium mb-1">Total Invoices</p>
                <p className="text-2xl font-bold text-slate-900">{invoiceStats.total}</p>
              </CardContent>
            </Card>
            <Card className="bg-yellow-50 border-yellow-200">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 font-medium mb-1">Draft</p>
                <p className="text-2xl font-bold text-slate-900">{invoiceStats.draft}</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 font-medium mb-1">Sent</p>
                <p className="text-2xl font-bold text-slate-900">{invoiceStats.sent}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 font-medium mb-1">Paid</p>
                <p className="text-2xl font-bold text-slate-900">{invoiceStats.paid}</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 font-medium mb-1">Overdue</p>
                <p className="text-2xl font-bold text-slate-900">{invoiceStats.overdue}</p>
              </CardContent>
            </Card>
          </div>

          {/* Invoice Filter */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="text-lg">Invoices ({filteredInvoices.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="mb-6">
                <Label className="text-sm font-medium mb-2 block">Filter by Status</Label>
                <select
                  value={invoiceFilter}
                  onChange={(e) => setInvoiceFilter(e.target.value)}
                  className="w-full md:w-48 px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>

              {filteredInvoices.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600">No invoices found for this user.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold">Invoice #</TableHead>
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="font-semibold">Amount</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Due Date</TableHead>
                        <TableHead className="text-right font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.map(invoice => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium text-slate-900">
                            {invoice.invoice_number || invoice.id?.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {new Date(invoice.created_at || invoice.date).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-medium text-slate-900">
                            {invoice.currency || "R"} {invoice.total?.toFixed(2) || "0.00"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              invoice.status === "paid" ? "default" :
                              invoice.status === "sent" ? "secondary" :
                              invoice.status === "overdue" ? "destructive" :
                              "outline"
                            }>
                              {invoice.status || "draft"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" className="text-indigo-600">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// Change User Plan Sub-Component
function ChangeUserPlanSection() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newPlan, setNewPlan] = useState("");
  const [changeHistory, setChangeHistory] = useState([]);

  useEffect(() => {
    const loadUsers = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setUsers(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    };

    const loadHistory = () => {
      try {
        const stored = localStorage.getItem("plan_change_history");
        if (stored) {
          setChangeHistory(JSON.parse(stored));
        }
      } catch {
        setChangeHistory([]);
      }
    };

    loadUsers();
    loadHistory();
  }, []);

  const selectedUser = users.find(u => u.id === selectedUserId);

  const handlePlanChange = () => {
    if (!selectedUser || !newPlan) return;

    const oldPlan = selectedUser.plan || "free";
    if (oldPlan === newPlan) {
      alert("User is already on this plan.");
      return;
    }

    // Update user
    const updatedUsers = users.map(u =>
      u.id === selectedUserId ? { ...u, plan: newPlan } : u
    );
    setUsers(updatedUsers);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUsers));

    // Add to history
    const historyEntry = {
      id: crypto.randomUUID(),
      userId: selectedUserId,
      userName: selectedUser.full_name,
      userEmail: selectedUser.email,
      oldPlan,
      newPlan,
      timestamp: new Date().toISOString(),
      reason: ""
    };

    const updatedHistory = [historyEntry, ...changeHistory];
    setChangeHistory(updatedHistory);
    localStorage.setItem("plan_change_history", JSON.stringify(updatedHistory));

    // Log admin action
    logAdminAction(
      "Plan Changed",
      "User",
      selectedUserId,
      selectedUser.full_name,
      `Changed user plan from ${PLANS[oldPlan]?.name} to ${PLANS[newPlan]?.name}`,
      currentUser?.id || 'admin',
      currentUser?.full_name || 'Admin',
      {
        userEmail: selectedUser.email,
        oldPlan: PLANS[oldPlan]?.name,
        newPlan: PLANS[newPlan]?.name
      }
    );

    // Reset form
    setSelectedUserId("");
    setNewPlan("");

    alert(`Successfully changed ${selectedUser.full_name} from ${PLANS[oldPlan]?.name} to ${PLANS[newPlan]?.name}`);
  };

  const recentChanges = changeHistory.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Plan Change Form */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="text-lg">Change User Plan</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-select-plan" className="text-sm font-medium">
              Select User
            </Label>
            <select
              id="user-select-plan"
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setNewPlan("");
              }}
              className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">-- Select a user --</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({PLANS[user.plan || "free"]?.name || "Free"})
                </option>
              ))}
            </select>
          </div>

          {selectedUser && (
            <>
              {/* Current Plan Info */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-600 font-medium mb-1">Current Plan</p>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold text-slate-900">
                    {PLANS[selectedUser.plan || "free"]?.name || "Free"}
                  </p>
                  <div className="text-xs text-slate-500">
                    {PLANS[selectedUser.plan || "free"]?.userLimit ? 
                      `${PLANS[selectedUser.plan || "free"].userLimit} users` : 
                      "Unlimited users"}
                  </div>
                </div>
              </div>

              {/* Plan Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select New Plan</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(PLANS).map(([key, plan]) => {
                    const isCurrent = key === (selectedUser.plan || "free");
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setNewPlan(key);
                        }}
                        className={`p-4 border-2 rounded-lg transition text-left ${
                          newPlan === key
                            ? "border-indigo-600 bg-indigo-50"
                            : isCurrent
                            ? "border-slate-300 bg-slate-50 opacity-50 cursor-not-allowed"
                            : "border-slate-300 hover:border-indigo-400"
                        }`}
                        disabled={isCurrent}
                      >
                        <p className="font-semibold text-slate-900 capitalize">{plan.name}</p>
                        <p className="text-xs text-slate-600 mt-1">
                          {plan.userLimit ? `${plan.userLimit} users` : "Unlimited users"}
                        </p>
                        {isCurrent && (
                          <p className="text-xs text-slate-500 mt-2 font-medium">
                            Current Plan
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {newPlan && newPlan !== (selectedUser.plan || "free") && (
                <>
                  {/* Confirmation */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900 font-medium mb-2">
                      ⚠️ Confirm Plan Change
                    </p>
                    <p className="text-sm text-blue-800">
                      Change <span className="font-semibold">{selectedUser.full_name}</span> from{" "}
                      <span className="font-semibold">{PLANS[selectedUser.plan || "free"]?.name}</span> to{" "}
                      <span className="font-semibold">{PLANS[newPlan]?.name}</span>?
                    </p>
                    <div className="flex gap-3 mt-4">
                      <Button
                        onClick={handlePlanChange}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Confirm Change
                      </Button>
                      <Button
                        onClick={() => {
                          setNewPlan("");
                        }}
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      {selectedUser && newPlan && newPlan !== (selectedUser.plan || "free") && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-lg">Plan Comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">Feature</TableHead>
                    <TableHead className="text-center font-semibold">
                      {PLANS[selectedUser.plan || "free"]?.name}
                    </TableHead>
                    <TableHead className="text-center font-semibold">
                      {PLANS[newPlan]?.name}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">User Limit</TableCell>
                    <TableCell className="text-center">
                      {PLANS[selectedUser.plan || "free"]?.userLimit || "∞"}
                    </TableCell>
                    <TableCell className="text-center">
                      {PLANS[newPlan]?.userLimit || "∞"}
                    </TableCell>
                  </TableRow>
                  {/* Add more features as needed */}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Change History */}
      {recentChanges.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-lg">Recent Plan Changes</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              {recentChanges.map(change => (
                <div key={change.id} className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{change.userName}</p>
                      <p className="text-sm text-slate-600">{change.userEmail}</p>
                      <p className="text-sm text-slate-600 mt-2">
                        <span className="font-medium">{PLANS[change.oldPlan]?.name}</span>
                        {" → "}
                        <span className="font-medium">{PLANS[change.newPlan]?.name}</span>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-500">
                        {new Date(change.timestamp).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(change.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


export default function AdminControl() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-slate-900">Admin Control</h1>
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
            </div>
          </div>
          <p className="text-slate-600">
            Internal power tools for managing your workspace, users, and system.
          </p>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-3 gap-2 mb-6">
            <TabsTrigger value="users" className="flex items-center gap-2 justify-start">
              <Users className="w-4 h-4" />
              View All Users
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2 justify-start">
              <FileText className="w-4 h-4" />
              View User Invoices
            </TabsTrigger>
            <TabsTrigger value="plans" className="flex items-center gap-2 justify-start">
              <Zap className="w-4 h-4" />
              Change User Plan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <ViewAllUsersSection />
          </TabsContent>

          <TabsContent value="invoices">
            <ViewUserInvoicesSection />
          </TabsContent>

          <TabsContent value="plans">
            <ChangeUserPlanSection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
