import { OutstandingBalanceService } from "@/services/OutstandingBalanceService";
import { ADMIN_ROLE_TIERS } from "@/constants/adminRoles";
import { fetchSupabaseUsers, updateUserRole, deleteUser, addUser, syncAndCleanUsers } from "@/api/userManagement";
import { formatQueryError } from "@/utils/apiErrorText";
import { adminRowPrimaryId, stableDirectoryRowKey } from "@/utils/stableListKey";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Invoice } from "@/api/entities";
import { Client } from "@/api/entities";
import { BankingDetail } from "@/api/entities";
import { Expense } from "@/api/entities";
import { Payment } from "@/api/entities";
import { User } from "@/api/entities";
import { Service } from "@/api/entities";
import { PurchaseOrder } from "@/api/entities";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { useAppStore } from "@/stores/useAppStore";
import { useShallow } from "zustand/shallow";
import { useAppContext } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getUserCurrency } from "@/api/currencyProfiles";
import { formatCurrency } from "@/utils/currencyCalculations";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { userService } from "@/services/ExcelUserService";
import { normalizePaidPackageKey } from "@/lib/subscriptionPlan";
import CreateAccountDialog from "@/components/CreateAccountDialog";
import {
  FileText,
  Users as UsersIcon,
  Plus,
  Headset,
  Receipt,
  Store,
} from "lucide-react";
import {
  isInvoicePaidLike,
  isInvoiceExcludedFromAging,
  invoiceStatusLabel,
  normalizeInvoiceStatus,
} from "@shared/commercial/documentStatuses.js";
import { motion } from "framer-motion";
import ViewInvoice from "@/pages/ViewInvoice";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import GoalProgress from '@/components/dashboard/GoalProgress';
import { GoalSetterModal } from '@/components/dashboard/GoalSetterModal';
import UpcomingPayments from '@/components/dashboard/UpcomingPayments';
import { getBusinessGoal, resolveBusinessGoalsUserId } from '@/api/businessGoals';
import { useCalendarYear } from '@/hooks/useCalendarYear';
import SetupProgressStepper from '@/components/dashboard/SetupProgressStepper';
import PosSalesCard from '@/components/dashboard/PosSalesCard';
import useCompanyContext from "@/hooks/useCompanyContext";
import { useCanShowPosNav } from "@/hooks/useCanShowPosNav";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { useDashboardInvoicesQuery, useDashboardPayslipsQuery } from "@/hooks/useDashboardDocumentsQuery";
import { useDashboardRevenueSourcesQuery } from "@/hooks/useDashboardRevenueSourcesQuery";
import DashboardRevenueWidget from "@/components/dashboard/DashboardRevenueWidget";
import CompanyMemberDashboard from "@/components/dashboard/CompanyMemberDashboard";
import DashboardSubscriptionBanner from "@/components/dashboard/DashboardSubscriptionBanner";
import FinancialSummary from "@/components/dashboard/FinancialSummary";
import { useCurrentSubscriptionQuery } from "@/hooks/useCurrentSubscriptionQuery";
import { startOfMonth, endOfMonth, format as formatDate, subMonths, startOfDay } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { computeDashboardFinancials } from "@/lib/dashboard/financialSummary";
import { computeDashboardRevenue } from "@/lib/dashboard/revenueComposition";
import { mergeRowsById } from "@/lib/dashboard/listDashboardRevenueSources";
import {
  registerAdminDashboardRealtimeRefresh,
  PAIDLY_APP_FETCH_ALL_SETTLED_EVENT,
} from "@/lib/realtimeStoreHydration";

/** Recent Invoices preview on the user dashboard; full list is on Invoices. */
const RECENT_INVOICES_PREVIEW_ROWS = 3;
/** Transactions lists (mobile + desktop): ~3 rows visible, then scroll. */
const TRANSACTION_PREVIEW_ROWS = 3;
const TRANSACTIONS_SOURCE_EACH = 30;
const TRANSACTIONS_MERGED_MAX = 60;

const DASHBOARD_CACHE_KEY = (userId) => `paidly_dashboard_cache_${userId || "anon"}`;

function setCachedDashboard(userId, data) {
  if (!userId || !data) return;
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY(userId), JSON.stringify({ ...data, ts: Date.now() }));
  } catch {
    // ignore quota or parse errors
  }
}

/** Drop in-memory goal rows when the dashboard year changes (e.g. New Year) or legacy rows lack `year`. */
function businessGoalMatchesYear(goal, calendarYear) {
  if (!goal || calendarYear == null) return false;
  const y = Number(goal.year);
  return Number.isFinite(y) && y === Number(calendarYear);
}

export default function Dashboard() {
  const { user: authUser } = useAuth();
  const isAdmin = (authUser?.role || "user") === "admin";
  const { companyId, loading: companyCtxLoading, showBusinessDashboard } = useCompanyContext();

  if (!isAdmin && !companyCtxLoading && companyId && !showBusinessDashboard) {
    return <CompanyMemberDashboard />;
  }

  return <DashboardMain />;
}

function DashboardMain() {
  const { user: authUser, session } = useAuth();
  const canShowPosEntry = useCanShowPosNav();
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
  const [inventoryProductsState, setInventoryProductsState] = useState([]);
  const [outstandingPurchaseOrdersState, setOutstandingPurchaseOrdersState] = useState([]);
  const [paymentsState, setPaymentsState] = useState([]);
  const [userState, setUserState] = useState(null);
  const [userCurrencyPreference, setUserCurrencyPreference] = useState('ZAR');
  const [, setHasBankingDetails] = useState(false);
  /** After first banking list attempt so we do not show “add banking” while the request is still in flight. */
  const [, setBankingCheckResolved] = useState(false);
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
    starterUsers: 0,
    businessUsers: 0,
    growthUsers: 0,
    enterpriseUsers: 0,
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
  const checklistPersistKeyRef = useRef("");

  // Non-admin: read from global store (filled by Layout fetchAll). Admin: use local state from loadAdminData.
  const {
    storeInvoices,
    storeClients,
    storeExpenses,
    storePayments,
    storeQuotes,
    storeIsLoading,
    fetchAll,
    payslips,
  } = useAppStore(
    useShallow((s) => ({
      storeInvoices: s.invoices,
      storeClients: s.clients,
      storeExpenses: s.expenses,
      storePayments: s.payments,
      storeQuotes: s.quotes,
      storeIsLoading: s.isLoading,
      fetchAll: s.fetchAll,
      payslips: s.payslips,
    }))
  );

  const dashboardInvoicesQuery = useDashboardInvoicesQuery(authUser?.id);
  const dashboardPayslipsQuery = useDashboardPayslipsQuery(authUser?.id);
  const revenueSourcesQuery = useDashboardRevenueSourcesQuery(authUser?.id, !isAdmin);
  const currentSubscriptionQuery = useCurrentSubscriptionQuery({ enabled: !isAdmin });
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
  const quotes = isAdmin ? [] : (Array.isArray(storeQuotes) ? storeQuotes : []);
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
    const persistKey = JSON.stringify(onboardingChecklist);
    if (checklistPersistKeyRef.current === persistKey) return;
    checklistPersistKeyRef.current = persistKey;
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

  // Inventory figures (shown only when product catalog items exist)
  // self-contained fetch, independent of the invoice/expense loading pipeline above.
  useEffect(() => {
    if (isAdmin || !authUser?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [servicesSettled, posSettled] = await Promise.allSettled([
          withTimeoutRetry(() => Service.list(), 15000, 1),
          withTimeoutRetry(() => PurchaseOrder.list(), 15000, 1),
        ]);
        if (cancelled || !mountedRef.current) return;
        const services = servicesSettled.status === 'fulfilled' && Array.isArray(servicesSettled.value)
          ? servicesSettled.value
          : [];
        setInventoryProductsState(services.filter((s) => s.item_type === 'product'));
        const purchaseOrders = posSettled.status === 'fulfilled' && Array.isArray(posSettled.value)
          ? posSettled.value
          : [];
        setOutstandingPurchaseOrdersState(
          purchaseOrders.filter((po) => po.status === 'draft' || po.status === 'approved')
        );
      } catch (err) {
        if (!cancelled) console.warn('Dashboard: inventory KPI fetch failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, authUser?.id]);

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
          return createdDate >= monthStart && createdDate <= monthEnd && isInvoicePaidLike(inv.status);
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
        .filter(inv => isInvoicePaidLike(inv.status))
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
          return createdDate >= lastMonthStart && createdDate <= lastMonthEnd && isInvoicePaidLike(inv.status);
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

      // Plan breakdown by current catalog family (legacy slugs map in via normalizePaidPackageKey)
      const starterUsers = allUsers.filter((u) => normalizePaidPackageKey(u.plan) === "starter").length;
      const businessUsers = allUsers.filter((u) => normalizePaidPackageKey(u.plan) === "business").length;
      const growthUsers = allUsers.filter((u) => normalizePaidPackageKey(u.plan) === "growth").length;
      const enterpriseUsers = allUsers.filter((u) => normalizePaidPackageKey(u.plan) === "enterprise").length;
      
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
        starterUsers,
        businessUsers,
        growthUsers,
        enterpriseUsers,
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

      const lowPlans = ["free", "trial", "starter", "basic"];
      const highVolumeThresholds = {
        free: 10,
        trial: 10,
        basic: 15,
        individual: 15,
        starter: 15,
        sme: 40,
        professional: 40,
        business: 40,
        corporate: 80,
        growth: 80,
        enterprise: 120,
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

  const _loadUserData = useCallback(async (hasCachedData = false, _authUserId = null) => {
    if (!hasCachedData) setIsLoadingState(true);
    try {
      const userResult = profileFromQuery || authUser || null;

      if (!userResult) {
        throw new Error("Not authenticated");
      }

      const [invoicesSettled, clientsSettled, expensesSettled, paymentsSettled, bankingSettled] =
        await Promise.allSettled([
          withTimeoutRetry(() => Invoice.list("-created_date"), 25000, 1),
          withTimeoutRetry(() => Client.list("-created_date"), 20000, 1),
          withTimeoutRetry(() => Expense.list("-date", 100), 20000, 1),
          withTimeoutRetry(() => Payment.list().catch(() => []), 12000, 1),
          withTimeoutRetry(() => BankingDetail.list(), 12000, 0),
        ]);

      const invoicesData =
        invoicesSettled.status === 'fulfilled' && Array.isArray(invoicesSettled.value)
          ? invoicesSettled.value
          : [];
      const clientsData =
        clientsSettled.status === 'fulfilled' && Array.isArray(clientsSettled.value)
          ? clientsSettled.value
          : [];
      const expensesData =
        expensesSettled.status === 'fulfilled' && Array.isArray(expensesSettled.value)
          ? expensesSettled.value
          : [];
      const paymentsData =
        paymentsSettled.status === 'fulfilled' && Array.isArray(paymentsSettled.value)
          ? paymentsSettled.value
          : [];
      const bankingDetailsData =
        bankingSettled.status === 'fulfilled' && Array.isArray(bankingSettled.value)
          ? bankingSettled.value
          : [];

      if (invoicesSettled.status === 'rejected') {
        console.warn('Dashboard: invoices load failed, continuing with partial data.', invoicesSettled.reason);
      }
      if (clientsSettled.status === 'rejected') {
        console.warn('Dashboard: clients load failed, continuing with partial data.', clientsSettled.reason);
      }
      if (expensesSettled.status === 'rejected') {
        console.warn('Dashboard: expenses load failed, continuing with partial data.', expensesSettled.reason);
      }
      if (paymentsSettled.status === 'rejected') {
        console.warn('Dashboard: payments load failed, continuing with partial data.', paymentsSettled.reason);
      }
      if (bankingSettled.status === 'rejected') {
        console.warn('Dashboard: banking details load failed, continuing with partial data.', bankingSettled.reason);
      }

      const goalUid = resolveBusinessGoalsUserId(userResult) || userResult.id;
      const goalRow = goalUid
        ? await withTimeoutRetry(() => getBusinessGoal(goalUid, calendarYear), 10000, 0).catch(() => null)
        : null;

      if (!mountedRef.current) return;

      const bankingDetails = Array.isArray(bankingDetailsData) ? bankingDetailsData : [];
      const currencyFromProfile = userResult?.currency || 'ZAR';

      setInvoicesState(invoicesData);
      setClientsState(clientsData);
      setUserState(userResult);
      setExpensesState(expensesData);
      setPaymentsState(Array.isArray(paymentsData) ? paymentsData : []);
      setHasBankingDetails(bankingDetails.length > 0);
      setUserCurrencyPreference(currencyFromProfile);
      const normalizedGoal = businessGoalMatchesYear(goalRow, calendarYear) ? goalRow : null;
      setBusinessGoal(normalizedGoal);

      // Use userResult.id for the cache key (not authUserId from closure)
      setCachedDashboard(userResult.id, {
        invoices: invoicesData,
        clients: clientsData,
        expenses: expensesData,
        payments: Array.isArray(paymentsData) ? paymentsData : [],
        user: userResult,
        userCurrencyPreference: currencyFromProfile,
        hasBankingDetails: bankingDetails.length > 0,
        businessGoal: normalizedGoal
      });
    } catch (error) {
      if (!mountedRef.current) return;
      console.error("Error loading dashboard data:", error);
      toast({
        title: "Could not load dashboard",
        description: error?.message || "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) setIsLoadingState(false);
    }
  }, [toast, calendarYear, profileFromQuery, authUser]);

  const refreshBusinessGoal = useCallback(async () => {
    const uid = resolveBusinessGoalsUserId(user) || user?.id;
    if (!uid) return;
    const goal = await getBusinessGoal(uid, calendarYear).catch(() => null);
    setBusinessGoal(businessGoalMatchesYear(goal, calendarYear) ? goal : null);
  }, [user, calendarYear]);

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

  const revenueTrendData = useMemo(() => {
    const now = new Date();
    const days = Number(revenueRange) || 30;
    const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const buckets = new Map();

    for (let i = 0; i < days; i += 1) {
      const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      buckets.set(formatDate(date, 'MMM d'), 0);
    }

    const paidOrPartial = (inv) => isInvoicePaidLike(inv.status);
    resolvedInvoices.filter(paidOrPartial).forEach(inv => {
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
  }, [resolvedInvoices, revenueRange]);

  const financials = useMemo(
    () =>
      computeDashboardFinancials({
        invoices: resolvedInvoices,
        payments,
        quotes,
      }),
    [resolvedInvoices, payments, quotes]
  );

  const revenueSourceArgs = useMemo(
    () => ({
      invoices: mergeRowsById(resolvedInvoices, revenueSourcesQuery.data?.invoices),
      payments: mergeRowsById(payments, revenueSourcesQuery.data?.payments),
      posSales: revenueSourcesQuery.data?.posSales || [],
      quotes: mergeRowsById(quotes, revenueSourcesQuery.data?.quotes),
    }),
    [resolvedInvoices, payments, quotes, revenueSourcesQuery.data]
  );

  const revenueBreakdown = useMemo(
    () => computeDashboardRevenue({ ...revenueSourceArgs, rangeDays: revenueRange }),
    [revenueSourceArgs, revenueRange]
  );

  const revenueHeroByPeriod = useMemo(
    () => ({
      month: computeDashboardRevenue({ ...revenueSourceArgs, period: "month" }),
      year: computeDashboardRevenue({ ...revenueSourceArgs, period: "year" }),
    }),
    [revenueSourceArgs]
  );

  const inventoryKpis = useMemo(() => {
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let inventoryValue = 0;
    for (const product of inventoryProductsState) {
      const stock = Number(product.stock_quantity ?? 0);
      const threshold = Number(product.low_stock_threshold ?? 10);
      if (stock <= 0) outOfStockCount += 1;
      else if (stock <= threshold) lowStockCount += 1;
      inventoryValue += stock * Number(product.cost_price ?? 0);
    }
    return {
      lowStockCount,
      outOfStockCount,
      inventoryValue,
      outstandingPOs: outstandingPurchaseOrdersState.length,
    };
  }, [inventoryProductsState, outstandingPurchaseOrdersState]);

  const recentTransactions = useMemo(
    () =>
      resolvedInvoices
        .filter((inv) => isInvoicePaidLike(inv.status))
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
        .slice(0, TRANSACTIONS_SOURCE_EACH),
    [resolvedInvoices]
  );

  const mergedTransactions = useMemo(() => {
    const income = recentTransactions.map((inv) => ({
      id: `inv-${inv.id}`,
      type: 'income',
      date: inv.created_date,
      label: clients.find((c) => c.id === inv.client_id)?.name || 'Invoice',
      amount: Number(inv.total_amount) || 0,
    }));
    const expense = expenses.slice(0, TRANSACTIONS_SOURCE_EACH).map((exp) => ({
      id: `exp-${exp.id}`,
      type: 'expense',
      date: exp.date || exp.created_date,
      label: exp.description || 'Expense',
      amount: -(Number(exp.amount) || 0),
    }));
    return [...income, ...expense]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, TRANSACTIONS_MERGED_MAX);
  }, [recentTransactions, expenses, clients]);

  const sortedRecentInvoices = useMemo(
    () =>
      [...resolvedInvoices]
        .sort(
          (a, b) =>
            new Date(b.created_date || b.created_at || 0) - new Date(a.created_date || a.created_at || 0)
        )
        .slice(0, RECENT_INVOICES_PREVIEW_ROWS),
    [resolvedInvoices]
  );

  const billingProfileFallback = useMemo(
    () => ({
      ...(authUser || {}),
      ...(profileFromQuery || {}),
    }),
    [authUser, profileFromQuery]
  );

  // ADMIN DASHBOARD — platform staff use /admin-v2. Do not show tenant-scoped or localStorage KPIs here.
  if (isAdmin) {
    return <Navigate to="/admin-v2" replace />;
  }

  // COMPANY MEMBER DASHBOARD — rendered by Dashboard() wrapper before DashboardMain mounts.

  // USER DASHBOARD
  // Unified revenue: from paid/partial invoices (or from payments for collected amount)
  const totalRevenue = invoices.reduce((sum, inv) => {
    if (isInvoicePaidLike(inv.status)) {
      return sum + (inv.total_amount || 0);
    }
    return sum;
  }, 0);

  const goalYear = calendarYear;
  const revenueForGoalYear = invoices.reduce((sum, inv) => {
    if (!isInvoicePaidLike(inv.status)) return sum;
    const raw = inv.invoice_date || inv.created_date || inv.created_at;
    if (!raw) return sum;
    const y = new Date(raw).getFullYear();
    if (Number.isNaN(y) || y !== goalYear) return sum;
    return sum + (Number(inv.total_amount) || 0);
  }, 0);

  const lastYear = calendarYear - 1;
  const lastYearRevenue = invoices.reduce((sum, inv) => {
    if (!isInvoicePaidLike(inv.status)) return sum;
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

  const statusColors = {
    paid: "text-status-paid",
    sent: "text-status-sent",
    sending: "text-primary",
    preparing: "text-primary",
    viewed: "text-status-sent",
    draft: "text-muted-foreground",
    overdue: "text-status-overdue",
    partial_paid: "text-status-pending",
    partially_paid: "text-status-pending",
    cancelled: "text-status-declined",
    void: "text-status-declined",
  };

  const getStatusLabel = (status) => invoiceStatusLabel(status);

  const today = startOfDay(new Date());
  const endOfThisWeek = new Date(today);
  endOfThisWeek.setDate(endOfThisWeek.getDate() + 7);
  const dueThisWeekCount = invoices.filter((inv) => {
    if (isInvoiceExcludedFromAging(inv.status)) return false;
    const raw = inv.due_date || inv.delivery_date;
    const due = raw ? startOfDay(new Date(raw)) : null;
    return due && due >= today && due <= endOfThisWeek;
  }).length;
  const outstandingHint =
    financials.outstandingCount === 0
      ? "No unpaid invoices"
      : [
          `${financials.outstandingCount} invoice${financials.outstandingCount === 1 ? "" : "s"} awaiting payment`,
          financials.overdueCount > 0 ? `${financials.overdueCount} overdue` : null,
          dueThisWeekCount > 0 ? `${dueThisWeekCount} due this week` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const draftTotal = financials.draftInvoiceCount + financials.draftQuoteCount;
  const draftsHint = [
    financials.draftInvoiceCount > 0
      ? `${financials.draftInvoiceCount} invoice${financials.draftInvoiceCount === 1 ? "" : "s"}`
      : null,
    financials.draftQuoteCount > 0
      ? `${financials.draftQuoteCount} quote${financials.draftQuoteCount === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ") || "No drafts";

  return (
    <div className="min-h-full w-full min-w-0 mobile-page">
      <div className="responsive-page-shell w-full min-w-0 py-2 sm:py-6 md:py-8">
        <header className="mb-6 sm:mb-8">
          <p className="mb-1 hidden text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:block">{timeGreeting}</p>
          <h1 className="font-display text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
            {user?.company_name || userName}
          </h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">Business overview</p>
        </header>

        {!isAdmin && !profileLoading && profileLoadError && (
            <p className="mb-6 border-l-2 border-status-pending pl-3 text-sm text-muted-foreground">
              Could not load your profile details right now. Core dashboard data is still available.
            </p>
        )}

        <DashboardSubscriptionBanner
          serverStatus={currentSubscriptionQuery.data || null}
          profileFallback={billingProfileFallback}
          isLoading={currentSubscriptionQuery.isLoading && !currentSubscriptionQuery.data}
        />

        <div className="mb-8">
          <FinancialSummary
            heroByPeriod={revenueHeroByPeriod}
            currency={userCurrency}
            outstanding={formatCurrency(financials.outstandingTotal, userCurrency)}
            outstandingHint={outstandingHint}
            overdue={formatCurrency(financials.overdueAmount, userCurrency)}
            overdueHint={
              financials.overdueCount === 0
                ? "No overdue invoices"
                : `${financials.overdueCount} overdue invoice${financials.overdueCount === 1 ? "" : "s"}`
            }
            pending={formatCurrency(financials.pendingAmount, userCurrency)}
            pendingHint={
              financials.pendingCount === 0
                ? "No invoices awaiting payment"
                : `${financials.pendingCount} awaiting payment`
            }
            drafts={String(draftTotal)}
            draftsHint={draftsHint}
            quoted={formatCurrency(financials.quotedValue, userCurrency)}
            quotedHint="Proposed quote value — not revenue"
            invoiced={formatCurrency(financials.invoicedValue, userCurrency)}
            invoicedHint="Issued invoices, excluding drafts"
            isLoading={isLoading}
          />
        </div>

        {inventoryProductsState.length > 0 && (
          <div className="mb-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Low stock</p>
              <p className="currency-nums mt-1 text-lg font-medium tabular-nums">{inventoryKpis.lowStockCount}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {inventoryKpis.lowStockCount === 0 ? "No low-stock items" : "At or below threshold"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Out of stock</p>
              <p className="currency-nums mt-1 text-lg font-medium tabular-nums">{inventoryKpis.outOfStockCount}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Inventory value</p>
              <p className="currency-nums mt-1 break-words text-lg font-medium tabular-nums">{formatCurrency(inventoryKpis.inventoryValue, userCurrency)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Outstanding POs</p>
              <p className="currency-nums mt-1 text-lg font-medium tabular-nums">{inventoryKpis.outstandingPOs}</p>
            </div>
          </div>
        )}

        {/* Mobile: quick actions only — transactions appear with the later card */}
        <div className="md:hidden space-y-4 mb-6">
          <div className="border-y border-border py-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="dashboard-cta rounded-2xl min-h-11"
                onClick={() => navigate(createPageUrl("CreateInvoice"))}
              >
                <FileText className="w-4 h-4 shrink-0" />
                New Invoice
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl border-primary/40 text-primary min-h-11"
                onClick={() => navigate(createPageUrl("CashFlow"))}
              >
                <Receipt className="w-4 h-4 shrink-0" />
                Add Expense
              </Button>
              {canShowPosEntry ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="col-span-2 rounded-2xl dashboard-cta min-h-11"
                  onClick={() => navigate(createPageUrl("POS"))}
                >
                  <Store className="w-4 h-4 shrink-0" />
                  POS
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {!isLoading && totalRevenue === 0 && (
          <p className="mb-6 text-sm text-muted-foreground">
            No billed revenue yet.{" "}
            <Link
              to={createPageUrl("Clients")}
              className="font-medium text-primary underline underline-offset-2 hover:text-primary/90"
            >
              Import clients from Excel
            </Link>
            {" "}if you already have a list.
          </p>
        )}

        {isAdmin && (
          <div className="dashboard-card mb-6 p-6">
            <h2 className="text-base font-semibold mb-4 text-foreground">Admin Roles Management</h2>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label htmlFor="dashboard-admin-role" className="text-sm font-medium text-muted-foreground">Role:</label>
              <select
                id="dashboard-admin-role"
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {ADMIN_ROLE_TIERS.map(role => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </select>
              {roleInfo?.description && (
                <span className="text-xs text-muted-foreground">{roleInfo.description}</span>
              )}
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-lg text-xs font-medium"
                onClick={async () => {
                  setLoadingAdmin(true);
                  const users = await syncAndCleanUsers();
                  setSupabaseUsers(users);
                  setLoadingAdmin(false);
                }}
                disabled={loadingAdmin}
              >
                Sync &amp; Clean Users
              </Button>
              <span className="text-xs text-muted-foreground">Removes orphaned users without profiles.</span>
            </div>
            <form
              className="mb-5 flex flex-wrap gap-2"
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
                id="admin-new-user-email"
                name="admin_new_user_email"
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                className="h-8 flex-1 min-w-[160px] rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                required
              />
              <input
                id="admin-new-user-full-name"
                name="admin_new_user_full_name"
                type="text"
                placeholder="Full Name"
                value={newUser.fullName}
                onChange={e => setNewUser({ ...newUser, fullName: e.target.value })}
                className="h-8 flex-1 min-w-[140px] rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
                required
              />
              <select
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {ADMIN_ROLE_TIERS.map(role => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </select>
              <Button type="submit" size="sm" className="h-8 rounded-lg text-xs font-medium" disabled={loadingAdmin}>
                Add User
              </Button>
            </form>
            {loadingAdmin ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : supabaseUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users found.</p>
            ) : (
              <ul className="divide-y divide-border">
                {supabaseUsers.map((user, idx) => (
                  <li key={stableDirectoryRowKey(user, idx)} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <span className="text-sm font-medium text-foreground">{user.email}</span>
                      <span className="text-xs text-muted-foreground ml-2">ID: {user?.id ?? user?.supabase_id ?? "—"}</span>
                      {user.profile && (
                        <span className="text-xs text-muted-foreground ml-2">· {user.profile.full_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={user.memberships?.[0]?.role || ''}
                        onChange={async e => {
                          const uid = adminRowPrimaryId(user);
                          if (!uid) return;
                          setLoadingAdmin(true);
                          await updateUserRole(uid, e.target.value);
                          const users = await fetchSupabaseUsers();
                          setSupabaseUsers(users);
                          setLoadingAdmin(false);
                        }}
                        className="h-7 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        {ADMIN_ROLE_TIERS.map(role => (
                          <option key={role.key} value={role.key}>{role.label}</option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 rounded-lg text-xs px-3"
                        onClick={async () => {
                          const uid = adminRowPrimaryId(user);
                          if (!uid) return;
                          setLoadingAdmin(true);
                          await deleteUser(uid);
                          const users = await fetchSupabaseUsers();
                          setSupabaseUsers(users);
                          setLoadingAdmin(false);
                        }}
                        disabled={loadingAdmin}
                      >Delete</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-4 sm:gap-6 mb-6">
          <UpcomingPayments invoices={invoices} clients={clients} currency={userCurrency} />
          <div className="space-y-6">
            {user && !isAdmin && (
              <SetupProgressStepper checklist={onboardingChecklist} />
            )}
            {user && !isAdmin && canShowPosEntry && (
              <PosSalesCard currency={userCurrency} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] items-stretch gap-4 sm:gap-6 mb-6">
          <DashboardRevenueWidget
            breakdown={revenueBreakdown}
            rangeDays={revenueRange}
            onRangeChange={setRevenueRange}
            currency={userCurrency}
            isLoading={isLoading}
            compact
            className="h-full"
          />
          <div className="flex h-full min-h-0 flex-col gap-4 sm:gap-6">
            <div className="dashboard-card hidden p-4 md:block">
              <h3 className="mb-3 hidden text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:block">Create</h3>
              <div className="space-y-2">
                <Button
                  size="sm"
                  className="dashboard-cta w-full rounded-2xl"
                  onClick={() => navigate(createPageUrl("CreateInvoice"))}
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  New Invoice
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  {canShowPosEntry ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-2xl"
                      onClick={() => navigate(createPageUrl("POS"))}
                    >
                      <Store className="w-4 h-4 shrink-0" />
                      POS
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-2xl border-primary/40 text-primary"
                    onClick={() => navigate(createPageUrl("CashFlow"))}
                  >
                    <Receipt className="w-4 h-4 shrink-0" />
                    Add Expense
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-2xl"
                    onClick={() => navigate(createPageUrl("Clients"))}
                  >
                    <UsersIcon className="w-4 h-4 shrink-0" />
                    Customer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-2xl"
                    onClick={() => navigate(createPageUrl("Services"))}
                  >
                    <Headset className="w-4 h-4 shrink-0" />
                    Service
                  </Button>
                  {canShowPosEntry ? null : (
                    <Link to={createPageUrl("Invoices")} className="min-w-0">
                      <Button variant="ghost" size="sm" className="w-full rounded-2xl text-muted-foreground hover:text-foreground">
                        View all
                      </Button>
                    </Link>
                  )}
                </div>
                {canShowPosEntry ? (
                  <div className="flex justify-end pt-0.5">
                    <Link
                      to={createPageUrl("Invoices")}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      View all
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-auto">
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
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-4 sm:gap-6 mb-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* Recent Invoices — same width as Revenue trend, directly below */}
            <div className="dashboard-card">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Recent invoices</h3>
                  {invoices.length > RECENT_INVOICES_PREVIEW_ROWS ? (
                    <span className="text-xs text-muted-foreground">
                      Showing {RECENT_INVOICES_PREVIEW_ROWS} of {invoices.length}
                    </span>
                  ) : null}
                </div>
                <Link
                  to={createPageUrl("Invoices")}
                  className="text-sm font-medium text-primary hover:text-primary/80"
                >
                  View all →
                </Link>
              </div>
              <div className="px-6 pb-6">
                {isLoading ? (
                  <div className="overflow-x-auto rounded-lg border border-border/50">
                    <table className="w-full min-w-[320px] text-left">
                      <thead className="sticky top-0 z-[1] border-b border-border bg-muted/30 backdrop-blur-sm">
                        <tr className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
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
                      className="dashboard-cta rounded-2xl"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Create invoice
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 md:hidden">
                      {sortedRecentInvoices.map((invoice) => {
                        const client = clients.find((c) => c.id === invoice.client_id);
                        const statusClass = statusColors[normalizeInvoiceStatus(invoice.status)] || statusColors[invoice.status] || "bg-muted text-muted-foreground";
                        return (
                          <button
                            key={invoice.id}
                            type="button"
                            onClick={() => setSelectedInvoiceId(invoice.id)}
                            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left touch-manipulation"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{client?.name || "Unknown"}</p>
                              <p className="truncate text-[10px] text-muted-foreground">{invoice.invoice_number || `#${invoice.id?.slice(0, 8)}`}</p>
                              <span className={`mt-1 inline-block text-xs font-medium ${statusClass}`}>
                                {getStatusLabel(invoice.status)}
                              </span>
                            </div>
                            <p className="currency-nums shrink-0 text-sm font-medium tabular-nums">
                              {formatCurrency(invoice.total_amount, userCurrency)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    <div
                      className="hidden overflow-x-auto rounded-lg border border-border/50 md:block"
                      role="region"
                      aria-label={`${RECENT_INVOICES_PREVIEW_ROWS} most recent invoices`}
                    >
                      <table className="w-full min-w-[320px] text-left">
                        <thead className="sticky top-0 z-[1] border-b border-border bg-muted/30 backdrop-blur-sm">
                          <tr className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            <th className="py-3 pr-4">Client</th>
                            <th className="py-3 pr-4">Status</th>
                            <th className="py-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {sortedRecentInvoices.map((invoice) => {
                            const client = clients.find((c) => c.id === invoice.client_id);
                            const statusClass = statusColors[normalizeInvoiceStatus(invoice.status)] || statusColors[invoice.status] || "bg-muted text-muted-foreground";
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
                                  <span className={`text-xs font-medium ${statusClass}`}>
                                    {getStatusLabel(invoice.status)}
                                  </span>
                                </td>
                                <td className="py-3 text-right font-medium text-foreground tabular-nums text-sm">
                                  {formatCurrency(invoice.total_amount, userCurrency)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>

          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            {/* Transaction List */}
            <div className="dashboard-card">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Transactions</h3>
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
                      <Button size="sm" variant="outline" className="rounded-lg">
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
                <div
                  className="max-h-[min(13.5rem,42vh)] overflow-y-auto overscroll-y-contain divide-y divide-border"
                  role="region"
                  aria-label="Transactions, scroll for more"
                >
                  {mergedTransactions.map((tx) => {
                    const isIncome = tx.type === 'income';
                    return (
                      <div
                        key={tx.id}
                        className="flex items-baseline justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{tx.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx.date ? formatDate(new Date(tx.date), 'dd MMM yyyy') : '—'}
                            {isIncome ? " · Paid" : " · Expense"}
                          </p>
                        </div>
                        <p className="currency-nums shrink-0 text-sm font-medium tabular-nums text-foreground">
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
              <ViewInvoice
                invoiceId={selectedInvoiceId}
                embedded
                embeddedFullWidth
                onClose={() => setSelectedInvoiceId(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

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
