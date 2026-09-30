import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const IMPORT_STEPS = Object.freeze([
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map" },
  { key: "review", label: "Review" },
  { key: "import", label: "Import" },
]);

/** 1 Upload · 2 Map · 3 Review · 4 Import */
export default function ImportStepper({ current }) {
  const currentIdx = IMPORT_STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-1.5 sm:gap-3" aria-label="Import steps">
      {IMPORT_STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s.key} className="flex items-center gap-1.5 sm:gap-3 min-w-0" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done && "bg-emerald-600 text-white",
                active && "bg-foreground text-background",
                !done && !active && "bg-muted text-muted-foreground"
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn("text-xs sm:text-sm truncate", active ? "font-semibold text-foreground" : "text-muted-foreground", !active && "hidden sm:inline")}>
              {s.label}
            </span>
            {i < IMPORT_STEPS.length - 1 ? <span className="h-px w-4 sm:w-8 bg-border" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
