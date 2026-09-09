import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import AdminSidebar from "@/components/admin/shell/AdminSidebar";
import AdminHeader from "@/components/admin/shell/AdminHeader";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-slate-900">
      <AdminSidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div className={cn("min-h-screen transition-all duration-300", collapsed ? "md:ml-[76px]" : "md:ml-[260px]")}>
        <AdminHeader setMobileOpen={setMobileOpen} />
        <main className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {children || <Outlet />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
