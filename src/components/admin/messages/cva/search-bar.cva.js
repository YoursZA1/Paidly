import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const searchBarShellVariants = cva(
  [
    "flex w-full items-center gap-2 rounded-[var(--comm-radius-md)] border px-3",
    "bg-[hsl(var(--comm-surface-muted))] border-[hsl(var(--comm-border))]",
    "transition-colors duration-150",
    "focus-within:border-[hsl(var(--comm-border-strong))] focus-within:ring-2 focus-within:ring-[hsl(var(--comm-focus-ring)/0.35)]",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-9",
        md: "h-[var(--comm-search-height)]",
      },
      invalid: {
        true: "border-[hsl(var(--comm-danger))] focus-within:ring-[hsl(var(--comm-danger)/0.35)]",
        false: "",
      },
      elevated: {
        true: "shadow-sm",
        false: "",
      },
    },
    defaultVariants: {
      size: "md",
      invalid: false,
      elevated: false,
    },
  }
);

export const searchInputVariants = cva(
  [
    "w-full bg-transparent outline-none placeholder:text-[hsl(var(--comm-muted-foreground))]",
    "text-[hsl(var(--comm-foreground))] text-[length:var(--comm-font-size-md)]",
    "disabled:cursor-not-allowed disabled:opacity-60",
  ].join(" "),
  {
    variants: {
      hasLeadingIcon: {
        true: "",
        false: "",
      },
    },
    defaultVariants: {
      hasLeadingIcon: true,
    },
  }
);

export const searchFilterChipVariants = cva(
  [
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[length:var(--comm-font-size-xs)]",
    "transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--comm-focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  ].join(" "),
  {
    variants: {
      active: {
        true: "border-transparent bg-[hsl(var(--comm-selected-bg))] text-[hsl(var(--comm-foreground))]",
        false: "border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] text-[hsl(var(--comm-muted-foreground))] hover:bg-[hsl(var(--comm-hover-bg))]",
      },
    },
    defaultVariants: {
      active: false,
    },
  }
);

export function searchBarShellClassName(options) {
  return cn(searchBarShellVariants(options));
}
