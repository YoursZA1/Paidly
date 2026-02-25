import { useEffect, useState } from 'react';
import { userService } from '@/services/ExcelUserService';
import { formatCurrency } from '@/utils/currencyCalculations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Button from '@/components/ui/button';
import { format as formatDate } from 'date-fns';

export default function AdminBusinesses() {
  const [businesses, setBusinesses] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    // Simulate businesses as users with company info
    const allUsers = userService.getAllUsers();
    setBusinesses(allUsers.filter(u => u.company));
  }, []);

  if (selected) {
    // Business Detail View
    const b = selected;
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Button onClick={() => setSelected(null)} className="mb-4">Back to Businesses</Button>
        <Card>
          <CardHeader>
            <CardTitle>{b.company}</CardTitle>
            <div className="text-sm text-slate-500">Owner: {b.full_name || b.display_name || b.email}</div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>Status: <span className="font-semibold">{b.status}</span></div>
              <div>Plan: <span className="font-semibold">{b.plan || '—'}</span></div>
              <div>Subscription: <span className="font-semibold">{b.subscription_status || '—'}</span></div>
              <div>MRR: <span className="font-semibold">{formatCurrency(b.subscription_amount || 0, 'ZAR')}</span></div>
              <div>Created: <span className="font-semibold">{b.created_at ? formatDate(new Date(b.created_at), 'yyyy-MM-dd') : '—'}</span></div>
              <div>Last Activity: <span className="font-semibold">{b.updated_at ? formatDate(new Date(b.updated_at), 'yyyy-MM-dd') : '—'}</span></div>
            </div>
            <div className="mb-2">Total Revenue: <span className="font-semibold">{formatCurrency(b.total_revenue || 0, 'ZAR')}</span></div>
            <div className="mb-2">Total Invoices: <span className="font-semibold">{b.total_invoices || 0}</span></div>
            <div className="mb-2">Payment Gateway: <span className="font-semibold">{b.payment_gateway_connected ? 'Connected' : 'Not Connected'}</span></div>
            <div className="mb-2">Activity Logs:</div>
            <ul className="text-xs bg-slate-50 rounded p-2 mb-4">
              {(b.activity_logs || []).map((log, i) => (
                <li key={i}>{log}</li>
              ))}
              {(!b.activity_logs || b.activity_logs.length === 0) && <li>No activity logs.</li>}
            </ul>
            <div className="flex gap-2">
              <Button variant="destructive">Suspend</Button>
              <Button variant="secondary">Upgrade</Button>
              <Button variant="outline">Reset Password</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Businesses</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border rounded shadow">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="p-2">Business Name</th>
              <th className="p-2">Owner</th>
              <th className="p-2">Status</th>
              <th className="p-2">Plan</th>
              <th className="p-2">MRR</th>
              <th className="p-2">Created</th>
              <th className="p-2">Last Activity</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map(b => (
              <tr key={b.id} className="border-b hover:bg-slate-50">
                <td className="p-2 font-semibold">{b.company}</td>
                <td className="p-2">{b.full_name || b.display_name || b.email}</td>
                <td className="p-2">{b.status}</td>
                <td className="p-2">{b.plan || '—'}</td>
                <td className="p-2">{formatCurrency(b.subscription_amount || 0, 'ZAR')}</td>
                <td className="p-2">{b.created_at ? formatDate(new Date(b.created_at), 'yyyy-MM-dd') : '—'}</td>
                <td className="p-2">{b.updated_at ? formatDate(new Date(b.updated_at), 'yyyy-MM-dd') : '—'}</td>
                <td className="p-2">
                  <Button size="sm" onClick={() => setSelected(b)}>View</Button>
                </td>
              </tr>
            ))}
            {businesses.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-center text-slate-400">No businesses found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
