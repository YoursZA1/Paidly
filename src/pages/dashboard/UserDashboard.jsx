import { OutstandingBalanceService } from "@/services/OutstandingBalanceService";
import { formatQueryError } from "@/utils/apiErrorText";
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

export default function UserDashboard() {
export default function UserDashboard() {
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



  // USER DASHBOARD
  // Unified revenue: from paid/partial invoices (or from payments for collected amount)
  const totalRevenue = invoices.reduce((sum, inv) => {
    if (inv.status === 'paid' || inv.status === 'partial_paid') {
      return sum + (inv.total_amount || 0);
    }
    return sum;
  }, 0);

  const goalYear = calendarYear;
  const revenueForGoalYear = invoices.reduce((sum, inv) => {
    if (inv.status !== 'paid' && inv.status !== 'partial_paid') return sum;
    const raw = inv.invoice_date || inv.created_date || inv.created_at;
    if (!raw) return sum;
    const y = new Date(raw).getFullYear();
    if (Number.isNaN(y) || y !== goalYear) return sum;
    return sum + (Number(inv.total_amount) || 0);
  }, 0);

  const lastYear = calendarYear - 1;
  const lastYearRevenue = invoices.reduce((sum, inv) => {
    if (inv.status !== 'paid' && inv.status !== 'partial_paid') return sum;
    const created = inv.created_date || inv.created_at;
    if (!created || new Date(created).getFullYear() !== lastYear) return sum;
    return sum + (inv.total_amount || 0);
  }, 0);

  const userName = user?.display_name || user?.full_name || 'there';
  const userCurrency = userCurrencyPreference || 'ZAR';
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const rawAnnualTarget =
    businessGoal?.annual_target != null ? Number(businessGoal.annual_target) : 0;
  const revenueTarget =
    Number.isFinite(rawAnnualTarget) && rawAnnualTarget > 0 ? rawAnnualTarget : 0;
  const goalProgress =
    revenueTarget > 0 ? Math.min(100, (revenueForGoalYear / revenueTarget) * 100) : 0;

  const statusColors = dashboardInvoiceStatusColors;

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
  const chipClassName =
    "inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold tracking-tight shadow-sm";
  const outstandingSubtitle = fintechKpis.outstandingCount === 0
    ? 'No unpaid invoices'
    : dueThisWeekCount > 0 || overdueCount > 0
      ? (
        <span className="flex flex-wrap items-center gap-2">
          {dueThisWeekCount > 0 && (
            <span className={`${chipClassName} border-status-pending/35 bg-status-pending/15 text-status-pending`}>
              Due this week: {dueThisWeekCount}
            </span>
          )}
          {overdueCount > 0 && (
            <span className={`${chipClassName} border-status-overdue/35 bg-status-overdue/15 text-status-overdue`}>
              Overdue: {overdueCount}
            </span>
          )}
        </span>
      )
      : `${fintechKpis.outstandingCount} invoice${fintechKpis.outstandingCount !== 1 ? 's' : ''}`;

  return (
    <div className="min-h-full w-full min-w-0 mobile-page">
      <div className="responsive-page-shell w-full min-w-0 py-2 sm:py-6 md:py-8">
        {/* Welcome Header — subtle fade, leads into staggered content */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="mb-2 sm:mb-6"
        >
          <p className="text-xs sm:text-[11px] font-semibold tracking-[0.1em] text-muted-foreground/70 uppercase mb-0.5 sm:mb-1 hidden sm:block">{timeGreeting}</p>
          <h1 className="text-base sm:text-2xl md:text-[28px] font-bold text-foreground mb-0.5 sm:mb-1 font-display leading-tight">
            {user?.company_name || userName}
          </h1>
          <p className="finbank-body text-xs sm:text-sm text-muted-foreground hidden sm:block">Here&apos;s your business overview for today.</p>
        </motion.div>

        {!isAdmin && !profileLoading && profileLoadError && (
            <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Could not load your profile details right now. Core dashboard data is still available; please refresh in a moment.
            </div>
        )}

        {subscriptionBanner && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="mb-4 sm:mb-5 flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5 sm:px-4 sm:py-3 backdrop-blur-sm"
            >
              <span className="text-xs sm:text-sm font-medium text-muted-foreground">Subscription</span>
              <PlanBadge plan={subscriptionBanner.badgePlan} />
              <span className="text-xs sm:text-sm text-foreground">
                {subscriptionBanner.sub.packageLabel}
                <span className="text-muted-foreground"> · {subscriptionBanner.sub.statusLabel}</span>
              </span>
              <Link
                to={`${createPageUrl("Settings")}?tab=subscription`}
                className="text-xs sm:text-sm font-semibold text-primary hover:underline underline-offset-2 ml-auto sm:ml-0"
              >
                Manage
              </Link>
            </motion.div>
        )}

        <AffiliateProgramBanner />

        {/* KPI Carousel — Framer Motion swipe on mobile, grid on desktop */}
        <div className="mb-4 sm:mb-6">
          <div className="glass-card rounded-2xl sm:rounded-fintech border border-border p-4 sm:p-6 mobile-card-wrap">
            {/* Mobile: Framer Motion carousel */}
            <div className="md:hidden">
              <KPICarousel>
                <DashboardStatCard title="Revenue" value={formatCurrency(fintechKpis.revenue, userCurrency)} icon={TrendingUp} iconImageSrc="https://img.icons8.com/liquid-glass/48/economic-improvement.png" iconImageAlt="economic-improvement" isLoading={isLoading} fintech accent="blue" growth={fintechKpis.revenueGrowth} animateFromZero numericValue={fintechKpis.revenue} currencyForAnimation={userCurrency} />
                <DashboardStatCard title="Awaiting payment" value={formatCurrency(fintechKpis.outstandingTotal, userCurrency)} subtitle={outstandingSubtitle} icon={DollarSign} iconImageSrc="https://img.icons8.com/liquid-glass/48/payment-history.png" iconImageAlt="payment-history" isLoading={isLoading} fintech accent="purple" />
                <DashboardStatCard title="VAT / Tax liability" value={formatCurrency(fintechKpis.vatLiability, userCurrency)} subtitle="Set aside for SARS" icon={Landmark} iconImageSrc="https://img.icons8.com/liquid-glass/48/accounting.png" iconImageAlt="accounting" isLoading={isLoading} fintech accent="amber" />
                <DashboardStatCard title="Cash flow" value={formatCurrency(fintechKpis.cashFlow, userCurrency)} icon={Receipt} iconImageSrc="https://img.icons8.com/liquid-glass/48/flow-chart.png" iconImageAlt="flow-chart" isLoading={isLoading} fintech accent="blue" growth={fintechKpis.cashFlowGrowth} />
              </KPICarousel>
            </div>
            {/* Desktop: grid */}
            <motion.div variants={dashboardContainerVariants} initial="hidden" animate="visible" className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <motion.div variants={dashboardItemVariants}><DashboardStatCard title="Revenue" value={formatCurrency(fintechKpis.revenue, userCurrency)} icon={TrendingUp} iconImageSrc="https://img.icons8.com/liquid-glass/48/economic-improvement.png" iconImageAlt="economic-improvement" isLoading={isLoading} fintech accent="blue" growth={fintechKpis.revenueGrowth} animateFromZero numericValue={fintechKpis.revenue} currencyForAnimation={userCurrency} /></motion.div>
              <motion.div variants={dashboardItemVariants}><DashboardStatCard title="Awaiting payment" value={formatCurrency(fintechKpis.outstandingTotal, userCurrency)} subtitle={outstandingSubtitle} icon={DollarSign} iconImageSrc="https://img.icons8.com/liquid-glass/48/payment-history.png" iconImageAlt="payment-history" isLoading={isLoading} fintech accent="purple" /></motion.div>
              <motion.div variants={dashboardItemVariants}><DashboardStatCard title="VAT / Tax liability" value={formatCurrency(fintechKpis.vatLiability, userCurrency)} subtitle="Set aside for SARS" icon={Landmark} iconImageSrc="https://img.icons8.com/liquid-glass/48/accounting.png" iconImageAlt="accounting" isLoading={isLoading} fintech accent="amber" /></motion.div>
              <motion.div variants={dashboardItemVariants}><DashboardStatCard title="Cash flow" value={formatCurrency(fintechKpis.cashFlow, userCurrency)} icon={Receipt} iconImageSrc="https://img.icons8.com/liquid-glass/48/flow-chart.png" iconImageAlt="flow-chart" isLoading={isLoading} fintech accent="blue" growth={fintechKpis.cashFlowGrowth} /></motion.div>
            </motion.div>
          </div>
        </div>

        {/* Total Income — full width, glassmorphism, below KPI carousel on mobile */}
        <div className="mb-4 sm:mb-6 md:hidden w-full max-w-full">
          <CreditCardDisplay balance={totalRevenue} currency={userCurrency} user={user} onRefresh={refreshDashboardData} isDataReady={!isLoading} variant="carousel" />
        </div>

        {/* Mobile: Action buttons + Recent Transactions — premium fintech order */}
        <div className="md:hidden space-y-4 mb-6">
          <div className="glass-card rounded-2xl border border-border p-4">
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-2xl min-h-[48px] h-12 px-4 gap-2 text-base transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] touch-manipulation"
                onClick={() => navigate(createPageUrl("CreateInvoice"))}
              >
                <FileText className="w-5 h-5 shrink-0" />
                New Invoice
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl min-h-[48px] h-12 px-4 gap-2 border-2 border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/20 hover:border-primary/60 text-base transition-all active:scale-[0.98] touch-manipulation"
                onClick={() => navigate(createPageUrl("CashFlow"))}
              >
                <Receipt className="w-5 h-5 shrink-0" />
                Add Expense
              </Button>
            </div>
          </div>
          {/* Recent Transactions — compact mobile list */}
          <div className="glass-card rounded-2xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground font-display">Recent Transactions</h3>
                {mergedTransactions.length > TRANSACTION_PREVIEW_ROWS ? (
                  <span className="text-xs text-muted-foreground">Scroll for more</span>
                ) : null}
              </div>
            </div>
            {mergedTransactions.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <p className="text-muted-foreground text-sm">No transactions yet.</p>
                <p className="text-muted-foreground/80 text-xs mt-1">Paid invoices and expenses will appear here.</p>
              </div>
            ) : (
              <div
                className="max-h-[min(13.5rem,42vh)] overflow-y-auto overscroll-y-contain divide-y divide-border"
                role="region"
                aria-label="Recent transactions, scroll for more"
              >
                {mergedTransactions.map((tx) => {
                  const isIncome = tx.type === 'income';
                  const statusColor = isIncome ? 'bg-status-paid/15 text-status-paid border-status-paid/30' : 'bg-status-pending/15 text-status-pending border-status-pending/30';
                  const displayAmount = isIncome ? tx.amount : Math.abs(tx.amount);
                  return (
                    <div key={tx.id} className="py-4 px-4 min-h-[56px]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm text-foreground truncate flex-1">{tx.label}</p>
                        <p className="font-bold text-sm text-foreground currency-nums shrink-0">
                          {isIncome ? '+' : '-'}{formatCurrency(displayAmount, userCurrency)}
                        </p>
                      </div>
                      <div className="mt-1.5">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-md border ${statusColor}`}>
                          {isIncome ? 'Paid' : 'Expense'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {mergedTransactions.length > 0 && (
              <Link to={createPageUrl("Invoices")} className="block p-4 border-t border-border text-center">
                <span className="text-sm font-medium text-primary">View all transactions</span>
              </Link>
            )}
          </div>
        </div>

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

        
        {/* Main Dashboard Grid — Pro layout: 70% left (Revenue + Recent Invoices), 30% right (Setup, Quick Creator, annual target card, Transactions) */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-4 sm:gap-6 mb-6">
          {/* Left Column (70%) — Revenue trend + Recent Invoices */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* Top row: Total Income (desktop) + Pending Payments */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
              <div className="hidden md:block min-h-[220px]">
                <CreditCardDisplay balance={totalRevenue} currency={userCurrency} user={user} onRefresh={refreshDashboardData} isDataReady={!isLoading} />
              </div>
              <UpcomingPayments invoices={invoices} clients={clients} currency={userCurrency} />
            </div>

            {/* Revenue trend — large chart; lazy-loaded Recharts to avoid blocking initial paint */}
            <div className="glass-card rounded-fintech border border-border p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h3 className="text-lg font-semibold text-foreground font-display">Revenue trend</h3>
                <div className="flex gap-2">
                  {[30, 60, 90].map((range) => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => setRevenueRange(range)}
                      className={`px-3 py-1 text-[11px] font-semibold rounded-full transition-all duration-150 ${
                        revenueRange === range
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : "text-muted-foreground border border-transparent hover:border-border hover:text-foreground"
                      }`}
                    >
                      {range}d
                    </button>
                  ))}
                </div>
              </div>
              {isLoading ? (
                <div className="h-[300px] w-full rounded-xl" aria-hidden>
                  <Skeleton className="h-full w-full rounded-xl bg-white/10 animate-pulse" />
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="h-[300px] w-full rounded-xl" aria-hidden>
                      <Skeleton className="h-full w-full rounded-xl bg-white/10 animate-pulse" />
                    </div>
                  }
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                    className="w-full min-h-[260px] h-[300px]"
                  >
                    <DashboardRevenueChart
                      revenueTrendData={revenueTrendData}
                      userCurrency={userCurrency}
                    />
                  </motion.div>
                </Suspense>
              )}
            </div>

            {/* Recent Invoices — same width as Revenue trend, directly below */}
            <div className="glass-card rounded-fintech border border-border overflow-hidden">
              <div className="p-6 pb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-6 bg-orange-500 rounded-full shrink-0" />
                    <h3 className="text-lg font-semibold text-foreground font-display">Recent Invoices</h3>
                  </div>
                  {invoices.length > RECENT_INVOICES_PREVIEW_ROWS ? (
                    <span className="text-xs text-muted-foreground">
                      Showing {RECENT_INVOICES_PREVIEW_ROWS} of {invoices.length}
                    </span>
                  ) : null}
                </div>
                <Link
                  to={createPageUrl("Invoices")}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors"
                >
                  View All →
                </Link>
              </div>
              <div className="px-6 pb-6">
                {isLoading ? (
                  <div className="overflow-x-auto rounded-lg border border-border/50">
                    <table className="w-full min-w-[320px] text-left">
                      <thead className="sticky top-0 z-[1] border-b border-border bg-muted/30 backdrop-blur-sm">
                        <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                          <th className="py-3 pr-4">Client</th>
                          <th className="py-3 pr-4">Status</th>
                          <th className="py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[1, 2, 3].map((i) => (
                          <tr key={i} className="py-3">
                            <td className="py-3 pr-4">
                              <Skeleton className="h-4 w-28 mb-1 animate-pulse" />
                              <Skeleton className="h-3 w-20 animate-pulse" />
                            </td>
                            <td className="py-3 pr-4">
                              <Skeleton className="h-5 w-16 rounded-full animate-pulse" />
                            </td>
                            <td className="py-3 text-right">
                              <Skeleton className="h-4 w-20 ml-auto animate-pulse" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-60" />
                    <p className="text-sm text-muted-foreground mb-4">No invoices yet</p>
                    <Button
                      size="sm"
                      onClick={() => navigate(createPageUrl("CreateInvoice"))}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Create invoice
                    </Button>
                  </div>
                ) : (
                  <div
                    className="overflow-x-auto rounded-lg border border-border/50"
                    role="region"
                    aria-label={`${RECENT_INVOICES_PREVIEW_ROWS} most recent invoices`}
                  >
                    <table className="w-full min-w-[320px] text-left">
                      <thead className="sticky top-0 z-[1] border-b border-border bg-muted/30 backdrop-blur-sm">
                        <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                          <th className="py-3 pr-4">Client</th>
                          <th className="py-3 pr-4">Status</th>
                          <th className="py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sortedRecentInvoices.map((invoice) => {
                          const client = clients.find((c) => c.id === invoice.client_id);
                          const statusClass = statusColors[invoice.status] || "bg-muted text-muted-foreground";
                          return (
                            <tr
                              key={invoice.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedInvoiceId(invoice.id)}
                              onKeyDown={(e) => e.key === "Enter" && setSelectedInvoiceId(invoice.id)}
                              className="group hover:bg-muted/50 transition-colors cursor-pointer"
                            >
                              <td className="py-3 pr-4">
                                <p className="font-semibold text-foreground text-sm">{client?.name || "Unknown"}</p>
                                <p className="text-[10px] text-muted-foreground">{invoice.invoice_number || `#${invoice.id?.slice(0, 8)}`}</p>
                              </td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusClass} border-0`}>
                                  {getDashboardInvoiceStatusLabel(invoice.status)}
                                </span>
                              </td>
                              <td className="py-3 text-right font-bold text-foreground tabular-nums text-sm">
                                {formatCurrency(invoice.total_amount, userCurrency)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </motion.div>

          {/* Right Column (30%) — Setup Progress, Quick Creator, revenue target, Transactions */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            {user && !isAdmin && (
              <SetupProgressStepper checklist={onboardingChecklist} />
            )}

            {/* Quick Creator — hidden on mobile (shown in mobile block above) */}
            <div className="glass-card rounded-2xl sm:rounded-fintech border border-border p-4 sm:p-5 hidden md:block">
              <h3 className="text-sm font-semibold text-foreground font-display mb-3 tracking-tight hidden sm:block">Quick Creator</h3>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-2">
                <Button
                  size="sm"
                  className="group bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-2xl min-h-[48px] sm:min-h-[36px] h-12 sm:h-9 px-4 gap-2 text-base sm:text-sm transition-all duration-200 ease-out hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] touch-manipulation"
                  onClick={() => navigate(createPageUrl("CreateInvoice"))}
                >
                  <FileText className="w-5 h-5 sm:w-4 sm:h-4 shrink-0" />
                  New Invoice
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="group rounded-2xl min-h-[48px] sm:min-h-[36px] h-12 sm:h-9 px-4 gap-2 border-2 border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/20 hover:border-primary/60 text-base sm:text-sm transition-all duration-200 ease-out active:scale-[0.98] touch-manipulation"
                  onClick={() => navigate(createPageUrl("CashFlow"))}
                >
                  <Receipt className="w-5 h-5 sm:w-4 sm:h-4 shrink-0" />
                  Add Expense
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:inline-flex group rounded-lg h-9 px-4 gap-1.5 border-border text-foreground font-medium hover:bg-muted transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:scale-110"
                  onClick={() => navigate(createPageUrl("Clients"))}
                >
                  <UsersIcon className="w-4 h-4 shrink-0" />
                  Customer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:inline-flex group rounded-lg h-9 px-4 gap-1.5 border-border text-foreground font-medium hover:bg-muted transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:scale-110"
                  onClick={() => navigate(createPageUrl("Services"))}
                >
                  <Headset className="w-4 h-4 shrink-0" />
                  Service
                </Button>
                <Link to={createPageUrl("Invoices")} className="hidden sm:inline-flex sm:ml-auto">
                  <Button variant="ghost" size="sm" className="group rounded-lg h-9 text-muted-foreground hover:text-foreground text-sm font-medium">
                    View all
                  </Button>
                </Link>
              </div>
            </div>

            <GoalProgress
              year={calendarYear}
              progress={goalProgress}
              revenueTarget={revenueTarget}
              currentRevenue={revenueForGoalYear}
              currency={userCurrency}
              onClick={() => setGoalSetterOpen(true)}
            />
            <GoalSetterModal
              isOpen={goalSetterOpen}
              onClose={() => setGoalSetterOpen(false)}
              onSaved={refreshBusinessGoal}
              user={user}
              year={calendarYear}
              initialGoal={businessGoal}
              lastYearRevenue={lastYearRevenue}
            />

            {/* Transaction List — hidden on mobile (shown in mobile block above) */}
            <div className="glass-card rounded-fintech border border-border overflow-hidden hidden md:block">
              <div className="p-4 sm:p-6 border-b border-border flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-base sm:text-lg font-semibold text-foreground font-display">Transactions</h3>
                  {mergedTransactions.length > TRANSACTION_PREVIEW_ROWS ? (
                    <span className="text-xs text-muted-foreground">Scroll for more</span>
                  ) : null}
                </div>
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
                      <Button size="sm" className="rounded-lg bg-primary/10 text-primary border-2 border-primary/40 hover:bg-primary/20 hover:border-primary/60 font-semibold">
                        Add Expense
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div
                  className="max-h-[min(13.5rem,42vh)] overflow-y-auto overscroll-y-contain divide-y divide-border"
                  role="region"
                  aria-label="Transactions, scroll for more"
                >
                  {mergedTransactions.map((tx) => {
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
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Invoice slide-over panel — contextual transition from Recent Invoices */}
      <Sheet open={!!selectedInvoiceId} onOpenChange={(open) => !open && setSelectedInvoiceId(null)}>
        <SheetContent
          side="right"
          className="inset-0 left-0 h-[100dvh] w-full max-w-full sm:max-w-full rounded-none border-0 p-0 overflow-hidden flex flex-col [&>button]:z-10"
        >
          <div className="flex-1 min-h-0 overflow-auto pt-14 pb-4 px-0 sm:px-2">
            {selectedInvoiceId && (
              <Suspense
                fallback={
                  <div className="flex min-h-[40vh] items-center justify-center p-8">
                    <Skeleton className="h-8 w-8 rounded-full" />
                  </div>
                }
              >
                <ViewInvoice
                  invoiceId={selectedInvoiceId}
                  embedded
                  embeddedFullWidth
                  onClose={() => setSelectedInvoiceId(null)}
                />
              </Suspense>
            )}
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
