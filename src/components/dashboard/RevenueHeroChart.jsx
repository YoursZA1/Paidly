import { useId } from "react";
import PropTypes from "prop-types";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from "recharts";
import { formatCurrency } from "@/utils/currencyCalculations";

function HeroTooltip({ active, payload, userCurrency }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload || {};
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm">
      <p className="mb-0.5 font-medium text-foreground">{point.dateLabel}</p>
      <p className="currency-nums tabular-nums text-foreground">
        {formatCurrency(Number(point.total) || 0, userCurrency)}
      </p>
    </div>
  );
}

HeroTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  userCurrency: PropTypes.string,
};

export default function RevenueHeroChart({ chart = [], userCurrency }) {
  const fillId = `revenue-hero-fill-${useId().replace(/:/g, "")}`;

  return (
    <div className="h-[120px] w-full md:h-[128px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            stroke="rgba(255,255,255,0.7)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
            dy={2}
          />
          <Tooltip
            content={<HeroTooltip userCurrency={userCurrency} />}
            cursor={{ stroke: "#ffffff", strokeWidth: 1, strokeOpacity: 0.45 }}
            allowEscapeViewBox={{ x: true, y: true }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#ffffff"
            strokeWidth={2}
            fill={`url(#${fillId})`}
            dot={false}
            activeDot={{ r: 3, fill: "#ffffff", strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

RevenueHeroChart.propTypes = {
  chart: PropTypes.arrayOf(PropTypes.object),
  userCurrency: PropTypes.string,
};
