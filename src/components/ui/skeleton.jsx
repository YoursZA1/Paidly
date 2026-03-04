import { cn } from "@/lib/utils"

function Skeleton({
  className,
  shimmer = true,
  ...props
}) {
  return (
    <div
      className={cn(
        "rounded-md bg-primary/10",
        shimmer ? "skeleton-shimmer" : "animate-pulse",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton }
