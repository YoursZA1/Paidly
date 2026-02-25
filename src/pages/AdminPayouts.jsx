import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Dummy payout actions (to be replaced with real service calls)
function manualOverride(payoutId) {
  alert(`Manual override for payout ${payoutId}`);
}
function retryPayout(payoutId) {
  alert(`Retry payout for ${payoutId}`);
}
function freezePayout(payoutId) {
  alert(`Freeze payout ability for ${payoutId}`);
}

function filterPayouts(payouts, filters) {
  return payouts.filter(p => {
    if (filters.status && filters.status !== 'all' && p.status !== filters.status) return false;
    if (filters.business && filters.business !== 'all' && p.business !== filters.business) return false;
    if (filters.minAmount && p.amount < Number(filters.minAmount)) return false;
    if (filters.maxAmount && p.amount > Number(filters.maxAmount)) return false;
    if (filters.startDate && new Date(p.scheduledDate) < new Date(filters.startDate)) return false;
    if (filters.endDate && new Date(p.scheduledDate) > new Date(filters.endDate)) return false;
    return true;
  });
}

export default function AdminPayouts() {
  const [payouts, setPayouts] = useState([]);
  const [filters, setFilters] = useState({
    status: 'all',
    business: 'all',
    minAmount: '',
    maxAmount: '',
    startDate: '',
    endDate: ''
  });
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => {
    import('@/services/ExcelUserService').then(({ userService }) => {
      const allUsers = userService.getAllUsers();
      let payoutsArr = [];
      let biz = new Set();
      allUsers.forEach(u => {
        if (u.payouts) {
          u.payouts.forEach(po => {
            payoutsArr.push({
              id: po.id,
              business: u.company || '-',
              amount: po.amount || 0,
              fee: po.fee || 0,
              bank: po.bank || po.method || '-',
              status: po.status || 'Pending',
              scheduledDate: po.scheduled_date || po.scheduledDate || '',
              reference: po.reference || '-',
            });
            biz.add(u.company || '-');
          });
        }
      });
      setPayouts(payoutsArr);
      setBusinesses(['all', ...Array.from(biz).filter(b => b && b !== '-')]);
    });
  }, []);

  const filtered = filterPayouts(payouts, filters);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Payouts</h1>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs mb-1">Status</label>
            <select className="border rounded px-2 py-1" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="all">All</option>
              <option value="Pending">Pending</option>
              <option value="Processed">Processed</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Business</label>
            <select className="border rounded px-2 py-1" value={filters.business} onChange={e => setFilters(f => ({ ...f, business: e.target.value }))}>
              {businesses.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Min Amount</label>
            <Input type="number" value={filters.minAmount} onChange={e => setFilters(f => ({ ...f, minAmount: e.target.value }))} className="w-24" />
          </div>
          <div>
            <label className="block text-xs mb-1">Max Amount</label>
            <Input type="number" value={filters.maxAmount} onChange={e => setFilters(f => ({ ...f, maxAmount: e.target.value }))} className="w-24" />
          </div>
          <div>
            <label className="block text-xs mb-1">Start Date</label>
            <Input type="date" value={filters.startDate} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} className="w-36" />
          </div>
          <div>
            <label className="block text-xs mb-1">End Date</label>
            <Input type="date" value={filters.endDate} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} className="w-36" />
          </div>
          <Button variant="outline" onClick={() => setFilters({ status: 'all', business: 'all', minAmount: '', maxAmount: '', startDate: '', endDate: '' })}>Reset</Button>
        </div>
      </Card>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border rounded shadow">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="p-2">Business</th>
              <th className="p-2">Payout Amount</th>
              <th className="p-2">Fee Deducted</th>
              <th className="p-2">Bank / Method</th>
              <th className="p-2">Status</th>
              <th className="p-2">Scheduled Date</th>
              <th className="p-2">Reference #</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(po => (
              <tr key={po.id} className="border-b hover:bg-slate-50">
                <td className="p-2">{po.business}</td>
                <td className="p-2">{po.amount}</td>
                <td className="p-2">{po.fee}</td>
                <td className="p-2">{po.bank}</td>
                <td className={"p-2 font-semibold " + (po.status === 'Processed' ? 'text-emerald-700' : po.status === 'Failed' ? 'text-rose-700' : 'text-amber-700')}>{po.status}</td>
                <td className="p-2">{po.scheduledDate ? new Date(po.scheduledDate).toLocaleDateString() : '-'}</td>
                <td className="p-2 font-mono text-xs">{po.reference}</td>
                <td className="p-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => manualOverride(po.id)}>Manual Override</Button>
                  <Button size="sm" variant="outline" onClick={() => retryPayout(po.id)}>Retry</Button>
                  <Button size="sm" variant="destructive" onClick={() => freezePayout(po.id)}>Freeze</Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-center text-slate-400">No payouts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
