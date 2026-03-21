import { CheckBadgeIcon, ArrowTrendingUpIcon, FlagIcon, UserGroupIcon, SparklesIcon } from "@heroicons/react/24/solid";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrencySymbol, formatCurrency } from "@/utils/currencyCalculations";

const currentYear = () => new Date().getFullYear();

const MILESTONES = [
  { id: "tax", label: "Tax Ready", icon: CheckBadgeIcon },
  { id: "scale", label: "Scale Mode", icon: ArrowTrendingUpIcon },
  { id: "clients", label: "Client Acquisition", icon: UserGroupIcon },
  { id: "brand", label: "Brand Update", icon: SparklesIcon },
];

export default function GoalProgress({
  year = currentYear(),
  progress = 75,
  title,
  revenueTarget = 0,
  currentRevenue = 0,
  currency = "ZAR",
  onClick,
}) {
  const displayTitle = title ?? `${year} revenue target`;
  const numericTarget = Number(revenueTarget);
  const hasTarget = Number.isFinite(numericTarget) && numericTarget > 0;
  const isCompleted = hasTarget && progress >= 100;
  const progressPercent = hasTarget ? Math.min(100, Math.max(0, Number(progress))) : 0;
  const symbol = getCurrencySymbol(currency);
  const targetLabel = !hasTarget
    ? "Not set"
    : numericTarget >= 1e6
      ? `${symbol}${(numericTarget / 1e6).toFixed(1)}M`
      : `${symbol}${(numericTarget / 1e3).toFixed(0)}K`;

  return (
    <Card
      className={`relative overflow-hidden rounded-[32px] border-0 bg-slate-900 text-white shadow-2xl shadow-slate-900/30 ${onClick ? "cursor-pointer hover:ring-2 hover:ring-orange-500/50 transition-shadow" : ""}`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Background decorative element */}
      <div
        className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-500/10 blur-3xl"
        aria-hidden
      />
      {isCompleted && (
        <div
          className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/10 pointer-events-none"
          aria-hidden
        />
      )}

      <CardContent className="relative z-10 p-6 sm:p-8">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6 sm:mb-8">
          <div className="bg-orange-500/20 p-3 rounded-2xl shrink-0">
            <FlagIcon className="w-6 h-6 text-orange-400" />
          </div>
          <span
            className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border shrink-0 ${
              !hasTarget
                ? "bg-slate-700/80 text-slate-400 border-slate-600"
                : isCompleted
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : "bg-slate-700/80 text-slate-300 border-slate-600"
            }`}
          >
            {!hasTarget ? "Not set" : isCompleted ? "Completed" : "In progress"}
          </span>
        </div>

        <h3 className="text-xl sm:text-2xl font-black text-white mb-2 tracking-tight">
          {displayTitle}
        </h3>
        <p className="text-slate-400 text-sm leading-relaxed mb-6 sm:mb-8 max-w-[280px] text-left">
          {hasTarget ? (
            <>
              Progress toward your {year} target of{" "}
              <span className="text-slate-200 font-semibold tabular-nums">{targetLabel}</span> annual revenue
              {currentRevenue > 0 ? (
                <>
                  . Collected so far:{" "}
                  <span className="text-slate-200 font-semibold tabular-nums">
                    {formatCurrency(currentRevenue, currency)}
                  </span>
                </>
              ) : null}
              .
            </>
          ) : (
            <>
              Set an annual revenue goal for {year} to track how paid invoices stack up.{" "}
              {onClick ? <span className="text-slate-300">Tap this card to get started.</span> : null}
            </>
          )}
        </p>

        {/* Progress section */}
        <div className="space-y-3 sm:space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {hasTarget ? "Yearly target reach" : "Target not set"}
            </span>
            <span className="text-base sm:text-lg font-black text-white tabular-nums">
              {hasTarget ? `${Math.round(progressPercent)}%` : "—"}
            </span>
          </div>
          <div className="w-full h-2.5 sm:h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all duration-700 ease-out shadow-[0_0_15px_rgba(234,88,12,0.4)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Milestone badges */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-slate-800">
          {MILESTONES.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              className="flex items-center gap-2 min-w-0"
            >
              <Icon className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="text-xs font-bold text-slate-300 truncate">
                {label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
