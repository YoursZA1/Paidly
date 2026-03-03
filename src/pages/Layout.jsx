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
      <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
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
            <span className="sidebar-nav-icon inline-flex items-center justify-center h-10 w-10 rounded-lg transition-all bg-transparent text-muted-foreground group-hover:text-foreground [&_svg]:size-5">
              <item.icon className="size-5" strokeWidth={2.5} />
            </span>
            {!collapsed && (
              <span className="text-[13px] font-normal transition-colors text-muted-foreground group-hover:text-foreground">{item.title}</span>
            )}
            {!collapsed && (
              <span className={`ml-auto transition-transform text-muted-foreground ${open ? "rotate-90" : "rotate-0"}`}>
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
            ${isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground group-hover:bg-muted/80"}
          `}
        >
          <item.icon className="size-5" strokeWidth={2.5} />
        </span>
        {!collapsed && (
          <span className={`text-[13px] transition-colors ${isActive ? "text-primary-foreground font-semibold" : "text-muted-foreground group-hover:text-foreground font-normal"}`}>{item.title}</span>
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
  >
    <div className="w-full max-w-xs bg-[#121212] border-r border-white/10 text-white p-6 flex flex-col">
      <div className="flex h-20 items-center justify-between px-2">
        <Link to={createPageUrl("Dashboard")} onClick={onClose} className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00CCFF] rounded-xl flex items-center justify-center">
            <img src="/logo.svg" alt="Paidly" className="w-8 h-8" />
          </div>
          <span className="text-[15px] font-semibold text-white">Paidly</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white/60 hover:bg-white/10 hover:text-white rounded-lg">
          <X className="size-5" />
        </Button>
      </div>
      <nav className="space-y-1 mt-4 flex-1 overflow-y-auto">
        {items.map(item => (
          <NavLink key={item.id || item.title} item={item} onClick={onClose} />
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex flex-col items-center gap-2 mb-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center font-medium text-white/70 text-sm overflow-hidden">
            {user?.logo_url ? (
              <img src={user.logo_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              user?.full_name ? user.full_name[0].toUpperCase() : 'U'
            )}
          </div>
          <div className="text-center">
            <div className="font-semibold text-white">{user?.company_name || 'My Company'}</div>
            <div className="text-xs text-white/60">{user?.full_name || user?.email}</div>
          </div>
        </div>
        <Button className="w-full mb-2 bg-[#00CCFF] text-black hover:bg-[#00CCFF]/90 font-semibold py-3 rounded-xl" onClick={() => { onClose(); navigate(createPageUrl("Settings")); }}>
          <Settings className="size-5 mr-2" /> Settings
        </Button>
        <Button variant="outline" className="w-full mb-2 border-white/20 text-white hover:bg-white/10 py-3 rounded-xl" onClick={() => { onClose(); navigate(createPageUrl("Settings") + "?tab=subscription"); }}>
          <Bell className="size-5 mr-2" /> Subscription
        </Button>
        <Button variant="destructive" className="w-full rounded-xl" onClick={() => { onClose(); handleLogout(); }}>
          <LogOut className="size-5 mr-2" /> Logout
        </Button>
      </div>

      <div className="p-4">
        <Link to={createPageUrl("CreateInvoice")} onClick={onClose}>
          <Button className="w-full bg-[#00CCFF] text-black hover:bg-[#00CCFF]/90 font-semibold py-3 rounded-xl">
            <Plus className="size-5 mr-2" /> Create Invoice
          </Button>
        </Link>
      </div>
    </div>
    <div className="flex-1 bg-black/50" onClick={onClose}></div>
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
    'Login'
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
    <div
      className={`grid min-h-screen w-full ${{
        true: "md:grid-cols-[72px_1fr]",
        false: "md:grid-cols-[240px_1fr]"
      }[isSidebarCollapsed]}`}
    >
      {/* Sidebar */}
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
              >
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                  <img
                    src="/logo.svg"
                    alt="Paidly"
                    className="w-8 h-8"
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
                className="ml-auto text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl shrink-0 w-9 h-9 transition-colors"
                title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isSidebarCollapsed ? (
                  <ChevronsRight className="size-5" />
                ) : (
                  <ChevronsLeft className="size-5" />
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
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-xl shadow-lg shadow-primary/25 transition-all hover:shadow-primary/30"
                  size="icon"
                >
                  <Plus className="size-5" />
                </Button>
              ) : (
              <Button id="create-invoice-btn" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2.5 px-4 rounded-xl text-sm gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-primary/30">
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
              className={`flex items-center text-muted-foreground hover:text-foreground transition-colors w-full py-2.5 text-[13px] rounded-xl hover:bg-muted ${
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
        {/* Header */}
        <motion.header
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="h-16 bg-card/95 backdrop-blur-sm border-b border-border flex items-center justify-between px-4 sm:px-6 lg:px-8 shadow-sm"
        >
          <div className="flex items-center gap-4 flex-1">
            <Button variant="ghost" size="icon" className="md:hidden text-muted-foreground hover:bg-muted rounded-xl" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <div className="relative hidden sm:block max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
              <Input
                placeholder="Search invoices, clients…"
                className="pl-10 bg-muted/50 border-border rounded-xl text-foreground placeholder:text-muted-foreground h-10 text-sm focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
             <NotificationBell />
            
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 hover:bg-muted rounded-xl text-foreground">
                    <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center font-medium text-muted-foreground text-xs overflow-hidden">
                      {user.logo_url ? (
                        <img src={user.logo_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        user.full_name ? user.full_name[0].toUpperCase() : 'U'
                      )}
                    </div>
                    <span className="font-medium hidden sm:block text-foreground">{user.company_name || user.full_name || 'User'}</span>
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

        {/* Main Content Area — fintech navy gradient when on Dashboard */}
        <main
          ref={mainContentRef}
          className={`dashboard-scroll-area flex-1 overflow-auto overflow-x-hidden scroll-smooth py-8 px-4 sm:px-8 ${currentPageName === "Dashboard" ? "dashboard-fintech-wrap" : ""}`}
        >
          <div className="max-w-7xl mx-auto">
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

        {/* Footer */}
        <footer className="border-t border-border bg-card/30 py-4 px-4 sm:px-8">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
            <span>© {new Date().getFullYear()} Paidly. All rights reserved.</span>
            <div className="flex items-center gap-6">
              <Link to={createPageUrl("About")} className="hover:text-foreground transition-colors">
                Mission &amp; About
              </Link>
              <Link to={createPageUrl("Settings")} className="hover:text-foreground transition-colors">
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

