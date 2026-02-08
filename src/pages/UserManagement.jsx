import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, Pencil, Shield, Mail, Copy, Check, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import { PLANS, getActiveUserCount, getRemainingUserSlots, isUserLimitReached, getUserPlan, getPlanOrder } from "@/data/planLimits";
import PlanSelector from "@/components/subscription/PlanSelector";
import CurrencySelector from "@/components/CurrencySelector";
import UserCurrencyService from "@/services/UserCurrencyService";
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

export default function UserManagement() {
  const { user: currentUser, sendUserInvite } = useAuth();
  const [users, setUsers] = useState([]);
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
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadUsers = () => {
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
        // Set admin currency to ZAR
        UserCurrencyService.setUserCurrency(adminId, 'ZAR');
      }
    };

    loadUsers();
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.plan) {
      setCurrentPlan(currentUser.plan);
    }
  }, [currentUser]);

  const planKey = currentPlan || getUserPlan(currentUser);

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

  const handleSubmit = (e) => {
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

  const handleEdit = (u) => {
    setForm({
      id: u.id,
      full_name: u.full_name || "",
      email: u.email || "",
      role: u.role || "user",
      status: u.status || "active",
      plan: u.plan || planKey,
      currency: UserCurrencyService.getUserCurrency(u.id) || 'ZAR',
      isSystemAdmin: u.isSystemAdmin || false
    });
    setError("");
  };

  const handleDelete = (u) => {
    if (u.isSystemAdmin) {
      setError("System admin cannot be deleted");
      return;
    }
    if (u.role === "admin" && adminCount <= 1) {
      setError("You must keep at least one active admin.");
      return;
    }
    const next = users.filter(x => x.id !== u.id);
    persistUsers(next);
  };

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

      const link = await sendUserInvite(
        inviteForm.email.toLowerCase(),
        inviteForm.full_name.trim(),
        inviteForm.role,
        inviteForm.plan
      );

      setInviteLink(link);
      console.log("Invite Link:", link);
    } catch (err) {
      setInviteError(err?.message || "Failed to send invite");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetInviteForm = () => {
    setInviteForm({ full_name: "", email: "", role: "user", plan: planKey });
    setInviteLink("");
    setInviteError("");
    setCopied(false);
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
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-semibold text-blue-900">
                    {PLANS[planKey].name} Plan
                  </p>
                  <p className="text-sm text-blue-700">
                    {getActiveUserCount(users)} / {PLANS[planKey].userLimit === null ? "Unlimited" : PLANS[planKey].userLimit} users
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-blue-900">
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
            <h1 className="text-2xl font-semibold text-gray-900">User & Role Management</h1>
            <p className="text-sm text-slate-600">Create and manage user access for your workspace.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Shield className="w-4 h-4" />
              Admins: {adminCount}
            </div>
            <Button
              onClick={() => setInviteModal(true)}
              disabled={isUserLimitReached(users, planKey)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
                <div className="md:col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-900">System Admin</p>
                  <p className="text-xs text-blue-700 mt-1">No payment plan • Currency: ZAR (R)</p>
                </div>
              )}

              {error && (
                <div className="md:col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <div className="md:col-span-2 flex items-center gap-2">
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
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
                    <TableHead>Role</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                        No users yet. Add your first user above.
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={badgeVariants[u.role] || "secondary"}>
                              {roleLabels[u.role] || u.role}
                            </Badge>
                            {u.isSystemAdmin && (
                              <Badge className="bg-blue-100 text-blue-800">System Admin</Badge>
                            )}
                          </div>
                        </TableCell>
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
                          {!u.isSystemAdmin ? (
                            <span className="text-sm text-slate-600">
                              {UserCurrencyService.getUserCurrency(u.id) || 'ZAR'}
                            </span>
                          ) : (
                            <span className="text-sm font-medium text-blue-900">ZAR (R)</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.status === "active" ? "default" : "secondary"}>
                            {statusLabels[u.status] || u.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEdit(u)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDelete(u)}>
                              <Trash2 className="w-4 h-4" />
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

      {/* Invite Modal */}
      {inviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader>
              <CardTitle>Invite user</CardTitle>
            </CardHeader>
            <CardContent>
              {inviteLink ? (
                <div className="space-y-4">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                    Invite link generated! Share this link with the user to accept the invitation.
                  </div>

                  <div className="space-y-2">
                    <Label>Invite link</Label>
                    <div className="flex gap-2">
                      <Input
                        value={inviteLink}
                        readOnly
                        className="bg-slate-50"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyToClipboard}
                        className="flex-shrink-0"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                    <strong>Demo Note:</strong> The invite link is also logged in the browser console (F12).
                  </div>

                  <Button
                    onClick={() => {
                      resetInviteForm();
                      setInviteModal(false);
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700"
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
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700"
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
