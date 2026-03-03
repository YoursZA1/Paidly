/**
 * Unified icon styling across the app.
 * Use these sizes for consistency:
 * - sm (16px): buttons, dropdowns, inputs, compact UI
 * - md (20px): nav items, header, list items, cards
 * - lg (24px): empty states, feature icons, hero
 * Icons inherit text color (currentColor) unless className overrides.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

const Icon = React.forwardRef(({ as: Component, size = "md", className, ...props }, ref) => {
  if (!Component) return null;
  return (
    <Component
      ref={ref}
      className={cn("shrink-0 text-current", sizeClasses[size], className)}
      {...props}
    />
  );
});
Icon.displayName = "Icon";

export { Icon, sizeClasses };
