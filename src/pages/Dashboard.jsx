import { useState, useEffect, useCallback } from "react";
import PropTypes from 'prop-types';
import { Invoice } from "@/api/entities";
import { Client } from "@/api/entities";
import { User } from "@/api/entities";
import { BankingDetail } from "@/api/entities";
import { Expense } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getUserCurrency } from "@/api/currencyProfiles";
import { formatCurrency } from "@/utils/currencyCalculations";
import { useAuth } from "@/components/auth/AuthContext";
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
  TrendingDown,
  UserCheck,
  UserX,
  Activity,
  BarChart2,
  UserPlus,
  Ban,
  Clock,
  RefreshCw,
  ScrollText,
  Download
} from "lucide-react";
import { motion } from "framer-motion";
import InvoiceActions from "../components/invoice/InvoiceActions";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import WelcomeGuide from '../components/shared/WelcomeGuide';
import CreditCardDisplay from '../components/dashboard/CreditCardDisplay';
import RevenueChart from '../components/dashboard/RevenueChart';
import GoalProgress from '../components/dashboard/GoalProgress';
import UpcomingPayments from '../components/dashboard/UpcomingPayments';
import RecentExpenses from '../components/dashboard/RecentExpenses';
import { startOfMonth, endOfMonth, format as formatDate, subMonths, startOfDay } from 'date-fns';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// KPI Card Component for Admin Dashboard
const KPICard = ({ title, value, icon: Icon, color, iconBg, isLoading, percentChange, trend }) => {
  const isPositive = trend === 'up';
  const changeColor = isPositive ? 'text-green-600' : 'text-red-600';
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card className="group bg-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden relative rounded-2xl">
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
      <CardContent className="p-6 relative">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-600 mb-3">{title}</p>
            {isLoading ? (
              <Skeleton className="h-10 w-3/4" />
            ) : (
              <>
                <p className="text-4xl font-bold text-slate-900">{value}</p>
                {percentChange !== undefined && (
                  <div className="flex items-center gap-1 mt-2">
                    <TrendIcon className={`w-4 h-4 ${changeColor}`} />
                    <span className={`text-sm font-semibold ${changeColor}`}>
                      {Math.abs(percentChange)}% {trend === 'up' ? 'increase' : 'decrease'}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          <div className={`w-16 h-16 ${iconBg} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-md`}>
            <Icon className="w-8 h-8 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

KPICard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.elementType.isRequired,
  color: PropTypes.string.isRequired,
  iconBg: PropTypes.string.isRequired,
  isLoading: PropTypes.bool,
  percentChange: PropTypes.number,
  trend: PropTypes.oneOf(['up', 'down', 'neutral'])
};

const QuickActionCard = ({ title, icon: Icon, href, color, iconBg }) => (
  <Link to={href}>
    <Card className="group bg-white hover:shadow-2xl transition-all duration-300 border-0 cursor-pointer h-full overflow-hidden relative rounded-3xl">
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
      <CardContent className="p-6 relative flex items-center gap-4">
        <div className={`w-14 h-14 ${iconBg} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
          <Icon className="w-7 h-7 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
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

const StatCard = ({ title, value, icon: Icon, color, iconBg, isLoading }) => (
  <Card className="group bg-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden relative">
    <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
    <CardContent className="p-6 relative">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-600 mb-2">{title}</p>
          {isLoading ? (
            <Skeleton className="h-10 w-3/4" />
          ) : (
            <p className="text-3xl font-bold text-slate-900">{value}</p>
          )}
        </div>
        <div className={`w-14 h-14 ${iconBg} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-md`}>
          <Icon className="w-7 h-7 text-slate-700" />
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
  const userRole = authUser?.role || 'user';
  const isAdmin = userRole === 'admin';
  const [createAccountDialogOpen, setCreateAccountDialogOpen] = useState(false);

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
  const [invoiceActivity, setInvoiceActivity] = useState({
    totalInvoicesAllTime: 0,
    invoicesThisWeek: 0,
    invoicesThisMonth: 0,
    averageInvoicesPerUser: 0,
    topActiveUsers: []
  });
  const [timeBreakdown, setTimeBreakdown] = useState({
    usersPerWeek: [],
    invoicesPerWeek: [],
    revenuePerMonth: []
  });
  const [financialMetrics, setFinancialMetrics] = useState({
    mrr: 0,
    arpu: 0,
    churnRate: 0,
    ltv: 0
  });
  const [activityLogs, setActivityLogs] = useState({
    recentActions: [],
    suspensions: [],
    planChanges: [],
    failedPayments: []
  });
  const [timeRange, setTimeRange] = useState('3months'); // '4weeks', '3months', '6months', '1year'
  const [timeUnit, setTimeUnit] = useState('week'); // 'week' or 'month'
  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    } else {
      loadUserData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Helper function to calculate activity logs
  const calculateActivityLogs = (allUsers, allInvoices, now) => {
    try {
      // Recent admin actions (simulated from user updates)
      const recentActions = allUsers
        .filter(u => u.updated_at)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 10)
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

      // User suspensions (last 30 days)
      const thirtyDaysAgo = subMonths(now, 1);
      const suspensions = allUsers
        .filter(u => u.status === 'suspended' && new Date(u.updated_at || u.created_at) >= thirtyDaysAgo)
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .map(u => ({
          id: u.id,
          user: u.display_name || u.full_name || 'Unknown User',
          reason: u.suspension_reason || 'Payment failed',
          timestamp: u.updated_at || u.created_at,
          email: u.email
        }));

      // Plan changes (last 30 days) - detect changes from trial to paid
      const planChanges = allUsers
        .filter(u => {
          const updatedDate = new Date(u.updated_at || u.created_at);
          return updatedDate >= thirtyDaysAgo && u.plan && u.status !== 'trial';
        })
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 10)
        .map(u => ({
          id: u.id,
          user: u.display_name || u.full_name || 'Unknown User',
          from: 'trial',
          to: u.plan || 'basic',
          timestamp: u.updated_at || u.created_at,
          type: u.status === 'active' ? 'upgrade' : 'change'
        }));

      // Failed payments (placeholder - would come from payment system)
      const failedPayments = [];

      setActivityLogs({ recentActions, suspensions, planChanges, failedPayments });
    } catch (error) {
      console.error("Error calculating activity logs:", error);
      setActivityLogs({ recentActions: [], suspensions: [], planChanges: [], failedPayments: [] });
    }
  };

  const calculateFinancialMetrics = (allUsers, allInvoices, now) => {
    // Calculate Monthly Recurring Revenue (MRR)
    // Based on active subscribers with paid plans (excluding system admins)
    const activeSubscribersWithPaidPlans = allUsers.filter(u => 
      u.status === 'active' && u.plan && u.plan !== 'free' && u.plan !== 'trial' && !u.isSystemAdmin
    );
    
    // Assuming subscription_amount field exists on user, or calculate from plan
    const mrr = activeSubscribersWithPaidPlans.reduce((sum, u) => {
      // If user has subscription_amount, use it; otherwise assume a default based on plan
      const monthlyAmount = u.subscription_amount || (u.plan === 'premium' ? 50 : u.plan === 'basic' ? 20 : 0);
      return sum + monthlyAmount;
    }, 0);

    // Average Revenue Per User (ARPU)
    // Exclude system admins from total active users
    const totalActiveUsers = allUsers.filter(u => u.status === 'active' && !u.isSystemAdmin).length;
    const arpu = totalActiveUsers > 0 ? Math.round(mrr / totalActiveUsers) : 0;

    // Calculate Churn Rate (monthly)
    // Users who cancelled in the last month / active users at start of month (excluding system admins)
    const monthStart = startOfMonth(now);
    const lastMonthStart = subMonths(monthStart, 1);
    const lastMonthEnd = endOfMonth(lastMonthStart);

    const churnedUsers = allUsers.filter(u => {
      if (!u.cancelled_at && !u.updated_at) return false;
      if (u.isSystemAdmin) return false; // Don't count system admins in churn
      const cancelDate = new Date(u.cancelled_at || u.updated_at);
      return (u.status === 'cancelled' || u.status === 'suspended') && 
             cancelDate >= lastMonthStart && 
             cancelDate <= lastMonthEnd;
    }).length;

    const activeUsersLastMonth = allUsers.filter(u => {
      if (u.isSystemAdmin) return false; // Don't count system admins
      const createdDate = new Date(u.created_at);
      return createdDate < monthStart;
    }).length;

    const churnRate = activeUsersLastMonth > 0 
      ? Math.round((churnedUsers / activeUsersLastMonth) * 100) 
      : 0;

    // Lifetime Value (LTV)
    // Formula: ARPU / Churn Rate (as decimal)
    // If churn is 0, assume a default retention period (e.g., 12 months)
    const churnDecimal = churnRate / 100;
    const ltv = churnDecimal > 0 
      ? Math.round(arpu / churnDecimal) 
      : arpu * 12; // Assume 12 months if no churn

    setFinancialMetrics({
      mrr,
      arpu,
      churnRate,
      ltv
    });
  };

  const calculateTimeBreakdown = (allUsers, allInvoices, now) => {
    // Get last 12 weeks of data
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
        week: formatDate(weekEnd, 'MMM dd'),
        users: usersInWeek,
        invoices: invoicesInWeek,
        revenue: allInvoices
          .filter(inv => {
            if (!inv.created_date) return false;
            const createdDate = new Date(inv.created_date);
            return createdDate >= weekStart && createdDate <= weekEnd && (inv.status === 'paid' || inv.status === 'partial_paid');
          })
          .reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
      });
    }

    // Get last 12 months of data
    const monthsData = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      const usersInMonth = allUsers.filter(u => {
        if (!u.created_at) return false;
        const createdDate = new Date(u.created_at);
        return createdDate >= monthStart && createdDate <= monthEnd;
      }).length;

      const invoicesInMonth = allInvoices.filter(inv => {
        if (!inv.created_date) return false;
        const createdDate = new Date(inv.created_date);
        return createdDate >= monthStart && createdDate <= monthEnd;
      }).length;

      const revenueInMonth = allInvoices
        .filter(inv => {
          if (!inv.created_date) return false;
          const createdDate = new Date(inv.created_date);
          return createdDate >= monthStart && createdDate <= monthEnd && (inv.status === 'paid' || inv.status === 'partial_paid');
        })
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      monthsData.push({
        month: formatDate(monthDate, 'MMM yyyy'),
        users: usersInMonth,
        invoices: invoicesInMonth,
        revenue: revenueInMonth
      });
    }

    setTimeBreakdown({
      usersPerWeek: weeksData,
      invoicesPerWeek: weeksData,
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

      // Calculate growth metrics
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

      // Plan breakdown (Individual / SME / Corporate)
      const individualUsers = allUsers.filter(u => u.plan === 'individual' || u.plan === 'basic' || u.plan === 'free').length;
      const smeUsers = allUsers.filter(u => u.plan === 'sme' || u.plan === 'professional' || u.plan === 'business').length;
      const corporateUsers = allUsers.filter(u => u.plan === 'corporate' || u.plan === 'enterprise').length;
      
      // Active vs cancelled subscriptions
      const activePlans = allUsers.filter(u => u.status === 'active' && u.plan && u.plan !== 'free').length;
      const cancelledPlans = allUsers.filter(u => u.status === 'cancelled' || u.status === 'inactive').length;

      // Subscription movement metrics (based on user status and plan changes in metadata)
      const upgrades = allUsers.filter(u => u.plan_history?.includes('upgrade')).length;
      const downgrades = allUsers.filter(u => u.plan_history?.includes('downgrade')).length;
      const cancellations = allUsers.filter(u => u.status === 'cancelled' || u.status === 'suspended').length;
      const trialsConverted = allUsers.filter(u => u.plan === 'paid' && u.previously_trial === true).length;

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

      // Calculate invoice activity metrics
      const invoicesThisWeek = allInvoices.filter(inv => {
        if (!inv.created_date) return false;
        const createdDate = new Date(inv.created_date);
        return createdDate >= weekStart && createdDate <= now;
      }).length;

      const invoicesThisMonth = allInvoices.filter(inv => {
        if (!inv.created_date) return false;
        const createdDate = new Date(inv.created_date);
        return createdDate >= monthStart && createdDate <= now;
      }).length;

      const averageInvoicesPerUser = allUsers.length > 0 ? Math.round(allInvoices.length / allUsers.length) : 0;

      // Get top 5 most active users (by invoice count)
      const userInvoiceMap = {};
      allInvoices.forEach(inv => {
        const userId = inv.user_id || inv.created_by;
        if (userId) {
          userInvoiceMap[userId] = (userInvoiceMap[userId] || 0) + 1;
        }
      });

      const topActiveUsers = Object.entries(userInvoiceMap)
        .map(([userId, count]) => {
          const userData = allUsers.find(u => u.id === userId);
          return {
            id: userId,
            name: userData?.display_name || userData?.full_name || 'Unknown User',
            invoiceCount: count
          };
        })
        .sort((a, b) => b.invoiceCount - a.invoiceCount)
        .slice(0, 5);

      setInvoiceActivity({
        totalInvoicesAllTime: allInvoices.length,
        invoicesThisWeek,
        invoicesThisMonth,
        averageInvoicesPerUser,
        topActiveUsers
      });

      // Calculate time-based breakdown (weekly/monthly)
      calculateTimeBreakdown(allUsers, allInvoices, now);

      // Calculate financial metrics
      calculateFinancialMetrics(allUsers, allInvoices, now);

      // Calculate activity logs
      calculateActivityLogs(allUsers, allInvoices, now);

      // Calculate activity logs
      calculateActivityLogs(allUsers, allInvoices, now);
    } catch (error) {
      console.error("Error loading admin dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []); // useCallback

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
    }
    setIsLoading(false);
  }, []); // useCallback

  // Calculate percentage changes
  const calculatePercentChange = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const userChangePercent = calculatePercentChange(adminStats.totalUsers, adminStats.totalUsersLastMonth + adminStats.totalUsers);

  // ADMIN DASHBOARD
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 p-8">
        <div className="max-w-[1600px] mx-auto space-y-8">
          {/* Welcome Header with System Health */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">
                Welcome back, Admin 👋
              </h1>
              <div className="flex items-center gap-2 text-lg">
                <span className="text-slate-600">System Health:</span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                  <span className="font-semibold text-green-700">Stable</span>
                </span>
              </div>
            </div>
          </motion.div>

          {/* Main KPI Cards - 4 Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            <KPICard
              title="Total Users"
              value={adminStats.totalUsers}
              icon={UsersIcon}
              color="from-blue-500 to-blue-600"
              iconBg="bg-gradient-to-br from-blue-500 to-blue-600"
              isLoading={isLoading}
              percentChange={Math.abs(userChangePercent)}
              trend={userChangePercent >= 0 ? 'up' : 'down'}
            />
            <KPICard
              title="Active Users"
              value={adminStats.activeUsers}
              icon={UserCheck}
              color="from-green-500 to-green-600"
              iconBg="bg-gradient-to-br from-green-500 to-green-600"
              isLoading={isLoading}
              percentChange={Math.abs(Math.round((adminStats.activeUsers / Math.max(adminStats.totalUsers, 1)) * 100))}
              trend="up"
            />
            <KPICard
              title="Suspended Users"
              value={adminStats.suspendedAccounts}
              icon={UserX}
              color="from-red-500 to-red-600"
              iconBg="bg-gradient-to-br from-red-500 to-red-600"
              isLoading={isLoading}
              percentChange={Math.abs(Math.round((adminStats.suspendedAccounts / Math.max(adminStats.totalUsers, 1)) * 100))}
              trend={adminStats.suspendedAccounts > 0 ? 'down' : 'neutral'}
            />
            <KPICard
              title="New Sign-ups"
              value={`${adminStats.newUsersToday} / ${growthStats.newUsersThisMonth}`}
              icon={UserPlus}
              color="from-purple-500 to-purple-600"
              iconBg="bg-gradient-to-br from-purple-500 to-purple-600"
              isLoading={isLoading}
              percentChange={Math.abs(growthStats.growthRate)}
              trend={growthStats.growthRate > 0 ? 'up' : growthStats.growthRate < 0 ? 'down' : 'neutral'}
            />
          </motion.div>

          {/* Charts Section - User Growth & Invoice Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* User Growth Chart */}
            <Card className="shadow-xl rounded-2xl border-0">
              <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  User Growth
                </CardTitle>
                <p className="text-blue-100 text-sm">New signups over time</p>
              </CardHeader>
              <CardContent className="p-6">
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : timeBreakdown.usersPerWeek.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={timeBreakdown.usersPerWeek}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="week" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="users" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-500">
                    <p>No user data available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Invoice Activity Chart */}
            <Card className="shadow-xl rounded-2xl border-0">
              <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Invoice Activity
                </CardTitle>
                <p className="text-orange-100 text-sm">Invoices created weekly</p>
              </CardHeader>
              <CardContent className="p-6">
                {isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : timeBreakdown.invoicesPerWeek.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeBreakdown.invoicesPerWeek}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="week" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="invoices"
                        stroke="#f97316"
                        strokeWidth={3}
                        dot={{ fill: '#f97316', r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-500">
                    <p>No invoice data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Subscriptions & Packages Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Briefcase className="h-6 w-6 text-blue-600" />
                Subscriptions & Packages
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Users per Plan */}
              <Card className="shadow-xl rounded-2xl border-0">
                <CardHeader className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-t-2xl">
                  <CardTitle className="flex items-center gap-2">
                    <UsersIcon className="h-5 w-5" />
                    Users per Plan
                  </CardTitle>
                  <p className="text-indigo-100 text-sm">Plan distribution</p>
                </CardHeader>
                <CardContent className="p-6">
                  {isLoading ? (
                    <Skeleton className="h-48 w-full" />
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          <span className="text-sm font-medium text-slate-700">Individual</span>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-slate-900">{adminStats.individualUsers}</p>
                          <p className="text-xs text-slate-500">
                            {Math.round((adminStats.individualUsers / Math.max(adminStats.totalUsers, 1)) * 100)}%
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span className="text-sm font-medium text-slate-700">SME</span>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-slate-900">{adminStats.smeUsers}</p>
                          <p className="text-xs text-slate-500">
                            {Math.round((adminStats.smeUsers / Math.max(adminStats.totalUsers, 1)) * 100)}%
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                          <span className="text-sm font-medium text-slate-700">Corporate</span>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-slate-900">{adminStats.corporateUsers}</p>
                          <p className="text-xs text-slate-500">
                            {Math.round((adminStats.corporateUsers / Math.max(adminStats.totalUsers, 1)) * 100)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Active vs Cancelled Subscriptions */}
              <Card className="shadow-xl rounded-2xl border-0">
                <CardHeader className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-t-2xl">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Subscription Status
                  </CardTitle>
                  <p className="text-green-100 text-sm">Active vs cancelled</p>
                </CardHeader>
                <CardContent className="p-6">
                  {isLoading ? (
                    <Skeleton className="h-48 w-full" />
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border-2 border-green-200">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                            <UserCheck className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-600">Active Plans</p>
                            <p className="text-3xl font-bold text-slate-900">{adminStats.activePlans}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className="bg-green-500 text-white hover:bg-green-600">
                            {Math.round((adminStats.activePlans / Math.max(adminStats.activePlans + adminStats.cancelledPlans, 1)) * 100)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border-2 border-red-200">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                            <Ban className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-600">Cancelled Plans</p>
                            <p className="text-3xl font-bold text-slate-900">{adminStats.cancelledPlans}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className="bg-red-500 text-white hover:bg-red-600">
                            {Math.round((adminStats.cancelledPlans / Math.max(adminStats.activePlans + adminStats.cancelledPlans, 1)) * 100)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">Total Subscriptions</span>
                          <span className="text-lg font-bold text-slate-900">{adminStats.activePlans + adminStats.cancelledPlans}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Upgrade / Downgrade Activity */}
              <Card className="shadow-xl rounded-2xl border-0">
                <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-2xl">
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Plan Changes
                  </CardTitle>
                  <p className="text-orange-100 text-sm">Upgrades & downgrades</p>
                </CardHeader>
                <CardContent className="p-6">
                  {isLoading ? (
                    <Skeleton className="h-48 w-full" />
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 bg-green-50 rounded-lg border-l-4 border-green-500">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <TrendingUp className="h-6 w-6 text-green-600" />
                            <div>
                              <p className="text-sm font-medium text-slate-600">Upgrades</p>
                              <p className="text-xs text-slate-500">Plan improvements</p>
                            </div>
                          </div>
                          <p className="text-3xl font-bold text-green-600">{growthStats.upgrades}</p>
                        </div>
                      </div>
                      <div className="p-4 bg-orange-50 rounded-lg border-l-4 border-orange-500">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <TrendingDown className="h-6 w-6 text-orange-600" />
                            <div>
                              <p className="text-sm font-medium text-slate-600">Downgrades</p>
                              <p className="text-xs text-slate-500">Plan reductions</p>
                            </div>
                          </div>
                          <p className="text-3xl font-bold text-orange-600">{growthStats.downgrades}</p>
                        </div>
                      </div>
                      <div className="p-4 bg-red-50 rounded-lg border-l-4 border-red-500">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Ban className="h-6 w-6 text-red-600" />
                            <div>
                              <p className="text-sm font-medium text-slate-600">Cancellations</p>
                              <p className="text-xs text-slate-500">Plan terminations</p>
                            </div>
                          </div>
                          <p className="text-3xl font-bold text-red-600">{growthStats.cancellations}</p>
                        </div>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Trial Conversions
                          </span>
                          <span className="text-lg font-bold text-blue-600">{growthStats.trialsConverted}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </motion.div>

          {/* Weekly / Monthly Toggle Controls */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <span className="text-slate-700 font-semibold">View:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setTimeUnit('week')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    timeUnit === 'week'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setTimeUnit('month')}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    timeUnit === 'month'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 text-sm">Time Range:</span>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="px-4 py-2 rounded-lg border-2 border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:border-blue-500"
              >
                <option value="4weeks">Last 4 Weeks</option>
                <option value="3months">Last 3 Months</option>
                <option value="6months">Last 6 Months</option>
                <option value="1year">Last Year</option>
              </select>
            </div>
          </motion.div>

          {/* Bottom Section - Account Alerts, Quick Actions, System Logs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Account Alerts */}
            <Card className="shadow-xl rounded-2xl border-0">
              <CardHeader className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <UserX className="h-5 w-5" />
                  Account Alerts
                </CardTitle>
                <p className="text-red-100 text-sm">Requires attention</p>
              </CardHeader>
              <CardContent className="p-6">
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Suspended Accounts Alert */}
                    {adminStats.suspendedAccounts > 0 && (
                      <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">Suspended Accounts</p>
                            <p className="text-sm text-slate-600">{adminStats.suspendedAccounts} users suspended</p>
                          </div>
                          <Badge className="bg-red-600">{adminStats.suspendedAccounts}</Badge>
                        </div>
                      </div>
                    )}
                    
                    {/* Trial Expiring Soon */}
                    {adminStats.trialUsers > 0 && (
                      <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">Trial Users</p>
                            <p className="text-sm text-slate-600">{adminStats.trialUsers} on trial period</p>
                          </div>
                          <Badge className="bg-orange-600">{adminStats.trialUsers}</Badge>
                        </div>
                      </div>
                    )}

                    {/* Low Activity Users */}
                    {invoiceActivity.averageInvoicesPerUser < 1 && (
                      <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">Low Activity</p>
                            <p className="text-sm text-slate-600">Avg {invoiceActivity.averageInvoicesPerUser.toFixed(1)} invoices/user</p>
                          </div>
                          <Badge className="bg-yellow-600">!</Badge>
                        </div>
                      </div>
                    )}

                    {adminStats.suspendedAccounts === 0 && adminStats.trialUsers === 0 && invoiceActivity.averageInvoicesPerUser >= 1 && (
                      <div className="text-center py-8 text-slate-500">
                        <UserCheck className="h-12 w-12 mx-auto mb-3 text-green-300" />
                        <p>All clear! No alerts</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions - Sticky */}
            <div className="sticky top-8 z-40 h-fit">
              <Card className="shadow-xl rounded-2xl border-0">
                <CardHeader className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-t-2xl">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Quick Actions
                  </CardTitle>
                  <p className="text-emerald-100 text-sm">Admin tools</p>
                </CardHeader>
                <CardContent className="p-6 space-y-3">
                  <button
                    onClick={() => setCreateAccountDialogOpen(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg group"
                  >
                    <UserPlus className="h-5 w-5" />
                    <span className="font-semibold">Create Account</span>
                  </button>

                  <button
                    onClick={() => window.alert('Suspend User form coming soon')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg group"
                  >
                    <Ban className="h-5 w-5" />
                    <span className="font-semibold">Suspend User</span>
                  </button>

                  <button
                    onClick={() => window.alert('Extend Trial form coming soon')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-md hover:shadow-lg group"
                  >
                    <Clock className="h-5 w-5" />
                    <span className="font-semibold">Extend Trial</span>
                  </button>

                  <button
                    onClick={() => window.alert('Change Plan form coming soon')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl hover:from-purple-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg group"
                  >
                    <RefreshCw className="h-5 w-5" />
                    <span className="font-semibold">Change Plan</span>
                  </button>

                  <button
                    onClick={() => window.alert('Logs & Audit Trail page coming soon')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-800 text-white rounded-xl hover:from-slate-800 hover:to-slate-900 transition-all shadow-md hover:shadow-lg group"
                  >
                    <ScrollText className="h-5 w-5" />
                    <span className="font-semibold">View Logs</span>
                  </button>

                  <button
                    onClick={() => userService.downloadExcel()}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg group"
                  >
                    <Download className="h-5 w-5" />
                    <span className="font-semibold">Export Users</span>
                  </button>
                </CardContent>
              </Card>
            </div>

            {/* System Logs Preview */}
            <Card className="shadow-xl rounded-2xl border-0">
              <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-t-2xl">
                <CardTitle className="flex items-center gap-2">
                  <ScrollText className="h-5 w-5" />
                  System Logs
                </CardTitle>
                <p className="text-purple-100 text-sm">Recent activity</p>
              </CardHeader>
              <CardContent className="p-6">
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : activityLogs.recentActions.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {activityLogs.recentActions.slice(0, 5).map((log, index) => (
                      <div
                        key={log.id || index}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        <p className="font-medium text-slate-900 text-sm">{log.user}</p>
                        <p className="text-xs text-slate-600 mt-1">{log.action}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatDate(new Date(log.timestamp), 'MMM dd, hh:mm a')}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <Activity className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    <p>No recent activity</p>
                  </div>
                )}
                <div className="mt-4 text-center">
                  <button
                    onClick={() => window.alert('Full logs page coming soon')}
                    className="text-sm text-purple-600 hover:text-purple-700 font-semibold"
                  >
                    View All Logs →
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Optional: Additional Metrics - Collapsible */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <details className="group">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between p-4 bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-5 w-5 text-slate-600" />
                    <span className="font-semibold text-slate-900">View Advanced Metrics</span>
                  </div>
                  <TrendingDown className="h-5 w-5 text-slate-400 group-open:rotate-180 transition-transform" />
                </div>
              </summary>
              
              <div className="mt-6 space-y-6">
                {/* Financial Overview */}
                <Card className="shadow-xl rounded-2xl border-0">
                  <CardHeader className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-t-2xl">
                    <CardTitle>Financial Metrics</CardTitle>
                    <p className="text-green-100 text-sm">Revenue insights</p>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-slate-900">
                          {formatCurrency(financialMetrics.mrr, 'ZAR')}
                        </p>
                        <p className="text-sm text-slate-600 mt-1">MRR (ZAR)</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-slate-900">
                          {formatCurrency(financialMetrics.arpu, 'ZAR')}
                        </p>
                        <p className="text-sm text-slate-600 mt-1">ARPU (ZAR)</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-slate-900">
                          {financialMetrics.churnRate.toFixed(1)}%
                        </p>
                        <p className="text-sm text-slate-600 mt-1">Churn Rate</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-slate-900">
                          {formatCurrency(financialMetrics.ltv, 'ZAR')}
                        </p>
                        <p className="text-sm text-slate-600 mt-1">LTV (ZAR)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </details>
          </motion.div>

        </div>
      </div>
    );
  }

  // USER DASHBOARD
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
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Welcome Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent mb-2">
            Welcome back, {userName}! 👋
          </h1>
          <p className="text-slate-600 text-base sm:text-lg">Here&apos;s what&apos;s happening with your business today</p>
        </motion.div>
        
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
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
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
