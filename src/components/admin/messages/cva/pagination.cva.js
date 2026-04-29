import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const paginationBarVariants = cva(
  [
    "flex w-full items-center justify-between gap-3 border-t px-3 py-2",
    "bg-[hsl(var(--comm-surface))] border-[hsl(var(--comm-border))]",
  ].join(" "),
  {
    variants: {
      compact: {
        true: "py-1.5",
        false: "py-2",
      },
      stickyBottom: {
        true: "sticky bottom-0 z-10",
        false: "",
      },
    },
    defaultVariants: {
      compact: false,
      stickyBottom: false,
    },
  }
);

export const paginationButtonVariants = cva(
  [
    "inline-flex items-center justify-center rounded-[var(--comm-radius-sm)] border px-2.5",
    "min-h-9 min-w-9 text-[length:var(--comm-font-size-sm)]",
    "transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--comm-focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      tone: {
        default:
          "border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] text-[hsl(var(--comm-foreground))] hover:bg-[hsl(var(--comm-hover-bg))]",
        ghost:
          "border-transparent bg-transparent text-[hsl(var(--comm-muted-foreground))] hover:bg-[hsl(var(--comm-hover-bg))]",
      },
      current: {
        true: "border-transparent bg-[hsl(var(--comm-selected-bg))] text-[hsl(var(--comm-foreground))]",
        false: "",
      },
    },
    defaultVariants: {
      tone: "default",
      current: false,
    },
  }
);

export const paginationMetaVariants = cva(
  "text-[length:var(--comm-font-size-xs)] text-[hsl(var(--comm-muted-foreground))]"
);

export function paginationBarClassName(options) {
  return cn(paginationBarVariants(options));
}
