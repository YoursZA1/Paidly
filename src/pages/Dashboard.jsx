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
  Receipt,
  Landmark
} from "lucide-react";
import { TaxService } from "@/services/TaxService";
import { motion } from "framer-motion";
import InvoiceActions from "@/components/invoice/InvoiceActions";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import WelcomeGuide from '@/components/shared/WelcomeGuide';
import CreditCardDisplay from '@/components/dashboard/CreditCardDisplay';
import GoalProgress from '@/components/dashboard/GoalProgress';
import UpcomingPayments from '@/components/dashboard/UpcomingPayments';
import { startOfMonth, endOfMonth, format as formatDate, subMonths, startOfDay } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const QUICK_ACTION_ACCENT = {
  green: { bg: 'bg-emerald-500/25', icon: 'text-emerald-400', hoverBg: 'group-hover:bg-emerald-500/35', border: 'hover:border-emerald-400/30' },
  red: { bg: 'bg-red-500/25', icon: 'text-red-400', hoverBg: 'group-hover:bg-red-500/35', border: 'hover:border-red-400/30' },
  blue: { bg: 'bg-primary/25', icon: 'text-primary', hoverBg: 'group-hover:bg-primary/35', border: 'hover:border-primary/30' },
  violet: { bg: 'bg-violet-500/25', icon: 'text-violet-400', hoverBg: 'group-hover:bg-violet-500/35', border: 'hover:border-violet-400/30' }
};

const QuickActionCard = ({ title, icon: Icon, href, fintech, accent = 'blue' }) => {
  const style = QUICK_ACTION_ACCENT[accent] || QUICK_ACTION_ACCENT.blue;
  return (
    <Link to={href} className="block min-w-0">
      <Card className={`group cursor-pointer h-full overflow-hidden relative transition-all duration-300 min-w-0 ${
        fintech
          ? `glass-card glass-card-hover rounded-fintech border border-border hover:border-primary/40 ${style.border}`
          : "bg-card hover:shadow-md rounded-xl border border-border"
      }`}>
        <CardContent className={`p-3 sm:p-4 md:p-6 relative flex items-center gap-3 sm:gap-4 min-w-0`}>
          <div className={`w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl transition-colors duration-300 shrink-0 ${
            fintech ? `${style.bg} ${style.hoverBg}` : "bg-primary/10 group-hover:bg-primary"
          }`}>
            <Icon className={`w-7 h-7 ${fintech ? `${style.icon} group-hover:text-primary-foreground` : "text-primary group-hover:text-primary-foreground"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={`text-sm font-semibold truncate ${fintech ? "text-foreground" : "text-foreground"}`}>{title}</h3>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

QuickActionCard.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  href: PropTypes.string.isRequired,
  fintech: PropTypes.bool,
  accent: PropTypes.oneOf(['green', 'red', 'blue', 'violet'])
};

const StatCard = ({ title, value, icon: Icon, color: _color, iconBg: _iconBg, isLoading, fintech, accent, growth, subtitle }) => (
  <Card className={`transition-all duration-300 overflow-hidden relative ${
    fintech
      ? "glass-card rounded-fintech border border-border"
      : "bg-card rounded-xl border border-border shadow-sm"
  }`}>
    <CardContent className={`p-4 sm:p-6 relative ${fintech ? "pb-5" : ""}`}>
      <div className="flex justify-between items-start gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium mb-1.5 ${fintech ? "text-muted-foreground" : "text-muted-foreground"}`}>{title}</p>
          {isLoading ? (
            <Skeleton className={`h-8 sm:h-10 w-3/4 rounded ${fintech ? "bg-muted" : ""}`} />
          ) : (
            <>
              <p className={`tabular-nums font-bold truncate min-w-0 ${fintech ? "text-2xl sm:text-3xl text-foreground drop-shadow-subtle" : "text-xl sm:text-2xl font-semibold text-foreground"}`}>{value}</p>
              {subtitle && (
                <div className={`text-xs mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 ${fintech ? "text-muted-foreground" : "text-muted-foreground"}`}>{subtitle}</div>
              )}
              {fintech && typeof growth === "number" && (
                <p className={`text-xs font-medium mt-1 ${growth >= 0 ? "text-status-paid" : "text-status-overdue"}`}>
                  {growth >= 0 ? "+" : ""}{growth}% vs last month
                </p>
              )}
            </>
          )}
        </div>
        <div className={`rounded-xl flex items-center justify-center shrink-0 ${
          fintech
            ? `w-10 h-10 sm:w-12 sm:h-12 ${accent === "purple" ? "bg-violet-500/20" : accent === "amber" ? "bg-amber-500/20" : "bg-primary/20"}`
            : "w-12 h-12 sm:w-14 sm:h-14 bg-muted"
        }`}>
          <Icon className={`${fintech ? "w-5 h-5 sm:w-6 sm:h-6 " + (accent === "purple" ? "text-violet-600" : accent === "amber" ? "text-amber-600" : "text-primary") : "w-6 h-6 sm:w-7 sm:h-7 text-muted-foreground"}`} />
        </div>
      </div>
      {fintech && (
        <div
          className="absolute bottom-0 left-4 right-4 h-px rounded-full bg-border"
        />
      )}
    </CardContent>
  </Card>
);

StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.elementType.isRequired,
  color: PropTypes.string,
  iconBg: PropTypes.string,
  isLoading: PropTypes.bool,
  fintech: PropTypes.bool,
  accent: PropTypes.oneOf(['blue', 'purple', 'amber']),
  growth: PropTypes.number,
  subtitle: PropTypes.node
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
        try {
          const users = await fetchSupabaseUsers();
          setSupabaseUsers(users);
        } catch (err) {
          console.warn("Admin users fetch failed (backend may be stopped):", err?.message || err);
          setSupabaseUsers([]);
          toast({
            title: "Backend unavailable",
            description: "Start the backend with: npm run server",
            variant: "destructive",
          });
        } finally {
          setLoadingAdmin(false);
        }
      }
      fetchUsers();
    }
  }, [isAdmin, toast]);

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

  // Fintech KPIs: Revenue, Awaiting payment (consolidated), VAT/Tax liability (SARS), Cash Flow + growth %
  const fintechKpis = useMemo(() => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const outstanding = OutstandingBalanceService.calculateTotalOutstanding(invoices);
    const paidInvoices = invoices.filter(inv => inv.status === 'paid' || inv.status === 'partial_paid');
    const taxSummary = TaxService.getTaxSummaryFromInvoices(paidInvoices);
    const rev = paidInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const exp = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const cashFlow = rev - exp;

    const revThisMonth = invoices
      .filter(inv => {
        const d = new Date(inv.created_date || inv.created_at || 0);
        return d >= thisMonthStart && (inv.status === 'paid' || inv.status === 'partial_paid');
      })
      .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const revLastMonth = invoices
      .filter(inv => {
        const d = new Date(inv.created_date || inv.created_at || 0);
        return d >= lastMonthStart && d <= lastMonthEnd && (inv.status === 'paid' || inv.status === 'partial_paid');
      })
      .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const expLastMonth = expenses
      .filter(e => {
        const d = new Date(e.date || 0);
        return d >= lastMonthStart && d <= lastMonthEnd;
      })
      .reduce((s, e) => s + (e.amount || 0), 0);

    const revenueGrowth = revLastMonth > 0 ? Math.round(((revThisMonth - revLastMonth) / revLastMonth) * 100) : (revThisMonth > 0 ? 100 : 0);
    const cashFlowLastMonth = revLastMonth - expLastMonth;
    const cashFlowGrowth = cashFlowLastMonth !== 0 ? Math.round(((cashFlow - cashFlowLastMonth) / Math.abs(cashFlowLastMonth)) * 100) : (cashFlow !== 0 ? 100 : 0);

    return {
      revenue: rev,
      outstandingTotal: outstanding.totalOutstanding,
      outstandingCount: outstanding.unpaidInvoiceCount,
      vatLiability: taxSummary.totalTax || 0,
      cashFlow,
      revenueGrowth,
      cashFlowGrowth
    };
  }, [invoices, expenses]);

  const recentTransactions = invoices
    .filter(inv => inv.status === 'paid' || inv.status === 'partial_paid')
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 5);

  const mergedTransactions = useMemo(() => {
    const income = recentTransactions.map((inv) => ({
      id: `inv-${inv.id}`,
      type: 'income',
      date: inv.created_date,
      label: clients.find((c) => c.id === inv.client_id)?.name || 'Invoice',
      amount: Number(inv.total_amount) || 0,
    }));
    const expense = expenses.slice(0, 5).map((exp) => ({
      id: `exp-${exp.id}`,
      type: 'expense',
      date: exp.date || exp.created_date,
      label: exp.description || 'Expense',
      amount: -(Number(exp.amount) || 0),
    }));
    return [...income, ...expense]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);
  }, [recentTransactions, expenses, clients]);

  // ADMIN DASHBOARD
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-background w-full min-w-0 px-3 py-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 w-full min-w-0">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-foreground font-display">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Is the business healthy today?</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Revenue (Today / MTD / YTD) */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-semibold text-foreground">{formatCurrency(adminStats.revenue, 'ZAR')}</p>
                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  <span className="text-muted-foreground">Today: <span className="font-semibold text-foreground">{formatCurrency(invoices.filter(inv => {
                    const created = new Date(inv.created_date || inv.created_at || 0);
                    const now = new Date();
                    return created.toDateString() === now.toDateString() && (inv.status === 'paid' || inv.status === 'partial_paid');
                  }).reduce((sum, inv) => sum + (inv.total_amount || 0), 0), 'ZAR')}</span></span>
                  <span className="text-muted-foreground">MTD: <span className="font-semibold text-foreground">{formatCurrency(invoices.filter(inv => {
                    const created = new Date(inv.created_date || inv.created_at || 0);
                    const now = new Date();
                    return created >= startOfMonth(now) && created <= now && (inv.status === 'paid' || inv.status === 'partial_paid');
                  }).reduce((sum, inv) => sum + (inv.total_amount || 0), 'ZAR'))}</span></span>
                  <span className="text-muted-foreground">YTD: <span className="font-semibold text-foreground">{formatCurrency(invoices.filter(inv => {
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
                <p className="text-xs text-muted-foreground">Active Businesses</p>
                <p className="text-2xl font-semibold text-foreground">{adminStats.activeUsers}</p>
              </CardContent>
            </Card>
            {/* Active Subscriptions */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Active Subscriptions</p>
                <p className="text-2xl font-semibold text-foreground">{adminStats.activeSubscribers}</p>
              </CardContent>
            </Card>
            {/* Total Transactions (24h) */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Transactions (24h)</p>
                <p className="text-2xl font-semibold text-foreground">{
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
                <p className="text-xs text-muted-foreground">Failed Payments</p>
                <p className="text-2xl font-semibold text-foreground">{
                  invoices.filter(inv => inv.status === 'failed' || inv.status === 'overdue').length
                }</p>
              </CardContent>
            </Card>
            {/* Pending Payouts */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Pending Payouts</p>
                <p className="text-2xl font-semibold text-foreground">{
                  invoices.filter(inv => inv.status === 'pending_payout' || inv.status === 'awaiting_payout').length
                }</p>
              </CardContent>
            </Card>
            {/* Platform Balance */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Platform Balance</p>
                <p className="text-2xl font-semibold text-foreground">{
                  formatCurrency(OutstandingBalanceService.calculateTotalOutstanding(invoices).totalOutstanding, 'ZAR')
                }</p>
              </CardContent>
            </Card>
            {/* System Alerts */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">System Alerts</p>
                <p className="text-2xl font-semibold text-foreground">{alerts.planLimits.length + alerts.failedSubscriptions.length + alerts.highVolumeLowPlan.length}</p>
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
                      <span className="text-sm text-muted-foreground">Starter</span>
                      <span className="text-sm font-semibold text-foreground">{adminStats.individualUsers}</span>
                    </div>
                    <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-md px-3 py-2">
                      <span className="text-sm font-semibold text-primary">Entrepreneur</span>
                      <span className="text-sm font-semibold text-foreground">{adminStats.smeUsers}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Corporate</span>
                      <span className="text-sm font-semibold text-foreground">{adminStats.corporateUsers}</span>
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
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-border hover:border-border'
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
            <h2 className="text-lg font-semibold text-foreground">Admin Analytics</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">Growth Metrics</CardTitle>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">New users (7d)</p>
                    <p className="text-lg font-semibold text-foreground">{growthStats.newUsersThisWeek}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">New users (30d)</p>
                    <p className="text-lg font-semibold text-foreground">{growthStats.newUsersThisMonth}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Growth rate</p>
                    <p className="text-lg font-semibold text-foreground">{growthStats.growthRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Trial conversions</p>
                    <p className="text-lg font-semibold text-foreground">{growthStats.trialsConverted}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Upgrades</p>
                    <p className="text-lg font-semibold text-foreground">{growthStats.upgrades}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Downgrades</p>
                    <p className="text-lg font-semibold text-foreground">{growthStats.downgrades}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">Activity Logs</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {activityLogs.recentActions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recent admin actions.</p>
                  ) : (
                    activityLogs.recentActions.map(action => (
                      <div key={action.id} className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{action.user}</p>
                          <p className="text-xs text-muted-foreground">{action.action}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {action.timestamp ? formatDate(new Date(action.timestamp), 'MMM d') : '—'}
                        </span>
                      </div>
                    ))
                  )}
                  {activityLogs.suspensions.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Suspensions</p>
                      {activityLogs.suspensions.slice(0, 2).map(suspension => (
                        <div key={suspension.id} className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{suspension.user}</p>
                            <p className="text-xs text-muted-foreground">{suspension.reason}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {suspension.timestamp ? formatDate(new Date(suspension.timestamp), 'MMM d') : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {activityLogs.planChanges.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Plan changes</p>
                      {activityLogs.planChanges.map(change => {
                        const label = change.type === 'downgrade'
                          ? 'Downgrade'
                          : change.type === 'upgrade'
                            ? 'Upgrade'
                            : 'Change';
                        const badgeClass = change.type === 'downgrade'
                          ? 'bg-destructive/10 text-destructive'
                          : change.type === 'upgrade'
                            ? 'bg-status-paid/10 text-status-paid'
                            : 'bg-muted text-muted-foreground';
                        return (
                          <div key={change.id} className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{change.user}</p>
                                <Badge className={badgeClass}>{label}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{change.from} → {change.to}</p>
                            </div>
                            <span className="text-xs text-muted-foreground">
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
                        <Line type="monotone" dataKey="invoices" stroke="#f24e00" strokeWidth={2} dot={false} />
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
                        <Line type="monotone" dataKey="revenue" stroke="#f24e00" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Alerts & Actions</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-semibold">Users Hitting Plan Limits</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {alerts.planLimits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No plan limits reached.</p>
                  ) : (
                    alerts.planLimits.slice(0, 4).map(user => (
                      <div key={user.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {user.full_name || user.display_name || user.email}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
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
                    <p className="text-sm text-muted-foreground">No failed subscriptions.</p>
                  ) : (
                    alerts.failedSubscriptions.slice(0, 4).map(user => (
                      <div key={user.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {user.full_name || user.display_name || user.email}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.status || 'inactive'}</p>
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
                    <p className="text-sm text-muted-foreground">No upgrade candidates.</p>
                  ) : (
                    alerts.highVolumeLowPlan.slice(0, 4).map(user => (
                      <div key={user.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {user.full_name || user.display_name || user.email}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.invoiceCount} invoices (30 days)</p>
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

  const goalProgress = Math.min(100, (totalRevenue / 50000) * 100);

  const statusColors = {
    'paid': 'bg-status-paid/10 text-status-paid',
    'sent': 'bg-primary/20 text-primary',
    'viewed': 'bg-primary/20 text-primary',
    'draft': 'bg-muted text-muted-foreground',
    'overdue': 'bg-status-overdue/10 text-status-overdue',
    'partial_paid': 'bg-status-pending/10 text-status-pending',
    'cancelled': 'bg-muted text-muted-foreground'
  };

  const isProfileComplete = Boolean(user?.company_name && user?.company_address && user?.logo_url);
  const showWelcomeBanner = !isProfileComplete || !hasBankingDetails;
  const today = startOfDay(new Date());
  const endOfThisWeek = new Date(today);
  endOfThisWeek.setDate(endOfThisWeek.getDate() + 7);
  const overdueCount = invoices.filter(inv => {
    if (inv.status === 'paid' || inv.status === 'partial_paid' || inv.status === 'draft' || inv.status === 'cancelled') return false;
    if (inv.status === 'overdue') return true;
    const due = inv.due_date ? startOfDay(new Date(inv.due_date)) : null;
    return due && due < today;
  }).length;
  const dueThisWeekCount = invoices.filter(inv => {
    if (inv.status === 'paid' || inv.status === 'partial_paid' || inv.status === 'draft' || inv.status === 'cancelled') return false;
    const due = inv.due_date ? startOfDay(new Date(inv.due_date)) : null;
    return due && due >= today && due <= endOfThisWeek;
  }).length;

  return (
    <div className="min-h-full w-full min-w-0 mobile-page">
      <div className="max-w-7xl mx-auto w-full min-w-0 px-3 py-2 sm:p-6 md:p-8">
        {/* Welcome Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-6"
        >
          <h1 className="text-xl sm:text-2xl md:text-[28px] font-bold text-foreground mb-1 sm:mb-2 font-display leading-tight">
            Welcome back, {userName}
          </h1>
          <p className="finbank-body text-sm text-foreground">Track cash flow, get paid faster, and stay on top of your business.</p>
        </motion.div>

        {/* KPI Summary — Revenue, Awaiting payment (consolidated), VAT/Tax (SARS), Cash Flow */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6"
        >
          <div className="glass-card rounded-fintech border border-border p-4 sm:p-6 mobile-card-wrap">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Revenue"
            value={formatCurrency(fintechKpis.revenue, userCurrency)}
            icon={TrendingUp}
            isLoading={isLoading}
            fintech
            accent="blue"
            growth={fintechKpis.revenueGrowth}
          />
          <StatCard
            title="Awaiting payment"
            value={formatCurrency(fintechKpis.outstandingTotal, userCurrency)}
            subtitle={
              fintechKpis.outstandingCount === 0
                ? 'No unpaid invoices'
                : dueThisWeekCount > 0 || overdueCount > 0
                  ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {dueThisWeekCount > 0 && (
                          <span className="inline-flex items-center rounded-md bg-status-pending/20 px-1.5 py-0.5 text-[11px] font-medium text-status-pending border border-status-pending/40">
                            Due this week: {dueThisWeekCount}
                          </span>
                        )}
                        {overdueCount > 0 && (
                          <span className="inline-flex items-center rounded-md bg-status-overdue/20 px-1.5 py-0.5 text-[11px] font-medium text-status-overdue border border-status-overdue/40">
                            Overdue: {overdueCount}
                          </span>
                        )}
                      </span>
                    )
                  : `${fintechKpis.outstandingCount} invoice${fintechKpis.outstandingCount !== 1 ? 's' : ''}`
            }
            icon={DollarSign}
            isLoading={isLoading}
            fintech
            accent="purple"
          />
          <StatCard
            title="VAT / Tax liability"
            value={formatCurrency(fintechKpis.vatLiability, userCurrency)}
            subtitle="Set aside for SARS"
            icon={Landmark}
            isLoading={isLoading}
            fintech
            accent="amber"
          />
          <StatCard
            title="Cash flow"
            value={formatCurrency(fintechKpis.cashFlow, userCurrency)}
            icon={Receipt}
            isLoading={isLoading}
            fintech
            accent="blue"
            growth={fintechKpis.cashFlowGrowth}
          />
            </div>
          </div>
        </motion.div>

        {/* Empty-state tip when Revenue (and Cash Flow) are zero */}
        {!isLoading && fintechKpis.revenue === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="glass-card rounded-fintech border border-border p-6 flex flex-wrap items-center gap-3">
              <span className="text-sm text-foreground">Looks like you&apos;re just starting!</span>
              <span className="text-sm text-muted-foreground">Did you know you can import your existing client list from Excel?</span>
              <Link
                to={createPageUrl("Clients")}
                className="text-sm font-semibold text-primary underline underline-offset-2 hover:text-primary/90"
              >
                Import clients →
              </Link>
            </div>
          </motion.div>
        )}

        {/* Admin Roles Management Section (Visible to Admins Only) */}
        {isAdmin && (
          <div className="glass-card rounded-fintech p-6 mb-6 border border-border">
            <h2 className="text-lg font-semibold mb-2 text-foreground">Admin Roles Management</h2>
            <div className="mb-4">
              <label className="font-semibold text-foreground mr-2">Select Admin Role:</label>
              <select
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                className="border rounded px-2 py-1"
              >
                {ADMIN_ROLE_TIERS.map(role => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </select>
              <span className="ml-4 text-xs text-muted-foreground">{roleInfo?.description}</span>
            </div>
            <div className="mb-4">
              <button
                className="bg-primary/100 text-white px-3 py-1 rounded mr-2"
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
              <span className="text-xs text-muted-foreground">Best practice: sync and clean orphaned users</span>
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
              <p className="text-muted-foreground">Loading...</p>
            ) : supabaseUsers.length === 0 ? (
              <p className="text-muted-foreground">No users found.</p>
            ) : (
              <ul className="divide-y">
                {supabaseUsers.map(user => (
                  <li key={user.id} className="py-2 flex flex-col md:flex-row md:items-center md:justify-between">
                    <div>
                      <span className="font-medium text-foreground">{user.email}</span>
                      <span className="text-xs text-muted-foreground ml-2">ID: {user.id}</span>
                      {user.profile && (
                        <span className="text-xs text-muted-foreground ml-2">Name: {user.profile.full_name}</span>
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
        
        {user && !isLoading && showWelcomeBanner && (
          <div className="glass-card rounded-fintech border border-border mb-6 overflow-hidden">
            <WelcomeGuide user={user} hasBankingDetails={hasBankingDetails} />
          </div>
        )}

        {user && !isLoading && !showWelcomeBanner && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="glass-card rounded-fintech border border-border p-6 flex flex-wrap items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-foreground font-display">Quick insights</h3>
              <div className="flex flex-wrap items-center gap-6 text-sm">
                {overdueCount > 0 ? (
                  <Link to={createPageUrl("Invoices")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>{overdueCount} invoice{overdueCount !== 1 ? 's' : ''} overdue — send reminders</span>
                  </Link>
                ) : fintechKpis.vatLiability > 0 ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Landmark className="w-4 h-4 shrink-0" />
                    Set aside {formatCurrency(fintechKpis.vatLiability, userCurrency)} for VAT / SARS
                  </span>
                ) : null}
                {overdueCount === 0 && fintechKpis.vatLiability <= 0 && (
                  <span className="text-muted-foreground">You&apos;re all set. Create an invoice or track expenses below.</span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="glass-card rounded-fintech border border-border p-4 sm:p-6 mobile-card-wrap">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <QuickActionCard title="Create Invoice" icon={FileText} href={createPageUrl("CreateInvoice")} fintech accent="green" />
          <QuickActionCard title="Add Expense" icon={Receipt} href={createPageUrl("CashFlow")} fintech accent="red" />
          <QuickActionCard title="Add Customer" icon={UsersIcon} href={createPageUrl("Clients")} fintech accent="blue" />
          <QuickActionCard title="Add Service" icon={Headset} href={createPageUrl("Services")} fintech accent="violet" />
            </div>
          </div>
        </motion.div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
          {/* Left Column - Card & Recent Transactions */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            <CreditCardDisplay balance={totalRevenue} currency={userCurrency} user={user} onRefresh={loadUserData} />

            {/* Transaction List — clean list, 16px padding per row, circular avatar with 10% status color */}
            <div className="glass-card rounded-fintech border border-border overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-border flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <h3 className="text-base sm:text-lg font-semibold text-foreground font-display">Transactions</h3>
                <div className="flex gap-2">
                  <Link to={createPageUrl("Invoices")}>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                      Invoices
                    </Button>
                  </Link>
                  <Link to={createPageUrl("CashFlow")}>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                      Cash flow
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="divide-y divide-border">
                {mergedTransactions.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <p className="text-muted-foreground text-sm">No transactions yet.</p>
                    <p className="text-muted-foreground/80 text-xs mt-1">Paid invoices and expenses will appear here.</p>
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      <Link to={createPageUrl("CreateInvoice")}>
                        <Button size="sm" className="bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg">
                          Create invoice
                        </Button>
                      </Link>
                      <Link to={createPageUrl("CashFlow")}>
                        <Button size="sm" variant="outline" className="rounded-lg">
                          Add expense
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  mergedTransactions.map((tx) => {
                    const isIncome = tx.type === 'income';
                    const Icon = isIncome ? FileText : Receipt;
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between py-3 px-3 sm:py-4 sm:px-4 hover:bg-muted/50 transition-colors gap-2"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                              isIncome ? 'bg-status-paid/10' : 'bg-status-overdue/10'
                            }`}
                          >
                            <Icon
                              className={`w-5 h-5 shrink-0 ${
                                isIncome ? 'text-status-paid' : 'text-status-overdue'
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">{tx.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {tx.date ? formatDate(new Date(tx.date), 'dd MMM yyyy') : '—'}
                            </p>
                          </div>
                        </div>
                        <p
                          className={`font-bold text-sm tabular-nums shrink-0 ml-2 ${
                            isIncome ? 'text-status-paid' : 'text-status-overdue'
                          }`}
                        >
                          {isIncome ? '+' : ''}{formatCurrency(tx.amount, userCurrency)}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>

          {/* Right Column - Revenue chart + Upcoming + Goal */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-2 space-y-6"
          >
            {/* Revenue line chart with electric blue / purple gradient */}
            <div className="glass-card rounded-fintech border border-border p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h3 className="text-lg font-semibold text-foreground font-display">Revenue trend</h3>
                <div className="flex gap-2">
                  {[30, 60, 90].map((range) => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => setRevenueRange(range)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                        revenueRange === range
                          ? "bg-primary text-primary-foreground border border-primary"
                          : "bg-muted text-muted-foreground border border-border hover:border-primary/40"
                      }`}
                    >
                      {range}d
                    </button>
                  ))}
                </div>
              </div>
              {isLoading ? (
                <Skeleton className="h-64 w-full rounded-xl bg-white/10" />
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="w-full h-[260px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueTrendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fintechRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" style={{ stopColor: 'var(--brand-primary)' }} stopOpacity={0.35} />
                          <stop offset="50%" style={{ stopColor: 'var(--brand-secondary)' }} stopOpacity={0.2} />
                          <stop offset="100%" style={{ stopColor: 'var(--brand-secondary)' }} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#7E9294" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#7E9294" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--bg-card)", color: "var(--text-main)", border: "1px solid hsl(var(--border))", borderRadius: "12px" }}
                        labelStyle={{ color: "var(--text-main)" }}
                        formatter={(value) => [formatCurrency(Number(value || 0), userCurrency), "Revenue"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="var(--brand-primary)"
                        strokeWidth={3}
                        fill="url(#fintechRevenueGrad)"
                        fillOpacity={1}
                        dot={false}
                        activeDot={{ r: 4, fill: "var(--brand-primary)", stroke: "#fff", strokeWidth: 1 }}
                        isAnimationActive
                        animationDuration={1200}
                        animationEasing="ease-out"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>
              )}
            </div>

            <UpcomingPayments invoices={invoices} clients={clients} currency={userCurrency} />

            <GoalProgress year={new Date().getFullYear()} progress={goalProgress} />
          </motion.div>
        </div>

        {/* Recent Invoices — glass table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-foreground font-display">Recent Invoices</h2>
            <Link to={createPageUrl("Invoices")}>
              <Button variant="outline" size="sm" className="rounded-lg border-border text-muted-foreground hover:bg-muted hover:text-foreground text-sm font-medium">View all</Button>
            </Link>
          </div>
          <div className="glass-card rounded-fintech border border-border overflow-hidden">
            <div className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {Array(3).fill(0).map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-4 px-4">
                      <div className="flex items-center gap-4 flex-1">
                        <Skeleton className="h-14 w-14 rounded-2xl bg-white/10" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-32 mb-2 bg-white/10" />
                          <Skeleton className="h-3 w-24 bg-white/10" />
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-6 w-24 bg-white/10" />
                        <Skeleton className="h-6 w-16 rounded-full bg-white/10" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center p-12">
                  <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2 font-display">No invoices yet</h3>
                  <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">Create professional invoices in seconds. Supports ZAR and all major currencies.</p>
                  <Button onClick={() => navigate(createPageUrl('CreateInvoice'))} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl px-6 py-2.5 shadow-lg shadow-primary/20">
                    <Plus className="w-4 h-4 mr-2" />
                    Create your first invoice
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {invoices.slice(0, 5).map((invoice) => {
                    const client = clients.find((c) => c.id === invoice.client_id);
                    return (
                      <div key={invoice.id} className="group flex items-center justify-between py-5 px-6 hover:bg-white/5 transition-all">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                            <FileText className="w-7 h-7 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-foreground">{invoice.invoice_number}</p>
                            <p className="text-sm text-muted-foreground">{client?.name || 'Unknown Client'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right hidden sm:block">
                            <p className="font-bold text-lg text-foreground">{formatCurrency(invoice.total_amount, userCurrency)}</p>
                          </div>
                          <Badge className={`${statusColors[invoice.status] || 'bg-muted text-foreground'} border-0 font-semibold px-3 py-1.5`}>
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
            </div>
          </div>
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
