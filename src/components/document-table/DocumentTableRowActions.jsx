import { cn } from "@/lib/utils";

/** Hidden on mobile. On md+ appear on hover or keyboard focus. */
export default function DocumentTableRowActions({ children, className }) {
  return (
    <div
      role="group"
      aria-label="Row actions"
      className={cn(
        "hidden md:flex items-center justify-end gap-2 opacity-0 transition-opacity",
        "group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100",
        className
      )}
    >
      {children}
    </div>
  );
}
