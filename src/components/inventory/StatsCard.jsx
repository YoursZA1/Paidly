import { motion } from "framer-motion";

export default function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "primary",
  trend,
  onClick,
  active = false,
}) {
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    blue: "bg-status-sent/10 text-status-sent",
    red: "bg-status-overdue/10 text-status-overdue",
    green: "bg-status-paid/10 text-status-paid",
    yellow: "bg-status-pending/10 text-status-pending",
  };

  const interactive = typeof onClick === "function";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={[
        "rounded-xl p-4 sm:p-5 transition-all duration-200",
        active ? "bg-card border border-primary/30 shadow-sm" : "bg-card border border-border/50",
        interactive ? "cursor-pointer hover:border-border/80 hover:shadow-sm" : "",
      ].join(" ")}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight leading-none">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && <p className="text-xs font-medium text-foreground/70">{trend}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${colorMap[color] ?? colorMap.primary}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
    </motion.div>
  );
}

