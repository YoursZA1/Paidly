/**
 * Build Logs – Build and deployment information and log viewer.
 * Under Admin → Operations → Build Logs.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Terminal,
  RefreshCw,
  Package,
  Calendar,
  GitBranch,
  Server,
  Loader2,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";

const serverUrl = (import.meta.env.VITE_SERVER_URL || "http://localhost:5179").replace(/\/$/, "");
const BUILD_INFO_TIMEOUT_MS = 15000;
const appVersion = import.meta.env.VITE_APP_VERSION || "0.0.0";
const buildTime = import.meta.env.VITE_BUILD_TIME || null;
const isDev = import.meta.env.DEV === true;
const mode = import.meta.env.MODE || "development";

export default function BuildLogs() {
  const [buildInfo, setBuildInfo] = useState(null);
  const [serverLogs, setServerLogs] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchBuildInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/build-info`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(BUILD_INFO_TIMEOUT_MS),
      });
      if (res.ok) {
        const data = await res.json();
        setBuildInfo(data);
        if (data.logs) setServerLogs(data.logs);
      } else {
        setBuildInfo(null);
        setServerLogs("");
      }
    } catch (e) {
      const msg = e?.message || "Could not reach server";
      const isTimeout = msg.includes("aborted") || msg.includes("timed out");
      setError(isTimeout
        ? `Request timed out after ${BUILD_INFO_TIMEOUT_MS / 1000}s. The server may be slow or offline.`
        : msg);
      setBuildInfo(null);
      setServerLogs("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBuildInfo();
  }, [fetchBuildInfo]);

  const handleCopy = () => {
    const text = [
      `App: ${appVersion}`,
      `Mode: ${mode}`,
      buildTime ? `Build: ${buildTime}` : null,
      serverLogs ? `\n--- Server logs ---\n${serverLogs}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
              <Terminal className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Build Logs</h1>
              <p className="text-sm text-slate-500">
                Build info and deployment logs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchBuildInfo}
              disabled={loading}
              className="gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              Copy
            </Button>
          </div>
        </div>

        {/* Build info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Package className="w-4 h-4" />
                App version
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold text-slate-900">{appVersion}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Mode
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={isDev ? "secondary" : "default"} className="mt-1">
                {mode}
              </Badge>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Build time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium text-slate-900">
                {buildTime || (isDev ? "Development (no build)" : "—")}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Server className="w-4 h-4" />
                Backend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                <Badge variant="destructive" className="text-xs">Unreachable</Badge>
              ) : buildInfo ? (
                <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">OK</Badge>
              ) : (
                <span className="text-sm text-slate-500">—</span>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Server build info (if API exists) */}
        {buildInfo && (buildInfo.version || buildInfo.nodeVersion) && (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Server build info</CardTitle>
              <CardDescription>From backend /api/build-info</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {buildInfo.version != null && (
                  <>
                    <dt className="text-slate-500">Version</dt>
                    <dd className="font-medium">{buildInfo.version}</dd>
                  </>
                )}
                {buildInfo.nodeVersion != null && (
                  <>
                    <dt className="text-slate-500">Node</dt>
                    <dd className="font-medium">{buildInfo.nodeVersion}</dd>
                  </>
                )}
                {buildInfo.env != null && (
                  <>
                    <dt className="text-slate-500">Env</dt>
                    <dd className="font-medium">{buildInfo.env}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Log viewer */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Log output
                </CardTitle>
                <CardDescription>
                  {serverLogs
                    ? "Recent build or server logs from backend."
                    : "No log content from server. Set VITE_BUILD_TIME at build time or add /api/build-info on the backend to expose logs."}
                </CardDescription>
              </div>
              {serverUrl && (
                <a
                  href={serverUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  <ExternalLink className="w-4 h-4" />
                  Backend
                </a>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] w-full rounded-lg border border-slate-200 bg-slate-900/5 p-4">
              <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words">
                {serverLogs || (error ? `Error: ${error}` : "No logs available. Start the backend with: npm run server")}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Help */}
        <Card className="border-slate-200 bg-slate-50/50">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-600">
              <strong>Build time in production:</strong> Set <code className="bg-slate-200 px-1 rounded text-xs">VITE_BUILD_TIME</code> and optionally{" "}
              <code className="bg-slate-200 px-1 rounded text-xs">VITE_APP_VERSION</code> in your build environment (e.g. CI) so they are embedded at <code className="bg-slate-200 px-1 rounded text-xs">npm run build</code>.
              The backend can expose <code className="bg-slate-200 px-1 rounded text-xs">GET /api/build-info</code> to return version and log snippets.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
