import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { Search, Trash2, CheckCircle, Eye, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import PageHeader from '@/components/dashboard/PageHeader';

export default function WaitlistPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewingEntry, setViewingEntry] = useState(null);
  const [form, setForm] = useState({ name: '', email: '' });
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['waitlist'],
    queryFn: () => paidly.entities.WaitlistEntry.list('-created_date', 200),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (payload) => paidly.entities.WaitlistEntry.create(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['waitlist'] });
      const previous = queryClient.getQueryData(['waitlist']);
      const optimistic = {
        id: `tmp-${Date.now()}`,
        name: payload.name || '',
        email: payload.email,
        converted: false,
        created_date: new Date().toISOString(),
      };
      queryClient.setQueryData(['waitlist'], (old = []) => [optimistic, ...old]);
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['waitlist'], ctx.previous);
      toast.error(err?.message || 'Create failed');
    },
    onSuccess: () => {
      toast.success('Entry added');
      setForm({ name: '', email: '' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => paidly.entities.WaitlistEntry.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['waitlist'] });
      const previous = queryClient.getQueryData(['waitlist']);
      queryClient.setQueryData(['waitlist'], (old = []) => old.map((row) => (row.id === id ? { ...row, ...data } : row)));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['waitlist'], ctx.previous);
      toast.error(err?.message || 'Update failed');
    },
    onSuccess: () => toast.success('Entry updated'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => paidly.entities.WaitlistEntry.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['waitlist'] });
      const previous = queryClient.getQueryData(['waitlist']);
      queryClient.setQueryData(['waitlist'], (old = []) => old.filter((row) => row.id !== id));
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['waitlist'], ctx.previous);
      toast.error(err?.message || 'Delete failed');
    },
    onSuccess: () => toast.success('Entry removed'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['waitlist'] }),
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.email) return;
    createMutation.mutate(form);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Delete this waitlist entry? This action cannot be undone.')) return;
    deleteMutation.mutate(id);
  };

  const filtered = entries.filter((e) => {
    const matchSearch = (
      !search ||
      (e.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.email || '').toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = statusFilter === 'all' || (statusFilter === 'converted' ? e.converted : !e.converted);
    return matchSearch && matchStatus;
  });

  const convertedCount = entries.filter((e) => e.converted).length;
  const pendingCount = entries.length - convertedCount;

  return (
    <div>
      <PageHeader
        title="Waitlist"
        description={`${entries.length} total entries · ${convertedCount} converted`}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      {error ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error?.message ||
            'Could not load waitlist. Run the latest Supabase migration (waitlist admin access) and sign in as an admin.'}
        </p>
      ) : null}

      <Tabs defaultValue="entries" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="entries" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Entries</TabsTrigger>
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total', value: entries.length, color: 'border-primary/30' },
              { label: 'Pending', value: pendingCount, color: 'border-amber-500/30' },
              { label: 'Converted', value: convertedCount, color: 'border-emerald-500/30' },
            ].map((card) => (
              <div key={card.label} className={`bg-card rounded-xl border-2 ${card.color} p-5`}>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold mt-1">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <form onSubmit={handleCreate} className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Input
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="bg-card"
              />
              <Input
                placeholder="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                className="bg-card"
                required
              />
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Adding...' : 'Add Entry'}
              </Button>
            </form>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search waitlist..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-card pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full bg-card sm:w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entries</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-6 py-3 text-left font-medium">Name</th>
                    <th className="px-6 py-3 text-left font-medium">Email</th>
                    <th className="px-6 py-3 text-left font-medium">Converted</th>
                    <th className="px-6 py-3 text-left font-medium">Signed Up</th>
                    <th className="px-6 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {error ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-red-400">
                        Failed to load waitlist entries.
                      </td>
                    </tr>
                  ) : null}
                  {filtered.map((entry) => (
                    <tr key={entry.id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4 text-sm font-medium">{entry.name || '—'}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{entry.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium ${entry.converted ? 'text-emerald-500' : 'text-muted-foreground'}`}
                        >
                          {entry.converted ? (
                            <>
                              <CheckCircle className="h-3 w-3" /> Yes
                            </>
                          ) : (
                            'No'
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {entry.created_date ? format(new Date(entry.created_date), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="View details"
                            onClick={() => setViewingEntry(entry)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!entry.converted ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-500"
                              title="Mark converted"
                              onClick={() => updateMutation.mutate({ id: entry.id, data: { converted: true } })}
                              disabled={updateMutation.isPending}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            title="Remove entry"
                            onClick={() => handleDelete(entry.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                        {isLoading ? 'Loading...' : 'No entries found'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="overview">
          <div className="bg-card rounded-xl border border-border p-6">
            <p className="text-sm text-muted-foreground">Conversion Rate</p>
            <p className="mt-2 text-3xl font-bold">
              {entries.length ? `${((convertedCount / entries.length) * 100).toFixed(1)}%` : '0%'}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {convertedCount} of {entries.length} waitlist entries converted.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!viewingEntry} onOpenChange={() => setViewingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waitlist Entry</DialogTitle>
          </DialogHeader>
          {viewingEntry ? (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{viewingEntry.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{viewingEntry.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium">{viewingEntry.converted ? 'Converted' : 'Pending'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Signed Up</p>
                  <p className="font-medium">{viewingEntry.created_date ? format(new Date(viewingEntry.created_date), 'dd MMM yyyy') : '—'}</p>
                </div>
              </div>
              {!viewingEntry.converted ? (
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    updateMutation.mutate({ id: viewingEntry.id, data: { converted: true } });
                    setViewingEntry(null);
                  }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark as Converted
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
