import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from "prop-types";
import {
  HomeIcon,
  DocumentTextIcon,
  DocumentDuplicateIcon,
  UserGroupIcon,
  PlusIcon,
  Bars3Icon,
} from "@heroicons/react/24/outline";
import { createPageUrl, triggerHaptic } from "@/utils";

const speedDialActions = [
  { name: "Invoice", url: createPageUrl("CreateInvoice"), icon: DocumentTextIcon },
  { name: "Quote", url: createPageUrl("CreateQuote"), icon: DocumentDuplicateIcon },
];

function MobileBottomNav({ onOpenMenu }) {
  const location = useLocation();
  const [speedDialOpen, setSpeedDialOpen] = useState(false);

  useEffect(() => {
    setSpeedDialOpen(false);
  }, [location.pathname, location.search]);

  const isActive = (url) => location.pathname === url.split("?")[0];

  const handlePress = (callback) => {
    triggerHaptic(12);
    if (typeof callback === "function") callback();
  };

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 isolate pointer-events-none">
      <nav
        className="relative pointer-events-auto bg-background/95 dark:bg-background/95 backdrop-blur-xl backdrop-saturate-150 border-t border-border shadow-[0_-10px_40px_-12px_rgba(15,23,42,0.12)] dark:shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.55)] px-4 sm:px-6 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        aria-label="Primary navigation"
      >
        <div className="flex justify-between items-center max-w-lg mx-auto gap-0.5 sm:gap-1">
          {/* Home */}
          <Link
            to={createPageUrl("Dashboard")}
            onClick={() => handlePress()}
            className={`flex flex-col items-center gap-0.5 touch-manipulation min-h-[48px] min-w-[52px] justify-center rounded-2xl px-1 py-1 transition-colors active:scale-[0.97] ${
              isActive(createPageUrl("Dashboard")) ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Home"
            aria-current={isActive(createPageUrl("Dashboard")) ? "page" : undefined}
          >
            <HomeIcon className="w-6 h-6 shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">Home</span>
          </Link>
          {/* Invoices */}
          <Link
            to={createPageUrl("Invoices")}
            onClick={() => handlePress()}
            className={`flex flex-col items-center gap-0.5 touch-manipulation min-h-[48px] min-w-[52px] justify-center rounded-2xl px-1 py-1 transition-colors active:scale-[0.97] ${
              isActive(createPageUrl("Invoices")) ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Invoices"
            aria-current={isActive(createPageUrl("Invoices")) ? "page" : undefined}
          >
            <DocumentTextIcon className="w-6 h-6 shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">Invoices</span>
          </Link>

          {/* Center FAB */}
          <div className="relative -top-8 flex flex-col items-center">
            <AnimatePresence>
              {speedDialOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-full mb-2 flex flex-col gap-2"
                >
                  {speedDialActions.map((action, i) => (
                    <motion.div
                      key={action.name}
                      initial={{ opacity: 0, y: 20, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25, delay: i * 0.05 }}
                    >
                      <Link
                        to={action.url}
                        onClick={() => handlePress(() => setSpeedDialOpen(false))}
                        className="flex items-center gap-2 w-24 py-2.5 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-primary/10 hover:border-primary/30 active:scale-95 transition-colors"
                      >
                        <action.icon className="w-5 h-5 text-primary" />
                        {action.name}
                      </Link>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button
              type="button"
              onClick={() => handlePress(() => setSpeedDialOpen((o) => !o))}
              className="w-14 h-14 bg-primary text-primary-foreground rounded-2xl shadow-lg shadow-primary/35 flex items-center justify-center ring-4 ring-background touch-manipulation"
              whileTap={{ scale: 0.92 }}
              animate={{ rotate: speedDialOpen ? 45 : 0 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 24,
                mass: 0.8,
              }}
              aria-label={speedDialOpen ? "Close create menu" : "Create new"}
            >
              <PlusIcon className="w-8 h-8 stroke-[2.5] pointer-events-none" />
            </motion.button>
          </div>

          {/* Clients */}
          <Link
            to={createPageUrl("Clients")}
            onClick={() => handlePress()}
            className={`flex flex-col items-center gap-0.5 touch-manipulation min-h-[48px] min-w-[52px] justify-center rounded-2xl px-1 py-1 transition-colors active:scale-[0.97] ${
              isActive(createPageUrl("Clients")) ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Clients"
            aria-current={isActive(createPageUrl("Clients")) ? "page" : undefined}
          >
            <UserGroupIcon className="w-6 h-6 shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">Clients</span>
          </Link>
          {/* Menu — opens sidebar drawer */}
          <button
            type="button"
            onClick={() => handlePress(() => onOpenMenu?.())}
            className="flex flex-col items-center gap-0.5 touch-manipulation min-h-[48px] min-w-[52px] justify-center rounded-2xl px-1 py-1 text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]"
            aria-label="Menu"
          >
            <Bars3Icon className="w-6 h-6 shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">Menu</span>
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
