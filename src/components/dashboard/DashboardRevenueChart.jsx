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
              <stop offset="0%" stopColor="#f24e00" stopOpacity={0.22} />
              <stop offset="55%" stopColor="#f24e00" stopOpacity={0.06} />
              <stop offset="100%" stopColor="#f24e00" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.1)" vertical={false} />
          <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={4} />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              color: 'hsl(var(--card-foreground))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '10px',
              fontSize: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            }}
            labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px', fontSize: '11px' }}
            itemStyle={{ color: '#f24e00', fontWeight: 600 }}
            formatter={(value) => [formatCurrency(Number(value || 0), userCurrency), 'Revenue']}
            cursor={{ stroke: 'rgba(242,78,0,0.25)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#f24e00"
            strokeWidth={2}
            fill="url(#fintechRevenueGrad)"
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, fill: '#f24e00', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive
            animationDuration={1000}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
