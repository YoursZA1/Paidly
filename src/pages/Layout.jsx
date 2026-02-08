
import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl, createAdminPageUrl } from "@/utils";
import "@/styles/animations.css";
import {
  LayoutDashboard,
  Users,
  Headset,
  FileText,
  Settings,
  LogOut,
  StickyNote,
  Repeat,
  BarChart2,
  Search,
  Bell,
  Menu,
  X,
  Receipt,
  Calendar,
  MessageCircle,
  TrendingUp,
  Activity,
  History,
  FileSpreadsheet,
  Shield,
  Briefcase,
  Building2,
  BarChart3,
  Package,
  Wrench,
  LifeBuoy,
  Key,
  Plus,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { AnimatePresence, motion } from "framer-motion";
import NotificationBell from '@/components/notifications/NotificationBell';
import RecurringInvoiceService from '@/components/recurring/RecurringInvoiceService';
import NotificationService from '@/components/notifications/NotificationService';
import { hasFeatureAccess, getRequiredPlan, LockedNavItem } from '@/components/subscription/FeatureGate';
import OnboardingTour from '@/components/onboarding/OnboardingTour';
import SetupWizard from '@/components/onboarding/SetupWizard';
import QuoteReminderService from '@/components/quote/QuoteReminderService';

const allNavigationItems = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
    feature: null, // Always accessible
    id: "nav-dashboard"
  },
  {
    title: "Quotes",
    url: createPageUrl("Quotes"),
    icon: FileText,
    feature: 'quotes',
    id: "nav-quotes"
  },
  {
    title: "Invoices",
    url: createPageUrl("Invoices"),
    icon: FileText,
    feature: 'invoices',
    id: "nav-invoices"
  },
  {
    title: "Recurring",
    url: createPageUrl("RecurringInvoices"),
    icon: Repeat,
    feature: 'recurring',
    id: "nav-recurring"
  },
  {
    title: "Customers",
    url: createPageUrl("Clients"),
    icon: Users,
    feature: 'clients',
    id: "nav-clients"
  },
  {
    title: "Cash Flow",
    url: createPageUrl("CashFlow"),
    icon: BarChart2,
    feature: 'cashflow'
  },
  {
    title: "Budgets",
    url: createPageUrl("Budgets"),
    icon: TrendingUp,
    feature: 'reports' // Use reports feature flag for now
  },
  {
    title: "Accounting",
    url: createPageUrl("Accounting"),
    icon: BarChart2,
    feature: 'accounting'
  },
  {
    title: "Reports",
    url: createPageUrl("Reports"),
    icon: BarChart2,
    feature: 'reports'
  },
  {
    title: "Products & Services",
    url: createPageUrl("Services"),
    icon: Headset,
    feature: 'services'
  },
  {
    title: "Payroll",
    url: createPageUrl("Payslips"),
    icon: Receipt,
    feature: 'payroll'
  },
  {
    title: "Calendar",
    url: createPageUrl("Calendar"),
    icon: Calendar,
    feature: 'calendar'
  },
  {
    title: "Messages",
    url: createPageUrl("Messages"),
    icon: MessageCircle,
    feature: 'messages'
  },
  {
    title: "Notes",
    url: createPageUrl("Notes"),
    icon: StickyNote,
    feature: 'notes'
  },
  {
    title: "Users",
    url: createAdminPageUrl("Users"),
    icon: Users,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Admin Control",
    url: createAdminPageUrl("Admin Control"),
    icon: Shield,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Platform Settings",
    url: createAdminPageUrl("Platform Settings"),
    icon: Wrench,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Support & Admin Tools",
    url: createAdminPageUrl("Support Admin Tools"),
    icon: LifeBuoy,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Security & Compliance",
    url: createAdminPageUrl("Security Compliance"),
    icon: Shield,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Admin Roles",
    url: createAdminPageUrl("Roles Management"),
    icon: Key,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Access Control",
    url: createAdminPageUrl("Access Control"),
    icon: Users,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Logs & Audit Trail",
    url: createAdminPageUrl("Logs & Audit Trail"),
    icon: History,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Excel Data Capture",
    url: createAdminPageUrl("Excel Data Capture"),
    icon: FileSpreadsheet,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Subscriptions",
    url: createAdminPageUrl("Subscriptions"),
    icon: Briefcase,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Plans Management",
    url: createAdminPageUrl("Plans Management"),
    icon: Package,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Document Activity",
    url: createAdminPageUrl("Document Activity"),
    icon: Activity,
    feature: null,
    roles: ['admin']
  },
  {
    title: "User Management",
    url: createAdminPageUrl("User Management"),
    icon: Users,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Accounts Management",
    url: createAdminPageUrl("Accounts Management"),
    icon: Building2,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Document Oversight",
    url: createAdminPageUrl("Document Oversight"),
    icon: BarChart3,
    feature: null,
    roles: ['admin']
  },
  {
    title: "Settings",
    url: createPageUrl("Settings"),
    icon: Settings,
    feature: null, // Always accessible
    roles: null,
    id: "nav-settings"
  }
  ];

const getNavigationItems = (userPlan, userRole) => {
  // Admin-only navigation items
  const adminOnlyItems = [
    'Users',
    'Admin Control',
    'Access Control',
    'Logs & Audit Trail',
    'Excel Data Capture',
    'Subscriptions',
    'Plans Management',
    'Document Activity',
    'User Management',
    'Accounts Management',
    'Document Oversight'
  ];
  
  let items = allNavigationItems;
  
  // Filter navigation for admin users
  if (userRole === 'admin') {
    items = allNavigationItems.filter(item => adminOnlyItems.includes(item.title));
  }
  
  return items.map(item => ({
    ...item,
    hasAccess: !item.feature || hasFeatureAccess(userPlan, item.feature),
    requiredPlan: item.feature ? getRequiredPlan(item.feature) : null,
    hasRoleAccess: !item.roles || item.roles.includes(userRole)
  }));
};

const NavLink = ({ item, onClick, collapsed = false }) => {
  const location = useLocation();
  const isActive = location.pathname === item.url.split("?")[0];
  
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
    >
      <Link
        id={item.id}
        to={item.url}
        onClick={onClick}
        title={collapsed ? item.title : undefined}
        aria-label={collapsed ? item.title : undefined}
        className={`flex items-center rounded-lg py-3 text-white/80 transition-all hover:bg-white/10 hover:text-white ${
          collapsed ? "justify-center px-2" : "gap-3 px-4"
        } ${
          isActive ? "bg-white/20 text-white font-medium" : ""
        }`}
      >
        <item.icon className="h-5 w-5" />
        {!collapsed && item.title}
      </Link>
    </motion.div>
  );
  };

const MobileNav = ({ items, onClose, userPlan, onLogout }) => (
  <motion.div
    initial={{ x: "-100%" }}
    animate={{ x: 0 }}
    exit={{ x: "-100%" }}
    transition={{ duration: 0.3, ease: "easeInOut" }}
    className="fixed inset-0 z-50 flex md:hidden"
  >
    <div className="w-full max-w-xs bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 text-white p-4 flex flex-col">
       <div className="flex h-20 items-center justify-between px-2">
            <Link
              to={createPageUrl("Dashboard")}
              onClick={onClose}
              className="flex items-center gap-3"
            >
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                <img 
                  src="/Logo icon.png" 
                  alt="InvoiceBreak" 
                  className="w-8 h-8"
                />
              </div>
              <span className="text-xl font-bold">InvoiceBreek</span>
            </Link>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10">
              <X className="h-6 w-6" />
            </Button>
          </div>
      <nav className="space-y-1 mt-4 flex-1 overflow-y-auto">
        {items.map(item => (
          <NavLink key={item.title} item={item} onClick={onClose} />
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <Link to={createPageUrl("CreateInvoice")} onClick={onClose}>
          <Button className="w-full bg-white text-purple-600 hover:bg-purple-50 font-semibold py-3 rounded-lg shadow-lg">
            + CREATE INVOICE
          </Button>
        </Link>
      </div>

      <div className="p-4">
        <button
          onClick={() => { onClose(); }}
          className="flex items-center gap-3 text-white/80 hover:text-white transition-colors w-full py-2"
        >
          <LogOut className="h-5 w-5" />
          Log out
        </button>
      </div>
    </div>
    <div className="flex-1 bg-black/60" onClick={onClose}></div>
  </motion.div>
);

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const { user, logout } = useAuth();

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
      // Optionally trigger tour after wizard
      setShowTour(true);
  };

  useEffect(() => {
      const checkRecurringInvoices = async () => {
          if (!user) return;

          // Use local storage to prevent running this on every navigation
          const lastCheck = localStorage.getItem('lastRecurringCheck');
          const now = new Date().getTime();
          const oneDay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

          if (!lastCheck || (now - parseInt(lastCheck) > oneDay)) {
               try {
                  console.log("Checking for due recurring invoices...");
                  const generated = await RecurringInvoiceService.checkAndGenerateDueInvoices();
                  if (generated.length > 0) {
                      console.log(`${generated.length} recurring invoices generated.`);
                      await NotificationService.createNotification(
                          user.id,
                          `${generated.length} Recurring Invoice(s) Generated`,
                          `The system automatically created ${generated.length} new invoice(s) from your recurring profiles.`,
                          'recurring_generated',
                          null
                      );
                  } else {
                      console.log("No recurring invoices were due.");
                  }
                  localStorage.setItem('lastRecurringCheck', now.toString());
              } catch (error) {
                  console.error("Failed to check recurring invoices:", error);
              }
          }
      };

      const checkDueDateReminders = async () => {
      if (!user) return;

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
      if (!user) return;

      const lastFollowUpCheck = localStorage.getItem('lastFollowUpCheck');
      const now = new Date().getTime();
      const oneDay = 24 * 60 * 60 * 1000;

      if (!lastFollowUpCheck || (now - parseInt(lastFollowUpCheck) > oneDay)) {
          try {
              // Use the new PaymentReminderService for reminders
              const PaymentReminderService = (await import('@/components/reminders/PaymentReminderService')).default;
              await PaymentReminderService.checkAndSendReminders();

              // Quote Reminders
              await QuoteReminderService.checkAndSendReminders();

              // Keep ClientFollowUpService only for segment updates if needed, or replace entirely if reminders are handled
              const ClientFollowUpService = (await import('@/components/clients/ClientFollowUpService')).default;
              // await ClientFollowUpService.checkAndSendFollowUps(); // Disabled in favor of PaymentReminderService
              await ClientFollowUpService.updateClientSegments();
              
              localStorage.setItem('lastFollowUpCheck', now.toString());
          } catch (error) {
              console.error("Failed to check reminders/follow-ups:", error);
          }
      }
      };

      checkRecurringInvoices();
      checkDueDateReminders();
      checkClientFollowUps();
  }, [user]); // Run when user data is available

  const handleLogout = async () => {
    try {
      await logout();
      navigate(createPageUrl("Login"));
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  // Pages that should display without the main application layout (sidebar/header)
  const standalonePages = [
    'PayslipPDF',
    'InvoicePDF',
    'QuotePDF',
    'CashFlowPDF',
    'PublicInvoice',
    'PublicQuote',
    'PublicPayslip',
    'Login'
  ];

  if (standalonePages.includes(currentPageName)) {
    return children;
  }

  return (
    <div
      className={`grid min-h-screen w-full ${{
        true: "md:grid-cols-[72px_1fr]",
        false: "md:grid-cols-[280px_1fr]"
      }[isSidebarCollapsed]}`}
    >
      {/* Sidebar */}
      <motion.div 
        initial={{ x: -280 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`hidden md:block bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 text-white sticky top-0 h-screen ${
          isSidebarCollapsed ? "px-2" : ""
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className={`flex h-20 items-center ${isSidebarCollapsed ? "px-2" : "px-6"}`}>
            <Link
              to={createPageUrl("Dashboard")}
              className={`flex items-center ${isSidebarCollapsed ? "justify-center" : "gap-3"}`}
            >
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                <img 
                  src="/Logo icon.png" 
                  alt="InvoiceBreak" 
                  className="w-8 h-8"
                />
              </div>
              {!isSidebarCollapsed && <span className="text-xl font-bold">InvoiceBreek</span>}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className={`ml-auto text-white hover:bg-white/10 ${isSidebarCollapsed ? "w-9 h-9" : "w-9 h-9"}`}
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? (
                <ChevronsRight className="h-5 w-5" />
              ) : (
                <ChevronsLeft className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Navigation */}
          <div className={`flex-1 py-4 overflow-y-auto ${isSidebarCollapsed ? "px-1" : "px-4"}`}>
            <nav className={isSidebarCollapsed ? "space-y-2" : "space-y-1"}>
              {getNavigationItems(user?.subscription_plan || 'Individual', user?.role).map(item => (
                <NavLink key={item.title} item={item} collapsed={isSidebarCollapsed} />
              ))}
            </nav>
          </div>

          {/* Create Invoice Button */}
          <div className={`mt-auto ${isSidebarCollapsed ? "p-2" : "p-4"}`}>
            <Link
              to={createPageUrl("CreateInvoice")}
              title={isSidebarCollapsed ? "Create Invoice" : undefined}
              aria-label={isSidebarCollapsed ? "Create Invoice" : undefined}
            >
              {isSidebarCollapsed ? (
                <Button
                  id="create-invoice-btn"
                  className="w-full bg-white text-purple-600 hover:bg-purple-50 font-semibold rounded-lg shadow-lg"
                  size="icon"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              ) : (
              <Button id="create-invoice-btn" className="w-full bg-white text-purple-600 hover:bg-purple-50 font-semibold py-3 rounded-lg shadow-lg">
                + CREATE INVOICE
              </Button>
              )}
            </Link>
          </div>

          {/* Logout */}
          <div className={`border-t border-white/10 ${isSidebarCollapsed ? "p-2" : "p-4"}`}>
            <button
              onClick={handleLogout}
              title={isSidebarCollapsed ? "Log out" : undefined}
              aria-label={isSidebarCollapsed ? "Log out" : undefined}
              className={`flex items-center text-white/80 hover:text-white transition-colors w-full py-2 ${
                isSidebarCollapsed ? "justify-center" : "gap-3"
              }`}
            >
              <LogOut className="h-5 w-5" />
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
            userPlan={user?.subscription_plan}
            onLogout={handleLogout}
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex flex-col bg-gray-50">
        {/* Header */}
        <motion.header 
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="h-20 bg-white border-b border-gray-100 flex items-center justify-between px-4 sm:px-6 shadow-sm"
        >{/* Search & Mobile Menu */}
          <div className="flex items-center gap-4 flex-1">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
            <div className="relative hidden sm:block max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search something"
                className="pl-10 bg-gray-50 border-gray-200 rounded-xl"
              />
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-4">
             <NotificationBell />
            
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 hover:bg-gray-100">
                    <div className="w-8 h-8 rounded-full bg-cyan-400 flex items-center justify-center font-bold text-white text-sm overflow-hidden">
                      {user.logo_url ? (
                        <img src={user.logo_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        user.full_name ? user.full_name[0].toUpperCase() : 'U'
                      )}
                    </div>
                    <span className="font-medium hidden sm:block">{user.company_name || user.full_name || 'User'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-2">
                    <p className="text-sm font-semibold text-slate-900">{user.company_name || 'My Company'}</p>
                    <p className="text-xs text-slate-500">{user.full_name || user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate(createPageUrl("Settings"))}>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl("Settings") + "?tab=subscription")}>
                    <Bell className="w-4 h-4 mr-2" />
                    Subscription
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </motion.header>

        {/* Main Content Area with Scroll and Animation */}
        <motion.main 
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth"
        >
          {children}
        </motion.main>

        <OnboardingTour isOpen={showTour} onClose={() => setShowTour(false)} />
        <SetupWizard isOpen={showWizard} onComplete={handleWizardComplete} />
        </div>
        </div>
        );
        }
