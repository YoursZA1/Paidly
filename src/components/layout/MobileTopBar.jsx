import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import { Menu, Search } from "lucide-react";
import Button from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import NotificationBell from "@/components/notifications/NotificationBell";
import Logo from "@/components/shared/Logo";

/** 44×44 minimum touch target, shared by every control in the bar. */
const TAP_TARGET =
  "flex size-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card touch-manipulation";

/**
 * Mobile / tablet (< lg) app bar: Menu | Paidly mark + wordmark | Search · Notifications · Account.
 *
 * Layout only — every action is owned by the caller (drawer, quick search, account menu items), so
 * behaviour stays in Layout. Below 360px the wordmark is dropped before any control shrinks.
 */
export default function MobileTopBar({
  homeHref,
  pageLabel,
  onOpenMenu,
  onOpenSearch,
  showActions,
  accountInitial,
  accountLogoPath,
  accountMenu,
}) {
  return (
    <div className="flex h-16 w-full min-w-0 items-center gap-2 lg:hidden">
      <button type="button" onClick={onOpenMenu} aria-label="Open menu" className={`${TAP_TARGET} -ml-2.5`}>
        <Menu className="size-[22px]" strokeWidth={1.75} aria-hidden />
      </button>

      <Link
        to={homeHref}
        className="flex min-w-0 items-center gap-2.5 rounded-xl touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        aria-label="Paidly home"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary">
          <img src="/logo.svg" alt="" className="size-8" aria-hidden="true" />
        </span>
        <span
          className="hidden truncate font-display text-lg font-black leading-none tracking-tight text-foreground min-[360px]:block"
          aria-hidden="true"
        >
          Paidly
        </span>
        {pageLabel ? <span className="sr-only">{pageLabel}</span> : null}
      </Link>

      {showActions && (
        <div className="-mr-2.5 ml-auto flex shrink-0 items-center gap-0.5 min-[375px]:gap-1">
          <button type="button" onClick={onOpenSearch} aria-label="Search" className={TAP_TARGET}>
            <Search className="size-5" aria-hidden />
          </button>
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={`${TAP_TARGET} p-0`} aria-label="Account menu">
                <span className="relative flex size-9 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-sm font-medium text-muted-foreground">
                  <span aria-hidden="true">{accountInitial}</span>
                  {accountLogoPath ? (
                    <Logo path={accountLogoPath} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : null}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              collisionPadding={12}
              className="w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-card shadow-elevation-lg"
            >
              {accountMenu}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

MobileTopBar.propTypes = {
  homeHref: PropTypes.string.isRequired,
  pageLabel: PropTypes.string,
  onOpenMenu: PropTypes.func.isRequired,
  onOpenSearch: PropTypes.func,
  showActions: PropTypes.bool,
  accountInitial: PropTypes.string,
  accountLogoPath: PropTypes.string,
  accountMenu: PropTypes.node,
};
