import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  HomeIcon,
  DocumentTextIcon,
  UsersIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";
import { createPageUrl } from "@/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChartBarIcon, Cog6ToothIcon, ArrowTrendingUpIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";

const navItems = [
  { name: "Home", icon: HomeIcon, url: createPageUrl("Dashboard") },
  { name: "Invoices", icon: DocumentTextIcon, url: createPageUrl("Invoices") },
  { name: "Clients", icon: UsersIcon, url: createPageUrl("Clients") },
];

const moreLinks = [
  { name: "Quotes", url: createPageUrl("Quotes"), icon: DocumentDuplicateIcon },
  { name: "Cash Flow", url: createPageUrl("CashFlow"), icon: ArrowTrendingUpIcon },
  { name: "Reports", url: createPageUrl("Reports"), icon: ChartBarIcon },
  { name: "Settings", url: createPageUrl("Settings"), icon: Cog6ToothIcon },
];

function MobileBottomNav() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreLinks.some(
    (link) => location.pathname === link.url.split("?")[0]
  );

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 dark:bg-slate-900/90 backdrop-blur-sm border-t border-border dark:border-slate-700/50 pb-safe"
      aria-label="Primary navigation"
    >
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto px-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.url.split("?")[0];
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              to={item.url}
              className="relative flex flex-col items-center justify-center flex-1 h-full group touch-manipulation min-h-[48px]"
              aria-current={isActive ? "page" : undefined}
              aria-label={item.name}
            >
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-bubble"
                  className="absolute inset-x-2 inset-y-1.5 rounded-xl bg-primary/20"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon
                className={`relative w-6 h-6 mb-1 transition-colors duration-200 ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
                aria-hidden="true"
              />
              <span
                className={`relative text-[11px] font-medium transition-colors duration-200 ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
              >
                {item.name}
              </span>
            </Link>
          );
        })}

        <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="relative flex flex-col items-center justify-center flex-1 h-full group touch-manipulation min-h-[48px]"
              aria-label="More options"
            >
              {isMoreActive && (
                <motion.span
                  layoutId="bottom-nav-bubble"
                  className="absolute inset-x-2 inset-y-1.5 rounded-xl bg-primary/20"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <EllipsisHorizontalIcon
                className={`relative w-6 h-6 mb-1 transition-colors duration-200 ${
                  isMoreActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
                aria-hidden="true"
              />
              <span
                className={`relative text-[11px] font-medium transition-colors duration-200 ${
                  isMoreActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
              >
                More
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="center"
            className="mb-2 w-56 rounded-xl"
          >
            {moreLinks.map((link) => {
              const Icon = link.icon;
              return (
                <DropdownMenuItem key={link.name} asChild>
                  <Link
                    to={link.url}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 min-h-[48px] cursor-pointer"
                  >
                    <Icon className="size-5 text-muted-foreground" />
                    {link.name}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}

export default MobileBottomNav;
