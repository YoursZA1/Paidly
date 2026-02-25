import { useEffect, useState } from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function filterTransactions(transactions, filters) {
  return transactions.filter(tx => {
    if (filters.status && filters.status !== 'all' && tx.status !== filters.status) return false;
    if (filters.business && filters.business !== 'all' && tx.business !== filters.business) return false;
    if (filters.customer && filters.customer !== 'all' && tx.customer !== filters.customer) return false;
    if (filters.minAmount && tx.amount < Number(filters.minAmount)) return false;
    if (filters.maxAmount && tx.amount > Number(filters.maxAmount)) return false;
    if (filters.startDate && new Date(tx.date) < new Date(filters.startDate)) return false;
    if (filters.endDate && new Date(tx.date) > new Date(filters.endDate)) return false;
    return true;
  });
}

export default function AdminTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({
    status: 'all',
    business: 'all',
    customer: 'all',
    minAmount: '',
    maxAmount: '',
    startDate: '',
    endDate: ''
  });
  const [businesses, setBusinesses] = useState([]);
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    import('@/services/ExcelUserService').then(({ userService }) => {
      const allUsers = userService.getAllUsers();
      let txs = [];
      let biz = new Set();
      let cust = new Set();
      allUsers.forEach(u => {
        if (u.invoices) {
          u.invoices.forEach(inv => {
            txs.push({
              id: inv.id,
              business: u.company || '-',
              customer: inv.client_name || inv.clientName || '-',
              amount: inv.total_amount || 0,
              fee: inv.fee_amount || 0,
              net: (inv.total_amount || 0) - (inv.fee_amount || 0),
              status: inv.status === 'refunded' ? 'Refunded' : (inv.status === 'failed' ? 'Failed' : 'Success'),
              gateway: inv.gateway_reference || '-',
              date: inv.created_date || inv.created_at || '',
            });
            biz.add(u.company || '-');
            cust.add(inv.client_name || inv.clientName || '-');
          });
        }
      });
      setTransactions(txs);
      setBusinesses(['all', ...Array.from(biz).filter(b => b && b !== '-')]);
      setCustomers(['all', ...Array.from(cust).filter(c => c && c !== '-')]);
    });
  }, []);

  const filtered = filterTransactions(transactions, filters);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Transactions</h1>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs mb-1">Status</label>
            <select className="border rounded px-2 py-1" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="all">All</option>
              <option value="Success">Success</option>
              <option value="Failed">Failed</option>
              <option value="Refunded">Refunded</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Business</label>
            <select className="border rounded px-2 py-1" value={filters.business} onChange={e => setFilters(f => ({ ...f, business: e.target.value }))}>
              {businesses.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Customer</label>
            <select className="border rounded px-2 py-1" value={filters.customer} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))}>
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
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
          <Button variant="outline" onClick={() => setFilters({ status: 'all', business: 'all', customer: 'all', minAmount: '', maxAmount: '', startDate: '', endDate: '' })}>Reset</Button>
        </div>
      </Card>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border rounded shadow">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="p-2">Transaction ID</th>
              <th className="p-2">Business</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Fee</th>
              <th className="p-2">Net</th>
              <th className="p-2">Status</th>
              <th className="p-2">Gateway Ref</th>
              <th className="p-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(tx => (
              <tr key={tx.id} className="border-b hover:bg-slate-50">
                <td className="p-2 font-mono text-xs">{tx.id}</td>
                <td className="p-2">{tx.business}</td>
                <td className="p-2">{tx.customer}</td>
                <td className="p-2">{formatCurrency(tx.amount, 'ZAR')}</td>
                <td className="p-2">{formatCurrency(tx.fee, 'ZAR')}</td>
                <td className="p-2">{formatCurrency(tx.net, 'ZAR')}</td>
                <td className={"p-2 font-semibold " + (tx.status === 'Success' ? 'text-emerald-700' : tx.status === 'Failed' ? 'text-rose-700' : 'text-amber-700')}>{tx.status}</td>
                <td className="p-2 font-mono text-xs">{tx.gateway}</td>
                <td className="p-2">{tx.date ? new Date(tx.date).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="p-4 text-center text-slate-400">No transactions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
