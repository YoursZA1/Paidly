import { cn } from "@/lib/utils";

/**
 * Fills the app main pane and keeps page chrome (title, filters) fixed
 * while the list body scrolls.
 */
export default function DocListLockShell({ header, toolbar, children, footer, className }) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <div className="responsive-page-shell flex min-h-0 flex-1 flex-col py-3 sm:py-4">
        {header ? <div className="mb-3 shrink-0 sm:mb-4">{header}</div> : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          {toolbar ? (
            <div className="shrink-0 border-b border-border/50 p-3 sm:p-4">{toolbar}</div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
            {footer ? <div className="shrink-0 border-t border-border/50">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
