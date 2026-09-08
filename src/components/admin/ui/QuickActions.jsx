import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function QuickActions({ actions = [] }) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <h2 className="text-sm font-semibold">Quick actions</h2>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className={cn(
              "rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:border-primary/30 hover:bg-primary/5"
            )}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
