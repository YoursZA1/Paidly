import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const threadRowVariants = cva(
  [
    "group w-full min-w-0 border-b text-left transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--comm-focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "border-[hsl(var(--comm-border))] text-[hsl(var(--comm-foreground))]",
    "hover:bg-[hsl(var(--comm-hover-bg))]",
  ].join(" "),
  {
    variants: {
      density: {
        compact: "h-[var(--comm-row-height-compact)] px-3",
        comfortable: "h-[var(--comm-row-height-comfortable)] px-4",
      },
      selected: {
        true: "bg-[hsl(var(--comm-selected-bg))]",
        false: "bg-[hsl(var(--comm-surface))]",
      },
      unread: {
        true: "font-semibold",
        false: "font-normal",
      },
      interactive: {
        true: "cursor-pointer",
        false: "cursor-default",
      },
    },
    defaultVariants: {
      density: "comfortable",
      selected: false,
      unread: false,
      interactive: true,
    },
  }
);

export const threadRowSlotVariants = cva("min-w-0 flex items-center", {
  variants: {
    slot: {
      leading: "w-9 shrink-0 justify-center",
      sender: "flex-1 truncate text-[length:var(--comm-font-size-md)]",
      subject: "flex-[2] truncate text-[length:var(--comm-font-size-md)]",
      preview: "hidden lg:block flex-[3] truncate text-[length:var(--comm-font-size-sm)] text-[hsl(var(--comm-muted-foreground))]",
      time: "w-20 shrink-0 justify-end text-[length:var(--comm-font-size-xs)] text-[hsl(var(--comm-muted-foreground))]",
    },
  },
});

export function threadRowClassName(options) {
  return cn(threadRowVariants(options));
}
