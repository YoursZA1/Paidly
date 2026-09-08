import PropTypes from "prop-types";
import { formatCurrency } from "@/utils/currencyCalculations";

const currentYear = () => new Date().getFullYear();

export default function GoalProgress({
  year = currentYear(),
  progress = 0,
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

  return (
    <section
      className={`dashboard-card dashboard-card-dark px-4 py-5 ${
        onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""
      }`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? (hasTarget ? `Edit ${displayTitle}` : `Set ${displayTitle}`) : undefined}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/65">{displayTitle}</p>
      {hasTarget ? (
        <>
          <p className="currency-nums mt-2 text-lg font-semibold tabular-nums tracking-tight text-white">
            {formatCurrency(currentRevenue, currency)}
            <span className="mx-1 font-normal text-white/45">/</span>
            {formatCurrency(numericTarget, currency)}
          </p>
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-xs text-white/65">
              <span>{isCompleted ? "Target reached" : "Year to date"}</span>
              <span className="tabular-nums font-medium text-white">{Math.round(progressPercent)}%</span>
            </div>
            <div
              className="dashboard-progress-track h-1.5 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={Math.round(progressPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={displayTitle}
            >
              <div className="dashboard-progress-fill h-full" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </>
      ) : (
          <p className="mt-2 text-sm text-white/70">
            No revenue target set for {year}.{onClick ? " Select to set one." : null}
          </p>
        )}
    </section>
  );
}

GoalProgress.propTypes = {
  year: PropTypes.number,
  progress: PropTypes.number,
  title: PropTypes.string,
  revenueTarget: PropTypes.number,
  currentRevenue: PropTypes.number,
  currency: PropTypes.string,
  onClick: PropTypes.func,
};
