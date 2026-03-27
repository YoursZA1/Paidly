/**
 * Logs – Operations audit trail of platform operations.
 * Under Admin → Operations → Logs.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  History,
  DollarSign,
  Edit,
  Plus,
  Search,
  RefreshCw,
  Shield,
  Download,
  Users,
  Lock,
  Database,
  FileText,
  TrendingUp,
  Filter,
  X,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import AuditLogService, { EVENT_TYPES, SEVERITY_LEVELS } from "@/services/AuditLogService";

function LogsAuditTrail() {
  const [logs, setLogs] = useState([]);
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [statistics, setStatistics] = useState(null);
  const [migrated, setMigrated] = useState(false);

  useEffect(() => {
    loadLogs();
    loadStatistics();

    if (!migrated) {
      const result = AuditLogService.migrateLegacyLogs();
      if (result.success && result.count > 0) {
        setMigrated(true);
        loadLogs();
        loadStatistics();
      }
    }

    const handleNewLog = () => {
      loadLogs();
      loadStatistics();
    };

    window.addEventListener("auditEventLogged", handleNewLog);
    return () => window.removeEventListener("auditEventLogged", handleNewLog);
  }, [migrated]);

  const loadLogs = () => {
    setLogs(AuditLogService.getAllLogs());
  };

  const loadStatistics = () => {
    setStatistics(AuditLogService.getStatistics(30));
  };

  const filteredLogs = useMemo(() => {
    return AuditLogService.getLogs({
      type: filterType,
      severity: filterSeverity,
      datePreset: dateFilter !== "all" ? dateFilter : undefined,
      search: searchTerm || undefined,
    });
  }, [filterType, filterSeverity, searchTerm, dateFilter]);

  const handleExport = (format) => {
    AuditLogService.downloadLogs(format, {
      type: filterType,
      severity: filterSeverity,
      datePreset: dateFilter !== "all" ? dateFilter : undefined,
      search: searchTerm || undefined,
    });
  };

  const handleClearFilters = () => {
    setFilterType("all");
    setFilterSeverity("all");
    setSearchTerm("");
    setDateFilter("all");
  };

  const getLogTypeIcon = (type) => {
    const iconClass = "w-4 h-4 text-slate-600";
    switch (type) {
      case EVENT_TYPES.INVOICE_CREATED:
        return <Plus className={iconClass} />;
      case EVENT_TYPES.INVOICE_UPDATED:
        return <Edit className={iconClass} />;
      case EVENT_TYPES.PAYMENT_RECORDED:
        return <DollarSign className={iconClass} />;
      case EVENT_TYPES.STATUS_CHANGED:
        return <RefreshCw className={iconClass} />;
      case EVENT_TYPES.ADMIN_ACTION:
        return <Shield className={iconClass} />;
      case EVENT_TYPES.SECURITY_ALERT:
      case EVENT_TYPES.ACCESS_DENIED:
        return <Lock className={iconClass} />;
      case EVENT_TYPES.USER_LOGIN:
      case EVENT_TYPES.USER_LOGOUT:
        return <Users className={iconClass} />;
      case EVENT_TYPES.DATA_EXPORT:
      case EVENT_TYPES.BACKUP_CREATED:
        return <Database className={iconClass} />;
      default:
        return <History className={iconClass} />;
    }
  };

  const getLogTypeColor = (type) => {
    switch (type) {
      case EVENT_TYPES.INVOICE_CREATED:
        return "bg-green-100 text-green-800 border-green-200";
      case EVENT_TYPES.INVOICE_UPDATED:
        return "bg-primary/15 text-primary border-primary/20";
      case EVENT_TYPES.PAYMENT_RECORDED:
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case EVENT_TYPES.STATUS_CHANGED:
        return "bg-orange-100 text-orange-800 border-orange-200";
      case EVENT_TYPES.ADMIN_ACTION:
        return "bg-purple-100 text-purple-800 border-purple-200";
      case EVENT_TYPES.SECURITY_ALERT:
      case EVENT_TYPES.ACCESS_DENIED:
        return "bg-red-100 text-red-800 border-red-200";
      case EVENT_TYPES.USER_LOGIN:
      case EVENT_TYPES.USER_LOGOUT:
        return "bg-primary/15 text-primary border-primary/20";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const getSeverityBadge = (severity) => {
    const colors = {
      [SEVERITY_LEVELS.LOW]: "bg-slate-100 text-slate-700 border-slate-200",
      [SEVERITY_LEVELS.MEDIUM]: "bg-amber-100 text-amber-800 border-amber-200",
      [SEVERITY_LEVELS.HIGH]: "bg-orange-100 text-orange-800 border-orange-200",
      [SEVERITY_LEVELS.CRITICAL]: "bg-red-100 text-red-800 border-red-200",
    };
    return (
      <Badge variant="outline" className={`text-xs border ${colors[severity] || colors[SEVERITY_LEVELS.LOW]}`}>
        {severity}
      </Badge>
    );
  };

  const logStats = useMemo(() => {
    if (!logs.length) return null;
    return {
      total: logs.length,
      created: logs.filter((l) => l.type === EVENT_TYPES.INVOICE_CREATED).length,
      updated: logs.filter((l) => l.type === EVENT_TYPES.INVOICE_UPDATED).length,
      payments: logs.filter((l) => l.type === EVENT_TYPES.PAYMENT_RECORDED).length,
      statusChanges: logs.filter((l) => l.type === EVENT_TYPES.STATUS_CHANGED).length,
      adminActions: logs.filter((l) => l.type === EVENT_TYPES.ADMIN_ACTION).length,
      security: logs.filter(
        (l) => l.type === EVENT_TYPES.SECURITY_ALERT || l.type === EVENT_TYPES.ACCESS_DENIED
      ).length,
    };
  }, [logs]);

  const hasActiveFilters =
    filterType !== "all" ||
    filterSeverity !== "all" ||
    !!searchTerm ||
    dateFilter !== "all";

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header – Operations style */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
              <History className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Logs</h1>
              <p className="text-sm text-slate-500">
                Operations → Audit trail of platform operations
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")} className="gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("json")} className="gap-2">
              <Download className="w-4 h-4" />
              Export JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => { loadLogs(); loadStatistics(); }} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </div>

        <Tabs defaultValue="logs" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-white border border-slate-200">
            <TabsTrigger value="logs" className="gap-2">
              <FileText className="w-4 h-4" />
              Audit logs
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              Statistics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-4">
            {/* Stats row */}
            {logStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: "Total", value: logStats.total, className: "text-slate-900" },
                  { label: "Created", value: logStats.created, className: "text-green-600" },
                  { label: "Updated", value: logStats.updated, className: "text-primary" },
                  { label: "Payments", value: logStats.payments, className: "text-emerald-600" },
                  { label: "Status", value: logStats.statusChanges, className: "text-orange-600" },
                  { label: "Admin", value: logStats.adminActions, className: "text-purple-600" },
                  { label: "Security", value: logStats.security, className: "text-red-600" },
                ].map(({ label, value, className }) => (
                  <Card key={label} className="border-slate-200">
                    <CardContent className="p-3">
                      <p className="text-xs font-medium text-slate-500">{label}</p>
                      <p className={`text-lg font-bold ${className}`}>{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Filters */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filters & search
                  </CardTitle>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={handleClearFilters} className="gap-2">
                      <X className="w-4 h-4" />
                      Clear
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="audit-filter-event-type" className="text-sm font-medium text-slate-700">Event type</label>
                    <select
                      id="audit-filter-event-type"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                    >
                      <option value="all">All events</option>
                      <option value={EVENT_TYPES.INVOICE_CREATED}>Invoice created</option>
                      <option value={EVENT_TYPES.INVOICE_UPDATED}>Invoice updated</option>
                      <option value={EVENT_TYPES.PAYMENT_RECORDED}>Payment recorded</option>
                      <option value={EVENT_TYPES.STATUS_CHANGED}>Status changed</option>
                      <option value={EVENT_TYPES.ADMIN_ACTION}>Admin action</option>
                      <option value={EVENT_TYPES.SECURITY_ALERT}>Security alert</option>
                      <option value={EVENT_TYPES.USER_LOGIN}>User login</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="audit-filter-severity" className="text-sm font-medium text-slate-700">Severity</label>
                    <select
                      id="audit-filter-severity"
                      value={filterSeverity}
                      onChange={(e) => setFilterSeverity(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                    >
                      <option value="all">All</option>
                      <option value={SEVERITY_LEVELS.LOW}>Low</option>
                      <option value={SEVERITY_LEVELS.MEDIUM}>Medium</option>
                      <option value={SEVERITY_LEVELS.HIGH}>High</option>
                      <option value={SEVERITY_LEVELS.CRITICAL}>Critical</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="audit-filter-date-range" className="text-sm font-medium text-slate-700">Date range</label>
                    <select
                      id="audit-filter-date-range"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                    >
                      <option value="all">All time</option>
                      <option value="today">Today</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="week">Last 7 days</option>
                      <option value="month">Last 30 days</option>
                      <option value="3months">Last 90 days</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="audit-filter-search" className="text-sm font-medium text-slate-700">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="audit-filter-search"
                        placeholder="Search logs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Log list */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Audit log entries</CardTitle>
                  <span className="text-sm text-slate-500">
                    {filteredLogs.length} of {logs.length} events
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {filteredLogs.length > 0 ? (
                  <div className="space-y-3">
                    {filteredLogs.slice(0, 100).map((log) => (
                      <div
                        key={log.id}
                        className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50/80 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-1 shrink-0">{getLogTypeIcon(log.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="font-medium text-slate-900">{log.action}</span>
                              <Badge className={`text-xs border ${getLogTypeColor(log.type)}`}>
                                {log.type}
                              </Badge>
                              {getSeverityBadge(log.severity)}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                              {(log.entityName || log.entityType) && (
                                <div>
                                  <p className="text-slate-500">{log.entityType || "Entity"}</p>
                                  <p className="font-medium text-slate-900 truncate">{log.entityName || log.entityId || "—"}</p>
                                </div>
                              )}
                              {log.clientName && (
                                <div>
                                  <p className="text-slate-500">Client</p>
                                  <p className="font-medium text-slate-900 truncate">{log.clientName}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-slate-500">Performed by</p>
                                <p className="font-medium text-slate-900 truncate">{log.performedBy || log.userName || "System"}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Time</p>
                                <p className="font-medium text-slate-900">
                                  {new Date(log.timestamp).toLocaleString()}
                                </p>
                              </div>
                              {log.amount != null && (
                                <div>
                                  <p className="text-slate-500">Amount</p>
                                  <p className="font-medium text-slate-900">
                                    {log.currency || "ZAR"}{" "}
                                    {typeof log.amount === "number" ? log.amount.toFixed(2) : log.amount}
                                  </p>
                                </div>
                              )}
                            </div>
                            {log.details && Object.keys(log.details).length > 0 && (
                              <details className="mt-2 bg-slate-100 rounded-md border border-slate-200 p-2">
                                <summary className="text-xs font-medium text-slate-600 cursor-pointer">
                                  View details
                                </summary>
                                <pre className="text-xs overflow-x-auto mt-2 p-2 rounded bg-white">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredLogs.length > 100 && (
                      <p className="text-center text-sm text-slate-500 py-3">
                        Showing first 100 of {filteredLogs.length}. Narrow filters to see fewer.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
                    <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-600">No audit events match your filters</p>
                    {hasActiveFilters ? (
                      <p className="text-sm text-slate-500 mt-1">Try clearing filters</p>
                    ) : (
                      <p className="text-sm text-slate-500 mt-1">Events appear as operations occur</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            {statistics ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-slate-600">Total events (30 days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-slate-900">{statistics.totalEvents}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-slate-600">Critical events</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-red-600">
                        {statistics.bySeverity?.[SEVERITY_LEVELS.CRITICAL] ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-slate-600">Peak day</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-slate-900">
                        {statistics.dailyActivity?.length
                          ? Math.max(...statistics.dailyActivity.map((d) => d.count), 0)
                          : 0}{" "}
                        events
                      </p>
                    </CardContent>
                  </Card>
                </div>
                {statistics.topUsers?.length > 0 && (
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Top users (30 days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {statistics.topUsers.slice(0, 10).map((entry, i) => (
                          <li
                            key={i}
                            className="flex justify-between items-center py-2 px-3 rounded-lg bg-slate-50 border border-slate-100"
                          >
                            <span className="font-medium text-slate-900">{entry.user}</span>
                            <span className="text-sm text-slate-500">{entry.count} events</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card className="border-slate-200">
                <CardContent className="py-12 text-center text-slate-500">
                  No statistics yet. Logs will generate stats as events are recorded.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Info + Related */}
        <Card className="border-slate-200 bg-slate-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-slate-600" />
              About this audit trail
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>
              Logs include: invoice created/updated/deleted/sent/viewed, payments recorded/updated/refunded,
              user login/logout and admin actions, security alerts, data exports and backups. Retention: 365 days
              (max 10,000 entries). Export to CSV/JSON for archival.
            </p>
            <div className="pt-2 border-t border-slate-200">
              <p className="text-slate-500 mb-2">Related:</p>
              <ul className="flex flex-wrap gap-3">
                <li>
                  <a href="/admin/system-status" className="text-primary hover:underline inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    System status
                  </a>
                </li>
                <li>
                  <a href="/admin/background-jobs" className="text-primary hover:underline inline-flex items-center gap-1">
                    Background jobs
                  </a>
                </li>
                <li>
                  <a href="/admin/support-tools" className="text-primary hover:underline inline-flex items-center gap-1">
                    Support & admin tools
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default LogsAuditTrail;
