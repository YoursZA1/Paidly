import { useEffect, useState } from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';


export default function AdminFinancials() {
  const [stats, setStats] = useState({
    gmv: 0,
    netRevenue: 0,
    fees: 0,
    payouts: 0,
    outstandingPayouts: 0,
    refunds: 0,
    revenueOverTime: [],
    feesOverTime: []
  });

  useEffect(() => {
    // Simulate pulling all invoices and payouts from the platform
    // Replace with real API/service calls as needed
    import('@/services/ExcelUserService').then(({ userService }) => {
      const allUsers = userService.getAllUsers();
      let allInvoices = [];
      allUsers.forEach(u => {
        if (u.invoices) allInvoices = allInvoices.concat(u.invoices);
      });
      // GMV: sum of all invoice totals
      const gmv = allInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      // Net Revenue: sum of all paid/partial_paid invoices minus fees
      const paid = allInvoices.filter(inv => inv.status === 'paid' || inv.status === 'partial_paid');
      const netRevenue = paid.reduce((sum, inv) => sum + (inv.total_amount || 0) - (inv.fee_amount || 0), 0);
      // Fees: sum of all invoice fees
      const fees = allInvoices.reduce((sum, inv) => sum + (inv.fee_amount || 0), 0);
      // Payouts: sum of all payouts processed (simulate as invoices with status 'paid_out')
      const payouts = allInvoices.filter(inv => inv.status === 'paid_out').reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      // Outstanding Payouts: sum of all invoices with status 'pending_payout'
      const outstandingPayouts = allInvoices.filter(inv => inv.status === 'pending_payout').reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      // Refunds: sum of all invoices with status 'refunded'
      const refunds = allInvoices.filter(inv => inv.status === 'refunded').reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      // Revenue over time (by month)
      const revenueOverTime = [];
      const feesOverTime = [];
      // Group by month
      const byMonth = {};
      allInvoices.forEach(inv => {
        const date = new Date(inv.created_date || inv.created_at || 0);
        const label = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        if (!byMonth[label]) byMonth[label] = { revenue: 0, fees: 0 };
        byMonth[label].revenue += inv.total_amount || 0;
        byMonth[label].fees += inv.fee_amount || 0;
      });
      Object.entries(byMonth).forEach(([label, vals]) => {
        revenueOverTime.push({ label, value: vals.revenue });
        feesOverTime.push({ label, value: vals.fees });
      });
      setStats({ gmv, netRevenue, fees, payouts, outstandingPayouts, refunds, revenueOverTime, feesOverTime });
    });
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Financials Overview</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Total Gross Volume (GMV)</p><p className="text-2xl font-semibold text-slate-900">{formatCurrency(stats.gmv, 'ZAR')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Net Platform Revenue</p><p className="text-2xl font-semibold text-slate-900">{formatCurrency(stats.netRevenue, 'ZAR')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Total Fees Collected</p><p className="text-2xl font-semibold text-slate-900">{formatCurrency(stats.fees, 'ZAR')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Total Payouts Processed</p><p className="text-2xl font-semibold text-slate-900">{formatCurrency(stats.payouts, 'ZAR')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Outstanding Payout Liability</p><p className="text-2xl font-semibold text-slate-900">{formatCurrency(stats.outstandingPayouts, 'ZAR')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-slate-500">Refunds</p><p className="text-2xl font-semibold text-slate-900">{formatCurrency(stats.refunds, 'ZAR')}</p></CardContent></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader><CardTitle>Revenue Over Time</CardTitle></CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats.revenueOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip formatter={v => formatCurrency(Number(v || 0), 'ZAR')} />
                <Line type="monotone" dataKey="value" stroke="#0f172a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Fees Over Time</CardTitle></CardHeader>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats.feesOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip formatter={v => formatCurrency(Number(v || 0), 'ZAR')} />
                <Line type="monotone" dataKey="value" stroke="#eab308" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
