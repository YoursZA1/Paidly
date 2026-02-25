import { OutstandingBalanceService } from "@/services/OutstandingBalanceService";
import { ADMIN_ROLE_TIERS } from "@/constants/adminRoles";
import { fetchSupabaseUsers, updateUserRole, deleteUser, addUser, syncAndCleanUsers } from "@/api/userManagement";
import { useState, useEffect, useCallback, useMemo } from "react";
import PropTypes from 'prop-types';
import { Invoice } from "@/api/entities";
import { Client } from "@/api/entities";
import { User } from "@/api/entities";
import { BankingDetail } from "@/api/entities";
import { Expense } from "@/api/entities";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getUserCurrency } from "@/api/currencyProfiles";
import { formatCurrency } from "@/utils/currencyCalculations";
import { useAuth } from "@/components/auth/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { userService } from "@/services/ExcelUserService";
import CreateAccountDialog from "@/components/CreateAccountDialog";
import {
  FileText,
  Users as UsersIcon,
  Plus,
  Headset,
  DollarSign,
  TrendingUp,
  Briefcase,
  ShoppingBag,
  Coffee,
  Dumbbell,
  Car,
  Receipt,
  Percent
} from "lucide-react";
import { motion } from "framer-motion";
import InvoiceActions from "@/components/invoice/InvoiceActions";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import WelcomeGuide from '@/components/shared/WelcomeGuide';
import CreditCardDisplay from '@/components/dashboard/CreditCardDisplay';
import RevenueChart from '@/components/dashboard/RevenueChart';
import GoalProgress from '@/components/dashboard/GoalProgress';
import UpcomingPayments from '@/components/dashboard/UpcomingPayments';
import RecentExpenses from '@/components/dashboard/RecentExpenses';
import { startOfMonth, endOfMonth, format as formatDate, subMonths, startOfDay } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const QuickActionCard = ({ title, icon: Icon, href, color: _color, iconBg: _iconBg }) => (
  <Link to={href}>
    <Card className="group bg-card hover:shadow-md transition-all duration-300 cursor-pointer h-full overflow-hidden relative rounded-xl border border-border">
      <CardContent className="p-6 relative flex items-center gap-4">
        <div className="w-14 h-14 bg-primary/10 group-hover:bg-primary flex items-center justify-center rounded-xl transition-colors duration-300">
          <Icon className="w-7 h-7 text-primary group-hover:text-primary-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
      </CardContent>
    </Card>
  </Link>
);

QuickActionCard.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  href: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  iconBg: PropTypes.string.isRequired
};

const StatCard = ({ title, value, icon: Icon, color: _color, iconBg: _iconBg, isLoading }) => (
  <Card className="group bg-card transition-all duration-300 overflow-hidden relative rounded-xl border border-border shadow-sm">
    <CardContent className="p-6 relative">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
          {isLoading ? (
            <Skeleton className="h-10 w-3/4 rounded" />
          ) : (
            <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
          )}
        </div>
        <div className="w-14 h-14 bg-muted rounded-xl flex items-center justify-center shrink-0">
          <Icon className="w-7 h-7 text-muted-foreground" />
        </div>
      </div>
    </CardContent>
  </Card>
);

StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.elementType.isRequired,
  color: PropTypes.string.isRequired,
  iconBg: PropTypes.string.isRequired,
  isLoading: PropTypes.bool
};

export default function Dashboard() {
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const userRole = authUser?.role || 'user';
  const isAdmin = userRole === 'admin';
  const [createAccountDialogOpen, setCreateAccountDialogOpen] = useState(false);

  // Admin Roles Management State
  // Removed unused activeAdminTab
  const [selectedRole, setSelectedRole] = useState(ADMIN_ROLE_TIERS[0].key);
  const [supabaseUsers, setSupabaseUsers] = useState([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', fullName: '', role: ADMIN_ROLE_TIERS[0].key });
  const roleInfo = ADMIN_ROLE_TIERS.find(r => r.key === selectedRole);
  // Removed unused allowedTabs

  useEffect(() => {
    if (isAdmin) {
      async function fetchUsers() {
        setLoadingAdmin(true);
        const users = await fetchSupabaseUsers();
        setSupabaseUsers(users);
        setLoadingAdmin(false);
      }
      fetchUsers();
    }
  }, [isAdmin]);

  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [user, setUser] = useState(null);
  const [userCurrencyPreference, setUserCurrencyPreference] = useState('ZAR');
  const [hasBankingDetails, setHasBankingDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminStats, setAdminStats] = useState({
    totalUsers: 0,
    activeSubscribers: 0,
    trialUsers: 0,
    suspendedAccounts: 0,
    totalInvoices: 0,
    revenue: 0,
    totalUsersLastMonth: 0,
    totalInvoicesLastMonth: 0,
    revenueLastMonth: 0,
    individualUsers: 0,
    smeUsers: 0,
    corporateUsers: 0,
    activePlans: 0,
    cancelledPlans: 0
  });
  const [growthStats, setGrowthStats] = useState({
    newUsersThisWeek: 0,
    newUsersThisMonth: 0,
    growthRate: 0,
    upgrades: 0,
    downgrades: 0,
    cancellations: 0,
    trialsConverted: 0
  });
  const [timeBreakdown, setTimeBreakdown] = useState({
    usersPerWeek: [],
    revenuePerMonth: []
  });
  // Removed unused financialMetrics state
  const [activityLogs, setActivityLogs] = useState({
    recentActions: [],
    suspensions: [],
    planChanges: [],
    failedPayments: []
  });
  const [revenueRange, setRevenueRange] = useState(30);
  const [alerts, setAlerts] = useState({
    planLimits: [],
    failedSubscriptions: [],
    highVolumeLowPlan: []
  });
  const navigate = useNavigate();

  const openAccount = (user) => {
    const params = new URLSearchParams();
    if (user?.id) params.set('userId', user.id);
    if (user?.email) params.set('email', user.email);
    navigate(`/admin/accounts-management?${params.toString()}`);
  };

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    } else {
      loadUserData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Removed calculateFinancialMetrics (no longer used)

  const calculateActivityLogs = (allUsers, now) => {
    try {
      const recentActions = allUsers
        .filter(u => u.updated_at)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 6)
        .map(u => {
          let action = 'Profile updated';
          if (u.status === 'suspended') action = 'Account suspended';
          else if (u.status === 'active' && u.plan) action = `Plan set to ${u.plan}`;
          else if (u.status === 'trial') action = 'Trial account created';

          return {
            id: u.id,
            user: u.display_name || u.full_name || 'Unknown User',
            action,
            timestamp: u.updated_at || u.created_at,
            status: u.status
          };
        });

      const thirtyDaysAgo = subMonths(now, 1);
      const suspensions = allUsers
        .filter(u => u.status === 'suspended' && new Date(u.updated_at || u.created_at) >= thirtyDaysAgo)
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 5)
        .map(u => ({
          id: u.id,
          user: u.display_name || u.full_name || 'Unknown User',
          reason: u.suspension_reason || 'Payment failed',
          timestamp: u.updated_at || u.created_at,
          email: u.email
        }));

      const planChanges = allUsers
        .filter(u => {
          const updatedDate = new Date(u.updated_at || u.created_at);
          return updatedDate >= thirtyDaysAgo && u.plan && u.status !== 'trial';
        })
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 5)
        .map(u => ({
          id: u.id,
          user: u.display_name || u.full_name || 'Unknown User',
          from: 'trial',
          to: u.plan || 'basic',
          timestamp: u.updated_at || u.created_at,
          type: u.plan_history?.includes('downgrade')
            ? 'downgrade'
            : u.plan_history?.includes('upgrade')
              ? 'upgrade'
              : u.status === 'active'
                ? 'upgrade'
                : 'change'
        }));

      const failedPayments = [];

      setActivityLogs({ recentActions, suspensions, planChanges, failedPayments });
    } catch (error) {
      console.error("Error calculating activity logs:", error);
      setActivityLogs({ recentActions: [], suspensions: [], planChanges: [], failedPayments: [] });
    }
  };

  const calculateTimeBreakdown = (allUsers, allInvoices, now) => {
    const weeksData = [];
    for (let i = 11; i >= 0; i--) {
      const weekEnd = new Date(now.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
      const weekStart = new Date(weekEnd.getTime() - (7 * 24 * 60 * 60 * 1000));

      const usersInWeek = allUsers.filter(u => {
        if (!u.created_at) return false;
        const createdDate = new Date(u.created_at);
        return createdDate >= weekStart && createdDate <= weekEnd;
      }).length;

      const invoicesInWeek = allInvoices.filter(inv => {
        if (!inv.created_date) return false;
        const createdDate = new Date(inv.created_date);
        return createdDate >= weekStart && createdDate <= weekEnd;
      }).length;

      weeksData.push({
        label: formatDate(weekEnd, 'MMM dd'),
        users: usersInWeek,
        invoices: invoicesInWeek
      });
    }

    const monthsData = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      const revenueInMonth = allInvoices
        .filter(inv => {
          if (!inv.created_date) return false;
          const createdDate = new Date(inv.created_date);
          return createdDate >= monthStart && createdDate <= monthEnd && (inv.status === 'paid' || inv.status === 'partial_paid');
        })
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      monthsData.push({
        label: formatDate(monthDate, 'MMM yyyy'),
        revenue: revenueInMonth
      });
    }

    setTimeBreakdown({
      usersPerWeek: weeksData,
      revenuePerMonth: monthsData
    });
  };

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);
    try {
      const currencyPref = await getUserCurrency();
      if (currencyPref?.currency) {
        setUserCurrencyPreference(currencyPref.currency);
      }

      // Use Excel user service instead of broken User entity
      const allUsers = userService.getAllUsers();
      const allInvoices = await Invoice.list();
      setInvoices(allInvoices);
      // Removed allQuotes (unused)

      // Calculate invoice status breakdown
      // Removed setInvoiceStats (state no longer used)

      // Calculate quote status breakdown
      // Removed setQuoteStats (state no longer used)

      // Calculate current period stats
      const now = new Date();
      const activeUsers = allUsers.filter(u => u.status === 'active').length;
      const activeSubscribers = allUsers.filter(u => u.status === 'active' && u.plan && u.plan !== 'free').length;
      const trialUsers = allUsers.filter(u => u.plan === 'trial' || (u.plan === 'free' && u.status === 'active')).length;
      const suspendedAccounts = allUsers.filter(u => u.status === 'suspended').length;
      
      // Calculate new signups today
      const todayStart = startOfDay(now);
      const newUsersToday = allUsers.filter(u => {
        if (!u.created_at) return false;
        const createdDate = new Date(u.created_at);
        return createdDate >= todayStart && createdDate <= now;
      }).length;
      
      const totalRevenue = allInvoices
        .filter(inv => inv.status === 'paid' || inv.status === 'partial_paid')
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      // Calculate previous period stats (last month)
      const lastMonthStart = subMonths(startOfMonth(now), 1);
      const lastMonthEnd = endOfMonth(lastMonthStart);

      const lastMonthUsers = allUsers.filter(u => {
        if (!u.created_at) return false;
        const createdDate = new Date(u.created_at);
        return createdDate >= lastMonthStart && createdDate <= lastMonthEnd;
      }).length;

      const lastMonthInvoices = allInvoices.filter(inv => {
        if (!inv.created_date) return false;
        const createdDate = new Date(inv.created_date);
        return createdDate >= lastMonthStart && createdDate <= lastMonthEnd;
      }).length;

      const lastMonthRevenue = allInvoices
        .filter(inv => {
          if (!inv.created_date) return false;
          const createdDate = new Date(inv.created_date);
          return createdDate >= lastMonthStart && createdDate <= lastMonthEnd && (inv.status === 'paid' || inv.status === 'partial_paid');
        })
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = startOfMonth(now);
      const newUsersThisWeek = allUsers.filter(u => {
        if (!u.created_at) return false;
        const createdDate = new Date(u.created_at);
        return createdDate >= weekStart && createdDate <= now;
      }).length;

      const newUsersThisMonth = allUsers.filter(u => {
        if (!u.created_at) return false;
        const createdDate = new Date(u.created_at);
        return createdDate >= monthStart && createdDate <= now;
      }).length;

      const growthRate = lastMonthUsers > 0 ? Math.round(((newUsersThisMonth - lastMonthUsers) / lastMonthUsers) * 100) : 0;

      const upgrades = allUsers.filter(u => u.plan_history?.includes('upgrade')).length;
      const downgrades = allUsers.filter(u => u.plan_history?.includes('downgrade')).length;
      const cancellations = allUsers.filter(u => u.status === 'cancelled' || u.status === 'suspended').length;
      const trialsConverted = allUsers.filter(u => u.plan === 'paid' && u.previously_trial === true).length;

      // Plan breakdown (Individual / SME / Corporate)
      const individualUsers = allUsers.filter(u => u.plan === 'individual' || u.plan === 'basic' || u.plan === 'free').length;
      const smeUsers = allUsers.filter(u => u.plan === 'sme' || u.plan === 'professional' || u.plan === 'business').length;
      const corporateUsers = allUsers.filter(u => u.plan === 'corporate' || u.plan === 'enterprise').length;
      
      // Active vs cancelled subscriptions
      const activePlans = allUsers.filter(u => u.status === 'active' && u.plan && u.plan !== 'free').length;
      const cancelledPlans = allUsers.filter(u => u.status === 'cancelled' || u.status === 'inactive').length;

      setAdminStats({
        totalUsers: allUsers.length,
        activeUsers,
        activeSubscribers,
        trialUsers,
        suspendedAccounts,
        newUsersToday,
        totalInvoices: allInvoices.length,
        revenue: totalRevenue,
        totalUsersLastMonth: lastMonthUsers,
        totalInvoicesLastMonth: lastMonthInvoices,
        revenueLastMonth: lastMonthRevenue,
        individualUsers,
        smeUsers,
        corporateUsers,
        activePlans,
        cancelledPlans
      });

      setGrowthStats({
        newUsersThisWeek,
        newUsersThisMonth,
        growthRate,
        upgrades,
        downgrades,
        cancellations,
        trialsConverted
      });

      const lowPlans = ['free', 'trial', 'individual', 'basic', 'starter'];
      const highVolumeThresholds = {
        free: 10,
        trial: 10,
        individual: 12,
        basic: 12,
        starter: 15
      };
      const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const invoicesByUser = allInvoices.reduce((acc, inv) => {
        const createdAt = new Date(inv.created_date || inv.created_at || 0);
        if (createdAt >= last30Start && createdAt <= now) {
          const ownerId = inv.user_id || inv.created_by;
          if (ownerId) {
            acc[ownerId] = (acc[ownerId] || 0) + 1;
          }
        }
        return acc;
      }, {});

      const planLimits = allUsers.filter(u => (
        u?.limit_reached ||
        u?.is_limit_reached ||
        u?.plan_limit_reached ||
        u?.usage_status === 'limit_reached'
      ));

      const failedSubscriptions = allUsers.filter(u => (
        ['inactive', 'cancelled', 'suspended', 'overdue', 'past_due', 'failed'].includes(u?.status)
      ));

      const highVolumeLowPlan = allUsers
        .filter(u => lowPlans.includes((u.plan || 'free').toLowerCase()))
        .filter(u => {
          const planKey = (u.plan || 'free').toLowerCase();
          const threshold = highVolumeThresholds[planKey] ?? 20;
          return (invoicesByUser[u.id] || 0) >= threshold;
        })
        .map(u => ({
          ...u,
          invoiceCount: invoicesByUser[u.id] || 0
        }))
        .sort((a, b) => b.invoiceCount - a.invoiceCount);

      setAlerts({
        planLimits,
        failedSubscriptions,
        highVolumeLowPlan
      });

      // Removed call to calculateFinancialMetrics (function deleted)

      // Calculate time breakdown
      calculateTimeBreakdown(allUsers, allInvoices, now);

      // Calculate activity logs
      calculateActivityLogs(allUsers, now);
    } catch (error) {
      console.error("Error loading admin dashboard data:", error);
      toast({
        title: "Could not load dashboard",
        description: error?.message || "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]); // useCallback

  const loadUserData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load currency preference
      const currencyPref = await getUserCurrency();
      if (currencyPref?.currency) {
        setUserCurrencyPreference(currencyPref.currency);
      }

      const [invoicesData, clientsData, userData, expensesData, bankingDetailsData] = await Promise.all([
        Invoice.list("-created_date"),
        Client.list("-created_date"),
        User.me(),
        Expense.list("-date", 100),
        BankingDetail.list()
      ]);
      setInvoices(invoicesData);
      setClients(clientsData);
      setUser(userData);
      setExpenses(expensesData);
      setHasBankingDetails(bankingDetailsData.length > 0);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      toast({
        title: "Could not load dashboard",
        description: error?.message || "Please check your connection and try again.",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  }, [toast]); // useCallback

  // Real-time KPI updates: refetch when invoices, payments, or expenses change
  useSupabaseRealtime(
    ["invoices", "payments", "expenses"],
    () => {
      if (isAdmin) {
        loadAdminData();
      } else {
        loadUserData();
      }
    },
    { channelName: "dashboard-kpis" }
  );

  const revenueTrendData = useMemo(() => {
    const now = new Date();
    const days = Number(revenueRange) || 30;
    const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const buckets = new Map();

    for (let i = 0; i < days; i += 1) {
      const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      buckets.set(formatDate(date, 'MMM d'), 0);
    }

    invoices.forEach(inv => {
      const createdAt = new Date(inv.created_date || inv.created_at || 0);
      if (createdAt < start || createdAt > now) return;
      const label = formatDate(createdAt, 'MMM d');
      const value = Number(inv.total_amount || inv.total || 0);
      buckets.set(label, (buckets.get(label) || 0) + value);
    });

    return Array.from(buckets.entries()).map(([label, value]) => ({
      label,
      value
    }));
  }, [invoices, revenueRange]);

  // ADMIN DASHBOARD
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Admin Dashboard</h1>
            <p className="text-sm text-slate-600">Is the business healthy today?</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Total Revenue (Today / MTD / YTD) */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Revenue</p>
                <p className="text-2xl font-semibold text-slate-900">{formatCurrency(adminStats.revenue, 'ZAR')}</p>
                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  <span className="text-slate-500">Today: <span className="font-semibold text-slate-900">{formatCurrency(invoices.filter(inv => {
                    const created = new Date(inv.created_date || inv.created_at || 0);
                    const now = new Date();
                    return created.toDateString() === now.toDateString() && (inv.status === 'paid' || inv.status === 'partial_paid');
                  }).reduce((sum, inv) => sum + (inv.total_amount || 0), 0), 'ZAR')}</span></span>
                  <span className="text-slate-500">MTD: <span className="font-semibold text-slate-900">{formatCurrency(invoices.filter(inv => {
                    const created = new Date(inv.created_date || inv.created_at || 0);
                    const now = new Date();
                    return created >= startOfMonth(now) && created <= now && (inv.status === 'paid' || inv.status === 'partial_paid');
                  }).reduce((sum, inv) => sum + (inv.total_amount || 0), 'ZAR'))}</span></span>
                  <span className="text-slate-500">YTD: <span className="font-semibold text-slate-900">{formatCurrency(invoices.filter(inv => {
                    const created = new Date(inv.created_date || inv.created_at || 0);
                    const now = new Date();
                    return created.getFullYear() === now.getFullYear() && (inv.status === 'paid' || inv.status === 'partial_paid');
                  }).reduce((sum, inv) => sum + (inv.total_amount || 0), 0), 'ZAR')}</span></span>
                </div>
              </CardContent>
            </Card>
            {/* Active Businesses */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Active Businesses</p>
                <p className="text-2xl font-semibold text-slate-900">{adminStats.activeUsers}</p>
              </CardContent>
            </Card>
            {/* Active Subscriptions */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Active Subscriptions</p>
                <p className="text-2xl font-semibold text-slate-900">{adminStats.activeSubscribers}</p>
              </CardContent>
            </Card>
            {/* Total Transactions (24h) */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Transactions (24h)</p>
                <p className="text-2xl font-semibold text-slate-900">{
                  invoices.filter(inv => {
                    const created = new Date(inv.created_date || inv.created_at || 0);
                    const now = new Date();
                    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    return created >= yesterday && created <= now && (inv.status === 'paid' || inv.status === 'partial_paid');
                  }).length
                }</p>
              </CardContent>
            </Card>
            {/* Failed Payments */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Failed Payments</p>
                <p className="text-2xl font-semibold text-slate-900">{
                  invoices.filter(inv => inv.status === 'failed' || inv.status === 'overdue').length
                }</p>
              </CardContent>
            </Card>
            {/* Pending Payouts */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Pending Payouts</p>
                <p className="text-2xl font-semibold text-slate-900">{
                  invoices.filter(inv => inv.status === 'pending_payout' || inv.status === 'awaiting_payout').length
                }</p>
              </CardContent>
            </Card>
            {/* Platform Balance */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Platform Balance</p>
                <p className="text-2xl font-semibold text-slate-900">{
                  formatCurrency(OutstandingBalanceService.calculateTotalOutstanding(invoices).totalOutstanding, 'ZAR')
                }</p>
              </CardContent>
            </Card>
            {/* System Alerts */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">System Alerts</p>
                <p className="text-2xl font-semibold text-slate-900">{alerts.planLimits.length + alerts.failedSubscriptions.length + alerts.highVolumeLowPlan.length}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader className="border-b">
                <CardTitle className="text-base font-semibold">Plan Distribution</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {isLoading ? (
                  <Skeleton className="h-36 w-full" />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Starter</span>
                      <span className="text-sm font-semibold text-slate-900">{adminStats.individualUsers}</span>
                    </div>
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      <span className="text-sm font-semibold text-amber-800">Entrepreneur</span>
                      <span className="text-sm font-semibold text-amber-900">{adminStats.smeUsers}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Corporate</span>
                      <span className="text-sm font-semibold text-slate-900">{adminStats.corporateUsers}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="border-b flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold">Revenue Trend</CardTitle>
                <div className="flex items-center gap-2">
                  {[30, 60, 90].map(range => (
                    <button
                      key={range}
                      onClick={() => setRevenueRange(range)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition ${
                        revenueRange === range
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {range}d
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={revenueTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px'
                        }}
                        formatter={(value) => formatCurrency(Number(value || 0), 'ZAR')}
                      />
                      <Line type="monotone" dataKey="value" stroke="#0f172a" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Admin Analytics</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">Growth Metrics</CardTitle>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">New users (7d)</p>
                    <p className="text-lg font-semibold text-slate-900">{growthStats.newUsersThisWeek}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">New users (30d)</p>
                    <p className="text-lg font-semibold text-slate-900">{growthStats.newUsersThisMonth}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Growth rate</p>
                    <p className="text-lg font-semibold text-slate-900">{growthStats.growthRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Trial conversions</p>
                    <p className="text-lg font-semibold text-slate-900">{growthStats.trialsConverted}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Upgrades</p>
                    <p className="text-lg font-semibold text-slate-900">{growthStats.upgrades}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Downgrades</p>
                    <p className="text-lg font-semibold text-slate-900">{growthStats.downgrades}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">Activity Logs</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {activityLogs.recentActions.length === 0 ? (
                    <p className="text-sm text-slate-500">No recent admin actions.</p>
                  ) : (
                    activityLogs.recentActions.map(action => (
                      <div key={action.id} className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{action.user}</p>
                          <p className="text-xs text-slate-500">{action.action}</p>
                        </div>
                        <span className="text-xs text-slate-400">
                          {action.timestamp ? formatDate(new Date(action.timestamp), 'MMM d') : '—'}
                        </span>
                      </div>
                    ))
                  )}
                  {activityLogs.suspensions.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-semibold text-slate-500 mb-2">Suspensions</p>
                      {activityLogs.suspensions.slice(0, 2).map(suspension => (
                        <div key={suspension.id} className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{suspension.user}</p>
                            <p className="text-xs text-slate-500">{suspension.reason}</p>
                          </div>
                          <span className="text-xs text-slate-400">
                            {suspension.timestamp ? formatDate(new Date(suspension.timestamp), 'MMM d') : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {activityLogs.planChanges.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-semibold text-slate-500 mb-2">Plan changes</p>
                      {activityLogs.planChanges.map(change => {
                        const label = change.type === 'downgrade'
                          ? 'Downgrade'
                          : change.type === 'upgrade'
                            ? 'Upgrade'
                            : 'Change';
                        const badgeClass = change.type === 'downgrade'
                          ? 'bg-rose-100 text-rose-700'
                          : change.type === 'upgrade'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-700';
                        return (
                          <div key={change.id} className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-slate-900">{change.user}</p>
                                <Badge className={badgeClass}>{label}</Badge>
                              </div>
                              <p className="text-xs text-slate-500">{change.from} → {change.to}</p>
                            </div>
                            <span className="text-xs text-slate-400">
                              {change.timestamp ? formatDate(new Date(change.timestamp), 'MMM d') : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">Weekly Users & Invoices</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {isLoading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={timeBreakdown.usersPerWeek}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                        <YAxis stroke="#64748b" fontSize={10} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px'
                          }}
                        />
                        <Line type="monotone" dataKey="users" stroke="#0f172a" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="invoices" stroke="#2563eb" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">Monthly Revenue</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {isLoading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={timeBreakdown.revenuePerMonth}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                        <YAxis stroke="#64748b" fontSize={10} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px'
                          }}
                          formatter={(value) => formatCurrency(Number(value || 0), 'ZAR')}
                        />
                        <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Alerts & Actions</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">Users Hitting Plan Limits</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {alerts.planLimits.length === 0 ? (
                    <p className="text-sm text-slate-500">No plan limits reached.</p>
                  ) : (
                    alerts.planLimits.slice(0, 4).map(user => (
                      <div key={user.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {user.full_name || user.display_name || user.email}
                          </p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openAccount(user)}>
                          Review
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">Failed or Overdue Subscriptions</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {alerts.failedSubscriptions.length === 0 ? (
                    <p className="text-sm text-slate-500">No failed subscriptions.</p>
                  ) : (
                    alerts.failedSubscriptions.slice(0, 4).map(user => (
                      <div key={user.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {user.full_name || user.display_name || user.email}
                          </p>
                          <p className="text-xs text-slate-500">{user.status || 'inactive'}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openAccount(user)}>
                          Resolve
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">High-Volume Users on Low Plans</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {alerts.highVolumeLowPlan.length === 0 ? (
                    <p className="text-sm text-slate-500">No upgrade candidates.</p>
                  ) : (
                    alerts.highVolumeLowPlan.slice(0, 4).map(user => (
                      <div key={user.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {user.full_name || user.display_name || user.email}
                          </p>
                          <p className="text-xs text-slate-500">{user.invoiceCount} invoices (30 days)</p>
                        </div>
                        <Button size="sm" onClick={() => openAccount(user)}>
                          Upgrade
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // USER DASHBOARD
  // Unified revenue: from paid/partial invoices (or from payments for collected amount)
  const totalRevenue = invoices.reduce((sum, inv) => {
    if (inv.status === 'paid' || inv.status === 'partial_paid') {
      return sum + (inv.total_amount || 0);
    }
    return sum;
  }, 0);

  const userName = user?.display_name || user?.full_name || 'there';
  const userCurrency = userCurrencyPreference || 'ZAR';

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
  const monthExpenses = expenses
    .filter(exp => {
      const expDate = new Date(exp.date);
      return expDate >= monthStart && expDate <= monthEnd;
    })
    .reduce((sum, exp) => sum + (exp.amount || 0), 0);

  const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMarginPercent = totalRevenue > 0 ? Math.round(((totalRevenue - totalExpenses) / totalRevenue) * 100) : 0;
  const goalProgress = Math.min(100, (totalRevenue / 50000) * 100);

  const recentTransactions = invoices
    .filter(inv => inv.status === 'paid' || inv.status === 'partial_paid')
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 5);

  const statusColors = {
    'paid': 'bg-emerald-200 text-emerald-800',
    'sent': 'bg-blue-200 text-blue-800',
    'viewed': 'bg-purple-200 text-purple-800',
    'draft': 'bg-slate-200 text-slate-800',
    'overdue': 'bg-red-200 text-red-800',
    'partial_paid': 'bg-yellow-200 text-yellow-800',
    'cancelled': 'bg-slate-300 text-slate-700'
  };

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Welcome Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-2">
            Welcome back, {userName}
          </h1>
          <p className="text-muted-foreground text-base">Here&apos;s what&apos;s happening with your business today</p>
        </motion.div>

        {/* Admin Roles Management Section (Visible to Admins Only) */}
        {isAdmin && (
          <div className="bg-white rounded shadow p-4 mb-8">
            <h2 className="text-lg font-semibold mb-2">Admin Roles Management</h2>
            <div className="mb-4">
              <label className="font-semibold text-slate-700 mr-2">Select Admin Role:</label>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                className="border rounded px-2 py-1"
              >
                {ADMIN_ROLE_TIERS.map(role => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </select>
              <span className="ml-4 text-xs text-slate-500">{roleInfo?.description}</span>
            </div>
            <div className="mb-4">
              <button
                className="bg-indigo-500 text-white px-3 py-1 rounded mr-2"
                onClick={async () => {
                  setLoadingAdmin(true);
                  const users = await syncAndCleanUsers();
                  setSupabaseUsers(users);
                  setLoadingAdmin(false);
                }}
                disabled={loadingAdmin}
              >
                Sync & Clean Users
              </button>
              <span className="text-xs text-slate-500">Best practice: sync and clean orphaned users</span>
            </div>
            <form
              className="mb-4 flex gap-2"
              onSubmit={async e => {
                e.preventDefault();
                setLoadingAdmin(true);
                await addUser(newUser.email, newUser.fullName, newUser.role);
                const users = await fetchSupabaseUsers();
                setSupabaseUsers(users);
                setNewUser({ email: '', fullName: '', role: ADMIN_ROLE_TIERS[0].key });
                setLoadingAdmin(false);
              }}
            >
              <input
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                className="border px-2 py-1 rounded"
                required
              />
              <input
                type="text"
                placeholder="Full Name"
                value={newUser.fullName}
                onChange={e => setNewUser({ ...newUser, fullName: e.target.value })}
                className="border px-2 py-1 rounded"
                required
              />
              <select
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                className="border px-2 py-1 rounded"
              >
                {ADMIN_ROLE_TIERS.map(role => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </select>
              <button
                type="submit"
                className="bg-green-500 text-white px-3 py-1 rounded"
                disabled={loadingAdmin}
              >Add User</button>
            </form>
            {loadingAdmin ? (
              <p className="text-slate-500">Loading...</p>
            ) : supabaseUsers.length === 0 ? (
              <p className="text-slate-500">No users found.</p>
            ) : (
              <ul className="divide-y">
                {supabaseUsers.map(user => (
                  <li key={user.id} className="py-2 flex flex-col md:flex-row md:items-center md:justify-between">
                    <div>
                      <span className="font-medium text-slate-800">{user.email}</span>
                      <span className="text-xs text-slate-500 ml-2">ID: {user.id}</span>
                      {user.profile && (
                        <span className="text-xs text-slate-600 ml-2">Name: {user.profile.full_name}</span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2 md:mt-0">
                      <select
                        value={user.memberships?.[0]?.role || ''}
                        onChange={async e => {
                          setLoadingAdmin(true);
                          await updateUserRole(user.id, e.target.value);
                          const users = await fetchSupabaseUsers();
                          setSupabaseUsers(users);
                          setLoadingAdmin(false);
                        }}
                        className="border px-2 py-1 rounded"
                      >
                        {ADMIN_ROLE_TIERS.map(role => (
                          <option key={role.key} value={role.key}>{role.label}</option>
                        ))}
                      </select>
                      <button
                        className="bg-red-500 text-white px-3 py-1 rounded"
                        onClick={async () => {
                          setLoadingAdmin(true);
                          await deleteUser(user.id);
                          const users = await fetchSupabaseUsers();
                          setSupabaseUsers(users);
                          setLoadingAdmin(false);
                        }}
                        disabled={loadingAdmin}
                      >Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        
        {user && !isLoading && <WelcomeGuide user={user} hasBankingDetails={hasBankingDetails} />}

        {/* Quick Actions - Moved to Top */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
        >
          <QuickActionCard 
            title="Create Invoice" 
            icon={FileText} 
            href={createPageUrl("CreateInvoice")}
            color="from-purple-600 to-blue-600"
            iconBg="bg-gradient-to-br from-purple-600 to-blue-600"
          />
          <QuickActionCard 
            title="Add Expense" 
            icon={Receipt} 
            href={createPageUrl("CashFlow")}
            color="from-blue-600 to-cyan-500"
            iconBg="bg-gradient-to-br from-blue-600 to-cyan-500"
          />
          <QuickActionCard 
            title="Add Customer" 
            icon={UsersIcon}
            href={createPageUrl("Clients")}
            color="from-purple-500 to-blue-500"
            iconBg="bg-gradient-to-br from-purple-500 to-blue-500"
          />
          <QuickActionCard 
            title="Add Service" 
            icon={Headset} 
            href={createPageUrl("Services")}
            color="from-cyan-500 to-blue-500"
            iconBg="bg-gradient-to-br from-cyan-500 to-blue-500"
          />
        </motion.div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Left Column - Card & Transactions */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* Credit Card Display */}
            <CreditCardDisplay 
              balance={totalRevenue} 
              currency={userCurrency}
              user={user}
            />

            {/* Recent Transactions */}
            <Card className="bg-white border-0 shadow-xl rounded-3xl">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base font-bold text-slate-900">Recent Income</CardTitle>
                  <Link to={createPageUrl("Invoices")}>
                    <Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-slate-900">
                      View All
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentTransactions.slice(0, 5).map((transaction, index) => {
                  const icons = [ShoppingBag, Coffee, Dumbbell, FileText, Car];
                  const Icon = icons[index % icons.length];
                  const iconBgs = ['bg-slate-100', 'bg-slate-100', 'bg-slate-100', 'bg-slate-100', 'bg-slate-100'];
                  const iconBg = iconBgs[index % iconBgs.length];

                  return (
                    <div key={transaction.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center`}>
                          <Icon className="w-5 h-5 text-slate-700" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-900">{transaction.clientName}</p>
                          <p className="text-xs text-slate-400">{formatDate(new Date(transaction.created_date), 'dd MMM yyyy HH:mm')}</p>
                        </div>
                      </div>
                      <p className="font-bold text-sm text-emerald-600">+{formatCurrency(transaction.total_amount, userCurrency)}</p>
                    </div>
                  );
                })}
                {recentTransactions.length === 0 && (
                  <p className="text-center text-slate-500 text-sm py-4">No transactions yet</p>
                )}
              </CardContent>
            </Card>

            {/* Recent Expenses */}
            <RecentExpenses expenses={expenses} currency={userCurrency} />
          </motion.div>

          {/* Right Column - Chart & Payments */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-2 space-y-6"
          >
            {/* Upcoming Payments */}
            <UpcomingPayments invoices={invoices} clients={clients} currency={userCurrency} />

            {/* Revenue Chart */}
            <RevenueChart invoices={invoices} currency={userCurrency} />

            {/* Goal Progress */}
            <GoalProgress year={new Date().getFullYear()} progress={goalProgress} />
          </motion.div>
        </div>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8"
        >
          <StatCard 
            title="Total Revenue" 
            value={formatCurrency(totalRevenue, userCurrency)} 
            icon={TrendingUp}
            color="from-emerald-500 to-emerald-600"
            iconBg="bg-emerald-100"
            isLoading={isLoading}
          />
          <StatCard 
            title="Total Expenses" 
            value={formatCurrency(totalExpenses, userCurrency)} 
            icon={Receipt}
            color="from-red-500 to-red-600"
            iconBg="bg-red-100"
            isLoading={isLoading}
          />
          <StatCard 
            title="Net Profit" 
            value={formatCurrency(netProfit, userCurrency)} 
            icon={DollarSign}
            color={netProfit >= 0 ? "from-blue-500 to-blue-600" : "from-orange-500 to-orange-600"}
            iconBg={netProfit >= 0 ? "bg-blue-100" : "bg-orange-100"}
            isLoading={isLoading}
          />
          <StatCard 
            title="Profit margin" 
            value={totalRevenue > 0 ? `${profitMarginPercent}%` : "—"} 
            icon={Percent}
            color="from-violet-500 to-violet-600"
            iconBg="bg-violet-100"
            isLoading={isLoading}
          />
          <StatCard 
            title="This Month" 
            value={formatCurrency((invoices.filter(inv => {
              const invDate = new Date(inv.created_date);
              const now = new Date();
              return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear() && (inv.status === 'paid' || inv.status === 'partial_paid');
            }).reduce((sum, inv) => sum + (inv.total_amount || 0), 0)) - monthExpenses, userCurrency)} 
            icon={Briefcase}
            color="from-purple-500 to-purple-600"
            iconBg="bg-purple-100"
            isLoading={isLoading}
          />
        </motion.div>

        {/* Recent Invoices */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-900">Recent Invoices</h2>
            <Link to={createPageUrl("Invoices")}>
              <Button variant="outline" size="sm" className="rounded-full">View All</Button>
            </Link>
          </div>
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {Array(3).fill(0).map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-4 px-4">
                      <div className="flex items-center gap-4 flex-1">
                        <Skeleton className="h-14 w-14 rounded-2xl" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-32 mb-2" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-6 w-24" />
                        <Skeleton className="h-6 w-16 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center p-12">
                   <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                     <FileText className="w-10 h-10 text-slate-400" />
                   </div>
                   <h3 className="text-lg font-semibold text-slate-900 mb-2">No invoices yet</h3>
                   <p className="text-slate-500 mb-6">Get started by creating your first invoice</p>
                   <Button onClick={() => navigate(createPageUrl('CreateInvoice'))} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
                       <Plus className="w-4 h-4 mr-2" />
                       Create Invoice
                   </Button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {invoices.slice(0, 5).map((invoice) => {
                    const client = clients.find((c) => c.id === invoice.client_id);
                    return (
                      <div key={invoice.id} className="group flex items-center justify-between py-5 px-6 hover:bg-slate-50/50 transition-all">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                            <FileText className="w-7 h-7 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-slate-900">{invoice.invoice_number}</p>
                            <p className="text-sm text-slate-500">{client?.name || 'Unknown Client'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right hidden sm:block">
                            <p className="font-bold text-lg text-slate-900">{formatCurrency(invoice.total_amount, userCurrency)}</p>
                          </div>
                          <Badge className={`${statusColors[invoice.status] || 'bg-slate-200 text-slate-800'} border-0 font-semibold px-3 py-1.5`}>
                            {(invoice.status || 'draft').replace('_', ' ')}
                          </Badge>
                          <InvoiceActions
                            invoice={invoice}
                            client={client}
                            onActionSuccess={loadUserData}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Create Account Dialog */}
      <CreateAccountDialog
        open={createAccountDialogOpen}
        onOpenChange={setCreateAccountDialogOpen}
        onAccountCreated={() => {
          // Reload admin data when new account is created
          if (isAdmin) {
            loadAdminData();
          }
        }}
      />
    </div>
  );
}
