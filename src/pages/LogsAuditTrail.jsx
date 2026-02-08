import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  History, DollarSign, Edit, Plus, Search, RefreshCw, Shield, 
  Download, Users, Lock, Database, FileText,
  TrendingUp, Filter, X
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

    // Migrate legacy logs on first load
    if (!migrated) {
      const result = AuditLogService.migrateLegacyLogs();
      if (result.success && result.count > 0) {
        setMigrated(true);
        loadLogs();
        loadStatistics();
      }
    }

    // Listen for new audit logs
    const handleNewLog = () => {
      loadLogs();
      loadStatistics();
    };

    window.addEventListener("auditEventLogged", handleNewLog);
    return () => window.removeEventListener("auditEventLogged", handleNewLog);
  }, [migrated]);

  const loadLogs = () => {
    const allLogs = AuditLogService.getAllLogs();
    setLogs(allLogs);
  };

  const loadStatistics = () => {
    const stats = AuditLogService.getStatistics(30);
    setStatistics(stats);
  };

  const filteredLogs = useMemo(() => {
    const filters = {
      type: filterType,
      severity: filterSeverity,
      datePreset: dateFilter !== 'all' ? dateFilter : undefined,
      search: searchTerm || undefined
    };
    return AuditLogService.getLogs(filters);
  }, [filterType, filterSeverity, searchTerm, dateFilter]);

  const handleExport = (format) => {
    const filters = {
      type: filterType,
      severity: filterSeverity,
      datePreset: dateFilter !== 'all' ? dateFilter : undefined,
      search: searchTerm || undefined
    };
    AuditLogService.downloadLogs(format, filters);
  };

  const handleClearFilters = () => {
    setFilterType('all');
    setFilterSeverity('all');
    setSearchTerm('');
    setDateFilter('all');
  };

  const getLogTypeIcon = (type) => {
    switch (type) {
      case EVENT_TYPES.INVOICE_CREATED:
        return <Plus className="w-4 h-4" />;
      case EVENT_TYPES.INVOICE_UPDATED:
        return <Edit className="w-4 h-4" />;
      case EVENT_TYPES.PAYMENT_RECORDED:
        return <DollarSign className="w-4 h-4" />;
      case EVENT_TYPES.STATUS_CHANGED:
        return <RefreshCw className="w-4 h-4" />;
      case EVENT_TYPES.ADMIN_ACTION:
        return <Shield className="w-4 h-4" />;
      case EVENT_TYPES.SECURITY_ALERT:
      case EVENT_TYPES.ACCESS_DENIED:
        return <Lock className="w-4 h-4" />;
      case EVENT_TYPES.USER_LOGIN:
      case EVENT_TYPES.USER_LOGOUT:
        return <Users className="w-4 h-4" />;
      case EVENT_TYPES.DATA_EXPORT:
      case EVENT_TYPES.BACKUP_CREATED:
        return <Database className="w-4 h-4" />;
      default:
        return <History className="w-4 h-4" />;
    }
  };

  const getLogTypeColor = (type) => {
    switch (type) {
      case EVENT_TYPES.INVOICE_CREATED:
        return "bg-green-100 text-green-800";
      case EVENT_TYPES.INVOICE_UPDATED:
        return "bg-blue-100 text-blue-800";
      case EVENT_TYPES.PAYMENT_RECORDED:
        return "bg-emerald-100 text-emerald-800";
      case EVENT_TYPES.STATUS_CHANGED:
        return "bg-orange-100 text-orange-800";
      case EVENT_TYPES.ADMIN_ACTION:
        return "bg-purple-100 text-purple-800";
      case EVENT_TYPES.SECURITY_ALERT:
      case EVENT_TYPES.ACCESS_DENIED:
        return "bg-red-100 text-red-800";
      case EVENT_TYPES.USER_LOGIN:
      case EVENT_TYPES.USER_LOGOUT:
        return "bg-indigo-100 text-indigo-800";
      default:
        return "bg-slate-100 text-slate-800";
    }
  };

  const getSeverityBadge = (severity) => {
    const colors = {
      [SEVERITY_LEVELS.LOW]: 'bg-slate-100 text-slate-800',
      [SEVERITY_LEVELS.MEDIUM]: 'bg-yellow-100 text-yellow-800',
      [SEVERITY_LEVELS.HIGH]: 'bg-orange-100 text-orange-800',
      [SEVERITY_LEVELS.CRITICAL]: 'bg-red-100 text-red-800'
    };
    return (
      <Badge className={`text-xs ${colors[severity] || colors.low}`}>
        {severity}
      </Badge>
    );
  };

  const logStats = useMemo(() => {
    if (!statistics) return null;
    return {
      total: logs.length,
      created: logs.filter(l => l.type === EVENT_TYPES.INVOICE_CREATED).length,
      updated: logs.filter(l => l.type === EVENT_TYPES.INVOICE_UPDATED).length,
      payments: logs.filter(l => l.type === EVENT_TYPES.PAYMENT_RECORDED).length,
      statusChanges: logs.filter(l => l.type === EVENT_TYPES.STATUS_CHANGED).length,
      adminActions: logs.filter(l => l.type === EVENT_TYPES.ADMIN_ACTION).length,
      security: logs.filter(l => 
        l.type === EVENT_TYPES.SECURITY_ALERT || 
        l.type === EVENT_TYPES.ACCESS_DENIED
      ).length
    };
  }, [logs, statistics]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <History className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-slate-900">Logs & Audit Trail</h1>
                  <p className="text-slate-600">Complete audit trail of all platform operations</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleExport('csv')} variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
              <Button onClick={() => handleExport('json')} variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Export JSON
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="logs" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-white shadow-sm">
            <TabsTrigger value="logs" className="gap-2">
              <FileText className="w-4 h-4" />
              Audit Logs
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              Statistics
            </TabsTrigger>
          </TabsList>

          {/* Audit Logs Tab */}
          <TabsContent value="logs"  className="space-y-6">
            {/* Statistics Cards */}
            {logStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-slate-600">Total</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-slate-900">{logStats.total}</div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-slate-600">Created</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{logStats.created}</div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-slate-600">Updated</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{logStats.updated}</div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-slate-600">Payments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-emerald-600">{logStats.payments}</div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-slate-600">Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">{logStats.statusChanges}</div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-slate-600">Admin</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">{logStats.adminActions}</div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-slate-600">Security</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{logStats.security}</div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Filters */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="border-b flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Filters & Search
                </CardTitle>
                {(filterType !== 'all' || filterSeverity !== 'all' || searchTerm || dateFilter !== 'all') && (
                  <Button variant="ghost" size="sm" onClick={handleClearFilters} className="gap-2">
                    <X className="w-4 h-4" />
                    Clear Filters
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Event Type</label>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Events</option>
                      <option value={EVENT_TYPES.INVOICE_CREATED}>Invoice Created</option>
                      <option value={EVENT_TYPES.INVOICE_UPDATED}>Invoice Updated</option>
                      <option value={EVENT_TYPES.PAYMENT_RECORDED}>Payment Recorded</option>
                      <option value={EVENT_TYPES.STATUS_CHANGED}>Status Changed</option>
                      <option value={EVENT_TYPES.ADMIN_ACTION}>Admin Action</option>
                      <option value={EVENT_TYPES.SECURITY_ALERT}>Security Alert</option>
                      <option value={EVENT_TYPES.USER_LOGIN}>User Login</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Severity</label>
                    <select
                      value={filterSeverity}
                      onChange={(e) => setFilterSeverity(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Severities</option>
                      <option value={SEVERITY_LEVELS.LOW}>Low</option>
                      <option value={SEVERITY_LEVELS.MEDIUM}>Medium</option>
                      <option value={SEVERITY_LEVELS.HIGH}>High</option>
                      <option value={SEVERITY_LEVELS.CRITICAL}>Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Date Range</label>
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="week">Last 7 Days</option>
                      <option value="month">Last 30 Days</option>
                      <option value="3months">Last 90 Days</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search logs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Audit Log Entries */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle>Audit Log Entries</CardTitle>
                  <p className="text-sm text-slate-600">
                    Showing {filteredLogs.length} of {logs.length} events
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {filteredLogs.length > 0 ? (
                  <div className="space-y-3">
                    {filteredLogs.slice(0, 100).map((log) => (
                      <div
                        key={log.id}
                        className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="mt-1">{getLogTypeIcon(log.type)}</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <h4 className="font-semibold text-slate-900">{log.action}</h4>
                                <Badge className={`text-xs ${getLogTypeColor(log.type)}`}>
                                  {log.type}
                                </Badge>
                                {getSeverityBadge(log.severity)}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-3">
                                {log.entityName && (
                                  <div>
                                    <p className="text-slate-500">{log.entityType || 'Entity'}</p>
                                    <p className="font-medium text-slate-900">{log.entityName}</p>
                                  </div>
                                )}

                                {log.clientName && (
                                  <div>
                                    <p className="text-slate-500">Client</p>
                                    <p className="font-medium text-slate-900">{log.clientName}</p>
                                  </div>
                                )}

                                {log.amount && (
                                  <div>
                                    <p className="text-slate-500">Amount</p>
                                    <p className="font-medium text-slate-900">
                                      {log.currency || 'ZAR'} {typeof log.amount === "number" ? log.amount.toFixed(2) : log.amount}
                                    </p>
                                  </div>
                                )}

                                <div>
                                  <p className="text-slate-500">Performed By</p>
                                  <p className="font-medium text-slate-900">{log.performedBy || log.userName || 'System'}</p>
                                </div>

                                <div>
                                  <p className="text-slate-500">Timestamp</p>
                                  <p className="font-medium text-slate-900">
                                    {new Date(log.timestamp).toLocaleDateString()}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                  </p>
                                </div>
                              </div>

                              {log.details && Object.keys(log.details).length > 0 && (
                                <details className="bg-slate-100 rounded border border-slate-200 p-3">
                                  <summary className="text-xs font-semibold text-slate-700 cursor-pointer">
                                    View Details
                                  </summary>
                                  <div className="text-sm space-y-1 mt-2">
                                    <pre className="text-xs overflow-x-auto">
                                      {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                  </div>
                                </details>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredLogs.length > 100 && (
                      <div className="text-center text-sm text-slate-600 py-4">
                        Showing first 100 of {filteredLogs.length} results. Use filters to narrow down results.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
                    <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600">No audit events found</p>
                    {searchTerm || filterType !== "all" || dateFilter !== "all" ? (
                      <p className="text-sm text-slate-500 mt-2">Try adjusting your filters</p>
                    ) : (
                      <p className="text-sm text-slate-500 mt-2">Events will appear as operations occur</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Statistics Tab */}
          <TabsContent value="stats" className="space-y-6">
            {statistics && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Total Events (30 days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-4xl font-bold text-indigo-600">{statistics.totalEvents}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Critical Events</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-4xl font-bold text-red-600">
                        {statistics.bySeverity[SEVERITY_LEVELS.CRITICAL] || 0}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Top Activity Day</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-slate-900">
                        {statistics.dailyActivity.sort((a, b) => b.count - a.count)[0]?.count || 0} events
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Users (Last 30 Days)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {statistics.topUsers.slice(0, 10).map((entry, index) => (
                        <div key={index} className="flex justify-between items-center p-2 rounded bg-slate-50">
                          <span className="font-medium">{entry.user}</span>
                          <span className="text-slate-600">{entry.count} events</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Audit Trail Info */}
        <Card className="border-slate-200 bg-blue-50 shadow-sm mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-blue-900">Audit Trail Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-blue-800">
            <p className="mb-3">
              This unified audit trail automatically logs all platform operations including:
            </p>
            <ul className="mt-2 ml-4 list-disc space-y-1">
              <li><strong>Invoice Operations:</strong> Created, updated, deleted, sent, viewed</li>
              <li><strong>Payment Operations:</strong> Recorded, updated, refunded</li>
              <li><strong>User Operations:</strong> Login, logout, created, suspended, activated</li>
              <li><strong>Admin Actions:</strong> Plan changes, settings modified, role assignments</li>
              <li><strong>Security Events:</strong> Access denied, permission changes, alerts</li>
              <li><strong>Compliance Events:</strong> Data access, exports, backups</li>
            </ul>
            <p className="mt-3">
              <strong>Retention:</strong> Logs are retained for 365 days (max 10,000 entries). Export to CSV/JSON for long-term archival.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default LogsAuditTrail;
