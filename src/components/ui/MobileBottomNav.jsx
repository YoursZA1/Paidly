import { useState } from "react";
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

  const isActive = (url) => location.pathname === url.split("?")[0];

  const handlePress = (callback) => {
    triggerHaptic(12);
    if (typeof callback === "function") callback();
  };

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
      <nav
        className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-100 dark:border-slate-700/50 px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        aria-label="Primary navigation"
      >
        <div className="flex justify-between items-center max-w-md mx-auto">
          {/* Home */}
          <Link
            to={createPageUrl("Dashboard")}
            onClick={() => handlePress()}
            className="flex flex-col items-center gap-1 touch-manipulation min-h-[44px] justify-center group active:scale-90 transition-transform"
            aria-label="Home"
          >
            <HomeIcon
              className={`w-6 h-6 transition-transform group-active:scale-90 ${isActive(createPageUrl("Dashboard")) ? "text-primary" : "text-slate-400"}`}
            />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive(createPageUrl("Dashboard")) ? "text-primary" : "text-slate-400"}`}>
              Home
            </span>
          </Link>
          {/* Invoices */}
          <Link
            to={createPageUrl("Invoices")}
            onClick={() => handlePress()}
            className="flex flex-col items-center gap-1 touch-manipulation min-h-[44px] justify-center group active:scale-90 transition-transform"
            aria-label="Invoices"
          >
            <DocumentTextIcon
              className={`w-6 h-6 transition-transform group-active:scale-90 ${isActive(createPageUrl("Invoices")) ? "text-primary" : "text-slate-400"}`}
            />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive(createPageUrl("Invoices")) ? "text-primary" : "text-slate-400"}`}>
              Invoices
            </span>
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
              className="w-14 h-14 bg-slate-900 dark:bg-slate-800 rounded-2xl shadow-xl flex items-center justify-center text-white ring-4 ring-white dark:ring-slate-900 touch-manipulation"
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
            className="flex flex-col items-center gap-1 touch-manipulation min-h-[44px] justify-center group active:scale-90 transition-transform"
            aria-label="Clients"
          >
            <UserGroupIcon
              className={`w-6 h-6 transition-transform group-active:scale-90 ${isActive(createPageUrl("Clients")) ? "text-primary" : "text-slate-400"}`}
            />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive(createPageUrl("Clients")) ? "text-primary" : "text-slate-400"}`}>
              Clients
            </span>
          </Link>
          {/* Menu — opens sidebar drawer */}
          <button
            type="button"
            onClick={() => handlePress(() => onOpenMenu?.())}
            className="flex flex-col items-center gap-1 touch-manipulation min-h-[44px] justify-center group active:scale-90 transition-transform"
            aria-label="Menu"
          >
            <Bars3Icon className="w-6 h-6 text-slate-400 transition-transform group-active:scale-90" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Menu
            </span>
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
