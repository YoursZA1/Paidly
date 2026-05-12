import { cn } from "@/lib/utils";

/**
 * Reusable empty state: icon + title + description + optional CTA.
 *
 * @param {React.ReactNode} icon        - Lucide icon element (rendered inside the muted container)
 * @param {string}          title       - Bold heading, e.g. "No invoices yet"
 * @param {string}          description - Subtext explaining next steps
 * @param {React.ReactNode} [action]    - Optional CTA: <Button> or <Link><Button>
 * @param {string}          [className] - Extra classes on the wrapper
 */
export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div className={cn("text-center py-12 px-4", className)}>
      {icon && (
        <div className="mx-auto w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="mt-2 text-base font-semibold text-foreground font-display">{title}</h3>
      )}
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">{description}</p>
      )}
      {action && (
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
          {action}
        </div>
      )}
    </div>
  );
}
