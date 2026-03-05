import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import Button from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import NotificationBell from "@/components/notifications/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import OnboardingTour from "@/components/OnboardingTour";
import SetupWizard from "@/components/SetupWizard";
import { useAuth } from "@/components/auth/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl, createAdminPageUrl } from "@/utils";
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
  TrendingUp,
  Activity,
  History,
  Shield,
  Briefcase,
  Building2,
  BarChart3,
  Wrench,
  Terminal
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
  { type: "section", title: "Overview", id: "nav-section-overview" },
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
    feature: null,
    roles: ["user", "admin"],
    id: "nav-dashboard",
  },
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

const NavLink = ({ item, onClick, collapsed = false }) => {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (!item) return null;

  if (item.type === "section") {
    if (collapsed) {
      return <div className="my-2 h-px bg-border" />;
    }
    return (
      <div className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-foreground">
        {item.title}
      </div>
    );
  }

  // If the item has children, render a parent nav item with dropdown
  if (item.children && Array.isArray(item.children)) {
    return (
      <div className="mb-1">
        <motion.div whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}>
          <button
            type="button"
            className={`group flex items-center py-2 w-full transition-all font-mono ${collapsed ? "justify-center px-2" : "gap-3 px-4"}`}
            style={{ cursor: 'pointer' }}
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-controls={`nav-children-${item.id}`}
          >
            <span className="sidebar-nav-icon inline-flex items-center justify-center h-10 w-10 rounded-lg transition-all bg-transparent text-foreground [&_svg]:size-5">
              <item.icon className="size-5" strokeWidth={2.5} />
            </span>
            {!collapsed && (
              <span className="text-[13px] font-normal transition-colors text-foreground">{item.title}</span>
            )}
            {!collapsed && (
              <span className={`ml-auto transition-transform text-foreground ${open ? "rotate-90" : "rotate-0"}`}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            )}
          </button>
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
      className={`rounded-full ${isActive ? "sidebar-nav-item-active" : ""}`}
    >
      <Link
        id={item.id}
        to={item.url}
        onClick={onClick}
        title={collapsed ? item.title : undefined}
        aria-label={collapsed ? item.title : undefined}
        className={`group flex items-center py-2.5 transition-all ${collapsed ? "justify-center px-2" : "gap-3 px-3"} rounded-full`}
      >
        <span
          className={`sidebar-nav-icon inline-flex items-center justify-center h-9 w-9 rounded-lg transition-colors shrink-0 [&_svg]:size-5
            ${isActive ? "text-primary-foreground" : "text-foreground group-hover:bg-muted/80"}
          `}
        >
          <item.icon className="size-5" strokeWidth={2.5} />
        </span>
        {!collapsed && (
          <span className={`text-[13px] transition-colors ${isActive ? "text-primary-foreground font-semibold" : "text-foreground font-normal"}`}>{item.title}</span>
        )}
      </Link>
    </motion.div>
  );
};

NavLink.propTypes = {
  item: navItemShape,
  onClick: PropTypes.func,
  collapsed: PropTypes.bool
};

const MobileNav = ({ items, onClose, user, navigate, handleLogout }) => (
  <motion.div
    initial={{ x: "-100%" }}
    animate={{ x: 0 }}
    exit={{ x: "-100%" }}
    transition={{ duration: 0.3, ease: "easeInOut" }}
    className="fixed inset-0 z-50 flex md:hidden"
    role="dialog"
    aria-modal="true"
    aria-label="Main menu"
  >
    {/* Panel: theme-aligned (card, border), full safe areas, touch-friendly */}
    <div className="w-full max-w-[min(320px,85vw)] flex flex-col bg-card border-r border-border text-foreground shadow-elevation-lg p-4 mobile-nav-panel">
      {/* Header with safe-top applied via mobile-nav-panel */}
      <div className="flex h-14 min-h-[3.5rem] items-center justify-between shrink-0">
        <Link to={createPageUrl("Dashboard")} onClick={onClose} className="flex items-center gap-3 min-w-0 min-h-[44px] items-center touch-manipulation" aria-label="Paidly home">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
            <img src="/logo.svg" alt="" className="w-8 h-8" aria-hidden="true" />
          </div>
          <span className="text-[15px] font-semibold text-foreground truncate font-display">Paidly</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 min-h-12 min-w-12 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground touch-manipulation" aria-label="Close menu">
          <X className="size-5" />
        </Button>
      </div>

      {/* Nav list: scrollable, theme spacing */}
      <nav className="space-y-0.5 mt-2 flex-1 overflow-y-auto overflow-x-hidden -mx-2 py-2 min-h-0" aria-label="App navigation">
        {items.map(item => (
          <NavLink key={item.id || item.title} item={item} onClick={onClose} />
        ))}
      </nav>

      {/* Footer: user, actions, safe-bottom for home indicator — mobile: only Create Invoice + Logout */}
      <div className="shrink-0 border-t border-border pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] px-4 space-y-3">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center font-medium text-muted-foreground text-sm overflow-hidden shrink-0">
            {user?.logo_url ? (
              <img src={user.logo_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              user?.full_name ? user.full_name[0].toUpperCase() : 'U'
            )}
          </div>
          <div className="text-center min-w-0">
            <div className="font-semibold text-foreground truncate text-sm">{user?.company_name || 'My Company'}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.full_name || user?.email}</div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Link to={createPageUrl("CreateInvoice")} onClick={onClose} className="block">
            <Button className="w-full min-h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-3 rounded-xl touch-manipulation shadow-md shadow-primary/20">
              <Plus className="size-5 mr-2" /> Create Invoice
            </Button>
          </Link>
          <Button variant="outline" className="w-full min-h-12 border-border text-foreground hover:bg-muted py-3 rounded-xl touch-manipulation" onClick={() => { onClose(); handleLogout(); }}>
            <LogOut className="size-5 mr-2" /> Logout
          </Button>
        </div>
      </div>
    </div>
    <div className="flex-1 bg-black/50 min-h-screen" onClick={onClose} aria-hidden="true" />
  </motion.div>
);

MobileNav.propTypes = {
  items: PropTypes.arrayOf(navItemShape).isRequired,
  onClose: PropTypes.func,
  user: PropTypes.object,
  navigate: PropTypes.func,
  handleLogout: PropTypes.func
};

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const mainContentRef = useRef(null);
  const { user, logout } = useAuth();
  const { toast } = useToast();

  // Scroll main content area to top when route changes (content lives in overflow-auto, not window)
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;

    // Logic for showing onboarding
    if (!user.onboarding_completed && !user.company_name) {
      setShowWizard(true);
    } else if (!user.tour_completed && currentPageName === 'Dashboard') {
      setTimeout(() => setShowTour(true), 1000);
    }
  }, [currentPageName, user]);

  const handleWizardComplete = () => {
    setShowWizard(false);
    setShowTour(true);
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
    try {
      await logout();
      navigate(createPageUrl("Login"));
    } catch (error) {
      console.error("Error logging out:", error);
      toast({
        title: "Logout failed",
        description: error?.message || "Could not sign out. Please try again.",
        variant: "destructive",
      });
    }
  };


  // Pages that should display without the main application layout (sidebar/header)
  const standalonePages = [
    'PayslipPDF',
    'InvoicePDF',
    'CashFlowPDF',
    'PublicInvoice',
    'PublicQuote',
    'PublicPayslip',
    'Login',
    'Signup',
    'ForgotPassword',
    'ResetPassword',
    'AcceptInvite'
  ];

  if (standalonePages.includes(currentPageName)) {
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
    <div className={`overflow-x-hidden min-h-screen w-full grid grid-cols-1 min-w-0 ${isSidebarCollapsed ? "md:grid-cols-[72px_1fr]" : "md:grid-cols-[240px_1fr]"}`}>
      {/* Sidebar: hidden on mobile */}
      <motion.div
      <motion.div
        initial={{ x: -280 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`sidebar sidebar-panel hidden md:block text-foreground sticky top-0 h-screen py-6 ${
          isSidebarCollapsed ? "px-2" : "px-4"
        }`}
      >
        <div className="flex h-full flex-col">

          {/* Logo */}
          <div className={`flex flex-col ${isSidebarCollapsed ? "px-0" : ""}`}>
            <div className={`flex items-center ${isSidebarCollapsed ? "justify-center h-16" : "h-16 gap-3"}`}>
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
                  <span className="text-[15px] font-semibold text-foreground tracking-tight">
                    Paidly
                  </span>
                )}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                className="ml-auto shrink-0 h-10 w-10 rounded-xl border border-transparent bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/20 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0 active:scale-95 transition-all duration-200 ease-out"
                title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isSidebarCollapsed ? (
                  <ChevronsRight className="size-5" aria-hidden />
                ) : (
                  <ChevronsLeft className="size-5" aria-hidden />
                )}
              </Button>
            </div>
            <div className="mt-3" data-tour="dashboard-summary">
              <NavLink
                item={getNavigationItems(user?.subscription_plan || 'Individual', user?.role).find(item => item.title === "Dashboard")}
                collapsed={isSidebarCollapsed}
              />
            </div>
          </div>

          {/* Navigation */}
          <div className={`flex-1 py-4 overflow-auto sidebar-nav-scroll-area ${isSidebarCollapsed ? "px-1" : "px-3"}`}> 
            <nav className={isSidebarCollapsed ? "space-y-2" : "space-y-1"}>
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
          <div className={`mt-auto ${isSidebarCollapsed ? "p-2" : "p-4"}`}>
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
                  <Plus className="size-5" />
                </Button>
              ) : (
              <Button id="create-invoice-btn" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 px-4 rounded-xl text-sm gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-primary/30 focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <Plus className="size-5" /> Create Invoice
              </Button>
              )}
            </Link>
          </div>

          {/* Logout */}
          <div className={`border-t border-[var(--sidebar-border-color)] ${isSidebarCollapsed ? "p-2" : "p-4"}`}>
            <button
              onClick={handleLogout}
              title={isSidebarCollapsed ? "Log out" : undefined}
              aria-label={isSidebarCollapsed ? "Log out" : undefined}
              className={`flex items-center text-foreground transition-colors w-full py-2.5 text-[13px] rounded-xl hover:bg-muted ${
                isSidebarCollapsed ? "justify-center" : "gap-3"
              }`}
            >
              <LogOut className="size-5" />
              {!isSidebarCollapsed && "Log out"}
            </button>
          </div>
        </div>
      </motion.div>

       <AnimatePresence>
        {isMobileMenuOpen && (
          <MobileNav
            items={getNavigationItems(user?.subscription_plan || 'Individual', user?.role)}
            onClose={() => setIsMobileMenuOpen(false)}
            user={user}
            navigate={navigate}
            handleLogout={handleLogout}
          />
        )}
      </AnimatePresence>

      {/* Main Content — ultra-light neutral gradient (or navy when Dashboard) */}
      <div className={`flex flex-col min-h-screen ${currentPageName === "Dashboard" ? "" : "content-area-light"}`}>
        {/* Header: touch targets 44px on mobile, no horizontal overflow */}
        <motion.header
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="h-14 sm:h-16 safe-top bg-card/95 backdrop-blur-sm border-b border-border flex items-center justify-between gap-2 px-3 sm:px-6 lg:px-8 shadow-sm min-h-[56px]"
        >
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <Button variant="ghost" size="icon" className="md:hidden text-muted-foreground hover:bg-muted rounded-xl min-h-11 min-w-11 touch-manipulation shrink-0" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
            <div className="relative hidden sm:block max-w-md flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
              <Input
                placeholder="Search invoices, clients…"
                className="pl-10 bg-muted/50 border-border rounded-xl text-foreground placeholder:text-muted-foreground h-10 text-sm focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
             <NotificationBell />
            
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 hover:bg-muted rounded-xl text-foreground min-h-11 min-w-11 sm:min-w-0 sm:min-h-10 touch-manipulation px-2 sm:px-3">
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
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="size-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </motion.header>

        {/* Main Content Area — scrollable, no horizontal overflow, safe areas */}
        <main
          ref={mainContentRef}
          className={`dashboard-scroll-area flex-1 overflow-auto overflow-x-hidden scroll-smooth py-4 sm:py-6 md:py-8 px-3 sm:px-6 md:px-8 safe-x safe-bottom min-w-0 ${currentPageName === "Dashboard" ? "dashboard-fintech-wrap" : ""}`}
        >
          <div className="max-w-7xl mx-auto w-full min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="min-h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
          </div>
        </main>

        {/* Footer: stacked on mobile, touch-friendly links */}
        <footer className="border-t border-border bg-card/30 py-4 px-3 sm:px-6 md:px-8 safe-x safe-bottom">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-foreground text-center sm:text-left">
            <span>© {new Date().getFullYear()} Paidly. All rights reserved.</span>
            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-6">
              <Link to={createPageUrl("About")} className="text-foreground underline-offset-4 hover:underline transition-colors min-h-[44px] inline-flex items-center justify-center py-2">
                Mission &amp; About
              </Link>
              <Link to={createPageUrl("Settings")} className="text-foreground underline-offset-4 hover:underline transition-colors min-h-[44px] inline-flex items-center justify-center py-2">
                Settings
              </Link>
            </div>
          </div>
        </footer>

        <OnboardingTour isOpen={showTour} onClose={() => setShowTour(false)} />
        <SetupWizard isOpen={showWizard} onComplete={handleWizardComplete} />
        </div>
        </div>
      );
    }

Layout.propTypes = {
  children: PropTypes.node,
  currentPageName: PropTypes.string
};

