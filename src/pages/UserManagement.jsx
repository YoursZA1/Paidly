import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserPlus, Shield, Mail, AlertCircle, Eye, Ban, X, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { PLANS, getActiveUserCount, getRemainingUserSlots, isUserLimitReached, getUserPlan, getPlanOrder } from "@/data/planLimits";
import PlanSelector from "@/components/subscription/PlanSelector";
import CurrencySelector from "@/components/CurrencySelector";
import UserCurrencyService from "@/services/UserCurrencyService";
import AdminDataService from "@/services/AdminDataService";
import { syncAdminData } from "@/services/AdminSupabaseSyncService";
import { getAllUsersInvoices, getAllUsersQuotes } from "@/utils/adminDataAggregator";
import { updateUserRole } from "@/api/userManagement";
import { formatCurrency } from "@/utils/currencyCalculations";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";

const STORAGE_KEY = "breakapi_users";

const roleLabels = {
  admin: "Admin",
  user: "User"
};

const statusLabels = {
  active: "Active",
  disabled: "Disabled"
};

const badgeVariants = {
  admin: "default",
  user: "secondary"
};

const invoiceStatusLabels = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  paid: "Paid",
  partial_paid: "Partially paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  other: "Other",
  unknown: "Unknown"
};

const quoteStatusLabels = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  other: "Other",
  unknown: "Unknown"
};

const invoiceStatusStyles = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-primary/15 text-primary",
  viewed: "bg-primary/15 text-primary",
  paid: "bg-emerald-100 text-emerald-700",
  partial_paid: "bg-amber-100 text-amber-700",
  overdue: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-700",
  other: "bg-slate-100 text-slate-700",
  unknown: "bg-slate-100 text-slate-600"
};

const quoteStatusStyles = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-primary/15 text-primary",
  viewed: "bg-primary/15 text-primary",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  expired: "bg-amber-100 text-amber-700",
  other: "bg-slate-100 text-slate-700",
  unknown: "bg-slate-100 text-slate-600"
};

const formatStatusLabel = (value) => {
  if (!value) return "Unknown";
  return value
    .toString()
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const normalizeInvoiceStatus = (value) => {
  if (!value) return "unknown";
  const status = value.toString().toLowerCase();
  if (status === "partially_paid" || status === "partial") return "partial_paid";
  if (status === "canceled") return "cancelled";
  if (status in invoiceStatusLabels) return status;
  return "other";
};

const normalizeQuoteStatus = (value) => {
  if (!value) return "unknown";
  const status = value.toString().toLowerCase();
  if (status === "declined") return "rejected";
  if (status in quoteStatusLabels) return status;
  return "other";
};

const getInvoiceStatus = (inv) => (
  normalizeInvoiceStatus(inv?.status || inv?.invoice_status || inv?.payment_status || inv?.state)
);

const getQuoteStatus = (quote) => (
  normalizeQuoteStatus(quote?.status || quote?.quote_status || quote?.state)
);

const getInvoiceStatusLabel = (value) => invoiceStatusLabels[value] || formatStatusLabel(value);
const getQuoteStatusLabel = (value) => quoteStatusLabels[value] || formatStatusLabel(value);
const getInvoiceStatusStyle = (value) => invoiceStatusStyles[value] || invoiceStatusStyles.other;
const getQuoteStatusStyle = (value) => quoteStatusStyles[value] || quoteStatusStyles.other;

export default function UserManagement() {
  const { user: currentUser, sendUserInvite } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [allInvoices, setAllInvoices] = useState([]);
  const [allQuotes, setAllQuotes] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(() => getUserPlan(currentUser));
  const [form, setForm] = useState({
    id: null,
    full_name: "",
    email: "",
    role: "user",
    status: "active",
    plan: getUserPlan(currentUser),
    currency: 'ZAR'
  });
  const [error, setError] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    full_name: "",
    email: "",
    role: "user",
    plan: getUserPlan(currentUser),
    currency: 'ZAR'
  });
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccessMessage, setInviteSuccessMessage] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendError, setSuspendError] = useState("");
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [invoicePage, setInvoicePage] = useState(1);
  const [quotePage, setQuotePage] = useState(1);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("all");
  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteStatus, setQuoteStatus] = useState("all");
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const pageSize = 6;

  const loadUsersFromService = useCallback(() => {
    try {
      const fromService = AdminDataService.getAllUsers();
      if (fromService && fromService.length > 0) {
        setUsers(fromService);
        return;
      }
    } catch {
      // ignore
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUsers(JSON.parse(stored));
        return;
      }
    } catch {
      // ignore
    }
    if (currentUser?.email) {
      const adminId = currentUser.id || "1";
      const seed = [{
        id: adminId,
        full_name: currentUser.full_name || "Admin User",
        email: currentUser.email,
        role: currentUser.role || "admin",
        status: "active",
        isSystemAdmin: true,
        created_at: new Date().toISOString()
      }];
      setUsers(seed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      UserCurrencyService.setUserCurrency(adminId, "ZAR");
    }
  }, [currentUser]);

  useEffect(() => {
    loadUsersFromService();
  }, [loadUsersFromService]);

  const handleSyncFromSupabase = async () => {
    setSyncing(true);
    try {
      await syncAdminData();
      loadUsersFromService();
      setDataRefreshKey((k) => k + 1);
      toast({
        title: "Sync complete",
        description: "User list has been updated from Supabase.",
        variant: "default",
      });
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err?.message || "Could not sync users. Check your connection and admin access.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (currentUser?.plan) {
      setCurrentPlan(currentUser.plan);
    }
  }, [currentUser]);

  useEffect(() => {
    const handleRefresh = () => setDataRefreshKey((prev) => prev + 1);
    window.addEventListener("storage", handleRefresh);
    window.addEventListener("focus", handleRefresh);
    return () => {
      window.removeEventListener("storage", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, []);

  useEffect(() => {
    setAllInvoices(getAllUsersInvoices());
    setAllQuotes(getAllUsersQuotes());
  }, [dataRefreshKey]);

  const planKey = currentPlan || getUserPlan(currentUser);

  const userIdentifierMap = useMemo(() => {
    const map = new Map();
    users.forEach(u => {
      [u.id, u.supabase_id, u.auth_id, u.user_id].forEach(id => {
        if (id) {
          map.set(id, u.id);
        }
      });
    });
    return map;
  }, [users]);

  const invoiceByUser = useMemo(() => {
    const map = new Map();
    allInvoices.forEach(inv => {
      const key = inv.user_id || inv.created_by || inv.owner_id;
      const userId = userIdentifierMap.get(key);
      if (!userId) return;
      if (!map.has(userId)) map.set(userId, []);
      map.get(userId).push(inv);
    });
    return map;
  }, [allInvoices, userIdentifierMap]);

  const quoteByUser = useMemo(() => {
    const map = new Map();
    allQuotes.forEach(quote => {
      const key = quote.user_id || quote.created_by || quote.owner_id;
      const userId = userIdentifierMap.get(key);
      if (!userId) return;
      if (!map.has(userId)) map.set(userId, []);
      map.get(userId).push(quote);
    });
    return map;
  }, [allQuotes, userIdentifierMap]);

  const adminCount = useMemo(
    () => users.filter(u => u.role === "admin" && u.status === "active").length,
    [users]
  );

  const usersByPlan = useMemo(() => {
    const planOrder = getPlanOrder();
    const counts = users.reduce((acc, u) => {
      const plan = u.plan || planKey || "free";
      acc[plan] = (acc[plan] || 0) + 1;
      return acc;
    }, {});

    return planOrder.map((key) => ({
      plan: PLANS[key]?.name || key,
      key,
      users: counts[key] || 0
    }));
  }, [users, planKey]);

  const handlePlanChange = (newPlan) => {
    setCurrentPlan(newPlan);
    try {
      const stored = localStorage.getItem("breakapi_user");
      if (stored) {
        const userObj = JSON.parse(stored);
        userObj.plan = newPlan;
        localStorage.setItem("breakapi_user", JSON.stringify(userObj));
      }
    } catch {
      // ignore
    }
  };

  const resetForm = () => {
    setForm({ id: null, full_name: "", email: "", role: "user", status: "active", plan: planKey, currency: 'ZAR', isSystemAdmin: false });
    setError("");
  };

  const persistUsers = (next) => {
    setUsers(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!form.full_name.trim()) {
      setError("Full name is required.");
      return;
    }

    const emailLower = form.email.trim().toLowerCase();
    const duplicate = users.find(u => u.email.toLowerCase() === emailLower && u.id !== form.id);
    if (duplicate) {
      setError("A user with that email already exists.");
      return;
    }

    if (form.id) {
      const current = users.find(u => u.id === form.id);
      if (current?.role === "admin" && form.role !== "admin" && adminCount <= 1) {
        setError("You must keep at least one active admin.");
        return;
      }

      const supabaseId = current?.supabase_id || current?.auth_id || current?.id;
      if (supabaseId && form.role !== current?.role) {
        try {
          await updateUserRole(supabaseId, form.role);
        } catch (err) {
          toast({
            title: "Role updated locally",
            description: err?.message || "Could not update role in Supabase. Change saved locally.",
            variant: "destructive",
          });
        }
      }

      const next = users.map(u => {
        if (u.id === form.id) {
          UserCurrencyService.setUserCurrency(u.id, form.currency);
          return { ...u, full_name: form.full_name.trim(), email: emailLower, role: form.role, status: form.status, plan: form.plan };
        }
        return u;
      });
      persistUsers(next);
    } else {
      const userId = crypto.randomUUID();
      const nextUser = {
        id: userId,
        full_name: form.full_name.trim(),
        email: emailLower,
        role: form.role,
        status: form.status,
        plan: form.plan || planKey,
        created_at: new Date().toISOString()
      };
      UserCurrencyService.setUserCurrency(userId, form.currency);
      persistUsers([nextUser, ...users]);
    }

    resetForm();
  };

  const getLastActiveLabel = (u) => {
    const raw = u.last_active_at || u.last_login_at || u.updated_at || u.created_at;
    if (!raw) return "—";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString();
  };

  const openDrawer = (u) => {
    setSelectedUser(u);
    setIsDrawerOpen(true);
    setInvoicePage(1);
    setQuotePage(1);
    setInvoiceSearch("");
    setInvoiceStatus("all");
    setQuoteSearch("");
    setQuoteStatus("all");
    setDataRefreshKey((prev) => prev + 1);
  };

  const updateUser = (userId, updates) => {
    const next = users.map(u => (u.id === userId ? { ...u, ...updates } : u));
    persistUsers(next);
    const updated = next.find(u => u.id === userId);
    if (updated) setSelectedUser(updated);
  };

  const toggleSuspend = (u) => {
    if (u.isSystemAdmin) {
      setError("System admin cannot be suspended");
      return;
    }
    if (u.status === "disabled") {
      updateUser(u.id, { status: "active", suspension_reason: null, suspended_at: null });
      return;
    }
    setSuspendTarget(u);
    setSuspendReason("");
    setSuspendError("");
    setIsSuspendModalOpen(true);
  };

  const confirmSuspend = () => {
    if (!suspendTarget) return;
    const reason = suspendReason.trim();
    if (!reason) {
      setSuspendError("Suspend reason is required.");
      return;
    }
    updateUser(suspendTarget.id, {
      status: "disabled",
      suspension_reason: reason,
      suspended_at: new Date().toISOString()
    });
    setIsSuspendModalOpen(false);
    setSuspendTarget(null);
    setSuspendReason("");
    setSuspendError("");
  };

  const invoiceHistory = useMemo(() => {
    if (!selectedUser) return [];
    const list = invoiceByUser.get(selectedUser.id) || [];
    return [...list].sort((a, b) => new Date(b.created_date || b.created_at || 0) - new Date(a.created_date || a.created_at || 0));
  }, [selectedUser, invoiceByUser]);

  const quoteHistory = useMemo(() => {
    if (!selectedUser) return [];
    const list = quoteByUser.get(selectedUser.id) || [];
    return [...list].sort((a, b) => new Date(b.created_date || b.created_at || 0) - new Date(a.created_date || a.created_at || 0));
  }, [selectedUser, quoteByUser]);

  const invoiceStatusOptions = useMemo(() => {
    const set = new Set();
    invoiceHistory.forEach((inv) => set.add(getInvoiceStatus(inv)));
    const order = ["draft", "sent", "viewed", "paid", "partial_paid", "overdue", "cancelled", "other", "unknown"];
    return [
      "all",
      ...Array.from(set).sort((a, b) => {
        const aIndex = order.indexOf(a);
        const bIndex = order.indexOf(b);
        return (aIndex === -1 ? order.length : aIndex) - (bIndex === -1 ? order.length : bIndex);
      })
    ];
  }, [invoiceHistory]);

  const quoteStatusOptions = useMemo(() => {
    const set = new Set();
    quoteHistory.forEach((quote) => set.add(getQuoteStatus(quote)));
    const order = ["draft", "sent", "viewed", "accepted", "rejected", "expired", "other", "unknown"];
    return [
      "all",
      ...Array.from(set).sort((a, b) => {
        const aIndex = order.indexOf(a);
        const bIndex = order.indexOf(b);
        return (aIndex === -1 ? order.length : aIndex) - (bIndex === -1 ? order.length : bIndex);
      })
    ];
  }, [quoteHistory]);

  const filteredInvoiceHistory = useMemo(() => {
    const query = invoiceSearch.trim().toLowerCase();
    return invoiceHistory.filter((inv) => {
      const status = getInvoiceStatus(inv);
      if (invoiceStatus !== "all" && status !== invoiceStatus) return false;
      if (!query) return true;
      const haystack = [
        inv.invoice_number,
        inv.client_name,
        inv.customer_name,
        inv.company_name,
        inv.id,
        inv.total_amount
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [invoiceHistory, invoiceSearch, invoiceStatus]);

  const filteredQuoteHistory = useMemo(() => {
    const query = quoteSearch.trim().toLowerCase();
    return quoteHistory.filter((quote) => {
      const status = getQuoteStatus(quote);
      if (quoteStatus !== "all" && status !== quoteStatus) return false;
      if (!query) return true;
      const haystack = [
        quote.quote_number,
        quote.client_name,
        quote.customer_name,
        quote.company_name,
        quote.id,
        quote.total_amount
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [quoteHistory, quoteSearch, quoteStatus]);

  useEffect(() => {
    setInvoicePage(1);
  }, [invoiceSearch, invoiceStatus, selectedUser]);

  useEffect(() => {
    setQuotePage(1);
  }, [quoteSearch, quoteStatus, selectedUser]);

  const invoiceTotalPages = Math.max(1, Math.ceil(filteredInvoiceHistory.length / pageSize));
  const quoteTotalPages = Math.max(1, Math.ceil(filteredQuoteHistory.length / pageSize));

  const pagedInvoices = filteredInvoiceHistory.slice((invoicePage - 1) * pageSize, invoicePage * pageSize);
  const pagedQuotes = filteredQuoteHistory.slice((quotePage - 1) * pageSize, quotePage * pageSize);

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    setInviteError("");

    try {
      // Check plan limit
      if (isUserLimitReached(users, planKey)) {
        setInviteError(`You've reached the ${PLANS[planKey].userLimit} user limit for your ${PLANS[planKey].name} plan. Upgrade to add more users.`);
        return;
      }

      if (!inviteForm.full_name.trim()) {
        setInviteError("Full name is required");
        return;
      }

      if (!inviteForm.email.trim()) {
        setInviteError("Email is required");
        return;
      }

      // Check if email already exists
      const emailExists = users.some(u => u.email.toLowerCase() === inviteForm.email.toLowerCase());
      if (emailExists) {
        setInviteError("A user with that email already exists");
        return;
      }

      const message = await sendUserInvite(
        inviteForm.email.toLowerCase(),
        inviteForm.full_name.trim(),
        inviteForm.role,
        inviteForm.plan
      );

      setInviteSuccessMessage(message);
    } catch (err) {
      setInviteError(err?.message || "Failed to send invite");
    }
  };

  const resetInviteForm = () => {
    setInviteForm({ full_name: "", email: "", role: "user", plan: planKey });
    setInviteSuccessMessage("");
    setInviteError("");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Subscription & User Limits</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanSelector
              currentPlan={planKey}
              onPlanChange={handlePlanChange}
              activeUsers={getActiveUserCount(users)}
            />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Users by Subscription Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usersByPlan} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="plan" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="users" fill="#4f46e5" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="users" position="top" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        {/* Plan Info Banner */}
        {currentUser && (
          <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-semibold text-foreground">
                    {PLANS[planKey].name} Plan
                  </p>
                  <p className="text-sm text-primary">
                    {getActiveUserCount(users)} / {PLANS[planKey].userLimit === null ? "Unlimited" : PLANS[planKey].userLimit} users
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">
                  {getRemainingUserSlots(users, planKey) === Infinity
                    ? "Unlimited slots"
                    : `${getRemainingUserSlots(users, planKey)} slot${getRemainingUserSlots(users, planKey) === 1 ? "" : "s"} remaining`}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground font-display">User & role management</h1>
            <p className="text-sm text-slate-600">Create and manage user access for your workspace.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Shield className="w-4 h-4" />
              Admins: {adminCount}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleSyncFromSupabase}
              disabled={syncing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync from Supabase"}
            </Button>
            <Button
              onClick={() => setInviteModal(true)}
              disabled={isUserLimitReached(users, planKey)}
              className="bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              title={isUserLimitReached(users, planKey) ? "User limit reached for your plan" : ""}
            >
              <Mail className="w-4 h-4 mr-2" />
              Invite user
            </Button>
          </div>
        </div>

        {isUserLimitReached(users, planKey) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">User limit reached</p>
              <p className="text-sm text-red-700">
                You&apos;ve reached the {PLANS[planKey].userLimit} user limit for your {PLANS[planKey].name} plan. 
                Upgrade your plan to add more users.
              </p>
            </div>
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">{form.id ? "Edit user" : "Add user"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) => setForm(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Jane Doe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="jane@company.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(value) => setForm(prev => ({ ...prev, role: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm(prev => ({ ...prev, status: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!form.isSystemAdmin ? (
                <>
                  <div className="space-y-2">
                    <Label>Subscription plan</Label>
                    <Select value={form.plan} onValueChange={(value) => setForm(prev => ({ ...prev, plan: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(PLANS).map((key) => (
                          <SelectItem key={key} value={key}>
                            {PLANS[key].name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Default Currency</Label>
                    <CurrencySelector
                      id="currency"
                      value={form.currency || 'ZAR'}
                      onChange={(value) => setForm(prev => ({ ...prev, currency: value }))}
                    />
                  </div>
                </>
              ) : (
                <div className="md:col-span-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-sm font-medium text-foreground">System Admin</p>
                  <p className="text-xs text-primary mt-1">No payment plan • Currency: ZAR (R)</p>
                </div>
              )}

              {error && (
                <div className="md:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <div className="md:col-span-2 flex items-center gap-2">
                <Button type="submit" className="bg-primary hover:bg-primary/90">
                  <UserPlus className="w-4 h-4 mr-2" />
                  {form.id ? "Update user" : "Add user"}
                </Button>
                {form.id && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invoices Created</TableHead>
                    <TableHead>Quotes Created</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-slate-500 py-8">
                        No users yet. Add your first user above.
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          {!u.isSystemAdmin ? (
                            <Badge variant="secondary">
                              {PLANS[u.plan || planKey]?.name || (u.plan || "Free")}
                            </Badge>
                          ) : (
                            <span className="text-sm text-slate-500 italic">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.status === "active" ? "default" : "secondary"}>
                            {statusLabels[u.status] || u.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-600">
                            {(invoiceByUser.get(u.id) || []).length}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-600">
                            {(quoteByUser.get(u.id) || []).length}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-600">
                            {getLastActiveLabel(u)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openDrawer(u)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleSuspend(u)}
                              disabled={u.isSystemAdmin}
                            >
                              <Ban className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col h-full max-h-full p-0 gap-0 overflow-hidden">
          <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b bg-background">
            <SheetTitle>User Details</SheetTitle>
          </SheetHeader>
          {selectedUser && (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-6">
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDataRefreshKey((prev) => prev + 1)}
                >
                  Refresh history
                </Button>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">{selectedUser.full_name}</p>
                  <p className="text-sm text-slate-600">{selectedUser.email}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={badgeVariants[selectedUser.role] || "secondary"}>
                      {roleLabels[selectedUser.role] || selectedUser.role}
                    </Badge>
                    <Badge variant={selectedUser.status === "active" ? "default" : "secondary"}>
                      {statusLabels[selectedUser.status] || selectedUser.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Subscription Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-slate-600">Plan</p>
                  <Badge variant="secondary">
                    {PLANS[selectedUser.plan || planKey]?.name || (selectedUser.plan || "Free")}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Usage Stats</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Invoices</p>
                    <p className="text-lg font-semibold">{(invoiceByUser.get(selectedUser.id) || []).length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Quotes</p>
                    <p className="text-lg font-semibold">{(quoteByUser.get(selectedUser.id) || []).length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Last Active</p>
                    <p className="text-sm font-semibold">{getLastActiveLabel(selectedUser)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Invoice History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="flex flex-1 gap-2">
                      <Input
                        value={invoiceSearch}
                        onChange={(e) => setInvoiceSearch(e.target.value)}
                        placeholder="Search by invoice, client, or amount"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setInvoiceSearch("")}
                        disabled={!invoiceSearch.trim()}
                      >
                        Clear
                      </Button>
                    </div>
                    <Select value={invoiceStatus} onValueChange={setInvoiceStatus}>
                      <SelectTrigger className="sm:w-48">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        {invoiceStatusOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option === "all" ? "All statuses" : getInvoiceStatusLabel(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInvoiceSearch("");
                        setInvoiceStatus("all");
                      }}
                      disabled={!invoiceSearch.trim() && invoiceStatus === "all"}
                    >
                      Reset filters
                    </Button>
                  </div>
                  {(invoiceSearch.trim() || invoiceStatus !== "all") && (
                    <div className="flex flex-wrap gap-2">
                      {invoiceSearch.trim() && invoiceStatus !== "all" && (
                        <Badge className="bg-slate-100 text-slate-700">
                          Clear all filters
                          <button
                            type="button"
                            onClick={() => {
                              setInvoiceSearch("");
                              setInvoiceStatus("all");
                            }}
                            className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            aria-label="Clear all invoice filters"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )}
                      {invoiceSearch.trim() && (
                        <Badge className="bg-slate-100 text-slate-700">
                          Search: {invoiceSearch.trim()}
                          <button
                            type="button"
                            onClick={() => setInvoiceSearch("")}
                            className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            aria-label="Clear invoice search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )}
                      {invoiceStatus !== "all" && (
                        <Badge className="bg-slate-100 text-slate-700">
                          Status: {getInvoiceStatusLabel(invoiceStatus)}
                          <button
                            type="button"
                            onClick={() => setInvoiceStatus("all")}
                            className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            aria-label="Clear invoice status filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )}
                    </div>
                  )}
                  {pagedInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{inv.invoice_number || inv.id}</p>
                        <p className="text-xs text-slate-500">{new Date(inv.created_date || inv.created_at || Date.now()).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">{formatCurrency(inv.total_amount || 0, 'ZAR')}</span>
                        <Badge className={`${getInvoiceStatusStyle(getInvoiceStatus(inv))} text-[10px] px-2 py-0.5`}>
                          {getInvoiceStatusLabel(getInvoiceStatus(inv))}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {filteredInvoiceHistory.length === 0 && (
                    <p className="text-sm text-muted-foreground">No invoices for this user yet.</p>
                  )}
                  {filteredInvoiceHistory.length > 0 && (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-slate-500">
                        Page {invoicePage} of {invoiceTotalPages}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={invoicePage === 1}
                          onClick={() => setInvoicePage((prev) => Math.max(1, prev - 1))}
                        >
                          Prev
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={invoicePage === invoiceTotalPages}
                          onClick={() => setInvoicePage((prev) => Math.min(invoiceTotalPages, prev + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quote History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="flex flex-1 gap-2">
                      <Input
                        value={quoteSearch}
                        onChange={(e) => setQuoteSearch(e.target.value)}
                        placeholder="Search by quote, client, or amount"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setQuoteSearch("")}
                        disabled={!quoteSearch.trim()}
                      >
                        Clear
                      </Button>
                    </div>
                    <Select value={quoteStatus} onValueChange={setQuoteStatus}>
                      <SelectTrigger className="sm:w-48">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        {quoteStatusOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option === "all" ? "All statuses" : getQuoteStatusLabel(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setQuoteSearch("");
                        setQuoteStatus("all");
                      }}
                      disabled={!quoteSearch.trim() && quoteStatus === "all"}
                    >
                      Reset filters
                    </Button>
                  </div>
                  {(quoteSearch.trim() || quoteStatus !== "all") && (
                    <div className="flex flex-wrap gap-2">
                      {quoteSearch.trim() && quoteStatus !== "all" && (
                        <Badge className="bg-slate-100 text-slate-700">
                          Clear all filters
                          <button
                            type="button"
                            onClick={() => {
                              setQuoteSearch("");
                              setQuoteStatus("all");
                            }}
                            className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            aria-label="Clear all quote filters"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )}
                      {quoteSearch.trim() && (
                        <Badge className="bg-slate-100 text-slate-700">
                          Search: {quoteSearch.trim()}
                          <button
                            type="button"
                            onClick={() => setQuoteSearch("")}
                            className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            aria-label="Clear quote search"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )}
                      {quoteStatus !== "all" && (
                        <Badge className="bg-slate-100 text-slate-700">
                          Status: {getQuoteStatusLabel(quoteStatus)}
                          <button
                            type="button"
                            onClick={() => setQuoteStatus("all")}
                            className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            aria-label="Clear quote status filter"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )}
                    </div>
                  )}
                  {pagedQuotes.map(quote => (
                    <div key={quote.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{quote.quote_number || quote.id}</p>
                        <p className="text-xs text-slate-500">{new Date(quote.created_date || quote.created_at || Date.now()).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">{formatCurrency(quote.total_amount || 0, 'ZAR')}</span>
                        <Badge className={`${getQuoteStatusStyle(getQuoteStatus(quote))} text-[10px] px-2 py-0.5`}>
                          {getQuoteStatusLabel(getQuoteStatus(quote))}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {filteredQuoteHistory.length === 0 && (
                    <p className="text-sm text-muted-foreground">No quotes for this user yet.</p>
                  )}
                  {filteredQuoteHistory.length > 0 && (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-slate-500">
                        Page {quotePage} of {quoteTotalPages}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={quotePage === 1}
                          onClick={() => setQuotePage((prev) => Math.max(1, prev - 1))}
                        >
                          Prev
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={quotePage === quoteTotalPages}
                          onClick={() => setQuotePage((prev) => Math.min(quoteTotalPages, prev + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Manual Plan Override</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select
                    value={selectedUser.plan || planKey}
                    onValueChange={(value) => updateUser(selectedUser.id, { plan: value })}
                    disabled={selectedUser.isSystemAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(PLANS).map((key) => (
                        <SelectItem key={key} value={key}>
                          {PLANS[key].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedUser.isSystemAdmin && (
                    <p className="text-xs text-slate-500">System admins cannot have a plan override.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {isSuspendModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader>
              <CardTitle>Suspend user</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="suspend-reason">Reason</Label>
                <textarea
                  id="suspend-reason"
                  value={suspendReason}
                  onChange={(e) => {
                    setSuspendReason(e.target.value);
                    if (suspendError) setSuspendError("");
                  }}
                  placeholder="Explain why this account is being suspended"
                  className="min-h-[120px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              {suspendError && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                  {suspendError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsSuspendModalOpen(false);
                    setSuspendTarget(null);
                    setSuspendReason("");
                    setSuspendError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-rose-600 hover:bg-rose-700"
                  onClick={confirmSuspend}
                  disabled={!suspendReason.trim()}
                >
                  Suspend
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Invite Modal */}
      {inviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader>
              <CardTitle>Invite user</CardTitle>
            </CardHeader>
            <CardContent>
              {inviteSuccessMessage ? (
                <div className="space-y-4">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    {inviteSuccessMessage}
                  </div>

                  <Button
                    onClick={() => {
                      resetInviteForm();
                      setInviteModal(false);
                    }}
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleInviteSubmit} className="space-y-4">
                  {inviteError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {inviteError}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="invite_full_name">Full name</Label>
                    <Input
                      id="invite_full_name"
                      value={inviteForm.full_name}
                      onChange={(e) =>
                        setInviteForm(prev => ({ ...prev, full_name: e.target.value }))
                      }
                      placeholder="Jane Doe"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invite_email">Email</Label>
                    <Input
                      id="invite_email"
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) =>
                        setInviteForm(prev => ({ ...prev, email: e.target.value }))
                      }
                      placeholder="jane@company.com"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={inviteForm.role}
                      onValueChange={(value) =>
                        setInviteForm(prev => ({ ...prev, role: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Subscription plan</Label>
                    <Select
                      value={inviteForm.plan}
                      onValueChange={(value) =>
                        setInviteForm(prev => ({ ...prev, plan: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(PLANS).map((key) => (
                          <SelectItem key={key} value={key}>
                            {PLANS[key].name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      className="flex-1 bg-primary hover:bg-primary/90"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Send invite
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        resetInviteForm();
                        setInviteModal(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
