import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";

import Button from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import NotificationBell from "@/components/notifications/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import OnboardingTour from "@/components/OnboardingTour";
import SetupWizard from "@/components/SetupWizard";
import MobileBottomNav from "@/components/ui/MobileBottomNav";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/components/auth/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { useAppStore } from "@/stores/useAppStore";
import { createPageUrl, createAdminPageUrl, isWelcomeTourEligible } from "@/utils";
import { hasFeatureAccess, getRequiredPlan } from "@/components/subscription/FeatureGate";
import {
  Plus,
  ChevronsRight,
  ChevronsLeft,
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  BarChart2,
  Search,
  Bell,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  TrendingUp,
  Activity,
  History,
  Shield,
  Briefcase,
  Building2,
  BarChart3,
  Wrench,
  Terminal,
  Receipt
} from "lucide-react";

// PropTypes shape for navigation items
const navItemShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  title: PropTypes.string.isRequired,
  url: PropTypes.string,
  icon: PropTypes.elementType,
  feature: PropTypes.any,
  roles: PropTypes.array,
  hasAccess: PropTypes.bool,
  requiredPlan: PropTypes.string,
  hasRoleAccess: PropTypes.bool,
  type: PropTypes.string,
  children: PropTypes.arrayOf(PropTypes.any),
});
const adminNavigationItems = [
  {
    title: "Users",
    url: createAdminPageUrl("Users"),
    icon: Users,
    feature: null,
    roles: ["admin"],
    id: "nav-admin-users"
  },
  {
    title: "Accounts",
    url: createAdminPageUrl("Accounts Management"),
    icon: Building2,
    feature: null,
    roles: ["admin"],
    id: "nav-admin-accounts"
  },
  {
    title: "Reports",
    url: createAdminPageUrl("Document Oversight"),
    icon: BarChart3,
    feature: null,
    roles: ["admin"],
    id: "nav-admin-reports"
  },
  {
    title: "Operations",
    icon: Wrench,
    feature: null,
    roles: ["admin"],
    id: "nav-admin-operations",
    children: [
      {
        title: "System Status",
        url: createAdminPageUrl("System Status"),
        icon: Shield,
        feature: null,
        roles: ["admin"],
        id: "nav-admin-system-status"
      },
      {
        title: "Background Jobs",
        url: createAdminPageUrl("Background Jobs"),
        icon: Activity,
        feature: null,
        roles: ["admin"],
        id: "nav-admin-background-jobs"
      },
      {
        title: "Build Logs",
        url: createAdminPageUrl("Build Logs"),
        icon: Terminal,
        feature: null,
        roles: ["admin"],
        id: "nav-admin-build-logs"
      },
      {
        title: "Logs",
        url: createAdminPageUrl("Logs & Audit Trail"),
        icon: History,
        feature: null,
        roles: ["admin"],
        id: "nav-admin-logs"
      }
    ]
  },
  {
    type: "section",
    title: "Core Product"
  },
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
    feature: null,
    roles: ["admin"],
    id: "nav-admin-dashboard"
  },
  {
    title: "Businesses",
    icon: Building2,
    feature: null,
    roles: ["admin"],
    id: "nav-admin-businesses",
    url: createPageUrl("AdminBusinesses"),
    children: [
      {
        title: "Financials",
        url: createPageUrl("AdminFinancials"),
        icon: BarChart2,
        feature: null,
        roles: ["admin"],
        id: "nav-admin-financials"
      },
      {
        title: "Transactions",
        url: createAdminPageUrl("Transactions"),
        icon: Activity,
        feature: null,
        roles: ["admin"],
        id: "nav-admin-transactions"
      },
      {
        title: "Payouts",
        url: createAdminPageUrl("Payouts"),
        icon: TrendingUp,
        feature: null,
        roles: ["admin"],
        id: "nav-admin-payouts"
      },
      {
        title: "Fees",
        url: createAdminPageUrl("Fees"),
        icon: FileText,
        feature: null,
        roles: ["admin"],
        id: "nav-admin-fees"
      }
    ]
  },
  {
    title: "Billing",
    icon: Briefcase,
    feature: null,
    roles: ["admin"],
    id: "nav-admin-billing",
    url: createPageUrl("AdminBilling"),
    children: [
      {
        title: "Subscriptions",
        url: createAdminPageUrl("Subscriptions"),
        icon: Briefcase,
        feature: null,
        roles: ["admin"],
        id: "nav-admin-subscriptions"
      },
      {
        title: "Invoices & Quotes",
        url: "/admin/invoices-quotes",
        icon: FileText,
        feature: null,
        roles: ["admin"],
        id: "nav-admin-invoices-quotes"
      }
    ]
  }
];

const allNavigationItems = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-dashboard",
  },
  { type: "section", title: "Overview", id: "nav-section-overview" },
  {
    title: "Clients",
    url: createPageUrl("Clients"),
    icon: Users,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-clients",
  },
  {
    title: "Invoices",
    url: createPageUrl("Invoices"),
    icon: FileText,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-invoices",
  },
  {
    title: "Quotes",
    url: createPageUrl("Quotes"),
    icon: FileText,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-quotes",
  },
  {
    title: "Services",
    url: createPageUrl("Services"),
    icon: Briefcase,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-services",
  },
  { type: "section", title: "Finance", id: "nav-section-finance" },
  {
    title: "Payslips",
    url: createPageUrl("Payslips"),
    icon: Receipt,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-payslips",
  },
  {
    title: "Cash Flow",
    url: createPageUrl("CashFlow"),
    icon: TrendingUp,
    feature: "cashflow",
    roles: ["user", "admin"],
    id: "nav-cashflow",
  },
  {
    title: "Reports",
    url: createPageUrl("Reports"),
    icon: BarChart2,
    feature: "reports",
    roles: ["user", "admin"],
    id: "nav-reports",
  },
  { type: "section", title: "Workspace", id: "nav-section-workspace" },
  {
    title: "Notes",
    url: createPageUrl("Notes"),
    icon: FileText,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-notes",
  },
  {
    title: "Calendar",
    url: createPageUrl("Calendar"),
    icon: Activity,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-calendar",
  },
  {
    title: "Messages",
    url: createPageUrl("Messages"),
    icon: Bell,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-messages",
  },
  { type: "section", title: "Settings", id: "nav-section-settings" },
  {
    title: "Settings",
    url: createPageUrl("Settings"),
    icon: Settings,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-settings",
  },
];

const getNavigationItems = (userPlan, userRole) => {
  const normalizedRole = (userRole || "user").toLowerCase();
  if (normalizedRole === "admin") {
    // Only admin dashboard and admin nav for admin
    return adminNavigationItems.map(item => ({
      ...item,
      hasAccess: !item.feature || hasFeatureAccess(userPlan, item.feature),
      requiredPlan: item.feature ? getRequiredPlan(item.feature) : null,
      hasRoleAccess: !item.roles || item.roles.includes(normalizedRole)
    }));
  } else {
    // Only user dashboard and user nav for non-admin
    return allNavigationItems.map(item => ({
      ...item,
      hasAccess: !item.feature || hasFeatureAccess(userPlan, item.feature),
      requiredPlan: item.feature ? getRequiredPlan(item.feature) : null,
      hasRoleAccess: !item.roles || item.roles.includes(normalizedRole)
    }));
  }
};
// Placeholder for LockedNavItem to prevent errors
const LockedNavItem = ({ title, requiredPlan }) => (
  <div className="px-4 py-2 text-[13px] text-white/65">{title} (Upgrade to {requiredPlan})</div>
);
LockedNavItem.propTypes = {
  title: PropTypes.string.isRequired,
  requiredPlan: PropTypes.string
};
// Placeholder for QuoteReminderService to prevent errors
const QuoteReminderService = {
  checkAndSendReminders: async () => {}
};

const NavLink = ({ item, onClick, collapsed = false, mobile = false }) => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const isCollapsedRail = collapsed && !mobile;

  if (!item) return null;

  if (item.type === "section") {
    if (collapsed && !mobile) {
      return <div className="my-2 h-px bg-sidebar-border" />;
    }
    return (
      <div className={`px-3 py-1.5 mt-4 first:mt-2 text-[10px] font-medium uppercase tracking-widest ${mobile ? "text-muted-foreground/70" : "text-sidebar-foreground/45"}`}>
        {item.title}
      </div>
    );
  }

  // If the item has children, render a parent nav item with dropdown
  if (item.children && Array.isArray(item.children)) {
    const isCollapsedRailParent = collapsed && !mobile;
    const buttonEl = (
      <button
        type="button"
        className={`group flex items-center w-full transition-all font-mono ${collapsed && !mobile ? "justify-center px-2 py-2 rounded-xl hover:bg-white/10" : mobile ? "rounded-full" : "rounded-full hover:bg-sidebar-accent"} ${mobile ? "min-h-[44px] py-3 gap-3 px-3 rounded-full" : (!collapsed ? "py-2 gap-3 px-4" : "")}`}
        style={{ cursor: 'pointer' }}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={`nav-children-${item.id}`}
      >
        <span className={`sidebar-nav-icon inline-flex items-center justify-center h-10 w-10 rounded-xl transition-all bg-transparent [&_svg]:size-5 ${collapsed && !mobile ? "text-sidebar-foreground/80 group-hover:text-sidebar-foreground group-hover:bg-white/5" : mobile ? "text-foreground" : "text-sidebar-foreground"}`}>
          <item.icon className="size-5" strokeWidth={2} />
        </span>
        {!collapsed && (
          <span className={`text-[13px] font-normal transition-colors ${mobile ? "text-foreground" : "text-sidebar-foreground"}`}>{item.title}</span>
        )}
        {!collapsed && (
          <span className={`ml-auto transition-transform ${mobile ? "text-foreground" : "text-sidebar-foreground/80"} ${open ? "rotate-90" : "rotate-0"}`}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        )}
      </button>
    );
    return (
      <div className="mb-1 sidebar-nav-item">
        <motion.div whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}>
          {isCollapsedRailParent ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                {buttonEl}
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10} className="font-medium">
                {item.title}
              </TooltipContent>
            </Tooltip>
          ) : (
            buttonEl
          )}
        </motion.div>
        {/* Render children as indented sub-nav, only if open */}
        {!collapsed && open && (
          <div className="ml-8" id={`nav-children-${item.id}`}> 
            {item.children.filter(Boolean).map(child => (
              <NavLink key={child.id || child.title} item={child} onClick={onClick} collapsed={collapsed} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = item.url && location.pathname === item.url.split("?")[0];

  if (item.hasAccess === false) {
    return <LockedNavItem title={item.title} requiredPlan={item.requiredPlan} />;
  }

  if (item.hasRoleAccess === false) {
    return null;
  }

  return (
    <motion.div
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      className={`sidebar-nav-item relative ${isCollapsedRail ? "rounded-xl" : "rounded-lg"} ${mobile && isActive ? "sidebar-nav-item-active" : ""}`}
    >
      {isCollapsedRail ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Link
              id={item.id}
              to={item.url}
              onClick={onClick}
              aria-label={item.title}
              className={`relative z-10 group flex items-center transition-all justify-center px-2 py-2 rounded-lg border-l-[3px] ${isActive ? "border-l-primary bg-transparent" : "border-l-transparent hover:bg-white/10"}`}
            >
              <span
                className={`sidebar-nav-icon inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors shrink-0 [&_svg]:size-5
                  ${isActive ? "text-primary" : "text-sidebar-foreground/80 group-hover:text-sidebar-foreground"}
                `}
              >
                <item.icon className="size-5" strokeWidth={2} />
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="font-medium">
            {item.title}
          </TooltipContent>
        </Tooltip>
      ) : (
        <Link
          id={item.id}
          to={item.url}
          onClick={onClick}
          className={`relative z-10 group flex items-center transition-all rounded-lg border-l-[3px] ${mobile ? "min-h-[44px] py-3 gap-3 px-4 rounded-2xl" : "py-2.5 gap-3 px-3 pl-4"} ${mobile ? (isActive ? "bg-orange-50 border-l-transparent" : "border-l-transparent hover:bg-muted/60") : (isActive ? "border-l-primary bg-transparent" : "border-l-transparent hover:bg-sidebar-accent")}`}
        >
          <span
            className={`sidebar-nav-icon inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors shrink-0 [&_svg]:size-5
              ${mobile ? (isActive ? "text-primary" : "text-foreground group-hover:text-slate-600") : (isActive ? "text-primary" : "text-sidebar-foreground group-hover:text-sidebar-foreground")}
            `}
          >
            <item.icon className="size-5" strokeWidth={2} />
          </span>
          <span className={`text-[13px] transition-colors flex-1 text-left ${isActive ? "text-primary font-semibold" : mobile ? "text-foreground font-normal" : "text-sidebar-foreground font-normal"}`}>{item.title}</span>
          {mobile && isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 shadow-[0_0_8px_rgba(234,88,12,0.4)]" aria-hidden />
          )}
        </Link>
      )}
    </motion.div>
  );
};

NavLink.propTypes = {
  item: navItemShape,
  onClick: PropTypes.func,
  collapsed: PropTypes.bool,
  mobile: PropTypes.bool
};

const MobileNav = ({ items, onClose, user, navigate, handleLogout, theme, setTheme, resolvedTheme }) => {
  const MAIN_IDS = new Set(["nav-dashboard", "nav-invoices", "nav-quotes", "nav-services"]);
  const managementIds = new Set([
    "nav-clients", "nav-cashflow", "nav-reports", "nav-notes",
    "nav-calendar", "nav-messages", "nav-settings"
  ]);
  const mainItems = items.filter((i) => i.id && MAIN_IDS.has(i.id));
  let managementItems = items.filter((i) => i.id && managementIds.has(i.id));
  const adminItems = items.filter((i) => i.id && i.id.startsWith("nav-admin-"));
  if (adminItems.length > 0) {
    managementItems = [...managementItems, ...adminItems];
  }

  /* Panel only — used inside Sheet drawer on mobile */
  return (
    <div className="w-full flex flex-col h-full max-h-[100dvh] bg-white dark:bg-card text-foreground p-4 sm:p-6 mobile-nav-panel">
      {/* 1. BRANDING — extra bottom padding for premium spacing */}
      <div className="mb-10 sm:mb-12 shrink-0">
        <div className="flex min-h-[52px] items-center justify-between gap-2">
          <Link to={createPageUrl("Dashboard")} onClick={onClose} className="flex items-center gap-3 min-w-0 flex-1 touch-manipulation" aria-label="Paidly home">
            <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
              <img src="/logo.svg" alt="" className="w-8 h-8" aria-hidden="true" />
            </div>
            <span className="text-xl font-black text-slate-900 dark:text-foreground tracking-tight truncate font-display">Paidly</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 min-h-11 min-w-11 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground touch-manipulation" aria-label="Close menu">
            <X className="size-5" />
          </Button>
        </div>
      </div>

      {/* 2. NAVIGATION — grouped into Main & Management with muted headers; scrolls so footer stays visible */}
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mx-1 space-y-8" aria-label="App navigation">
        {mainItems.length > 0 && (
          <div>
            <p className="px-4 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-muted-foreground mb-3">
              Main
            </p>
            <div className="space-y-1">
              {mainItems.map((item) => (
                <NavLink key={item.id || item.title} item={item} onClick={onClose} mobile />
              ))}
            </div>
          </div>
        )}
        {managementItems.length > 0 && (
          <div>
            <p className="px-4 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-muted-foreground mb-3">
              Management
            </p>
            <div className="space-y-1">
              {managementItems.map((item) => (
                <NavLink key={item.id || item.title} item={item} onClick={onClose} mobile />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* 3. FOOTER — account (profile dropdown) then logout */}
      <div className="shrink-0 pt-6 border-t border-slate-100 dark:border-border space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-muted transition-all text-left touch-manipulation"
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-muted border-2 border-white dark:border-card shadow-sm overflow-hidden shrink-0 flex items-center justify-center font-semibold text-slate-600 dark:text-muted-foreground text-sm">
                {user?.logo_url ? (
                  <img src={user.logo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  user?.full_name ? user.full_name[0].toUpperCase() : (user?.email ? user.email[0].toUpperCase() : "U")
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-foreground truncate">{user?.full_name || user?.company_name || "User"}</p>
                <p className="text-[10px] text-slate-400 dark:text-muted-foreground font-medium truncate">{user?.email || ""}</p>
              </div>
              <Settings className="w-5 h-5 text-slate-300 dark:text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 rounded-xl">
            <DropdownMenuItem onClick={() => { navigate(createPageUrl("Settings")); onClose?.(); }} className="cursor-pointer">
              <Settings className="mr-2 size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { navigate(createPageUrl("Settings") + "?tab=subscription"); onClose?.(); }} className="cursor-pointer">
              <Bell className="mr-2 size-4" />
              Subscription
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground font-normal">Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme || "system"} onValueChange={(v) => { setTheme(v); onClose?.(); }}>
              <DropdownMenuRadioItem value="light" className="cursor-pointer">
                <Sun className="mr-2 size-4" /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" className="cursor-pointer">
                <Moon className="mr-2 size-4" /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system" className="cursor-pointer">
                <Monitor className="mr-2 size-4" /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          className="w-full min-h-12 border-slate-200 dark:border-border text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-900/50 py-3 rounded-2xl touch-manipulation"
          onClick={() => { onClose(); handleLogout(); }}
        >
          <LogOut className="size-5 mr-2" /> Logout
        </Button>
      </div>
    </div>
  );
};

MobileNav.propTypes = {
  items: PropTypes.arrayOf(navItemShape).isRequired,
  onClose: PropTypes.func,
  user: PropTypes.object,
  navigate: PropTypes.func,
  handleLogout: PropTypes.func,
  theme: PropTypes.string,
  setTheme: PropTypes.func,
  resolvedTheme: PropTypes.string
};

/** Routes without app chrome use document scroll and hash sections (e.g. /Home#waitlist). */
const STANDALONE_PAGE_NAMES = [
  "PayslipPDF",
  "InvoicePDF",
  "CashFlowPDF",
  "PublicInvoice",
  "PublicQuote",
  "PublicPayslip",
  "Home",
  "Login",
  "Signup",
  "ForgotPassword",
  "ResetPassword",
  "AcceptInvite",
];

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Default to expanded sidebar (especially after login/signup) so nav items are visible
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const mainContentRef = useRef(null);
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const fetchAll = useAppStore((s) => s.fetchAll);
  const lastFetchedAt = useAppStore((s) => s.lastFetchedAt);
  const userProfile = useAppStore((s) => s.userProfile);
  const resetStore = useAppStore((s) => s.reset);

  // Fetch shared app data when user is present (non-admin). Skip if we have fresh data so navigation doesn't refetch.
  const STALE_MS = 5 * 60 * 1000; // 5 min – same as React Query staleTime
  useEffect(() => {
    if (!user?.id) return;
    if ((user?.role || "").toLowerCase() === "admin") return;
    const hasFreshData = lastFetchedAt != null && Date.now() - lastFetchedAt < STALE_MS;
    // Always refetch if profile never hydrated (e.g. interrupted load, stale cache edge case).
    if (hasFreshData && userProfile != null) return;
    fetchAll();
  }, [user?.id, user?.role, fetchAll, lastFetchedAt, userProfile]);

  // Scroll main content area to top when route changes (content lives in overflow-auto, not window).
  // Skip standalone shells: they use window scroll; parent effects run after children and would undo
  // hash scrolling (e.g. Join waitlist → /Home#waitlist).
  useEffect(() => {
    if (STANDALONE_PAGE_NAMES.includes(currentPageName)) {
      return;
    }
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [location.pathname, currentPageName]);

  useEffect(() => {
    if (!user?.id) return;
    if (currentPageName !== "Dashboard") {
      setShowTour(false);
      return;
    }
    // Welcome tour only after completing email signup (flag set in Signup.jsx), not on every login.
    if (!isWelcomeTourEligible(user.id)) return;
    const t = window.setTimeout(() => setShowTour(true), 1000);
    return () => window.clearTimeout(t);
  }, [currentPageName, user?.id]);

  const handleWizardComplete = () => {
    setShowWizard(false);
    if (user?.id && isWelcomeTourEligible(user.id)) {
      setShowTour(true);
    }
  };

  // Reminder and follow-up checks
  useEffect(() => {
    if (!user) return;

    const checkDueDateReminders = async () => {
      const lastDueDateCheck = localStorage.getItem('lastDueDateCheck');
      const now = new Date().getTime();
      const oneDay = 24 * 60 * 60 * 1000;
      if (!lastDueDateCheck || (now - parseInt(lastDueDateCheck) > oneDay)) {
        try {
          const DueDateNotificationService = (await import('@/components/notifications/DueDateNotificationService')).default;
          await DueDateNotificationService.checkAndSendDueDateReminders();
          localStorage.setItem('lastDueDateCheck', now.toString());
        } catch (error) {
          console.error("Failed to check due date reminders:", error);
        }
      }
    };

    const checkClientFollowUps = async () => {
      const lastFollowUpCheck = localStorage.getItem('lastFollowUpCheck');
      const now = new Date().getTime();
      const oneDay = 24 * 60 * 60 * 1000;
      if (!lastFollowUpCheck || (now - parseInt(lastFollowUpCheck) > oneDay)) {
        try {
          const PaymentReminderService = (await import('@/components/reminders/PaymentReminderService')).default;
          await PaymentReminderService.checkAndSendReminders();
          // Quote Reminders
          await QuoteReminderService.checkAndSendReminders();
          const ClientFollowUpService = (await import('@/components/clients/ClientFollowUpService')).default;
          await ClientFollowUpService.updateClientSegments();
          localStorage.setItem('lastFollowUpCheck', now.toString());
        } catch (error) {
          console.error("Failed to check reminders/follow-ups:", error);
        }
      }
    };

    // Recurring invoices check
    const checkRecurringInvoices = async () => {
      // Implement recurring invoice logic here if needed
    };

    checkRecurringInvoices();
    checkDueDateReminders();
    checkClientFollowUps();
  }, [user]);

  const handleLogout = async () => {
    // Force logout: always reset local state and go to Login.
    resetStore();
    try {
      await logout();
    } finally {
      navigate(`${createPageUrl("Login")}#sign-in`, { replace: true });
    }
  };


  if (STANDALONE_PAGE_NAMES.includes(currentPageName)) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="min-h-screen"
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className={`overflow-x-hidden h-[100dvh] lg:h-screen w-full grid grid-cols-1 min-w-0 transition-[grid-template-columns] duration-300 ease-in-out ${isSidebarCollapsed ? "lg:grid-cols-[5rem_1fr]" : "lg:grid-cols-[16rem_1fr]"}`}>
      {/* Sidebar: hidden below lg (1024px); visible from lg up */}
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
        className={`sidebar sidebar-panel hidden lg:block text-sidebar-foreground sticky top-0 h-screen py-6 ${
          isSidebarCollapsed ? "pl-4 pr-1" : "px-4"
        }`}
      >
        <div className="relative flex h-full flex-col">
          <TooltipProvider delayDuration={0} skipDelayDuration={0}>
          {/* Collapse button — right edge of sidebar, tied to minimize function */}
          <div className="absolute top-6 right-0 z-20 flex flex-col items-center">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                  className="shrink-0 h-9 w-9 rounded-l-xl rounded-r-none border border-transparent border-r-0 bg-white/10 text-sidebar-foreground/90 hover:bg-white/15 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0 focus-visible:ring-offset-transparent active:scale-95 transition-all duration-200 ease-out"
                  title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {isSidebarCollapsed ? (
                    <ChevronsRight className="size-5" aria-hidden />
                  ) : (
                    <ChevronsLeft className="size-5" aria-hidden />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8} className="font-medium">
                {isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Logo — top, always visible when collapsed */}
          <div className={`flex flex-col shrink-0 ${isSidebarCollapsed ? "px-0 items-center pr-9" : "pr-12"}`}>
            <div className={isSidebarCollapsed ? "flex flex-col items-center gap-2" : "flex flex-col gap-2"}>
              <Link
                to={createPageUrl("Dashboard")}
                className={`flex items-center ${isSidebarCollapsed ? "justify-center" : "gap-2.5"}`}
                aria-label={isSidebarCollapsed ? "Paidly home" : undefined}
              >
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                  <img
                    src="/logo.svg"
                    alt=""
                    className="w-8 h-8"
                    aria-hidden="true"
                  />
                </div>
                {!isSidebarCollapsed && (
                  <span className="text-[15px] font-semibold text-sidebar-foreground tracking-tight">
                    Paidly
                  </span>
                )}
              </Link>
            </div>
            <div className="mt-3" data-tour="dashboard-summary">
              <NavLink
                item={getNavigationItems(user?.subscription_plan || 'Individual', user?.role).find(item => item.title === "Dashboard")}
                collapsed={isSidebarCollapsed}
              />
            </div>
          </div>

          {/* Navigation */}
          <div className={`flex-1 py-4 overflow-auto sidebar-nav-scroll-area ${isSidebarCollapsed ? "px-0 pr-9" : "px-3 pr-12"}`}>
            <nav className={isSidebarCollapsed ? "space-y-2.5" : "space-y-1"}>
              {getNavigationItems(user?.subscription_plan || 'Individual', user?.role)
                .filter(item => item.title && item.id && item.title !== "Dashboard")
                .map(item => {
                  // Add data-tour for Accounts/Clients and Reports
                  let extraProps = {};
                  if (item.title === "Accounts" || item.title === "Businesses" || item.title === "Clients") {
                    extraProps['data-tour'] = 'accounts-section';
                  }
                  if (item.title === "Reports") {
                    extraProps['data-tour'] = 'reports-section';
                  }
                  return (
                    <div key={item.id} {...extraProps}>
                      <NavLink item={item} collapsed={isSidebarCollapsed} />
                    </div>
                  );
                })}
            </nav>
          </div>

          {/* Create Invoice CTA */}
          <div className={`mt-auto ${isSidebarCollapsed ? "px-2 py-3" : "p-4"}`}>
            <Link
              to={createPageUrl("CreateInvoice")}
              title={isSidebarCollapsed ? "Create Invoice" : undefined}
              aria-label={isSidebarCollapsed ? "Create Invoice" : undefined}
            >
              {isSidebarCollapsed ? (
                <Button
                  id="create-invoice-btn"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-xl shadow-lg shadow-primary/25 transition-all hover:shadow-primary/30 focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  size="icon"
                >
                  <Plus className="size-5" strokeWidth={2} />
                </Button>
              ) : (
              <Button id="create-invoice-btn" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 px-4 rounded-xl text-sm gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-primary/30 focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <Plus className="size-5" strokeWidth={2} /> Create Invoice
              </Button>
              )}
            </Link>
          </div>

          {/* Logout — bottom, separated, muted with red hover */}
          <div className={`mt-4 pt-4 border-t border-sidebar-border ${isSidebarCollapsed ? "px-2 pb-4" : "px-4 pb-4"}`}>
            <button
              onClick={handleLogout}
              title={isSidebarCollapsed ? "Log out" : undefined}
              aria-label={isSidebarCollapsed ? "Log out" : undefined}
              className={`flex items-center text-slate-400 hover:text-red-500 transition-colors w-full py-2.5 text-[13px] rounded-lg ${
                isSidebarCollapsed ? "justify-center" : "gap-3"
              }`}
            >
              <LogOut className="size-5 shrink-0" />
              {!isSidebarCollapsed && "Log out"}
            </button>
          </div>
          </TooltipProvider>
        </div>
      </motion.div>

      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent
          side="left"
          hideClose
          className="w-full max-w-[min(300px,90vw)] p-0 h-full flex flex-col border-r border-slate-100 dark:border-border rounded-r-xl"
          aria-describedby={undefined}
        >
          <MobileNav
            items={getNavigationItems(user?.subscription_plan || "Individual", user?.role)}
            onClose={() => setIsMobileMenuOpen(false)}
            user={user}
            navigate={navigate}
            handleLogout={handleLogout}
            theme={theme}
            setTheme={setTheme}
            resolvedTheme={resolvedTheme}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content — ultra-light neutral gradient (or navy when Dashboard) */}
      <div className={`flex flex-col h-[100dvh] lg:h-screen min-h-0 overflow-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0 bg-background ${currentPageName === "Dashboard" ? "" : "content-area-light"}`}>
        {/* Top header: fixed on mobile (hamburger + Paidly + avatar); standard header on lg+ */}
        <motion.header
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative z-20 safe-top bg-card/95 backdrop-blur-sm border-b border-border shadow-sm min-h-[56px]
            fixed top-0 left-0 right-0 h-14 z-40 lg:static lg:z-20 lg:h-14 lg:min-h-[56px] flex items-center justify-between gap-2 px-3 sm:px-6 lg:px-8"
        >
          {/* Mobile (< lg): Hamburger | Paidly | Avatar */}
          <div className="flex items-center justify-between w-full lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open menu"
              className="flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 touch-manipulation shrink-0 cursor-pointer select-none w-12 h-12 min-w-[48px] min-h-[48px] p-0 border-0 bg-transparent -ml-1"
            >
              <Menu className="size-6 pointer-events-none" aria-hidden />
            </button>
            <span className="font-black text-foreground tracking-tight text-lg">Paidly</span>
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="rounded-xl p-0 min-h-[44px] min-w-[44px] touch-manipulation shrink-0" aria-label="Account menu">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-medium text-muted-foreground text-sm overflow-hidden border border-border">
                      {user.logo_url ? (
                        <img src={user.logo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        user.full_name ? user.full_name[0].toUpperCase() : (user.email ? user.email[0].toUpperCase() : "U")
                      )}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl border border-border bg-card shadow-elevation-lg">
                  <div className="px-2 py-2">
                    <p className="text-sm font-semibold text-foreground">{user.company_name || "My Company"}</p>
                    <p className="text-xs text-muted-foreground">{user.full_name || user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { navigate(createPageUrl("Settings")); setIsMobileMenuOpen(false); }} data-tour="settings-btn">
                    <Settings className="size-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl("Settings") + "?tab=subscription")}>
                    <Bell className="size-4 mr-2" />
                    Subscription
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-foreground focus:bg-muted focus:text-foreground cursor-pointer">
                    <LogOut className="size-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Desktop (lg+): Search, theme, notifications, profile */}
          <div className="hidden lg:flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <div className="relative max-w-md flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
              <Input
                placeholder="Search invoices, clients…"
                className="pl-10 bg-muted/50 border-border rounded-xl text-foreground placeholder:text-muted-foreground h-10 text-sm focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 sm:gap-3 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground min-h-[48px] min-w-[48px] md:min-h-10 md:min-w-10"
                  aria-label="Theme"
                  title="Appearance"
                >
                  {resolvedTheme === "dark" ? (
                    <Moon className="size-5" />
                  ) : resolvedTheme === "light" ? (
                    <Sun className="size-5" />
                  ) : (
                    <Monitor className="size-5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                <DropdownMenuLabel className="text-muted-foreground font-normal">Appearance</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={theme || "system"} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light" className="cursor-pointer">
                    <Sun className="mr-2 size-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark" className="cursor-pointer">
                    <Moon className="mr-2 size-4" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system" className="cursor-pointer">
                    <Monitor className="mr-2 size-4" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationBell />
            
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 hover:bg-muted rounded-xl text-foreground min-h-[48px] min-w-[48px] md:min-h-11 md:min-w-11 sm:min-w-0 sm:min-h-10 touch-manipulation px-2 sm:px-3">
                    <div className="w-8 h-8 sm:w-8 sm:h-8 rounded-xl bg-muted flex items-center justify-center font-medium text-muted-foreground text-xs overflow-hidden shrink-0">
                      {user.logo_url ? (
                        <img src={user.logo_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        user.full_name ? user.full_name[0].toUpperCase() : 'U'
                      )}
                    </div>
                    <span className="font-medium hidden sm:block text-foreground truncate max-w-[120px]">{user.company_name || user.full_name || 'User'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl border border-border bg-card shadow-elevation-lg">
                  <div className="px-2 py-2">
                    <p className="text-sm font-semibold text-foreground">{user.company_name || 'My Company'}</p>
                    <p className="text-xs text-muted-foreground">{user.full_name || user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate(createPageUrl("Settings"))} data-tour="settings-btn">
                    <Settings className="size-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl("Settings") + "?tab=subscription")}>
                    <Bell className="size-4 mr-2" />
                    Subscription
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-foreground focus:bg-muted focus:text-foreground cursor-pointer">
                    <LogOut className="size-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </motion.header>

        {/* Main Content Area — scrollable, no horizontal overflow, safe areas; pt for fixed mobile header */}
        <main
          ref={mainContentRef}
          className={`dashboard-scroll-area mobile-page mobile-scale-padding mobile-scale-typography flex-1 min-h-0 overflow-auto overflow-x-hidden scroll-smooth px-3 sm:px-6 md:px-8 safe-x min-w-0 flex flex-col pt-14 pb-4 sm:pt-6 sm:pb-6 md:pt-8 md:pb-8 lg:pt-8 ${currentPageName === "Dashboard" ? "dashboard-fintech-wrap" : ""}`}
        >
          <div className="max-w-7xl mx-auto w-full min-w-0 mobile-page flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname + location.search}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
              className="min-h-full w-full min-w-0"
            >
              {children}
            </motion.div>
          </AnimatePresence>
          </div>

          {/* Footer: grounded at bottom, theme-aligned, full width of content area */}
          <footer className="shrink-0 mt-auto w-full border-t border-border bg-muted/40 pt-6 mt-10 pb-2">
            <div className="max-w-7xl mx-auto flex flex-col-reverse sm:flex-row items-center justify-between gap-4 px-0 text-xs text-muted-foreground">
              <span className="text-center sm:text-left">© {new Date().getFullYear()} Paidly. All rights reserved.</span>
              <nav className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-6" aria-label="Footer links">
                <Link to={createPageUrl("About")} className="hover:text-primary transition-colors min-h-[48px] sm:min-h-0 inline-flex items-center justify-center py-2 touch-manipulation">
                  Mission &amp; About
                </Link>
                <Link to={createPageUrl("PrivacyPolicy")} className="hover:text-primary transition-colors min-h-[48px] sm:min-h-0 inline-flex items-center justify-center py-2 touch-manipulation">
                  Privacy Policy
                </Link>
                <Link to={createPageUrl("Settings")} className="hover:text-primary transition-colors min-h-[48px] sm:min-h-0 inline-flex items-center justify-center py-2 touch-manipulation">
                  Settings
                </Link>
              </nav>
            </div>
          </footer>
        </main>

        <OnboardingTour isOpen={showTour} onClose={() => setShowTour(false)} />
        <SetupWizard isOpen={showWizard} onComplete={handleWizardComplete} />
        <MobileBottomNav onOpenMenu={() => setIsMobileMenuOpen(true)} />
        </div>
        </div>
      );
    }

Layout.propTypes = {
  children: PropTypes.node,
  currentPageName: PropTypes.string
};

