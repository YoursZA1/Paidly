import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseErrorMessage } from '@/utils/supabaseErrorUtils';
import { createPageUrl } from '@/utils';
import { formatCurrency } from '@/utils/currencyCalculations';
import { RefreshCw, ExternalLink, Pencil, FileText, Repeat, CreditCard, Package } from 'lucide-react';

const STATUS_COLORS = {
  draft: 'bg-slate-200 text-slate-700',
  sent: 'bg-primary/15 text-primary',
  viewed: 'bg-primary/15 text-primary',
  paid: 'bg-green-100 text-green-700',
  partial_paid: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-300 text-slate-600',
};

export default function AdminInvoicesQuotes() {
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [stats, setStats] = useState({});
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const { data: invoicesData, error: invoicesError } = await supabase.from('invoices').select('*');
      if (invoicesError) {
        setError(getSupabaseErrorMessage(invoicesError, 'Failed to load invoices'));
        console.error('AdminInvoicesQuotes: invoices', invoicesError);
        return;
      }
      const { data: quotesData, error: quotesError } = await supabase.from('quotes').select('*');
      if (quotesError) {
        setError(getSupabaseErrorMessage(quotesError, 'Failed to load quotes'));
        console.error('AdminInvoicesQuotes: quotes', quotesError);
        return;
      }
      setInvoices(invoicesData ?? []);
      setQuotes(quotesData ?? []);
      const orgCounts = {};
      (invoicesData || []).forEach(inv => {
        const key = inv.org_id || 'unknown';
        orgCounts[key] = (orgCounts[key] || 0) + 1;
      });
      const totalQuotes = (quotesData || []).length;
      const totalInvoices = (invoicesData || []).length;
      const totalPaid = (invoicesData || []).filter(inv => inv.status === 'paid').length;
      const totalPartial = (invoicesData || []).filter(inv => inv.status === 'partial_paid').length;
      setStats({ orgCounts, totalQuotes, totalInvoices, totalPaid, totalPartial });
    } catch (err) {
      const msg = getSupabaseErrorMessage(err, 'Failed to load audit data');
      setError(msg);
      console.error('AdminInvoicesQuotes:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    await fetchData();
    setSyncing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Invoices & Quotes</h1>
          <p className="text-slate-600">View, edit, and sync invoices. Manage recurring invoices and subscription packages below.</p>
          {error && (
            <p className="mt-2 text-amber-600 text-sm" role="alert">{error}</p>
          )}
        </div>
        <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync invoices & quotes'}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Invoices per org</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.orgCounts || {}).length === 0 ? (
              <p className="text-slate-500">No invoices found.</p>
            ) : (
              <ul className="max-h-40 overflow-y-auto">
                {Object.entries(stats.orgCounts).map(([orgId, count]) => (
                  <li key={orgId} className="flex justify-between py-1 text-sm">
                    <span className="font-mono text-slate-600 truncate max-w-[180px]" title={orgId}>{orgId}</span>
                    <span className="font-semibold">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conversion & status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>Total Quotes: <span className="font-semibold">{stats.totalQuotes}</span></div>
              <div>Total Invoices: <span className="font-semibold">{stats.totalInvoices}</span></div>
              <div>Paid: <span className="font-semibold">{stats.totalPaid}</span></div>
              <div>Partial paid: <span className="font-semibold">{stats.totalPartial ?? 0}</span></div>
              <div>
                Quote → Invoice: <span className="font-semibold">{stats.totalQuotes ? ((stats.totalInvoices / stats.totalQuotes) * 100).toFixed(1) : '0'}%</span>
              </div>
              <div>
                Invoice → Paid: <span className="font-semibold">{stats.totalInvoices ? ((stats.totalPaid / stats.totalInvoices) * 100).toFixed(1) : '0'}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <p className="text-sm text-slate-600">View or edit an invoice to manage partial payments and payment history.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-2">Invoice #</th>
                <th className="text-left px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Created</th>
                <th className="text-left px-4 py-2">Due / Delivery</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-slate-500 py-4">No invoices found.</td></tr>
              ) : (
                invoices.map(inv => (
                  <tr key={inv.id} className="border-b hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-medium">{inv.invoice_number || inv.id?.slice(0, 8) || '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{formatCurrency(Number(inv.total_amount) || 0, 'ZAR')}</td>
                    <td className="px-4 py-2">
                      <Badge className={STATUS_COLORS[inv.status] || 'bg-slate-100 text-slate-700'}>
                        {(inv.status || 'draft').replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-sm">{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2 text-sm">{inv.delivery_date ? new Date(inv.delivery_date).toLocaleDateString() : inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" asChild className="gap-1">
                          <Link to={`${createPageUrl('ViewInvoice')}?id=${inv.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" /> View
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild className="gap-1">
                          <Link to={`${createPageUrl('EditInvoice')}?id=${inv.id}`}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Quotes</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-2">Quote #</th>
                <th className="text-left px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Created</th>
                <th className="text-left px-4 py-2">Valid until</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-slate-500 py-4">No quotes found.</td></tr>
              ) : (
                quotes.map(q => (
                  <tr key={q.id} className="border-b hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-medium">{q.quote_number || q.id?.slice(0, 8) || '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{formatCurrency(Number(q.total_amount) || 0, 'ZAR')}</td>
                    <td className="px-4 py-2">
                      <Badge className={STATUS_COLORS[q.status] || 'bg-slate-100 text-slate-700'}>
                        {(q.status || 'draft').replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-sm">{q.created_at ? new Date(q.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2 text-sm">{q.valid_until ? new Date(q.valid_until).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" asChild className="gap-1">
                          <Link to={`${createPageUrl('ViewQuote')}?id=${q.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" /> View
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild className="gap-1">
                          <Link to={`${createPageUrl('EditQuote')}?id=${q.id}`}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Recurring invoices, partial payments & subscription packages
          </CardTitle>
          <p className="text-sm text-slate-600">
            Manage recurring invoice profiles, record partial payments from the View Invoice screen, and configure subscription plans.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Button variant="outline" className="h-auto flex flex-col items-start gap-2 p-4" asChild>
              <Link to={createPageUrl('RecurringInvoices')}>
                <Repeat className="h-5 w-5 text-primary" />
                <span className="font-semibold">Recurring invoices</span>
                <span className="text-xs text-slate-500 text-left">Create and manage recurring invoice schedules</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex flex-col items-start gap-2 p-4" asChild>
              <Link to={createPageUrl('AdminSubscriptions')}>
                <CreditCard className="h-5 w-5 text-primary" />
                <span className="font-semibold">Subscriptions</span>
                <span className="text-xs text-slate-500 text-left">Pause, resume, upgrade, or cancel user subscriptions</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto flex flex-col items-start gap-2 p-4" asChild>
              <Link to={createPageUrl('AdminPlans')}>
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-semibold">Plan packages</span>
                <span className="text-xs text-slate-500 text-left">Edit plan limits, pricing, and features</span>
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Partial payments: open any invoice via View above, then use &quot;Record payment&quot; to add full or partial payments.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
