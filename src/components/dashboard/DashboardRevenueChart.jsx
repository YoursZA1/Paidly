import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { formatCurrency } from '@/utils/currencyCalculations';

/**
 * Lazy-loaded Revenue trend chart. Keeps Recharts out of the initial Dashboard bundle.
 */
export default function DashboardRevenueChart({ revenueTrendData, userCurrency }) {
  return (
    <div className="w-full h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={revenueTrendData}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="fintechRevenueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: '#475569' }} stopOpacity={0.12} />
              <stop offset="100%" style={{ stopColor: '#475569' }} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
              border: '1px solid hsl(var(--border))',
              borderRadius: '12px',
            }}
            labelStyle={{ color: 'var(--text-main)' }}
            formatter={(value) => [formatCurrency(Number(value || 0), userCurrency), 'Revenue']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#475569"
            strokeWidth={2}
            fill="url(#fintechRevenueGrad)"
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, fill: '#475569', stroke: '#fff', strokeWidth: 1 }}
            isAnimationActive
            animationDuration={1200}
            animationEasing="ease-in-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
