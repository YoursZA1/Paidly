import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from "prop-types";
import {
  HomeIcon,
  DocumentTextIcon,
  DocumentDuplicateIcon,
  UserGroupIcon,
  PlusIcon,
  Bars3Icon,
  ChevronDownIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import { createPageUrl, triggerHaptic } from "@/utils";
import useCompanyContext from "@/hooks/useCompanyContext";
import { resolveWorkforceHomePath } from "@/lib/workforceExperience.js";
import { OWNER_CREATE_ACTIONS } from "@/components/ui/CreateSplitButton";

/**
 * Rule 7 — Simple navigation: one primary row only (max ~5 targets).
 * Home, Invoices, Create (split pill), Clients, Menu — deeper routes live in the drawer.
 */
const ownerCreateActions = OWNER_CREATE_ACTIONS.map((action) => {
  const iconByName = {
    Invoice: DocumentTextIcon,
    Quote: DocumentDuplicateIcon,
    Client: UserGroupIcon,
    Product: CubeIcon,
  };
  return {
    name: action.name,
    url: action.url,
    icon: iconByName[action.name] || DocumentTextIcon,
  };
});

const employeeCreateActions = [
  { name: "Leave", url: createPageUrl("CreateLeaveRequest"), icon: DocumentTextIcon },
  { name: "Expense", url: createPageUrl("CreateExpenseClaim"), icon: DocumentDuplicateIcon },
];

const PINNED_NAV_PATHS = new Set([
  createPageUrl("Dashboard").split("?")[0].toLowerCase(),
  createPageUrl("Invoices").split("?")[0].toLowerCase(),
  createPageUrl("Clients").split("?")[0].toLowerCase(),
  createPageUrl("Payslips").split("?")[0].toLowerCase(),
  createPageUrl("Documents").split("?")[0].toLowerCase(),
  createPageUrl("Workforce").split("?")[0].toLowerCase(),
  createPageUrl("Workforce/manager").split("?")[0].toLowerCase(),
  createPageUrl("Workforce/payroll").split("?")[0].toLowerCase(),
  createPageUrl("MyPayroll").split("?")[0].toLowerCase(),
]);

function MobileBottomNav({ onOpenMenu }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createWrapRef = useRef(null);
  const { companyId, showBusinessDashboard, ctx } = useCompanyContext();
  const isCompanyMemberNav = Boolean(companyId) && !showBusinessDashboard;
  const createActions = isCompanyMemberNav ? employeeCreateActions : ownerCreateActions;
  const primaryCreateUrl = createActions[0]?.url || createPageUrl("CreateInvoice");
  const memberHomeUrl = resolveWorkforceHomePath(ctx);
  const homeUrl = isCompanyMemberNav ? memberHomeUrl : createPageUrl("Dashboard");
  const secondaryUrl = isCompanyMemberNav ? createPageUrl("Workforce") : createPageUrl("Invoices");
  const secondaryLabel = isCompanyMemberNav ? "Workforce" : "Invoices";

  useEffect(() => {
    setCreateMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!createMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!createWrapRef.current?.contains(event.target)) {
        setCreateMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [createMenuOpen]);

  const isActive = (url) => location.pathname === url.split("?")[0];
  const isMenuActive = !PINNED_NAV_PATHS.has(location.pathname.toLowerCase());

  const handlePress = (callback) => {
    triggerHaptic(12);
    if (typeof callback === "function") callback();
  };

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 isolate pointer-events-none">
      <nav
        className="relative pointer-events-auto bg-background/95 dark:bg-background/95 backdrop-blur-xl backdrop-saturate-150 border-t border-border shadow-[0_-10px_40px_-12px_rgba(15,23,42,0.12)] dark:shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.55)] mobile-bottom-nav-inner pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        aria-label="Primary navigation"
      >
        <div className="flex justify-between items-center max-w-layout-narrow mx-auto w-full gap-0.5 sm:gap-1 px-1">
          {/* Home */}
          <Link
            to={homeUrl}
            onClick={() => handlePress()}
            className={`flex flex-col items-center gap-0.5 touch-manipulation min-h-[48px] min-w-[48px] justify-center rounded-2xl px-1 py-1 transition-colors active:scale-[0.97] ${
              isActive(homeUrl) ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Home"
            aria-current={isActive(homeUrl) ? "page" : undefined}
          >
            <HomeIcon className="w-6 h-6 shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]">Home</span>
          </Link>
          <Link
            to={secondaryUrl}
            onClick={() => handlePress()}
            className={`flex flex-col items-center gap-0.5 touch-manipulation min-h-[48px] min-w-[48px] justify-center rounded-2xl px-1 py-1 transition-colors active:scale-[0.97] ${
              isActive(secondaryUrl) || (isCompanyMemberNav && location.pathname.toLowerCase().startsWith("/workforce"))
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label={secondaryLabel}
            aria-current={isActive(secondaryUrl) ? "page" : undefined}
          >
            {isCompanyMemberNav ? (
              <UserGroupIcon className="w-6 h-6 shrink-0" />
            ) : (
              <DocumentTextIcon className="w-6 h-6 shrink-0" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]">
              {secondaryLabel}
            </span>
          </Link>

          {/* Center split Create pill */}
          <div ref={createWrapRef} className="relative -top-3 flex flex-col items-center shrink-0 px-0.5">
            <AnimatePresence>
              {createMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  className="absolute bottom-full mb-3 w-44 rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl overflow-hidden"
                  role="menu"
                  aria-label="Create"
                >
                  {createActions.map((action) => (
                    <Link
                      key={action.name}
                      to={action.url}
                      role="menuitem"
                      onClick={() => handlePress(() => setCreateMenuOpen(false))}
                      className="flex items-center gap-2.5 px-3.5 py-3 text-sm font-medium text-foreground hover:bg-muted/80 active:bg-muted transition-colors border-b border-border/60 last:border-b-0"
                    >
                      <action.icon className="w-5 h-5 text-primary shrink-0" />
                      {action.name}
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div
              className="flex items-stretch rounded-full bg-primary text-primary-foreground shadow-[0_8px_28px_-4px_hsl(var(--primary)/0.55)] ring-2 ring-background"
              role="group"
              aria-label="Create"
            >
              <button
                type="button"
                onClick={() =>
                  handlePress(() => {
                    setCreateMenuOpen(false);
                    navigate(primaryCreateUrl);
                  })
                }
                className="flex items-center gap-2 pl-3 pr-2.5 py-2.5 rounded-l-full touch-manipulation active:bg-primary/90 transition-colors"
                aria-label={isCompanyMemberNav ? "Create leave request" : "Create invoice"}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                  <PlusIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                </span>
                <span className="text-sm font-semibold tracking-tight pr-0.5">Create</span>
              </button>
              <span className="w-px self-stretch my-2 bg-primary-foreground/25" aria-hidden />
              <button
                type="button"
                onClick={() => handlePress(() => setCreateMenuOpen((open) => !open))}
                className="flex items-center justify-center pl-2 pr-3 rounded-r-full touch-manipulation active:bg-primary/90 transition-colors min-w-[40px]"
                aria-label={createMenuOpen ? "Close create menu" : "Open create menu"}
                aria-expanded={createMenuOpen}
                aria-haspopup="menu"
              >
                <ChevronDownIcon
                  className={`w-4 h-4 stroke-[2.5] transition-transform duration-200 ${
                    createMenuOpen ? "rotate-180" : "rotate-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Clients (owners) / Documents (employees) */}
          <Link
            to={isCompanyMemberNav ? createPageUrl("Documents") : createPageUrl("Clients")}
            onClick={() => handlePress()}
            className={`flex flex-col items-center gap-0.5 touch-manipulation min-h-[48px] min-w-[48px] justify-center rounded-2xl px-1 py-1 transition-colors active:scale-[0.97] ${
              isActive(isCompanyMemberNav ? createPageUrl("Documents") : createPageUrl("Clients"))
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label={isCompanyMemberNav ? "Documents" : "Clients"}
            aria-current={
              isActive(isCompanyMemberNav ? createPageUrl("Documents") : createPageUrl("Clients"))
                ? "page"
                : undefined
            }
          >
            {isCompanyMemberNav ? (
              <DocumentDuplicateIcon className="w-6 h-6 shrink-0" />
            ) : (
              <UserGroupIcon className="w-6 h-6 shrink-0" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]">
              {isCompanyMemberNav ? "Documents" : "Clients"}
            </span>
          </Link>
          {/* Menu — opens sidebar drawer; active when on a route not pinned in the bar */}
          <button
            type="button"
            onClick={() => handlePress(() => onOpenMenu?.())}
            className={`flex flex-col items-center gap-0.5 touch-manipulation min-h-[48px] min-w-[48px] justify-center rounded-2xl px-1 py-1 transition-colors active:scale-[0.97] ${
              isMenuActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Menu"
          >
            <Bars3Icon className="w-6 h-6 shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]">Menu</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

MobileBottomNav.propTypes = {
  onOpenMenu: PropTypes.func,
};

export default MobileBottomNav;
