// --- COMPONENT EXPORTS MOVED TO BOTTOM ---
import { useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useState } from "react";
// Placeholder for LockedNavItem to prevent errors
const LockedNavItem = ({ title, requiredPlan }) => (
  <div className="px-4 py-2 text-[13px] text-gray-400">{title} (Upgrade to {requiredPlan})</div>
);
LockedNavItem.propTypes = {
  title: PropTypes.string.isRequired,
  requiredPlan: PropTypes.string
};
import { Button } from "@/components/ui/button";
import { X, LogOut } from "lucide-react";
import PropTypes from "prop-types";
import { createPageUrl } from "@/utils";

export const NavLink = ({ item, onClick, collapsed = false }) => {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (item.type === "section") {
    if (collapsed) {
      return <div className="my-2 h-px bg-white/10" />;
    }
    return (
      <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
        {item.title}
      </div>
    );
  }

  if (item.children && Array.isArray(item.children)) {
    return (
      <div className="mb-1">
        <motion.div whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}>
          <button
            type="button"
            className={`group flex items-center py-2 w-full transition-all ${collapsed ? "justify-center px-2" : "gap-3 px-4"}`}
            style={{ cursor: 'pointer' }}
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-controls={`nav-children-${item.id}`}
          >
            <span className={`inline-flex items-center justify-center h-10 w-10 rounded-xl shadow-sm transition-all bg-white/10 text-white/80 group-hover:bg-white/20 group-hover:text-white`}>
              <item.icon className="h-5 w-5" />
            </span>
            {!collapsed && (
              <span className="ml-2 text-[15px] font-medium transition-colors text-white/80 group-hover:text-white">{item.title}</span>
            )}
            {!collapsed && (
              <span className={`ml-auto transition-transform ${open ? "rotate-90" : "rotate-0"}`}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            )}
          </button>
        </motion.div>
        {!collapsed && open && (
          <div className="ml-8" id={`nav-children-${item.id}`}> 
            {item.children.map(child => (
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
    >
      <Link
        id={item.id}
        to={item.url}
        onClick={onClick}
        title={collapsed ? item.title : undefined}
        aria-label={collapsed ? item.title : undefined}
        className={`group flex items-center py-2 transition-all ${collapsed ? "justify-center px-2" : "gap-3 px-4"}`}
      >
        <span
          className={`inline-flex items-center justify-center h-10 w-10 rounded-xl shadow-sm transition-all
            ${isActive ? "bg-white/90 text-primary ring-2 ring-cyan-400/60" : "bg-white/10 text-white/80 group-hover:bg-white/20 group-hover:text-white"}
          `}
        >
          <item.icon className="h-5 w-5" />
        </span>
        {!collapsed && (
          <span className={`ml-2 text-[15px] font-medium transition-colors ${isActive ? "text-white" : "text-white/80 group-hover:text-white"}`}>{item.title}</span>
        )}
      </Link>
    </motion.div>
  );
};

NavLink.propTypes = {
  item: PropTypes.object.isRequired,
  onClick: PropTypes.func,
  collapsed: PropTypes.bool
};

export const MobileNav = ({ items, onClose }) => (
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

MobileNav.propTypes = {
  items: PropTypes.array.isRequired,
  onClose: PropTypes.func
};
