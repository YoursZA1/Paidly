/**
 * System Status – Operations dashboard for backend, Supabase, and sync health.
 * Under Admin → Operations → System Status.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/components/auth/AuthContext";
import {
  getSyncStatus,
  syncAdminData,
} from "@/services/AdminSupabaseSyncService";
import { supabase } from "@/lib/supabaseClient";
import {
  Shield,
  Server,
  Database,
  HardDrive,
  Radio,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Wrench,
} from "lucide-react";

const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:5179";
const hasSupabaseUrl = !!import.meta.env.VITE_SUPABASE_URL;
const hasSupabaseAnonKey = !!import.meta.env.VITE_SUPABASE_ANON_KEY;

function StatusBadge({ status }) {
  const config = {
    operational: { label: "Operational", variant: "default", icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
    degraded: { label: "Degraded", variant: "secondary", icon: AlertCircle, className: "bg-amber-500/10 text-amber-700 border-amber-200" },
    error: { label: "Error", variant: "destructive", icon: XCircle, className: "bg-red-500/10 text-red-700 border-red-200" },
    checking: { label: "Checking…", variant: "secondary", icon: Loader2, className: "bg-slate-100 text-slate-600 border-slate-200" },
  };
  const c = config[status] || config.checking;
  const Icon = c.icon;

  return (
    <Badge variant={c.variant} className={`gap-1 border ${c.className}`}>
      {status === "checking" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status !== "checking" && <Icon className="h-3 w-3" />}
      {c.label}
    </Badge>
  );
}

export default function SystemStatus() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [backendStatus, setBackendStatus] = useState("checking");
  const [authStatus, setAuthStatus] = useState("checking");
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [syncing, setSyncing] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  const checkBackend = useCallback(async () => {
    try {
      const res = await fetch(`${serverUrl}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(8000),
      });
      setBackendStatus(res.ok ? "operational" : "degraded");
    } catch {
      setBackendStatus("error");
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setAuthStatus("error");
        return;
      }
      setAuthStatus(data?.session ? "operational" : "degraded");
    } catch {
      setAuthStatus("error");
    }
  }, []);

  const refresh = useCallback(() => {
    setBackendStatus("checking");
    setAuthStatus("checking");
    setSyncStatus(getSyncStatus());
    setLastChecked(new Date());
    checkBackend();
    checkAuth();
    setSyncStatus(getSyncStatus());
  }, [checkBackend, checkAuth]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep sync status in sync with localStorage (e.g. after sync runs elsewhere)
  useEffect(() => {
    const interval = setInterval(() => setSyncStatus(getSyncStatus()), 5000);
    return () => clearInterval(interval);
  }, []);

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

  const overallStatus =
    backendStatus === "error" || authStatus === "error"
      ? "error"
      : backendStatus === "degraded" || authStatus === "degraded" || syncStatus?.status === "failed"
        ? "degraded"
        : "operational";

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">System Status</h1>
              <p className="text-sm text-slate-500">
                Operations → Backend, Supabase, and data sync health
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Overall status */}
        <Card className="border-2 border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Overall status</span>
              <StatusBadge status={overallStatus} />
            </CardTitle>
            <CardDescription>
              {lastChecked
                ? `Last checked ${lastChecked.toLocaleTimeString()}`
                : "Run Refresh to check."}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Services */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Backend API */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-600" />
                Backend API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Health endpoint</span>
                <StatusBadge status={backendStatus} />
              </div>
              <p className="text-xs text-slate-500 font-mono truncate">{serverUrl}/api/health</p>
            </CardContent>
          </Card>

          {/* Supabase Auth */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-slate-600" />
                Supabase Auth
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Session</span>
                <StatusBadge status={authStatus} />
              </div>
              {user?.email && (
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              )}
            </CardContent>
          </Card>

          {/* Data sync */}
          <Card className="sm:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4 text-slate-600" />
                Data sync (admin)
              </CardTitle>
              <CardDescription>
                Last sync from Supabase via server; used by Accounts, Document Oversight, and reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={
                      syncStatus?.status === "success"
                        ? "operational"
                        : syncStatus?.status === "failed"
                          ? "error"
                          : "degraded"
                    }
                  />
                  {syncStatus?.synced_at && (
                    <span className="text-xs text-slate-500">
                      {new Date(syncStatus.synced_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRunSync}
                  disabled={syncing}
                  className="gap-2"
                >
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {syncing ? "Syncing…" : "Run sync now"}
                </Button>
              </div>
              {syncStatus?.error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1.5">
                  {syncStatus.error}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card className="sm:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wrench className="h-4 w-4 text-slate-600" />
                Configuration
              </CardTitle>
              <CardDescription>
                Frontend env: Supabase URL and anon key; server URL for sync.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2 text-sm">
                <li className="flex items-center gap-2">
                  {hasSupabaseUrl ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <span>Supabase URL</span>
                </li>
                <li className="flex items-center gap-2">
                  {hasSupabaseAnonKey ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <span>Supabase anon key</span>
                </li>
                <li className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-slate-500 shrink-0" />
                  <span>Storage: profile-logos, invoicebreek, activities, bank-details</span>
                </li>
                <li className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-slate-500 shrink-0" />
                  <span>Realtime: invoices, quotes, payments, clients, notifications</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Links */}
        <Card className="border-dashed">
          <CardContent className="py-4">
            <p className="text-sm text-slate-600 mb-2">For maintenance and troubleshooting:</p>
            <ul className="flex flex-wrap gap-3 text-sm">
              <li>
                <a
                  href="/admin/platform-settings"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Platform settings
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a
                  href="/admin/support-tools"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Support & admin tools
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
            <p className="text-xs text-slate-500 mt-2">
              See docs: MONITORING_LOGS_AND_SYNC.md, ADMIN_FEATURES_AND_SUPABASE.md
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
