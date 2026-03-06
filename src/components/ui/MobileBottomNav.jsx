import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from "prop-types";
import {
  HomeIcon,
  DocumentTextIcon,
  DocumentDuplicateIcon,
  UserGroupIcon,
  Bars3Icon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { createPageUrl } from "@/utils";

const speedDialActions = [
  { name: "Invoice", url: createPageUrl("CreateInvoice"), icon: DocumentTextIcon },
  { name: "Quote", url: createPageUrl("CreateQuote"), icon: DocumentDuplicateIcon },
];

function MobileBottomNav({ onOpenMenu }) {
  const location = useLocation();
  const [speedDialOpen, setSpeedDialOpen] = useState(false);

  const isActive = (url) => location.pathname === url.split("?")[0];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 px-6 pb-8 z-50">
      <nav
        className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-[32px] h-20 flex items-center justify-between px-4"
        aria-label="Primary navigation"
      >
        {/* Left: Home & Invoices */}
        <div className="flex w-1/2 justify-around pr-4">
          <Link
            to={createPageUrl("Dashboard")}
            className="flex flex-col items-center gap-1 touch-manipulation min-h-[48px] justify-center"
            aria-label="Home"
          >
            <HomeIcon
              className={`w-6 h-6 ${
                isActive(createPageUrl("Dashboard"))
                  ? "text-orange-600"
                  : "text-slate-400"
              }`}
            />
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              Home
            </span>
          </Link>
          <Link
            to={createPageUrl("Invoices")}
            className="flex flex-col items-center gap-1 touch-manipulation min-h-[48px] justify-center"
            aria-label="Invoices"
          >
            <DocumentTextIcon
              className={`w-6 h-6 ${
                isActive(createPageUrl("Invoices"))
                  ? "text-orange-600"
                  : "text-slate-400"
              }`}
            />
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              Invoices
            </span>
          </Link>
        </div>

        {/* Center: Hero button + Speed dial */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-10 flex flex-col items-center">
          {/* Speed dial actions - pop up above the main button */}
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
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: {
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                        delay: i * 0.05,
                      },
                    }}
                    exit={{
                      opacity: 0,
                      y: 10,
                      scale: 0.9,
                      transition: { duration: 0.15 },
                    }}
                  >
                    <Link
                      to={action.url}
                      onClick={() => setSpeedDialOpen(false)}
                      className="flex items-center gap-2 w-24 py-2.5 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:border-orange-200 active:scale-95 transition-colors"
                    >
                      <action.icon className="w-5 h-5 text-orange-500" />
                      {action.name}
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="button"
            onClick={() => setSpeedDialOpen((o) => !o)}
            className="w-20 h-20 bg-gradient-to-br from-orange-500 to-orange-700 rounded-full flex items-center justify-center border-[6px] border-[#F9FAFB] dark:border-slate-900 shadow-xl touch-manipulation"
            whileTap={{ scale: 0.9 }}
            animate={{
              rotate: speedDialOpen ? 45 : 0,
              transition: { type: "spring", stiffness: 400, damping: 25 },
            }}
            aria-label={speedDialOpen ? "Close create menu" : "Create new"}
          >
            <PlusIcon className="w-10 h-10 text-white stroke-[2.5]" />
          </motion.button>
        </div>

        {/* Right: Clients & Menu */}
        <div className="flex w-1/2 justify-around pl-4">
          <Link
            to={createPageUrl("Clients")}
            className="flex flex-col items-center gap-1 touch-manipulation min-h-[48px] justify-center"
            aria-label="Clients"
          >
            <UserGroupIcon
              className={`w-6 h-6 ${
                isActive(createPageUrl("Clients"))
                  ? "text-orange-600"
                  : "text-slate-400"
              }`}
            />
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
              Clients
            </span>
          </Link>
          <button
            type="button"
            onClick={() => onOpenMenu?.()}
            className="flex flex-col items-center gap-1 touch-manipulation min-h-[48px] justify-center"
            aria-label="Menu"
          >
            <Bars3Icon className="w-6 h-6 text-slate-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
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
