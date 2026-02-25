/**
 * Background Jobs – Operations view for sync, reminders, and scheduled tasks.
 * Under Admin → Operations → Background Jobs.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  getSyncStatus,
  syncAdminData,
} from "@/services/AdminSupabaseSyncService";
import {
  Activity,
  RefreshCw,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Zap,
  Mail,
  FileText,
  Calendar,
  Server,
} from "lucide-react";

const STORAGE_KEYS = {
  LAST_DUE_DATE_CHECK: "lastDueDateCheck",
  LAST_FOLLOW_UP_CHECK: "lastFollowUpCheck",
};

function formatLastRun(ts) {
  if (!ts) return "Never";
  const d = new Date(typeof ts === "number" ? ts : parseInt(ts, 10));
  return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleString();
}

export default function BackgroundJobs() {
  const { toast } = useToast();
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [syncing, setSyncing] = useState(false);
  const [lastDueDateCheck, setLastDueDateCheck] = useState(null);
  const [lastFollowUpCheck, setLastFollowUpCheck] = useState(null);

  const refresh = useCallback(() => {
    setSyncStatus(getSyncStatus());
    const due = localStorage.getItem(STORAGE_KEYS.LAST_DUE_DATE_CHECK);
    const follow = localStorage.getItem(STORAGE_KEYS.LAST_FOLLOW_UP_CHECK);
    setLastDueDateCheck(due ? parseInt(due, 10) : null);
    setLastFollowUpCheck(follow ? parseInt(follow, 10) : null);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleRunSync = async () => {
    setSyncing(true);
    try {
      await syncAdminData();
      setSyncStatus(getSyncStatus());
      toast({
        title: "Sync complete",
        description: "Admin data has been synced from Supabase.",
      });
    } catch (err) {
      setSyncStatus(getSyncStatus());
      toast({
        title: "Sync failed",
        description: err?.message || "Check connection and admin access.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Background Jobs</h1>
              <p className="text-sm text-slate-500">
                Operations → Sync, reminders, and scheduled tasks
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* On-demand / manual jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-slate-600" />
              On-demand jobs
            </CardTitle>
            <CardDescription>
              Trigger these from the admin UI. Last run times are shown when available.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Admin data sync */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50/50">
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  Admin data sync
                  <Badge
                    variant={syncStatus?.status === "success" ? "default" : "secondary"}
                    className={
                      syncStatus?.status === "success"
                        ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                        : syncStatus?.status === "failed"
                          ? "bg-red-500/10 text-red-700 border-red-200"
                          : ""
                    }
                  >
                    {syncStatus?.status === "success" ? "Success" : syncStatus?.status === "failed" ? "Failed" : "—"}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">
                  Pull users, orgs, invoices, quotes, and payments from Supabase. Used by Accounts, Document Oversight, and reports.
                </p>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last run: {syncStatus?.synced_at ? new Date(syncStatus.synced_at).toLocaleString() : "Never"}
                </p>
                {syncStatus?.error && (
                  <p className="text-xs text-red-600 mt-1">{syncStatus.error}</p>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleRunSync}
                disabled={syncing}
                className="gap-2 shrink-0"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {syncing ? "Syncing…" : "Run sync now"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Client-triggered tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-600" />
              Client-triggered tasks
            </CardTitle>
            <CardDescription>
              Run when you use the app (e.g. open Layout). Throttled to about once per day per task.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="p-4 rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <Mail className="h-4 w-4 text-slate-600" />
                  Due date reminders
                </div>
                <p className="text-sm text-slate-500 mt-0.5">Check and send due date notifications.</p>
                <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last run: {formatLastRun(lastDueDateCheck)}
                </p>
              </div>
              <div className="p-4 rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <FileText className="h-4 w-4 text-slate-600" />
                  Payment & quote reminders
                </div>
                <p className="text-sm text-slate-500 mt-0.5">Payment reminders, quote reminders, client follow-ups.</p>
                <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last run: {formatLastRun(lastFollowUpCheck)}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              These run automatically when you use the app; no manual trigger here. Configure reminders in Settings → Reminders.
            </p>
          </CardContent>
        </Card>

        {/* Server-side scheduled jobs */}
        <Card className="border-dashed border-slate-300">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4 text-slate-600" />
              Server-side scheduled jobs
            </CardTitle>
            <CardDescription>
              Cron or job queue on the backend for fully automated tasks (e.g. nightly reports, billing).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-700">No server-side jobs configured</p>
                <p className="text-sm text-slate-500 mt-1">
                  Add cron jobs or a job queue in the server (e.g. <code className="text-xs bg-slate-200 px-1 rounded">server/</code>) for automated sync, report generation, or billing. This page can then show status from an admin API.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Links */}
        <Card className="border-dashed">
          <CardContent className="py-4">
            <p className="text-sm text-slate-600 mb-2">Related:</p>
            <ul className="flex flex-wrap gap-3 text-sm">
              <li>
                <a
                  href="/admin/system-status"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  System status
                </a>
              </li>
              <li>
                <a
                  href="/admin/support-tools"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Support & admin tools
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a
                  href="/settings"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Settings → Reminders
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
