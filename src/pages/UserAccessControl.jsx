import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, Settings, Users, Shield, CheckCircle, AlertCircle, TrendingUp, History } from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import { PLANS } from "@/data/planLimits";
import { logManualOverride, MANUAL_OVERRIDES_STORAGE_KEY } from "@/utils/overrideLogger";
import { logAdminAction } from "@/utils/auditLogger";

const STORAGE_KEY = "breakapi_users";

// Feature access matrix per plan
const FEATURE_ACCESS_MATRIX = {
  invoices: { free: true, starter: true, professional: true, enterprise: true },
  quotes: { free: true, starter: true, professional: true, enterprise: true },
  clients: { free: true, starter: true, professional: true, enterprise: true },
  recurring: { free: false, starter: true, professional: true, enterprise: true },
  cashflow: { free: false, starter: true, professional: true, enterprise: true },
  budgets: { free: false, starter: true, professional: true, enterprise: true },
  accounting: { free: false, starter: true, professional: true, enterprise: true },
  reports: { free: false, starter: true, professional: true, enterprise: true },
  payroll: { free: false, starter: false, professional: false, enterprise: true },
  banking: { free: true, starter: true, professional: true, enterprise: true },
  messages: { free: true, starter: true, professional: true, enterprise: true },
  notes: { free: true, starter: true, professional: true, enterprise: true },
};

const ALL_FEATURES = Object.keys(FEATURE_ACCESS_MATRIX);

const FEATURE_LABELS = {
  invoices: "Invoices",
  quotes: "Quotes",
  clients: "Clients",
  recurring: "Recurring Invoices",
  cashflow: "Cash Flow",
  budgets: "Budgets",
  accounting: "Accounting",
  reports: "Reports",
  payroll: "Payroll",
  banking: "Banking",
  messages: "Messages",
  notes: "Notes",
};

const FEATURE_DESCRIPTIONS = {
  invoices: "Create and manage invoices",
  quotes: "Create and manage quotes",
  clients: "Manage client information",
  recurring: "Set up recurring invoices (Starter+)",
  cashflow: "View cash flow analytics (Subscriber+)",
  budgets: "Create and track budgets (Subscriber+)",
  accounting: "Access accounting dashboard (Subscriber+)",
  reports: "Generate financial reports (Subscriber+)",
  payroll: "Manage payroll and payslips (Enterprise)",
  banking: "Banking integration and details",
  messages: "Send and receive messages",
  notes: "Create and manage notes",
};

function FeatureAccessTab() {
  const [users, setUsers] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);

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

  const userAccessSummary = useMemo(() => {
    return users.map(user => {
      const userPlan = user.plan || "free";
      const accessibleFeatures = ALL_FEATURES.filter(feature => 
        FEATURE_ACCESS_MATRIX[feature][userPlan]
      );
      
      return {
        ...user,
        userPlan,
        accessibleFeatures,
        accessibleCount: accessibleFeatures.length,
        totalFeatures: ALL_FEATURES.length
      };
    });
  }, [users]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="border-b">
        <CardTitle>Feature Access Per Plan</CardTitle>
        <p className="text-sm text-slate-600 mt-2">
          View which features are available for each user based on their subscription plan.
        </p>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Feature Availability Matrix */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-4">Feature Availability by Plan</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-100">
                    <TableHead className="font-semibold">Feature</TableHead>
                    <TableHead className="text-center font-semibold">Free</TableHead>
                    <TableHead className="text-center font-semibold">Starter</TableHead>
                    <TableHead className="text-center font-semibold">Professional</TableHead>
                    <TableHead className="text-center font-semibold">Enterprise</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ALL_FEATURES.map(feature => (
                    <TableRow key={feature}>
                      <TableCell className="font-medium">
                        <div>
                          <p className="text-slate-900">{FEATURE_LABELS[feature]}</p>
                          <p className="text-xs text-slate-500 mt-1">{FEATURE_DESCRIPTIONS[feature]}</p>
                        </div>
                      </TableCell>
                      {['free', 'starter', 'professional', 'enterprise'].map(plan => (
                        <TableCell key={plan} className="text-center">
                          {FEATURE_ACCESS_MATRIX[feature][plan] ? (
                            <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                          ) : (
                            <Lock className="w-5 h-5 text-slate-300 mx-auto" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* User Feature Access */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-4">User Feature Access</h3>
            <div className="space-y-3">
              {userAccessSummary.map(user => (
                <div key={user.id} className="border border-slate-200 rounded-lg p-4">
                  <div 
                    className="flex items-center justify-between cursor-pointer hover:bg-slate-50 p-2 -m-2 rounded"
                    onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{user.full_name}</p>
                        <p className="text-sm text-slate-600">{user.email}</p>
                      </div>
                      <Badge variant="secondary">{PLANS[user.userPlan]?.name || "Free"}</Badge>
                      <Badge variant="outline">
                        {user.status === "active" ? (
                          <span className="text-green-700">Active</span>
                        ) : (
                          <span className="text-red-700">Disabled</span>
                        )}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {user.accessibleCount}/{user.totalFeatures}
                      </p>
                      <p className="text-xs text-slate-600">Features</p>
                    </div>
                  </div>

                  {expandedUser === user.id && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {ALL_FEATURES.map(feature => {
                          const hasAccess = FEATURE_ACCESS_MATRIX[feature][user.userPlan];
                          return (
                            <div 
                              key={feature}
                              className={`p-3 rounded-lg border flex items-center gap-2 ${
                                hasAccess 
                                  ? 'bg-green-50 border-green-200' 
                                  : 'bg-slate-50 border-slate-200 opacity-60'
                              }`}
                            >
                              {hasAccess ? (
                                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                              ) : (
                                <Lock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              )}
                              <span className="text-sm font-medium text-slate-900">
                                {FEATURE_LABELS[feature]}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {userAccessSummary.length === 0 && (
                <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600">No users to display</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountSuspensionTab() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [suspensionLogs, setSuspensionLogs] = useState([]);

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

    const loadLogs = () => {
      try {
        const stored = localStorage.getItem("suspension_logs");
        if (stored) {
          setSuspensionLogs(JSON.parse(stored));
        }
      } catch {
        setSuspensionLogs([]);
      }
    };

    loadUsers();
    loadLogs();
  }, []);

  const toggleAccountStatus = (userId) => {
    const userToToggle = users.find(u => u.id === userId);
    if (!userToToggle) return;

    // Update user status immediately
    const updatedUsers = users.map(u => 
      u.id === userId 
        ? { ...u, status: u.status === "active" ? "disabled" : "active" }
        : u
    );

    setUsers(updatedUsers);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUsers));

    // Log the suspension/reactivation
    const newLog = {
      id: crypto.randomUUID(),
      userId: userId,
      userName: userToToggle.full_name,
      userEmail: userToToggle.email,
      action: userToToggle.status === "active" ? "suspended" : "reactivated",
      timestamp: new Date().toISOString(),
      performedBy: currentUser?.full_name || "Admin"
    };

    const updatedLogs = [newLog, ...suspensionLogs];
    setSuspensionLogs(updatedLogs);
    localStorage.setItem("suspension_logs", JSON.stringify(updatedLogs));

    // Log as manual override
    logManualOverride({
      type: "ACCOUNT_SUSPENSION",
      action: userToToggle.status === "active" ? "Account Suspended" : "Account Reactivated",
      userId: userId,
      userName: userToToggle.full_name,
      userEmail: userToToggle.email,
      details: {
        oldStatus: userToToggle.status,
        newStatus: userToToggle.status === "active" ? "disabled" : "active"
      },
      performedBy: currentUser?.full_name || "Admin",
      performedByEmail: currentUser?.email || "admin@system"
    });

    // Log as admin action in audit trail
    logAdminAction(
      userToToggle.status === "active" ? "Account Suspended" : "Account Reactivated",
      "User",
      userId,
      userToToggle.full_name,
      `User account ${userToToggle.status === "active" ? "suspended" : "reactivated"}`,
      currentUser?.id || "admin",
      currentUser?.full_name || "Admin",
      {
        userEmail: userToToggle.email,
        oldStatus: userToToggle.status,
        newStatus: userToToggle.status === "active" ? "disabled" : "active"
      }
    );

    // Trigger immediate effect
    window.dispatchEvent(new CustomEvent("userStatusChanged", { 
      detail: { userId, newStatus: updatedUsers.find(u => u.id === userId)?.status }
    }));
  };

  const getRecentSuspensions = () => {
    return suspensionLogs.slice(0, 10);
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b">
          <CardTitle>Account Status Management</CardTitle>
          <p className="text-sm text-slate-600 mt-2">
            Instantly suspend or reactivate user accounts. Changes take effect immediately.
          </p>
        </CardHeader>
        <CardContent className="p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Current Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id} className={user.status === "disabled" ? "opacity-60 bg-red-50" : ""}>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{PLANS[user.plan || "free"]?.name || "Free"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === "active" ? "default" : "destructive"}>
                        {user.status === "active" ? (
                          <>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Active
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3 mr-1" />
                            Suspended
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={user.status === "active" ? "outline" : "default"}
                        onClick={() => toggleAccountStatus(user.id)}
                        className={user.status === "active" ? "text-red-600 hover:bg-red-50" : ""}
                      >
                        {user.status === "active" ? (
                          <>
                            <Lock className="w-4 h-4 mr-2" />
                            Suspend
                          </>
                        ) : (
                          <>
                            <Unlock className="w-4 h-4 mr-2" />
                            Reactivate
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No users to manage</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instant Effect Indicator */}
      <Card className="border-green-200 bg-green-50 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <CardTitle className="text-green-900">Instant Effect</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-green-800">
          All account suspensions and reactivations take effect immediately. Suspended users:
          <ul className="mt-2 ml-4 list-disc space-y-1">
            <li>Cannot access any features or data</li>
            <li>Cannot log in to the platform</li>
            <li>Sessions are terminated immediately</li>
            <li>Can be reactivated at any time</li>
          </ul>
        </CardContent>
      </Card>

      {/* Suspension Activity Log */}
      {getRecentSuspensions().length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="border-b">
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {getRecentSuspensions().map(log => (
                <div key={log.id} className="flex items-start gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  {log.action === "suspended" ? (
                    <Lock className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Unlock className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">
                      {log.action === "suspended" ? "Account Suspended" : "Account Reactivated"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {log.userName} ({log.userEmail})
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      By {log.performedBy} at {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={log.action === "suspended" ? "destructive" : "default"}>
                    {log.action === "suspended" ? "Suspended" : "Reactivated"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsageLimitsTab() {
  const [users, setUsers] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [allQuotes, setAllQuotes] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    const loadUsers = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const loadedUsers = JSON.parse(stored);
          setUsers(loadedUsers);
          if (loadedUsers.length > 0) {
            setSelectedUser(loadedUsers[0]);
          }
        }
      } catch {
        // ignore
      }
    };

    const loadInvoices = () => {
      try {
        const stored = localStorage.getItem("breakapi_invoices");
        if (stored) {
          setAllInvoices(JSON.parse(stored));
        }
      } catch {
        setAllInvoices([]);
      }
    };

    const loadQuotes = () => {
      try {
        const stored = localStorage.getItem("breakapi_quotes");
        if (stored) {
          setAllQuotes(JSON.parse(stored));
        }
      } catch {
        setAllQuotes([]);
      }
    };

    loadUsers();
    loadInvoices();
    loadQuotes();
  }, []);

  const getUserUsageStats = useMemo(() => {
    if (!selectedUser) return null;

    const userInvoices = allInvoices.filter(i => i.user_id === selectedUser.id);
    const userQuotes = allQuotes.filter(q => q.user_id === selectedUser.id);
    const plan = PLANS[selectedUser.plan || "free"];

    return {
      invoicesCreated: userInvoices.length,
      invoiceLimit: plan?.invoices_limit || "Unlimited",
      invoicesPercentage: plan?.invoices_limit ? (userInvoices.length / plan.invoices_limit) * 100 : 0,
      
      quotesCreated: userQuotes.length,
      quoteLimit: plan?.quotes_limit || "Unlimited",
      quotesPercentage: plan?.quotes_limit ? (userQuotes.length / plan.quotes_limit) * 100 : 0,
      
      teamMembers: plan?.users || "Unlimited",
      storage: plan?.storage || "Unlimited",
      
      plan: plan?.name,
      nextUpgrade: plan?.nextTierName
    };
  }, [selectedUser, allInvoices, allQuotes]);

  const getUsageColor = (percentage) => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 75) return "bg-yellow-500";
    if (percentage >= 50) return "bg-primary/100";
    return "bg-green-500";
  };

  return (
    <div className="space-y-6">
      {/* User Selection */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b">
          <CardTitle>Select User</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-2">
            {users.map(user => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className={`p-4 text-left rounded-lg border-2 transition-all ${
                  selectedUser?.id === user.id
                    ? "border-primary bg-primary/10"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{user.full_name}</p>
                    <p className="text-sm text-slate-600">{user.email}</p>
                  </div>
                  <Badge variant="secondary">{PLANS[user.plan || "free"]?.name}</Badge>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedUser && getUserUsageStats && (
        <>
          {/* Usage Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Invoices Usage */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Invoices
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-3xl font-bold text-slate-900">
                    {getUserUsageStats.invoicesCreated}
                  </div>
                  <div className="text-sm text-slate-600">
                    {typeof getUserUsageStats.invoiceLimit === "number"
                      ? `of ${getUserUsageStats.invoiceLimit} limit`
                      : "Unlimited"}
                  </div>
                  {typeof getUserUsageStats.invoiceLimit === "number" && (
                    <div className="space-y-1">
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getUsageColor(
                            getUserUsageStats.invoicesPercentage
                          )}`}
                          style={{ width: `${Math.min(getUserUsageStats.invoicesPercentage, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        {getUserUsageStats.invoicesPercentage.toFixed(0)}% used
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quotes Usage */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Quotes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-3xl font-bold text-slate-900">
                    {getUserUsageStats.quotesCreated}
                  </div>
                  <div className="text-sm text-slate-600">
                    {typeof getUserUsageStats.quoteLimit === "number"
                      ? `of ${getUserUsageStats.quoteLimit} limit`
                      : "Unlimited"}
                  </div>
                  {typeof getUserUsageStats.quoteLimit === "number" && (
                    <div className="space-y-1">
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getUsageColor(
                            getUserUsageStats.quotesPercentage
                          )}`}
                          style={{ width: `${Math.min(getUserUsageStats.quotesPercentage, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        {getUserUsageStats.quotesPercentage.toFixed(0)}% used
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Team Members */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Team Size
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-3xl font-bold text-slate-900">
                    {typeof getUserUsageStats.teamMembers === "number"
                      ? getUserUsageStats.teamMembers
                      : "∞"}
                  </div>
                  <div className="text-sm text-slate-600">
                    {typeof getUserUsageStats.teamMembers === "number"
                      ? `${getUserUsageStats.teamMembers} member${getUserUsageStats.teamMembers !== 1 ? "s" : ""}`
                      : "Unlimited members"}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Storage */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Storage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-3xl font-bold text-slate-900">
                    {typeof getUserUsageStats.storage === "string"
                      ? getUserUsageStats.storage
                      : `${getUserUsageStats.storage}GB`}
                  </div>
                  <div className="text-sm text-slate-600">per month</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Usage Warnings */}
          {(getUserUsageStats.invoicesPercentage >= 75 || getUserUsageStats.quotesPercentage >= 75) && (
            <Card className="border-yellow-200 bg-yellow-50 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <CardTitle className="text-yellow-900">Usage Alert</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-yellow-800">
                <p className="mb-2">This user is approaching their usage limits:</p>
                <ul className="ml-4 space-y-1 list-disc">
                  {getUserUsageStats.invoicesPercentage >= 75 && (
                    <li>Invoices: {getUserUsageStats.invoicesCreated} of {getUserUsageStats.invoiceLimit}</li>
                  )}
                  {getUserUsageStats.quotesPercentage >= 75 && (
                    <li>Quotes: {getUserUsageStats.quotesCreated} of {getUserUsageStats.quoteLimit}</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Plan Information */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="border-b">
              <CardTitle>Current Plan Details</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    {getUserUsageStats.plan}
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Invoices limit:</span>
                      <span className="font-medium">
                        {typeof getUserUsageStats.invoiceLimit === "number"
                          ? getUserUsageStats.invoiceLimit
                          : "Unlimited"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Quotes limit:</span>
                      <span className="font-medium">
                        {typeof getUserUsageStats.quoteLimit === "number"
                          ? getUserUsageStats.quoteLimit
                          : "Unlimited"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Team members:</span>
                      <span className="font-medium">
                        {typeof getUserUsageStats.teamMembers === "number"
                          ? getUserUsageStats.teamMembers
                          : "Unlimited"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Storage:</span>
                      <span className="font-medium">
                        {typeof getUserUsageStats.storage === "string"
                          ? getUserUsageStats.storage
                          : `${getUserUsageStats.storage}GB`}
                      </span>
                    </div>
                  </div>
                </div>

                {getUserUsageStats.nextUpgrade && (
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                    <h4 className="font-semibold text-foreground mb-3">Next Upgrade: {getUserUsageStats.nextUpgrade}</h4>
                    <p className="text-sm text-primary mb-3">
                      Upgrade this user to get more features and higher limits.
                    </p>
                    <Button
                      size="sm"
                      className="w-full bg-primary hover:bg-primary/90"
                      onClick={() => {
                        // This would link to Admin Control > Change User Plan
                        window.location.href = "/admin-control";
                      }}
                    >
                      Change Plan
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!selectedUser && users.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No users available</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ManualOverridesLogTab() {
  const [overrideLogs, setOverrideLogs] = useState([]);
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const loadLogs = () => {
      try {
        const stored = localStorage.getItem(MANUAL_OVERRIDES_STORAGE_KEY);
        if (stored) {
          setOverrideLogs(JSON.parse(stored));
        }
      } catch {
        setOverrideLogs([]);
      }
    };

    loadLogs();

    // Listen for new override logs
    const handleNewOverride = () => {
      loadLogs();
    };

    window.addEventListener("manualOverrideLogged", handleNewOverride);
    return () => window.removeEventListener("manualOverrideLogged", handleNewOverride);
  }, []);

  const filteredLogs = useMemo(() => {
    return overrideLogs.filter(log => {
      const matchesType = filterType === "all" || log.type === filterType;
      const matchesSearch =
        log.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.performedBy?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action?.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesType && matchesSearch;
    });
  }, [overrideLogs, filterType, searchTerm]);

  const getOverrideTypeIcon = (type) => {
    switch (type) {
      case "ACCOUNT_SUSPENSION":
        return <Lock className="w-4 h-4" />;
      case "PLAN_CHANGE":
        return <TrendingUp className="w-4 h-4" />;
      case "FEATURE_OVERRIDE":
        return <Settings className="w-4 h-4" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };

  const getOverrideTypeBadgeColor = (type) => {
    switch (type) {
      case "ACCOUNT_SUSPENSION":
        return "bg-red-100 text-red-800";
      case "PLAN_CHANGE":
        return "bg-primary/15 text-primary";
      case "FEATURE_OVERRIDE":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getOverrideTypeLabel = (type) => {
    switch (type) {
      case "ACCOUNT_SUSPENSION":
        return "Account Suspension";
      case "PLAN_CHANGE":
        return "Plan Change";
      case "FEATURE_OVERRIDE":
        return "Feature Override";
      default:
        return type;
    }
  };

  const overrideStats = useMemo(() => {
    return {
      total: overrideLogs.length,
      suspensions: overrideLogs.filter(l => l.type === "ACCOUNT_SUSPENSION").length,
      planChanges: overrideLogs.filter(l => l.type === "PLAN_CHANGE").length,
      featureOverrides: overrideLogs.filter(l => l.type === "FEATURE_OVERRIDE").length,
      lastOverride: overrideLogs.length > 0 ? overrideLogs[0].timestamp : null
    };
  }, [overrideLogs]);

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total Overrides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{overrideStats.total}</div>
            {overrideStats.lastOverride && (
              <p className="text-xs text-slate-500 mt-2">
                Latest: {new Date(overrideStats.lastOverride).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Account Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{overrideStats.suspensions}</div>
            <p className="text-xs text-slate-500 mt-2">suspensions/reactivations</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Plan Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{overrideStats.planChanges}</div>
            <p className="text-xs text-slate-500 mt-2">plan upgrades/downgrades</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Feature Overrides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{overrideStats.featureOverrides}</div>
            <p className="text-xs text-slate-500 mt-2">manual feature access changes</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b">
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Types</option>
                <option value="ACCOUNT_SUSPENSION">Account Suspension</option>
                <option value="PLAN_CHANGE">Plan Change</option>
                <option value="FEATURE_OVERRIDE">Feature Override</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Search</label>
              <input
                type="text"
                placeholder="Search by user, email, or admin..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Override Logs Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="border-b">
          <CardTitle>Manual Override Log</CardTitle>
          <p className="text-sm text-slate-600 mt-2">
            Comprehensive audit trail of all manual admin actions and overrides.
          </p>
        </CardHeader>
        <CardContent className="p-6">
          {filteredLogs.length > 0 ? (
            <div className="space-y-4">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">{getOverrideTypeIcon(log.type)}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold text-slate-900">{log.action}</h4>
                          <Badge className={`text-xs ${getOverrideTypeBadgeColor(log.type)}`}>
                            {getOverrideTypeLabel(log.type)}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-slate-500">Affected User</p>
                            <p className="font-medium text-slate-900">{log.userName}</p>
                            <p className="text-slate-600">{log.userEmail}</p>
                          </div>

                          <div>
                            <p className="text-slate-500">Performed By</p>
                            <p className="font-medium text-slate-900">{log.performedBy}</p>
                            <p className="text-slate-600">{log.performedByEmail}</p>
                          </div>
                        </div>

                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="mt-3 p-3 bg-slate-100 rounded border border-slate-200">
                            <p className="text-xs font-semibold text-slate-700 mb-2">Details:</p>
                            <div className="text-sm space-y-1">
                              {Object.entries(log.details).map(([key, value]) => (
                                <div key={key} className="flex justify-between">
                                  <span className="text-slate-600 capitalize">
                                    {key.replace(/([A-Z])/g, " $1").trim()}:
                                  </span>
                                  <span className="font-medium text-slate-900">
                                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-slate-500 mt-3">
                          {new Date(log.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
              <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600">No overrides found</p>
              {searchTerm && (
                <p className="text-sm text-slate-500 mt-2">Try adjusting your search criteria</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Note */}
      <Card className="border-slate-200 bg-primary/10 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle className="text-foreground">Audit & Compliance</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-primary">
          All manual overrides are automatically logged and timestamped. This audit trail helps:
          <ul className="mt-2 ml-4 list-disc space-y-1">
            <li>Track admin actions for compliance requirements</li>
            <li>Investigate issues and account changes</li>
            <li>Monitor unauthorized or suspicious activity</li>
            <li>Maintain accountability for administrative decisions</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function UserAccessControl() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold text-slate-900">User & Access Control</h1>
          </div>
          <p className="text-slate-600">Manage user access levels, feature availability, and account suspension.</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="features" className="w-full">
          <TabsList className="grid w-full grid-cols-4 gap-2 mb-6">
            <TabsTrigger value="features" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Feature Access
            </TabsTrigger>
            <TabsTrigger value="suspension" className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Account Suspension
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Usage Limits
            </TabsTrigger>
            <TabsTrigger value="overrides" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Manual Overrides
            </TabsTrigger>
          </TabsList>

          <TabsContent value="features">
            <FeatureAccessTab />
          </TabsContent>

          <TabsContent value="suspension">
            <AccountSuspensionTab />
          </TabsContent>

          <TabsContent value="usage">
            <UsageLimitsTab />
          </TabsContent>

          <TabsContent value="overrides">
            <ManualOverridesLogTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
