import { useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import AdminSidebar from "@/components/admin/shell/AdminSidebar";
import AdminHeader from "@/components/admin/shell/AdminHeader";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const shellRef = useRef(null);

  // Page headers (.page-header-sticky) lock just below the sticky admin bar, so pass its height down.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    const bar = shell?.querySelector(":scope > div > header");
    if (!shell || !bar || typeof ResizeObserver === "undefined") return undefined;
    const apply = () => shell.style.setProperty("--page-header-sticky-top", `${bar.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={shellRef} className="min-h-screen bg-[#F4F5F7] text-slate-900 [--page-header-sticky-bg:#F4F5F7]">
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
