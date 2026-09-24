import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
 * Rule 7 — Simple navigation: one primary row only.
 * Owners on phones (< md): Home | Create (split pill) | Menu — Invoices & Clients live in the drawer
 * and the Create menu. Tablets (md → lg) keep Home | Invoices | Create | Clients | Menu.
 * Company members: Home | Workforce | Create | Documents | Menu at every size below lg.
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

const toPathKey = (page) => createPageUrl(page).split("?")[0].toLowerCase();

/** Owner routes that have their own bottom-nav tab on tablets but are reached via Menu on phones. */
const TABLET_ONLY_PINNED_PATHS = new Set([toPathKey("Invoices"), toPathKey("Clients")]);

const PINNED_NAV_PATHS = new Set([
  toPathKey("Dashboard"),
  ...TABLET_ONLY_PINNED_PATHS,
  toPathKey("Payslips"),
  toPathKey("Documents"),
  toPathKey("Workforce"),
  toPathKey("Workforce/manager"),
  toPathKey("Workforce/payroll"),
  toPathKey("MyPayroll"),
]);

const TAB_ACTIVE = "text-primary bg-primary/10 dark:bg-primary/[0.14]";
const TAB_INACTIVE = "text-muted-foreground hover:text-foreground";

function NavTab({ to, onClick, icon: Icon, label, active, activeClassName, wide = false, className = "" }) {
  const tabClassName = `flex flex-col items-center justify-center gap-1 touch-manipulation min-h-[52px] rounded-2xl py-1.5 transition-[color,background-color,transform] duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
    wide ? "min-w-[64px] px-3" : "min-w-[48px] px-1"
  } ${activeClassName ?? (active ? TAB_ACTIVE : TAB_INACTIVE)} ${className}`;
  const content = (
    <>
      <Icon className="w-6 h-6 shrink-0 stroke-[1.75]" aria-hidden />
      <span
        className={`text-[10px] font-semibold uppercase leading-none sm:text-[11px] ${
          wide ? "tracking-[0.08em]" : "tracking-wide"
        }`}
      >
        {label}
      </span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        onClick={onClick}
        className={tabClassName}
        aria-label={label}
        aria-current={active ? "page" : undefined}
      >
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={tabClassName} aria-label={label}>
      {content}
    </button>
  );
}

NavTab.propTypes = {
  to: PropTypes.string,
  onClick: PropTypes.func,
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  active: PropTypes.bool,
  activeClassName: PropTypes.string,
  wide: PropTypes.bool,
  className: PropTypes.string,
};

function MobileBottomNav({ onOpenMenu }) {
  const location = useLocation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createWrapRef = useRef(null);
  const createToggleRef = useRef(null);
  const { companyId, showBusinessDashboard, ctx } = useCompanyContext();
  const isCompanyMemberNav = Boolean(companyId) && !showBusinessDashboard;
  const createActions = isCompanyMemberNav ? employeeCreateActions : ownerCreateActions;
  const primaryCreateUrl = createActions[0]?.url || createPageUrl("CreateInvoice");
  const memberHomeUrl = resolveWorkforceHomePath(ctx);
  const homeUrl = isCompanyMemberNav ? memberHomeUrl : createPageUrl("Dashboard");
  const secondaryUrl = isCompanyMemberNav ? createPageUrl("Workforce") : createPageUrl("Invoices");
  const secondaryLabel = isCompanyMemberNav ? "Workforce" : "Invoices";
  const tertiaryUrl = isCompanyMemberNav ? createPageUrl("Documents") : createPageUrl("Clients");
  const tertiaryLabel = isCompanyMemberNav ? "Documents" : "Clients";
  /** Owners get the roomy 3-item bar on phones; members keep the compact 5-item bar. */
  const roomy = !isCompanyMemberNav;

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
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setCreateMenuOpen(false);
        createToggleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [createMenuOpen]);

  const isActive = (url) => location.pathname === url.split("?")[0];
  const pathKey = location.pathname.toLowerCase();
  const isMenuActive = !PINNED_NAV_PATHS.has(pathKey);
  /**
   * On phones, owners reach Invoices / Clients through Menu, so Menu lights up there;
   * on tablets those routes have their own tab, so Menu stays neutral.
   */
  const menuActiveClassName =
    !isCompanyMemberNav && TABLET_ONLY_PINNED_PATHS.has(pathKey)
      ? `${TAB_ACTIVE} md:text-muted-foreground md:bg-transparent md:dark:bg-transparent md:hover:text-foreground`
      : undefined;

  const handlePress = (callback) => {
    triggerHaptic(12);
    if (typeof callback === "function") callback();
  };

  /** Owner Invoices / Clients tabs render from md up only (tablet unchanged, phone decluttered). */
  const secondaryTabClassName = isCompanyMemberNav ? "" : "hidden md:flex";

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 isolate pointer-events-none">
      <nav
        className="relative pointer-events-auto bg-background/95 dark:bg-background/95 backdrop-blur-xl backdrop-saturate-150 border-t border-border/80 shadow-[0_-10px_40px_-12px_rgba(15,23,42,0.12)] dark:shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.55)] mobile-bottom-nav-inner pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
        aria-label="Primary navigation"
      >
        <div
          className={`flex justify-between items-center max-w-layout-narrow mx-auto w-full ${
            roomy ? "min-[360px]:px-1 sm:px-3" : "gap-0.5 sm:gap-1 px-1"
          }`}
        >
          <NavTab
            to={homeUrl}
            onClick={() => handlePress()}
            icon={HomeIcon}
            label="Home"
            active={isActive(homeUrl)}
            wide={roomy}
          />
          <NavTab
            to={secondaryUrl}
            onClick={() => handlePress()}
            icon={isCompanyMemberNav ? UserGroupIcon : DocumentTextIcon}
            label={secondaryLabel}
            active={
              isActive(secondaryUrl) ||
              (isCompanyMemberNav && location.pathname.toLowerCase().startsWith("/workforce"))
            }
            wide={roomy}
            className={secondaryTabClassName}
          />

          {/* Center split Create pill — primary CTA */}
          <div
            ref={createWrapRef}
            className={`relative flex flex-col items-center shrink-0 px-0.5 ${roomy ? "-top-0.5" : "-top-3"}`}
          >
            <AnimatePresence>
              {createMenuOpen && (
                <motion.div
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
                  transition={
                    prefersReducedMotion ? { duration: 0.12 } : { type: "spring", stiffness: 460, damping: 32 }
                  }
                  style={{ transformOrigin: "bottom center" }}
                  className="absolute bottom-full mb-3 w-48 max-w-[calc(100vw-2rem)] rounded-2xl border border-border/70 bg-popover/95 backdrop-blur-xl text-popover-foreground shadow-[0_18px_48px_-12px_rgba(15,23,42,0.28)] dark:shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] overflow-hidden"
                  role="menu"
                  aria-label="Create"
                >
                  {createActions.map((action) => (
                    <Link
                      key={action.name}
                      to={action.url}
                      role="menuitem"
                      onClick={() => handlePress(() => setCreateMenuOpen(false))}
                      className="flex items-center gap-3 px-4 min-h-[48px] text-[15px] font-medium text-foreground hover:bg-muted/70 active:bg-muted focus-visible:bg-muted focus-visible:outline-none transition-colors border-b border-border/50 last:border-b-0"
                    >
                      <action.icon className="w-5 h-5 text-primary shrink-0 stroke-[1.75]" aria-hidden />
                      {action.name}
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div
              className={`flex items-stretch rounded-full bg-primary text-primary-foreground ring-2 ring-background transition-shadow duration-300 ${
                createMenuOpen
                  ? "shadow-[0_10px_36px_-4px_hsl(var(--primary)/0.7),0_0_28px_-2px_hsl(var(--primary)/0.5)]"
                  : "shadow-[0_8px_28px_-6px_hsl(var(--primary)/0.6),0_0_22px_-6px_hsl(var(--primary)/0.45)]"
              }`}
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
                className={`flex items-center rounded-l-full touch-manipulation active:bg-black/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground/60 ${
                  roomy ? "gap-2.5 pl-2 pr-2.5 min-h-[48px]" : "gap-2 pl-3 pr-2.5 py-2.5"
                }`}
                aria-label={isCompanyMemberNav ? "Create leave request" : "Create invoice"}
              >
                <span
                  className={`inline-flex items-center justify-center rounded-full bg-white/20 ${
                    roomy ? "h-8 w-8" : "h-6 w-6"
                  }`}
                >
                  <PlusIcon className={`stroke-[2.5] ${roomy ? "w-4 h-4" : "w-3.5 h-3.5"}`} />
                </span>
                <span className={`font-semibold tracking-tight pr-0.5 ${roomy ? "text-[15px]" : "text-sm"}`}>
                  Create
                </span>
              </button>
              <span className="w-px self-stretch my-2.5 bg-primary-foreground/25" aria-hidden />
              <button
                ref={createToggleRef}
                type="button"
                onClick={() => handlePress(() => setCreateMenuOpen((open) => !open))}
                className={`flex items-center justify-center rounded-r-full touch-manipulation active:bg-black/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground/60 ${
                  roomy ? "pl-2.5 pr-3.5 min-w-[44px]" : "pl-2 pr-3 min-w-[40px]"
                }`}
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

          <NavTab
            to={tertiaryUrl}
            onClick={() => handlePress()}
            icon={isCompanyMemberNav ? DocumentDuplicateIcon : UserGroupIcon}
            label={tertiaryLabel}
            active={isActive(tertiaryUrl)}
            wide={roomy}
            className={secondaryTabClassName}
          />
          {/* Menu — opens sidebar drawer; active when on a route not pinned in the bar */}
          <NavTab
            onClick={() => handlePress(() => onOpenMenu?.())}
            icon={Bars3Icon}
            label="Menu"
            active={isMenuActive}
            activeClassName={menuActiveClassName}
            wide={roomy}
          />
        </div>
      </nav>
    </div>
  );
}

MobileBottomNav.propTypes = {
  onOpenMenu: PropTypes.func,
};

export default MobileBottomNav;
