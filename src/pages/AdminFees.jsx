import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function filterFees(fees, filters) {
  return fees.filter(f => {
    if (filters.plan && filters.plan !== 'all' && f.plan !== filters.plan) return false;
    if (filters.business && filters.business !== 'all' && f.business !== filters.business) return false;
    if (filters.minTotal && f.total < Number(filters.minTotal)) return false;
    if (filters.maxTotal && f.total > Number(filters.maxTotal)) return false;
    return true;
  });
}

export default function AdminFees() {
  const [fees, setFees] = useState([]);
  const [filters, setFilters] = useState({
    plan: 'all',
    business: 'all',
    minTotal: '',
    maxTotal: ''
  });
  const [plans, setPlans] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [sim, setSim] = useState({ plan: '', amount: '', business: '' });
  const [simResult, setSimResult] = useState(null);

  useEffect(() => {
    import('@/services/ExcelUserService').then(({ userService }) => {
      const allUsers = userService.getAllUsers();
      let feeArr = [];
      let planSet = new Set();
      let bizSet = new Set();
      allUsers.forEach(u => {
        if (u.fee_structure) {
          Object.entries(u.fee_structure).forEach(([plan, fee]) => {
            feeArr.push({
              business: u.company || '-',
              plan,
              percent: fee.percent,
              fixed: fee.fixed,
              custom: fee.custom || false,
              total: fee.total_collected || 0
            });
            planSet.add(plan);
            bizSet.add(u.company || '-');
          });
        }
      });
      setFees(feeArr);
      setPlans(['all', ...Array.from(planSet)]);
      setBusinesses(['all', ...Array.from(bizSet).filter(b => b && b !== '-')]);
    });
  }, []);

  const filtered = filterFees(fees, filters);

  function handleSimulate() {
    if (!sim.plan || !sim.amount) return setSimResult(null);
    const planFee = fees.find(f => f.plan === sim.plan && (sim.business === '' || f.business === sim.business));
    if (!planFee) return setSimResult('No fee structure found');
    const percentFee = (planFee.percent || 0) * Number(sim.amount) / 100;
    const fixedFee = planFee.fixed || 0;
    setSimResult(percentFee + fixedFee);
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Platform Fees</h1>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs mb-1">Plan</label>
            <select className="border rounded px-2 py-1" value={filters.plan} onChange={e => setFilters(f => ({ ...f, plan: e.target.value }))}>
              {plans.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Business</label>
            <select className="border rounded px-2 py-1" value={filters.business} onChange={e => setFilters(f => ({ ...f, business: e.target.value }))}>
              {businesses.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Min Total</label>
            <Input type="number" value={filters.minTotal} onChange={e => setFilters(f => ({ ...f, minTotal: e.target.value }))} className="w-24" />
          </div>
          <div>
            <label className="block text-xs mb-1">Max Total</label>
            <Input type="number" value={filters.maxTotal} onChange={e => setFilters(f => ({ ...f, maxTotal: e.target.value }))} className="w-24" />
          </div>
          <Button variant="outline" onClick={() => setFilters({ plan: 'all', business: 'all', minTotal: '', maxTotal: '' })}>Reset</Button>
        </div>
      </Card>
      <div className="overflow-x-auto mb-8">
        <table className="min-w-full bg-white border rounded shadow">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="p-2">Business</th>
              <th className="p-2">Plan</th>
              <th className="p-2">% Fee</th>
              <th className="p-2">Fixed Fee</th>
              <th className="p-2">Custom Override</th>
              <th className="p-2">Total Collected</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f, i) => (
              <tr key={i} className="border-b hover:bg-slate-50">
                <td className="p-2">{f.business}</td>
                <td className="p-2">{f.plan}</td>
                <td className="p-2">{f.percent}%</td>
                <td className="p-2">{f.fixed}</td>
                <td className="p-2">{f.custom ? 'Yes' : 'No'}</td>
                <td className="p-2">{f.total}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-slate-400">No fee data found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-2">Fee Simulation Calculator</h2>
        <div className="flex flex-wrap gap-4 items-end mb-2">
          <div>
            <label className="block text-xs mb-1">Plan</label>
            <select className="border rounded px-2 py-1" value={sim.plan} onChange={e => setSim(s => ({ ...s, plan: e.target.value }))}>
              <option value="">Select</option>
              {plans.filter(p => p !== 'all').map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Business (optional)</label>
            <select className="border rounded px-2 py-1" value={sim.business} onChange={e => setSim(s => ({ ...s, business: e.target.value }))}>
              <option value="">Any</option>
              {businesses.filter(b => b !== 'all').map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Amount</label>
            <Input type="number" value={sim.amount} onChange={e => setSim(s => ({ ...s, amount: e.target.value }))} className="w-32" />
          </div>
          <Button onClick={handleSimulate}>Simulate</Button>
        </div>
        {simResult !== null && (
          <div className="mt-2 text-sm">
            {typeof simResult === 'string' ? simResult : `Fee: ${simResult}`}
          </div>
        )}
      </Card>
    </div>
  );
}
