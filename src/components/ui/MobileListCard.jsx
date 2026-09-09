import PropTypes from "prop-types";
import { cn } from "@/lib/utils";

/**
 * Compact mobile row for list pages: title + meta on the left, value/status on the right.
 */
export default function MobileListCard({
  title,
  subtitle,
  meta,
  value,
  status,
  onClick,
  action,
  className,
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        {meta ? <p className="mt-1 text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        {value ? <p className="currency-nums text-sm font-semibold tabular-nums text-foreground">{value}</p> : null}
        {status}
      </div>
    </>
  );

  return (
    <article
      className={cn(
        "flex items-stretch overflow-hidden rounded-2xl border border-border bg-card",
        className
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left touch-manipulation"
        >
          {inner}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">{inner}</div>
      )}
      {action ? (
        <div className="flex items-center border-l border-border px-1.5">{action}</div>
      ) : null}
    </article>
  );
}

MobileListCard.propTypes = {
  title: PropTypes.node,
  subtitle: PropTypes.node,
  meta: PropTypes.node,
  value: PropTypes.node,
  status: PropTypes.node,
  onClick: PropTypes.func,
  action: PropTypes.node,
  className: PropTypes.string,
};
