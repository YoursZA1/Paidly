import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, Menu, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { findAdminNavItem, flattenAdminNavItems, getAdminNavGroupsForRole } from "@/lib/adminNavConfig";
import DateRangePicker from "@/components/admin/ui/DateRangePicker";

function newActionsForPath(pathname) {
  if (pathname.startsWith("/admin-v2/users")) {
    return [{ label: "Add user", to: "/admin-v2/users" }];
  }
  if (pathname.startsWith("/admin-v2/subscriptions")) {
    return [{ label: "Manage subscriptions", to: "/admin-v2/subscriptions" }];
  }
  if (pathname.startsWith("/admin-v2/messages")) {
    return [{ label: "Create announcement", to: "/admin-v2/messages" }];
  }
  if (pathname.startsWith("/admin-v2/waitlist")) {
    return [{ label: "Add waitlist entry", to: "/admin-v2/waitlist" }];
  }
  return [
    { label: "Add business", to: "/admin-v2/settings" },
    { label: "View users", to: "/admin-v2/users" },
    { label: "Create announcement", to: "/admin-v2/messages" },
    { label: "Manage subscriptions", to: "/admin-v2/subscriptions" },
  ];
}

export default function AdminHeader({ period, onPeriodChange, showPeriod = false, setMobileOpen }) {
  const { user } = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const item = findAdminNavItem(location.pathname);
  const actions = newActionsForPath(location.pathname);
  const searchable = useMemo(
    () => flattenAdminNavItems().filter((nav) => getAdminNavGroupsForRole(user?.role ?? "").some((g) => g.items.some((i) => i.path === nav.path))),
    [user?.role]
  );
  const matches = query.trim()
    ? searchable.filter((nav) => nav.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  const searchField = (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search admin…"
        className="h-10 min-h-11 rounded-xl pl-9 md:min-h-10"
        autoFocus={mobileSearchOpen}
      />
      {matches.length ? (
        <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {matches.map((nav) => (
            <button
              key={nav.path}
              type="button"
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                navigate(nav.path);
                setQuery("");
                setMobileSearchOpen(false);
              }}
            >
              <nav.icon className="h-4 w-4 text-slate-400" />
              {nav.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="flex items-center gap-2 px-4 py-3 lg:px-6">
        <button
          type="button"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:hidden"
          onClick={() => setMobileOpen?.(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary md:hidden">
            <img src="/logo.svg" alt="" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{item?.label || "Admin"}</p>
            <p className="hidden truncate text-xs text-slate-500 sm:block">Platform operations</p>
          </div>
        </div>
        <div className="relative hidden w-full max-w-sm md:block">{searchField}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 rounded-xl md:hidden"
          aria-label={mobileSearchOpen ? "Close search" : "Search"}
          aria-pressed={mobileSearchOpen}
          onClick={() => setMobileSearchOpen((open) => !open)}
        >
          <Search className="h-4 w-4" />
        </Button>
        {showPeriod ? <DateRangePicker value={period} onChange={onPeriodChange} /> : null}
        <Button asChild variant="ghost" size="icon" className="h-10 min-h-11 min-w-11 rounded-xl" aria-label="Notifications">
          <Link to="/admin-v2/messages">
            <Bell className="h-4 w-4" />
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="hidden h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 sm:inline-flex">
              <Plus className="mr-1.5 h-4 w-4" />
              New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((action) => (
              <DropdownMenuItem key={action.to} onClick={() => navigate(action.to)}>
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5 sm:px-3"
              aria-label="Admin account"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {(user?.full_name || user?.email || "A").slice(0, 1).toUpperCase()}
              </div>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-xs font-medium">{user?.full_name || user?.email || "Admin"}</p>
                <p className="truncate text-[10px] capitalize text-slate-500">{user?.role || "admin"}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-2">
              <p className="text-sm font-medium">{user?.full_name || user?.email || "Admin"}</p>
              <p className="text-xs capitalize text-slate-500">{user?.role || "admin"}</p>
            </div>
            {actions.map((action) => (
              <DropdownMenuItem key={`profile-${action.to}`} onClick={() => navigate(action.to)}>
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {mobileSearchOpen ? (
        <div className="border-t border-slate-200 px-4 py-2 md:hidden">{searchField}</div>
      ) : null}
    </header>
  );
}
