import { cn } from "@/lib/utils";

/**
 * Standard page wrapper: max-width 7xl, no extra padding (Layout provides py-8 px-4 sm:px-8).
 * Use for consistent structure and margins across Dashboard, Invoices, Quotes, Clients, etc.
 */
export default function PageContainer({ children, className, maxWidth = "max-w-screen-xl" }) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <div className={cn("mx-auto", maxWidth)}>{children}</div>
    </div>
  );
}
