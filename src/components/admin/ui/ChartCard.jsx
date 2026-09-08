import { cn } from "@/lib/utils";

export default function ChartCard({ title, description, children, className, action }) {
  return (
    <section className={cn("rounded-2xl border border-border/80 bg-card p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
