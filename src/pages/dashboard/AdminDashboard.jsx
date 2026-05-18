import { OutstandingBalanceService } from "@/services/OutstandingBalanceService";
import { ADMIN_ROLE_TIERS } from "@/constants/adminRoles";
import { fetchSupabaseUsers, updateUserRole, deleteUser, addUser, syncAndCleanUsers } from "@/api/userManagement";
import { formatQueryError } from "@/utils/apiErrorText";
import { adminRowPrimaryId, stableDirectoryRowKey } from "@/utils/stableListKey";
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { Invoice } from "@/api/entities";
import { Client } from "@/api/entities";
import { BankingDetail } from "@/api/entities";
import { Expense } from "@/api/entities";
import { Payment } from "@/api/entities";
import { User } from "@/api/entities";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { useAppStore } from "@/stores/useAppStore";
import { useShallow } from "zustand/shallow";
import { useAppContext } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getUserCurrency } from "@/api/currencyProfiles";
import { formatCurrency } from "@/utils/currencyCalculations";
import { useAuth } from "@/contexts/AuthContext";
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
  Landmark,
} from "lucide-react";
import { motion } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import CreditCardDisplay from '@/components/dashboard/CreditCardDisplay';
import KPICarousel from '@/components/dashboard/KPICarousel';
import GoalProgress from '@/components/dashboard/GoalProgress';
import { GoalSetterModal } from '@/components/dashboard/GoalSetterModal';
import UpcomingPayments from '@/components/dashboard/UpcomingPayments';
import { getBusinessGoal, resolveBusinessGoalsUserId } from '@/api/businessGoals';
import { useCalendarYear } from '@/hooks/useCalendarYear';
import SetupProgressStepper from '@/components/dashboard/SetupProgressStepper';
import AffiliateProgramBanner from '@/components/dashboard/AffiliateProgramBanner';
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { useDashboardInvoicesQuery, useDashboardPayslipsQuery } from "@/hooks/useDashboardDocumentsQuery";
import PlanBadge from "@/components/dashboard/PlanBadge";
import { startOfMonth, endOfMonth, format as formatDate, subMonths, startOfDay } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { runPaidConfetti } from '@/utils/confetti';
import {
  registerAdminDashboardRealtimeRefresh,
  PAIDLY_APP_FETCH_ALL_SETTLED_EVENT,
} from "@/lib/realtimeStoreHydration";

import DashboardStatCard from "@/components/dashboard/DashboardStatCard";
import {
  RECENT_INVOICES_PREVIEW_ROWS,
  TRANSACTION_PREVIEW_ROWS,
} from "@/lib/dashboard/dashboardConstants";
import { businessGoalMatchesYear } from "@/lib/dashboard/dashboardCache";
import {
  dashboardContainerVariants,
  dashboardItemVariants,
} from "@/lib/dashboard/dashboardMotion";
import {
  dashboardInvoiceStatusColors,
  getDashboardInvoiceStatusLabel,
} from "@/lib/dashboard/invoiceStatusUi";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";

const DashboardRevenueChart = lazy(() => import("@/components/dashboard/DashboardRevenueChart"));
const ViewInvoice = lazy(() => import("@/pages/ViewInvoice"));

export default function AdminDashboard() {
export default function AdminDashboard() {
  const { user: authUser, session } = useAuth();
  const { loading: appLoading, setLoading: setAppLoading } = useAppContext();
  const {
    profile: profileFromQuery,
    error: profileLoadError,
    isLoading: profileLoading,
  } = useUserProfileQuery();
  const { toast } = useToast();
  const calendarYear = useCalendarYear();
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
          console.warn("Admin users fetch failed:", err?.message || err);
          setSupabaseUsers([]);
          const detail = formatQueryError(err, "Could not load admin user list.");
          const localHint =
            import.meta.env.DEV &&
            (String(err?.code || "").includes("ERR_NETWORK") ||
              /network error|connection refused|failed to fetch/i.test(String(err?.message || "")));
          toast({
            title: localHint ? "Backend unreachable (dev)" : "Admin user list failed",
            description: localHint
              ? "Start the API from the project root: npm run server"
              : detail,
            variant: "destructive",
          });
        } finally {
          setLoadingAdmin(false);
        }
      }
      fetchUsers();
    }
  }, [isAdmin, toast]);

  const [invoicesState, setInvoicesState] = useState([]);
  const [clientsState, setClientsState] = useState([]);
  const [expensesState, setExpensesState] = useState([]);
  const [paymentsState, setPaymentsState] = useState([]);
  const [userState, setUserState] = useState(null);
  const [userCurrencyPreference, setUserCurrencyPreference] = useState('ZAR');
  const [hasBankingDetails, setHasBankingDetails] = useState(false);
  /** After first banking list attempt so we do not show “add banking” while the request is still in flight. */
  const [bankingCheckResolved, setBankingCheckResolved] = useState(false);
  const [isLoadingState, setIsLoadingState] = useState(true);
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
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [businessGoal, setBusinessGoal] = useState(null);
  const [goalSetterOpen, setGoalSetterOpen] = useState(false);
  const [alerts, setAlerts] = useState({
    planLimits: [],
    failedSubscriptions: [],
    highVolumeLowPlan: []
  });
  const navigate = useNavigate();
  const mountedRef = useRef(true);

  // Non-admin: read from global store (filled by Layout fetchAll). Admin: use local state from loadAdminData.
  const {
    storeInvoices,
    storeClients,
    storeExpenses,
    storePayments,
    storeIsLoading,
    fetchAll,
    payslips,
  } = useAppStore(
    useShallow((s) => ({
      storeInvoices: s.invoices,
      storeClients: s.clients,
      storeExpenses: s.expenses,
      storePayments: s.payments,
      storeIsLoading: s.isLoading,
      fetchAll: s.fetchAll,
      payslips: s.payslips,
    }))
  );

  const dashboardInvoicesQuery = useDashboardInvoicesQuery(authUser?.id);
  const dashboardPayslipsQuery = useDashboardPayslipsQuery(authUser?.id);
  const invoices = isAdmin ? invoicesState : storeInvoices;
  const resolvedInvoices = isAdmin
    ? invoices
    : (dashboardInvoicesQuery.data && dashboardInvoicesQuery.data.length > 0 ? dashboardInvoicesQuery.data : invoices);
  const resolvedPayslips = isAdmin
    ? payslips
    : (dashboardPayslipsQuery.data && dashboardPayslipsQuery.data.length > 0 ? dashboardPayslipsQuery.data : payslips);
  const clients = isAdmin ? clientsState : storeClients;
  const expenses = isAdmin ? expensesState : storeExpenses;
  const payments = isAdmin ? paymentsState : storePayments;
  const user = isAdmin ? userState : profileFromQuery ?? authUser;
  useEffect(() => {
    if (isAdmin || !authUser?.id || !profileFromQuery) return;
    const fromSignupOrSession = String(authUser?.plan || authUser?.subscription_plan || "").trim().toLowerCase();
    const fromProfile = String(profileFromQuery?.subscription_plan || profileFromQuery?.plan || "").trim().toLowerCase();
    if (fromSignupOrSession && fromProfile && fromSignupOrSession !== fromProfile) {
      console.error("[dashboard-plan-mismatch] auth user plan differs from DB profile plan", {
        userId: authUser.id,
        authPlan: fromSignupOrSession,
        profilePlan: fromProfile,
      });
    }
  }, [isAdmin, authUser?.id, authUser?.plan, authUser?.subscription_plan, profileFromQuery]);

  const isLoading = isAdmin
    ? isLoadingState
    : storeIsLoading || appLoading || dashboardInvoicesQuery.isLoading || dashboardPayslipsQuery.isLoading;

  const onboardingChecklist = useMemo(() => {
    const businessName = String(user?.company_name || "").trim();
    const business = user?.business && typeof user.business === "object" ? user.business : {};
    const onboarding = business?.onboarding_v2 && typeof business.onboarding_v2 === "object" ? business.onboarding_v2 : {};
    const industry = String(onboarding?.industry || business?.industry || "").trim();
    const onboardingFlowComplete =
      onboarding?.status === "completed" || Boolean(onboarding?.completed_at);
    const hasInvoice = Array.isArray(invoices) && invoices.length > 0;
    const hasClient = Array.isArray(clients) && clients.length > 0;
    // Match product reality: quick setup only requires business name; industry is optional.
    // If the user already has invoices and clients plus a company name, treat business setup as done.
    const setupBusiness =
      Boolean(businessName && industry) ||
      onboardingFlowComplete ||
      (Boolean(businessName) && hasInvoice && hasClient);
    return {
      setup_business: setupBusiness,
      create_first_invoice: hasInvoice,
      add_first_client: hasClient,
    };
  }, [user?.company_name, user?.business, resolvedInvoices, clients]);

  useEffect(() => {
    if (isAdmin || !user?.id) return;
    const business = user?.business && typeof user.business === "object" ? user.business : {};
    const onboarding = business?.onboarding_v2 && typeof business.onboarding_v2 === "object" ? business.onboarding_v2 : {};
    const currentChecklist =
      onboarding?.checklist && typeof onboarding.checklist === "object" ? onboarding.checklist : {};
    const changed =
      currentChecklist.setup_business !== onboardingChecklist.setup_business ||
      currentChecklist.create_first_invoice !== onboardingChecklist.create_first_invoice ||
      currentChecklist.add_first_client !== onboardingChecklist.add_first_client;
    if (!changed) return;
    User.updateMyUserData({
      business: {
        onboarding_v2: {
          ...onboarding,
          checklist: onboardingChecklist,
          updated_at: new Date().toISOString(),
        },
      },
    }).catch(() => {});
  }, [isAdmin, user?.id, user?.business, onboardingChecklist]);

  const openAccount = (user) => {
    const params = new URLSearchParams();
    if (user?.id) params.set('userId', user.id);
    if (user?.email) params.set('email', user.email);
    navigate(`/admin/accounts-management?${params.toString()}`);
  };

  // Keep global app loading in sync for non-admin dashboard renders.
  useEffect(() => {
    if (isAdmin) return;
    setAppLoading(Boolean(storeIsLoading));
  }, [isAdmin, storeIsLoading, setAppLoading]);

  // Clear stale goal immediately when the calendar year advances (before refetch completes).
  useEffect(() => {
    if (isAdmin) return;
    setBusinessGoal((prev) => (businessGoalMatchesYear(prev, calendarYear) ? prev : null));
  }, [calendarYear, isAdmin]);

  useEffect(() => {
    mountedRef.current = true;
    if (!authUser?.id) return () => { mountedRef.current = false; };
    if (isAdmin) {
      loadAdminData();
      return () => { mountedRef.current = false; };
    }
    setIsLoadingState(false);
    setBankingCheckResolved(false);
    let cancelled = false;
    (async () => {
      try {
        const goalUserId = resolveBusinessGoalsUserId(authUser) || authUser.id;
        const [bankingSettled, goalSettled] = await Promise.allSettled([
          withTimeoutRetry(
            () => BankingDetail.list("-created_date", { limit: 50, maxWaitMs: 8000 }),
            20000,
            1
          ),
          goalUserId
            ? withTimeoutRetry(
                () => getBusinessGoal(goalUserId, calendarYear),
                15000,
                1
              ).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled || !mountedRef.current) return;
        const bankingDetailsData =
          bankingSettled.status === "fulfilled" ? bankingSettled.value : [];
        const bankingDetails = Array.isArray(bankingDetailsData) ? bankingDetailsData : [];
        setHasBankingDetails(bankingDetails.length > 0);
        const goalRow =
          goalSettled.status === "fulfilled" ? goalSettled.value ?? null : null;
        setBusinessGoal(businessGoalMatchesYear(goalRow, calendarYear) ? goalRow : null);
        const profile = profileFromQuery;
        if (profile?.currency) setUserCurrencyPreference(profile.currency);
      } catch (err) {
        if (!cancelled && mountedRef.current) console.warn("Dashboard banking/goal fetch failed:", err);
      } finally {
        if (!cancelled && mountedRef.current) setBankingCheckResolved(true);
      }
    })();
    return () => { cancelled = true; mountedRef.current = false; };
  }, [isAdmin, authUser?.id, calendarYear, profileFromQuery]);

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
    setIsLoadingState(true);
    try {
      const currencyPref = await getUserCurrency();
      if (!mountedRef.current) return;
      if (currencyPref?.currency) {
        setUserCurrencyPreference(currencyPref.currency);
      }

      // Use Excel user service instead of broken User entity
      const allUsers = userService.getAllUsers();
      const [invoicesSettled, paymentsSettled] = await Promise.allSettled([
        withTimeoutRetry(() => Invoice.list(), 25000, 1),
        withTimeoutRetry(() => Payment.list().catch(() => []), 15000, 1),
      ]);
      const allInvoices =
        invoicesSettled.status === 'fulfilled' && Array.isArray(invoicesSettled.value)
          ? invoicesSettled.value
          : [];
      const allPayments =
        paymentsSettled.status === 'fulfilled' && Array.isArray(paymentsSettled.value)
          ? paymentsSettled.value
          : [];
      if (invoicesSettled.status === 'rejected') {
        console.warn('Admin dashboard: invoices load failed, continuing with partial data.', invoicesSettled.reason);
      }
      if (paymentsSettled.status === 'rejected') {
        console.warn('Admin dashboard: payments load failed, continuing with partial data.', paymentsSettled.reason);
      }
      if (!mountedRef.current) return;
      setInvoicesState(allInvoices);
      setPaymentsState(Array.isArray(allPayments) ? allPayments : []);
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
      if (!mountedRef.current) return;
      console.error("Error loading admin dashboard data:", error);
      toast({
        title: "Could not load dashboard",
        description: error?.message || "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) setIsLoadingState(false);
    }
  }, [toast]); // useCallback


  const refreshBusinessGoal = useCallback(async () => {
    const uid = resolveBusinessGoalsUserId(user) || user?.id;
    if (!uid) return;
    const goal = await getBusinessGoal(uid, calendarYear).catch(() => null);
    setBusinessGoal(businessGoalMatchesYear(goal, calendarYear) ? goal : null);
  }, [user, calendarYear]);

  const refreshDashboardData = useCallback(async () => {
    if (isAdmin) {
      await loadAdminData();
      return;
    }
    await fetchAll(authUser || null, {
      accessToken: session?.accessToken ?? null,
      full: true,
    });
    await refreshBusinessGoal();
  }, [authUser, fetchAll, isAdmin, loadAdminData, refreshBusinessGoal, session?.accessToken]);

  /** Admin aggregate dashboard: SyncEngine debounces DB events → reload local admin state when this screen is mounted. */
  useEffect(() => {
    if (!isAdmin) return undefined;
    return registerAdminDashboardRealtimeRefresh(() => {
      void loadAdminData();
    });
  }, [isAdmin, loadAdminData]);

  /** After SyncEngine-driven `fetchAll` (realtime), refresh goal row without a second global fetch. */
  useEffect(() => {
    if (isAdmin) return undefined;
    const onSettled = () => {
      void refreshBusinessGoal();
    };
    window.addEventListener(PAIDLY_APP_FETCH_ALL_SETTLED_EVENT, onSettled);
    return () => window.removeEventListener(PAIDLY_APP_FETCH_ALL_SETTLED_EVENT, onSettled);
  }, [isAdmin, refreshBusinessGoal]);

  const {
    revenueTrendData,
    fintechKpis,
    mergedTransactions,
    sortedRecentInvoices,
    subscriptionBanner,
  } = useDashboardMetrics({
    resolvedInvoices,
    resolvedPayslips,
    expenses,
    clients,
    revenueRange,
    isAdmin,
    profileFromQuery,
    authUser,
  });


  // ADMIN DASHBOARD
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-background w-full min-w-0 py-4 sm:py-6 lg:py-8">
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 w-full min-w-0">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-foreground font-display">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Is the business healthy today?</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Revenue (Today / MTD / YTD) */}
            <Card className="border-0 shadow-sm">
              <CardContent>
                <p className="text-xs text-muted-foreground">Total Revenue</p>
                <p className="currency-nums tabular-nums min-w-0 break-words text-sm font-semibold leading-snug text-foreground sm:text-base">
                  {formatCurrency(adminStats.revenue, 'ZAR')}
                </p>
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
              <CardContent>
                <p className="text-xs text-muted-foreground">Active Businesses</p>
                <p className="tabular-nums min-w-0 text-sm font-semibold leading-snug text-foreground sm:text-base">{adminStats.activeUsers}</p>
              </CardContent>
            </Card>
            {/* Active Subscriptions */}
            <Card className="border-0 shadow-sm">
              <CardContent>
                <p className="text-xs text-muted-foreground">Active Subscriptions</p>
                <p className="tabular-nums min-w-0 text-sm font-semibold leading-snug text-foreground sm:text-base">{adminStats.activeSubscribers}</p>
              </CardContent>
            </Card>
            {/* Total Transactions (24h) */}
            <Card className="border-0 shadow-sm">
              <CardContent>
                <p className="text-xs text-muted-foreground">Total Transactions (24h)</p>
                <p className="tabular-nums min-w-0 text-sm font-semibold leading-snug text-foreground sm:text-base">{
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
              <CardContent>
                <p className="text-xs text-muted-foreground">Failed Payments</p>
                <p className="tabular-nums min-w-0 text-sm font-semibold leading-snug text-foreground sm:text-base">{
                  invoices.filter(inv => inv.status === 'failed' || inv.status === 'overdue').length
                }</p>
              </CardContent>
            </Card>
            {/* Pending Payouts */}
            <Card className="border-0 shadow-sm">
              <CardContent>
                <p className="text-xs text-muted-foreground">Pending Payouts</p>
                <p className="tabular-nums min-w-0 text-sm font-semibold leading-snug text-foreground sm:text-base">{
                  invoices.filter(inv => inv.status === 'pending_payout' || inv.status === 'awaiting_payout').length
                }</p>
              </CardContent>
            </Card>
            {/* Platform Balance */}
            <Card className="border-0 shadow-sm">
              <CardContent>
                <p className="text-xs text-muted-foreground">Platform Balance</p>
                <p className="currency-nums tabular-nums min-w-0 break-words text-sm font-semibold leading-snug text-foreground sm:text-base">
                  {formatCurrency(OutstandingBalanceService.calculateTotalOutstanding(invoices).totalOutstanding, 'ZAR')}
                </p>
              </CardContent>
            </Card>
            {/* System Alerts */}
            <Card className="border-0 shadow-sm">
              <CardContent>
                <p className="text-xs text-muted-foreground">System Alerts</p>
                <p className="tabular-nums min-w-0 text-sm font-semibold leading-snug text-foreground sm:text-base">{alerts.planLimits.length + alerts.failedSubscriptions.length + alerts.highVolumeLowPlan.length}</p>
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
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={revenueTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.1)" vertical={false} />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          color: 'hsl(var(--card-foreground))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '11px',
                        }}
                        formatter={(value) => formatCurrency(Number(value || 0), 'ZAR')}
                      />
                      <Line type="monotone" dataKey="value" stroke="#f24e00" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#f24e00', stroke: '#fff', strokeWidth: 2 }} />
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
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
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
                <CardContent className="space-y-3">
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
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={timeBreakdown.usersPerWeek}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.1)" vertical={false} />
                        <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            color: 'hsl(var(--card-foreground))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '11px',
                          }}
                        />
                        <Line type="monotone" dataKey="users" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
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
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={timeBreakdown.revenuePerMonth}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.1)" vertical={false} />
                        <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
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
                <CardContent className="space-y-3">
                  {alerts.planLimits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No plan limits reached.</p>
                  ) : (
                    alerts.planLimits.slice(0, 4).map((user, idx) => (
                      <div key={stableDirectoryRowKey(user, idx)} className="flex items-center justify-between">
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
                <CardContent className="space-y-3">
                  {alerts.failedSubscriptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No failed subscriptions.</p>
                  ) : (
                    alerts.failedSubscriptions.slice(0, 4).map((user, idx) => (
                      <div key={stableDirectoryRowKey(user, idx)} className="flex items-center justify-between">
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
                <CardContent className="space-y-3">
                  {alerts.highVolumeLowPlan.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No upgrade candidates.</p>
                  ) : (
                    alerts.highVolumeLowPlan.slice(0, 4).map((user, idx) => (
                      <div key={stableDirectoryRowKey(user, idx)} className="flex items-center justify-between">
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
