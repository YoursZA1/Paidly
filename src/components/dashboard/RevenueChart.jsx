import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function buildMonthlyRevenue(subscriptions) {
  const now = new Date();
  const monthKeys = Array.from({ length: 6 }, (_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-US', { month: 'short' }),
      revenue: 0,
    };
  });
  const revenueByMonth = new Map(monthKeys.map((m) => [m.key, m]));

  subscriptions
    .filter((s) => s.status === 'active')
    .forEach((s) => {
      const rawDate = s.start_date || s.created_date || s.created_at;
      if (!rawDate) return;
      const d = new Date(rawDate);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = revenueByMonth.get(key);
      if (!bucket) return;
      bucket.revenue += Number(s.amount || 0);
    });

  return monthKeys.map((m) => ({ month: m.label, revenue: Math.max(0, Number(m.revenue.toFixed(2)))}));
}

export default function RevenueChart({ subscriptions }) {
  const data = buildMonthlyRevenue(subscriptions);

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <h2 className="font-semibold mb-1">Revenue Overview</h2>
      <p className="text-xs text-muted-foreground mb-4">Monthly recurring revenue trend</p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(24, 95%, 53%)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="hsl(24, 95%, 53%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 16%)" />
          <XAxis dataKey="month" tick={{ fill: 'hsl(220, 10%, 55%)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'hsl(220, 10%, 55%)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: 'hsl(220, 18%, 9%)',
              border: '1px solid hsl(220, 15%, 16%)',
              borderRadius: '8px',
              color: 'hsl(220, 10%, 95%)',
            }}
          />
          <Area type="monotone" dataKey="revenue" stroke="hsl(24, 95%, 53%)" fill="url(#revGradient)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}