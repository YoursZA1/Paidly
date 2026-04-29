import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const topActionsBarVariants = cva(
  [
    "flex w-full items-center gap-2 border-b px-2 sm:px-3",
    "border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))]",
    "min-h-[var(--comm-top-actions-height)]",
  ].join(" "),
  {
    variants: {
      sticky: {
        true: "sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--comm-surface)/0.92)]",
        false: "",
      },
      compact: {
        true: "gap-1 px-2",
        false: "gap-2 px-2 sm:px-3",
      },
    },
    defaultVariants: {
      sticky: true,
      compact: false,
    },
  }
);

export const topActionButtonVariants = cva(
  [
    "inline-flex items-center justify-center rounded-[var(--comm-radius-sm)] px-2.5 text-[length:var(--comm-font-size-sm)] font-medium",
    "min-h-9 transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--comm-focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      tone: {
        neutral: "text-[hsl(var(--comm-foreground))] hover:bg-[hsl(var(--comm-hover-bg))]",
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        danger:
          "text-[hsl(var(--comm-danger))] hover:bg-[hsl(var(--comm-danger)/0.12)]",
      },
      active: {
        true: "bg-[hsl(var(--comm-selected-bg))]",
        false: "",
      },
      iconOnly: {
        true: "size-9 min-h-9 min-w-9 p-0",
        false: "",
      },
    },
    defaultVariants: {
      tone: "neutral",
      active: false,
      iconOnly: false,
    },
  }
);

export function topActionsBarClassName(options) {
  return cn(topActionsBarVariants(options));
}
