import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getAdminNavGroupsForRole } from "@/lib/adminNavConfig";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function groupHasActive(group, pathname) {
  return (group.items || []).some((item) =>
    item.path === "/admin-v2" ? pathname === "/admin-v2" : pathname === item.path || pathname.startsWith(`${item.path}/`)
  );
}

function NavLink({ item, collapsed, pathname, onNavigate }) {
  const isActive = item.path === "/admin-v2" ? pathname === "/admin-v2" : pathname === item.path || pathname.startsWith(`${item.path}/`);
  const link = (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
        collapsed && "justify-center px-0",
        isActive ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export default function AdminSidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const groups = useMemo(() => getAdminNavGroupsForRole(user?.role ?? ""), [user?.role]);
  const [openGroups, setOpenGroups] = useState(() => new Set(["overview"]));

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const group of groups) {
        if (groupHasActive(group, location.pathname)) next.add(group.id);
      }
      return next;
    });
  }, [groups, location.pathname]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
      toast.success("Signed out");
    } catch (err) {
      toast.error(err?.message || "Failed to sign out");
    } finally {
      setLoggingOut(false);
    }
  };

  const toggleGroup = (id) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sidebar = (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-slate-200 bg-white",
        collapsed ? "w-[76px]" : "w-[260px]"
      )}
    >
      <div className={cn("flex h-16 items-center gap-3 border-b border-slate-200 px-4", collapsed && "justify-center px-2")}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
          <img src="/logo.svg" alt="Paidly" className="h-5 w-5" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">Paidly Admin</p>
            <p className="truncate text-[11px] capitalize text-slate-500">{user?.role || "admin"}</p>
          </div>
        ) : null}
        <button
          type="button"
          className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
          onClick={() => setMobileOpen?.(false)}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <TooltipProvider delayDuration={200}>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {groups.map((group) => {
            const open = collapsed || openGroups.has(group.id);
            return (
              <div key={group.id}>
                {!collapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="mb-1 flex w-full items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
                  >
                    {group.label}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open ? "rotate-0" : "-rotate-90")} />
                  </button>
                ) : null}
                {open ? (
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <NavLink
                        key={`${group.id}-${item.path}-${item.label}`}
                        item={item}
                        collapsed={collapsed}
                        pathname={location.pathname}
                        onNavigate={() => setMobileOpen?.(false)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </TooltipProvider>

      <div className="space-y-2 border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className={cn(
            "flex w-full items-center rounded-xl text-slate-600 hover:bg-slate-100",
            collapsed ? "justify-center py-2" : "gap-2 px-3 py-2"
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed ? <span className="text-xs">{loggingOut ? "Signing out..." : "Logout"}</span> : null}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="hidden w-full items-center justify-center rounded-xl py-2 text-slate-500 hover:bg-slate-100 md:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className={cn("fixed inset-y-0 left-0 z-50 hidden md:block")}>{sidebar}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[260px]">{sidebar}</div>
        </div>
      ) : null}
      <button
        type="button"
        className="fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
    </>
  );
}
