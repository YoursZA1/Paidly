import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import DoneState from '@/components/shared/DoneState';
import { createAdminSubscription } from '@/api/mutateAdminSubscription';
import {
  MIGRATION_BUCKETS,
  MIGRATION_GRACE_DEFAULT_DAYS,
  MIGRATION_GRACE_MAX_DAYS,
  MIGRATION_STATUS,
  MIGRATION_STATUS_LABEL,
} from '@shared/trialMigration.js';

export const TRIAL_MIGRATION_QUERY_KEY = 'trial-migration-preview';

const RUN_WARNING =
  'This will classify existing Paidly users based on their current subscription and trial information. No business data will be deleted.';

function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? format(d, 'dd MMM yyyy') : '—';
}

function MigrationStateCell({ row }) {
  if (row.skipped === 'excluded') {
    return <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Excluded</p>;
  }
  const label = MIGRATION_STATUS_LABEL[row.proposed] || '—';
  const review = row.proposed === MIGRATION_STATUS.REQUIRES_REVIEW;
  return (
    <div>
      <p className={`text-xs font-medium ${review ? 'text-amber-700 dark:text-amber-400' : ''}`}>
        {row.alreadyMigrated ? label : `Proposed: ${label}`}
      </p>
      {row.reasons?.length ? (
        <p className="max-w-[260px] text-[11px] text-muted-foreground">{row.reasons.join('; ')}</p>
      ) : null}
    </div>
  );
}

function graceCell(row, graceDays) {
  if (row.alreadyMigrated) return row.graceEndsAt ? `Until ${shortDate(row.graceEndsAt)}` : '—';
  if (row.proposed === MIGRATION_STATUS.MIGRATED_EXPIRED) return graceDays > 0 ? `${graceDays} days` : 'None';
  return '—';
}

function emailCell(row) {
  if (row.alreadyMigrated) return '—';
  if (row.notificationRequired) return 'Yes';
  return row.notificationNote ? `No — ${row.notificationNote}` : 'No';
}

/**
 * Admin: existing-user trial migration. Dry run first (read-only), then a confirmed run.
 * Row actions come from the page so trial / free-access / suspend actions stay in one place.
 * @param {{ renderActions: (row: object) => import('react').ReactNode }} props
 */
export default function TrialMigrationPanel({ renderActions }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [graceInput, setGraceInput] = useState(String(MIGRATION_GRACE_DEFAULT_DAYS));
  const [requested, setRequested] = useState(null);
  const [bucket, setBucket] = useState('all');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);

  const graceNumber = Number(graceInput);
  const graceValid =
    graceInput.trim() !== '' && Number.isInteger(graceNumber) && graceNumber >= 0 && graceNumber <= MIGRATION_GRACE_MAX_DAYS;

  const preview = useQuery({
    queryKey: [TRIAL_MIGRATION_QUERY_KEY, requested],
    queryFn: () => createAdminSubscription({ action: 'trial_migration_preview', grace_days: requested }),
    enabled: requested != null,
    staleTime: 0,
  });
  const data = preview.data;

  const run = useMutation({
    mutationFn: () =>
      createAdminSubscription({
        action: 'trial_migration_run',
        grace_days: data.graceDays,
        fingerprint: data.fingerprint,
        confirm: true,
      }),
    onSuccess: (out) => {
      setConfirming(false);
      setResult(out);
      queryClient.invalidateQueries({ queryKey: [TRIAL_MIGRATION_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-overview'] });
    },
    onError: () => setConfirming(false),
  });

  const rows = (data?.rows || []).filter((row) => {
    if (bucket === 'all') return true;
    if (bucket === 'excluded') return row.skipped === 'excluded';
    return row.proposed === bucket;
  });
  const pendingWrites = (data?.rows || []).filter(
    (row) =>
      (row.willWrite || row.willCreate) &&
      !row.alreadyMigrated &&
      !row.skipped &&
      !(row.existingStatus === MIGRATION_STATUS.REQUIRES_REVIEW && row.proposed === MIGRATION_STATUS.REQUIRES_REVIEW)
  ).length;
  const summary = data?.summary;

  return (
    <section className="mb-4 rounded-xl border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          <span className="block text-sm font-semibold">Existing User Migration</span>
          <span className="block text-xs text-muted-foreground">
            Place existing accounts in the trial lifecycle. Dry run first; nothing changes until you run it.
          </span>
        </span>
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {result ? (
            <DoneState
              title="Migration complete"
              reference={{
                number: `${result.processed} users processed`,
                meta: result.graceDays > 0 ? `${result.graceDays}-day grace period` : 'No grace period',
              }}
              message={
                <div className="space-y-1 text-sm">
                  <p>
                    {result.summary.active} Active Trials · {result.summary.ending} Ending Soon · {result.summary.expired} Expired ·{' '}
                    {result.summary.subscribed} Subscribed · {result.summary.free} Free Access · {result.summary.review} Requires Review
                  </p>
                  <p>
                    {result.dataRecordsDeleted} Data Records Deleted · {result.subscriptionsReset} Subscriptions Reset ·{' '}
                    {result.accountsDeleted} Accounts Deleted
                  </p>
                  <p className="text-muted-foreground">
                    {result.written} accounts classified now ({result.subscriptionRowsCreated} given the trial record signup
                    creates), {result.unchanged} already classified or unchanged
                    {result.failed ? `, ${result.failed} could not be saved` : ''}.
                  </p>
                </div>
              }
              status={{
                label: 'Emails',
                value: result.summary.notifications
                  ? `${result.summary.notifications} go out with the next daily run`
                  : 'None needed',
                tone: result.summary.notifications ? 'pending' : 'neutral',
              }}
              actions={[
                {
                  label: 'Back to migration',
                  onClick: () => {
                    setResult(null);
                    void preview.refetch();
                  },
                },
              ]}
            />
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="text-xs text-muted-foreground">
                  Grace period for expired accounts (days, 0 = none)
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MIGRATION_GRACE_MAX_DAYS}
                    value={graceInput}
                    onChange={(e) => setGraceInput(e.target.value)}
                    className="mt-1 h-11 w-full sm:w-40 md:h-9"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 md:h-9"
                  disabled={!graceValid || preview.isFetching}
                  onClick={() => {
                    if (requested === graceNumber) void preview.refetch();
                    else setRequested(graceNumber);
                  }}
                >
                  {preview.isFetching ? 'Running dry run…' : data ? 'Run dry run again' : 'Run dry run'}
                </Button>
                {data ? (
                  <Button
                    type="button"
                    className="h-11 md:h-9"
                    disabled={!data.migrationReady || pendingWrites === 0 || preview.isFetching || data.graceDays !== graceNumber}
                    onClick={() => setConfirming(true)}
                  >
                    Run Migration
                  </Button>
                ) : null}
              </div>
              {!graceValid ? (
                <p className="text-xs text-destructive">Enter a whole number of days from 0 to {MIGRATION_GRACE_MAX_DAYS}.</p>
              ) : null}

              {preview.isError ? (
                <Alert variant="destructive">
                  <AlertDescription>{preview.error?.message || 'The dry run could not finish.'}</AlertDescription>
                </Alert>
              ) : null}
              {run.isError ? (
                <Alert variant="destructive">
                  <AlertDescription>{run.error?.message || 'The migration could not finish.'}</AlertDescription>
                </Alert>
              ) : null}
              {data && !data.migrationReady ? (
                <Alert>
                  <AlertDescription>
                    Dry run only: the database does not have the migration columns yet. Apply the existing-user trial
                    migration before running it.
                  </AlertDescription>
                </Alert>
              ) : null}

              {summary ? (
                <>
                  <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Dry run at {format(new Date(data.generatedAt), 'dd MMM yyyy HH:mm')} — no changes were made.{' '}
                      {pendingWrites} account{pendingWrites === 1 ? '' : 's'} would be classified,{' '}
                      {summary.notifications} email{summary.notifications === 1 ? '' : 's'} would be queued.
                      {data.graceDays !== graceNumber ? ' Grace length changed — run the dry run again before migrating.' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                    {[
                      ['all', 'Existing Users', summary.total],
                      ...MIGRATION_BUCKETS.filter((b) => b.key !== 'suspended' || summary.suspended).map((b) => [
                        b.status,
                        b.label,
                        summary[b.key],
                      ]),
                      ...(summary.excluded ? [['excluded', 'Excluded', summary.excluded]] : []),
                    ].map(([key, label, count]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setBucket(key)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          bucket === key ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'
                        }`}
                      >
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
                        <span className="mt-0.5 block text-lg font-semibold tabular-nums">{count}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Showing {rows.length} of {data.rows.length}
                    </p>
                    <Select value={bucket} onValueChange={setBucket}>
                      <SelectTrigger className="h-11 w-full bg-card text-xs sm:w-[200px] md:h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All accounts</SelectItem>
                        {MIGRATION_BUCKETS.map((b) => (
                          <SelectItem key={b.status} value={b.status}>
                            {b.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={MIGRATION_STATUS.REVIEWED}>Reviewed by admin</SelectItem>
                        <SelectItem value="excluded">Excluded</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:hidden">
                    {rows.map((row) => (
                      <article key={row.key} className="rounded-2xl border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{row.businessName || row.ownerName || '—'}</p>
                            <p className="truncate text-xs text-muted-foreground">{row.ownerEmail || '—'}</p>
                          </div>
                          {renderActions(row)}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <p>
                            <span className="text-muted-foreground">Now: </span>
                            {row.currentPhaseLabel}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Grace: </span>
                            {graceCell(row, data.graceDays)}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Subscription: </span>
                            {row.subscription}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Trial end: </span>
                            {shortDate(row.trialEndsAt)}
                          </p>
                          <p className="col-span-2">
                            <span className="text-muted-foreground">Email: </span>
                            {emailCell(row)}
                          </p>
                        </div>
                        <div className="mt-2">
                          <MigrationStateCell row={row} />
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-3 py-2 text-left font-medium">User</th>
                          <th className="px-3 py-2 text-left font-medium">Business</th>
                          <th className="px-3 py-2 text-left font-medium">Current State</th>
                          <th className="px-3 py-2 text-left font-medium">Trial End</th>
                          <th className="px-3 py-2 text-left font-medium">Migration State</th>
                          <th className="px-3 py-2 text-left font-medium">Grace Period</th>
                          <th className="px-3 py-2 text-left font-medium">Subscription</th>
                          <th className="px-3 py-2 text-left font-medium">Free Access</th>
                          <th className="px-3 py-2 text-left font-medium">Email</th>
                          <th className="px-3 py-2 text-right font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.key} className="border-b border-border/50 align-top">
                            <td className="px-3 py-2.5">
                              <p className="text-sm font-medium">{row.ownerName || '—'}</p>
                              <p className="text-[11px] text-muted-foreground">{row.ownerEmail || '—'}</p>
                            </td>
                            <td className="px-3 py-2.5 text-sm">{row.businessName || '—'}</td>
                            <td className="px-3 py-2.5">
                              <p className="text-xs font-medium">{row.currentPhaseLabel}</p>
                              <p className="text-[11px] text-muted-foreground">{row.currentStatus || 'No subscription'}</p>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{shortDate(row.trialEndsAt)}</td>
                            <td className="px-3 py-2.5">
                              <MigrationStateCell row={row} />
                            </td>
                            <td className="px-3 py-2.5 text-xs">{graceCell(row, data.graceDays)}</td>
                            <td className="px-3 py-2.5 text-xs">{row.subscription}</td>
                            <td className="px-3 py-2.5 text-xs">{row.freeAccess}</td>
                            <td className="px-3 py-2.5 text-xs">{emailCell(row)}</td>
                            <td className="px-3 py-2.5 text-right">{renderActions(row)}</td>
                          </tr>
                        ))}
                        {rows.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                              No accounts in this group.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={(next) => (!next && !run.isPending ? setConfirming(false) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run the existing-user migration?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{RUN_WARNING}</p>
                {summary ? (
                  <p>
                    {pendingWrites} accounts will be classified from the dry run you just reviewed
                    {summary.created ? `; ${summary.created} without a trial record get the one signup creates, dated from sign-up` : ''}.{' '}
                    {data.graceDays > 0
                      ? `Expired accounts keep full access for ${data.graceDays} days, then become view-only.`
                      : 'Expired accounts become view-only straight away.'}{' '}
                    {summary.notifications} email{summary.notifications === 1 ? '' : 's'} will go out with the next daily run.
                    Accounts that need review keep their current access.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={run.isPending}>Cancel</AlertDialogCancel>
            <Button type="button" disabled={run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? 'Running…' : 'Run Migration'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
