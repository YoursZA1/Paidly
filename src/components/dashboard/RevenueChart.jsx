import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

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

const PIE_COLORS = ['hsl(24, 95%, 53%)', 'hsl(210, 90%, 55%)', 'hsl(142, 71%, 45%)'];

export default function RevenueChart({ subscriptions, totalUsers = 0, activeSubscriptions = 0, verifiedUsers = 0 }) {
  const data = buildMonthlyRevenue(subscriptions);
  const pieData = [
    { name: 'Total users', value: Number(totalUsers || 0) },
    { name: 'Active subscriptions', value: Number(activeSubscriptions || 0) },
    { name: 'Verified users', value: Number(verifiedUsers || 0) },
  ];

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
      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-3 text-xs text-muted-foreground">Users & subscriptions breakdown</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  stroke="none"
                  paddingAngle={2}
                >
                  {pieData.map((entry, idx) => (
                    <Cell key={entry.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(220, 18%, 9%)',
                    border: '1px solid hsl(220, 15%, 16%)',
                    borderRadius: '8px',
                    color: 'hsl(220, 10%, 95%)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {pieData.map((item, idx) => (
              <div key={item.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                    aria-hidden
                  />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
                <span className="font-semibold text-foreground">{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}