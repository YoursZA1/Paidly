import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Client, Invoice, Quote, Task } from "@/api/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Plus,
  Upload,
} from "lucide-react";
import { formatCurrency } from "@/components/CurrencySelector";
import { cn } from "@/lib/utils";
import TaskCard from "@/components/calendar/TaskCard";
import TaskForm from "@/components/calendar/TaskForm";
import TaskNotificationService from "@/components/calendar/TaskNotificationService";
import { csvRowToTaskPayload, parseTaskCsv, tasksToCsv } from "@/utils/taskCsvMapping";
import { useAuth } from "@/contexts/AuthContext";

const DAYS_HEADER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "in_progress") return "in_progress";
  if (value === "completed") return "completed";
  return "pending";
}

export default function CalendarPage() {
  const { toast } = useToast();
  const { profile } = useAuth();

  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState(null);
  const [layoutView, setLayoutView] = useState("calendar"); // calendar | timeline
  const [isContextPanelCollapsed, setIsContextPanelCollapsed] = useState(false);

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isExportingTasks, setIsExportingTasks] = useState(false);
  const [isImportingTasks, setIsImportingTasks] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const taskFileInputRef = useRef(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [invoicesData, quotesData, tasksData, clientsData] = await Promise.all([
        Invoice.list("-delivery_date"),
        Quote.list("-valid_until"),
        Task.list("-due_date"),
        Client.list(),
      ]);

      setInvoices(invoicesData || []);
      setQuotes(quotesData || []);
      setTasks(tasksData || []);
      setClients(clientsData || []);
      if (profile?.id) {
        TaskNotificationService.checkAndSendDueReminders(tasksData || [], profile.id);
      }
    } catch (error) {
      console.error("Error loading calendar data:", error);
      toast({
        title: "Could not load calendar data",
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getClientName = (clientId) => clients.find((c) => c.id === clientId)?.name || "Client";

  const getInvoicesForDate = useCallback((date) =>
    invoices.filter((invoice) => {
      const raw = invoice.due_date || invoice.delivery_date;
      if (!raw) return false;
      try {
        return isSameDay(parseISO(raw), date);
      } catch {
        return false;
      }
    }), [invoices]);

  const getQuotesForDate = useCallback((date) =>
    quotes.filter((quote) => {
      if (!quote.valid_until) return false;
      try {
        return isSameDay(parseISO(quote.valid_until), date);
      } catch {
        return false;
      }
    }), [quotes]);

  const getTasksForDate = useCallback((date) =>
    tasks.filter((task) => {
      if (!task.due_date) return false;
      try {
        return isSameDay(parseISO(task.due_date), date);
      } catch {
        return false;
      }
    }), [tasks]);

  const getPaymentMarkersForDate = useCallback(
    (date) => getInvoicesForDate(date).filter((invoice) => String(invoice.status || "").toLowerCase() === "paid"),
    [getInvoicesForDate]
  );

  const selectedInvoices = useMemo(() => getInvoicesForDate(selectedDate), [getInvoicesForDate, selectedDate]);
  const selectedQuotes = useMemo(() => getQuotesForDate(selectedDate), [getQuotesForDate, selectedDate]);
  const selectedTasks = useMemo(() => getTasksForDate(selectedDate), [getTasksForDate, selectedDate]);
  const selectedDueAmount = useMemo(
    () =>
      selectedInvoices
        .filter((inv) => String(inv.status || "").toLowerCase() !== "paid")
        .reduce((sum, inv) => sum + (Number(inv.total_amount ?? inv.grand_total ?? 0) || 0), 0),
    [selectedInvoices]
  );

  const daysInGrid = useMemo(() => {
    const start = startOfMonth(viewMonth);
    const end = endOfMonth(viewMonth);
    const days = eachDayOfInterval({ start, end });
    const pad = getDay(start);

    const cells = [];
    for (let i = 0; i < pad; i += 1) cells.push(null);
    days.forEach((d) => cells.push(d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const next7DaysTimeline = useMemo(() => {
    const start = startOfDay(new Date());
    const end = addDays(start, 7);
    const result = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      const invoicesForDate = getInvoicesForDate(cursor);
      const tasksForDate = getTasksForDate(cursor);
      const quotesForDate = getQuotesForDate(cursor);
      if (!invoicesForDate.length && !tasksForDate.length && !quotesForDate.length) continue;

      result.push({
        date: cursor,
        invoices: invoicesForDate,
        tasks: tasksForDate,
        quotes: quotesForDate,
      });
    }
    return result;
  }, [getInvoicesForDate, getQuotesForDate, getTasksForDate]);

  const timelineRows = useMemo(() => {
    const start = startOfMonth(viewMonth);
    const end = endOfMonth(viewMonth);
    const rows = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      const dayInvoices = getInvoicesForDate(cursor);
      const dayQuotes = getQuotesForDate(cursor);
      const dayTasks = getTasksForDate(cursor);
      if (!dayInvoices.length && !dayQuotes.length && !dayTasks.length) continue;

      rows.push({
        date: cursor,
        invoices: dayInvoices,
        quotes: dayQuotes,
        tasks: dayTasks,
      });
    }
    return rows;
  }, [viewMonth, getInvoicesForDate, getQuotesForDate, getTasksForDate]);

  const topLevelTasks = useMemo(() => tasks.filter((task) => !task.parent_task_id), [tasks]);
  const filteredTasksByDate = useMemo(() => {
    return topLevelTasks.filter((task) => {
      if (!task.due_date) return false;
      try {
        return isSameDay(parseISO(task.due_date), selectedDate);
      } catch {
        return false;
      }
    });
  }, [topLevelTasks, selectedDate]);

  const kanbanColumns = useMemo(
    () => ({
      pending: filteredTasksByDate.filter((t) => normalizeStatus(t.status) === "pending"),
      in_progress: filteredTasksByDate.filter((t) => normalizeStatus(t.status) === "in_progress"),
      completed: filteredTasksByDate.filter((t) => normalizeStatus(t.status) === "completed"),
    }),
    [filteredTasksByDate]
  );

  const openTaskForm = (preset = null) => {
    setEditingTask(preset);
    setShowTaskForm(true);
  };

  const handleSaveTask = async (taskData) => {
    try {
      if (editingTask?.id) {
        await Task.update(editingTask.id, taskData);
      } else {
        await Task.create(taskData);
      }
      setShowTaskForm(false);
      setEditingTask(null);
      await loadData();
    } catch (error) {
      toast({
        title: "Task save failed",
        description: error?.message || "Could not save task.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTask = async (task) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      await Task.delete(task.id);
      await loadData();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error?.message || "Could not delete task.",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (task, newStatus) => {
    try {
      await Task.update(task.id, {
        ...task,
        status: newStatus,
        completed_date: newStatus === "completed" ? new Date().toISOString() : null,
      });
      await loadData();
    } catch (error) {
      toast({
        title: "Status update failed",
        description: error?.message || "Could not update task status.",
        variant: "destructive",
      });
    }
  };

  const handleDropToColumn = async (targetStatus) => {
    if (!draggingTaskId) return;
    const task = topLevelTasks.find((t) => t.id === draggingTaskId);
    if (!task) return;
    await handleStatusChange(task, targetStatus);
    setDraggingTaskId(null);
  };

  const handleExportTaskCsv = async () => {
    setIsExportingTasks(true);
    try {
      const list = await Task.list("-due_date");
      if (!list?.length) {
        toast({ title: "No tasks to export", variant: "destructive" });
        return;
      }
      const csv = tasksToCsv(list);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Task_export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Export failed",
        description: error?.message || "Failed to export.",
        variant: "destructive",
      });
    } finally {
      setIsExportingTasks(false);
    }
  };

  const handleImportTaskCsv = (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setIsImportingTasks(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result ?? "";
        const { headers, rows } = parseTaskCsv(text);
        if (!headers?.length || !rows?.length) {
          toast({
            title: "Import failed",
            description: "CSV is empty or invalid.",
            variant: "destructive",
          });
          return;
        }

        for (const row of rows) {
          const payload = csvRowToTaskPayload(headers, row);
          if (payload.title) await Task.create(payload);
        }
        await loadData();
      } catch (error) {
        toast({
          title: "Import failed",
          description: error?.message || "Could not parse CSV.",
          variant: "destructive",
        });
      } finally {
        setIsImportingTasks(false);
        if (taskFileInputRef.current) taskFileInputRef.current.value = "";
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  if (isLoading) {
    return (
      <div className="min-h-0 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="responsive-page-shell py-4 lg:py-6">
          <Skeleton className="h-8 w-48 rounded-xl mb-4" />
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)] gap-4">
            <Skeleton className="h-[420px] rounded-2xl" />
            <Skeleton className="h-[420px] rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 bg-slate-50/50 dark:bg-slate-900/50">
      <div className="responsive-page-shell py-4 lg:py-6 space-y-4">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="truncate font-display text-xl font-semibold tracking-tight text-foreground">
            Calendar & Tasks
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center rounded-xl border border-border bg-muted/40 p-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2.5 rounded-lg text-xs font-medium",
                  layoutView === "timeline" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                )}
                onClick={() => setLayoutView("timeline")}
              >
                Timeline
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2.5 rounded-lg text-xs font-medium",
                  layoutView === "calendar" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                )}
                onClick={() => setLayoutView("calendar")}
              >
                Calendar
              </Button>
            </div>
            <Button size="sm" onClick={() => openTaskForm(null)} className="h-8 rounded-xl text-xs font-medium gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Add Task
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl text-xs font-medium"
              onClick={() =>
                openTaskForm({
                  title: "",
                  due_date: format(selectedDate, "yyyy-MM-dd"),
                  category: "meeting",
                  status: "pending",
                })
              }
            >
              Add Event
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-xl text-xs font-medium xl:hidden"
              onClick={() => setIsContextPanelCollapsed((v) => !v)}
            >
              {isContextPanelCollapsed ? "Show Details" : "Hide Details"}
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)] gap-4">
          <div className="space-y-3 min-w-0">
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-sm font-medium tracking-tight">{format(viewMonth, "MMMM yyyy")}</h2>
                <div className="flex items-center gap-0.5">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewMonth((v) => subMonths(v, 1))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewMonth((v) => addMonths(v, 1))}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {layoutView === "calendar" ? (
                <div className="overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-7 border-b border-border bg-muted/20">
                      {DAYS_HEADER.map((day) => (
                        <div key={day} className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-medium text-muted-foreground/70 text-center">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-px bg-border/50">
                      {daysInGrid.map((date, idx) => {
                        if (!date) return <div key={`empty-${idx}`} className="min-h-[84px] bg-card/70" />;
                        const dayInvoices = getInvoicesForDate(date);
                        const dayTasks = getTasksForDate(date);
                        const dayPaid = getPaymentMarkersForDate(date);
                        const dayQuotes = getQuotesForDate(date);
                        const topPreviewItems = [
                          ...dayInvoices.map((inv) => ({
                            key: `inv-${inv.id}`,
                            label: `Invoice #${inv.invoice_number || inv.id?.slice?.(0, 6) || ""}`,
                          })),
                          ...dayTasks.map((task) => ({
                            key: `task-${task.id}`,
                            label: task.title || "Task",
                          })),
                          ...dayQuotes.map((quote) => ({
                            key: `quote-${quote.id}`,
                            label: `Quote #${quote.quote_number || quote.id?.slice?.(0, 6) || ""}`,
                          })),
                        ].slice(0, 2);
                        const dueAmountPreview = dayInvoices
                          .filter((inv) => String(inv.status || "").toLowerCase() !== "paid")
                          .reduce((sum, inv) => sum + (Number(inv.total_amount ?? inv.grand_total ?? 0) || 0), 0);
                        const isSelected = isSameDay(date, selectedDate);
                        const hovered = hoveredDate && isSameDay(date, hoveredDate);
                        const dayCount = dayInvoices.length + dayTasks.length + dayQuotes.length;
                        const showDayPreview = hovered && dayCount > 0;

                        return (
                          <div
                            key={date.toISOString()}
                            className={cn(
                              "group relative min-h-[84px] bg-card p-1.5 transition-colors cursor-pointer",
                              isSelected && "bg-orange-50 dark:bg-orange-950/40 ring-1 ring-inset ring-orange-200 dark:ring-orange-800",
                              isToday(date) && !isSelected && "bg-muted/25",
                              "hover:bg-muted/20"
                            )}
                            onMouseEnter={() => setHoveredDate(date)}
                            onMouseLeave={() => setHoveredDate(null)}
                            onClick={() => setSelectedDate(date)}
                          >
                            <div className="flex items-start justify-between">
                              <span
                                className={cn(
                                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                                  isToday(date) ? "bg-primary text-primary-foreground" : "text-foreground"
                                )}
                              >
                                {format(date, "d")}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDate(date);
                                  openTaskForm({
                                    title: "",
                                    due_date: format(date, "yyyy-MM-dd"),
                                    status: "pending",
                                  });
                                }}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>

                            <div className="mt-1 space-y-0.5">
                              {dayInvoices.length > 0 && (
                                <Badge className="bg-orange-500/12 text-orange-700 border-transparent text-[10px] px-1.5 py-0 font-medium">
                                  {dayInvoices.length} invoice{dayInvoices.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                              {dayTasks.length > 0 && (
                                <Badge className="bg-blue-500/12 text-blue-700 border-transparent text-[10px] px-1.5 py-0 font-medium">
                                  {dayTasks.length} task{dayTasks.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                              {dayPaid.length > 0 && (
                                <Badge className="bg-emerald-500/12 text-emerald-700 border-transparent text-[10px] px-1.5 py-0 font-medium">
                                  {dayPaid.length} payment{dayPaid.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>

                            {showDayPreview ? (
                              <div className="pointer-events-none absolute left-1.5 right-1.5 bottom-1.5 rounded-lg border border-border bg-background/95 shadow-sm px-2 py-1.5 space-y-0.5 z-10">
                                <p className="text-[10px] font-medium text-foreground truncate">{format(date, "EEE, d MMM")}</p>
                                {topPreviewItems.map((item) => (
                                  <p key={item.key} className="text-[10px] text-muted-foreground truncate">
                                    {item.label}
                                  </p>
                                ))}
                                {dueAmountPreview > 0 ? (
                                  <p className="text-[10px] font-medium text-orange-700">
                                    Due: {formatCurrency(dueAmountPreview, "ZAR", 0)}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {timelineRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                      <p className="text-sm text-muted-foreground">No timeline activity for this month.</p>
                    </div>
                  ) : (
                    timelineRows.map((row) => (
                      <button
                        key={row.date.toISOString()}
                        className="w-full text-left rounded-xl border border-border px-3 py-2 hover:bg-muted/20 transition-colors"
                        onClick={() => {
                          setSelectedDate(row.date);
                          setLayoutView("calendar");
                        }}
                      >
                        <p className="text-sm font-medium">{format(row.date, "EEE, d MMM")}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {row.invoices.length} invoices · {row.tasks.length} tasks · {row.quotes.length} events
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm px-4 py-3">
              <h3 className="text-sm font-medium mb-2">Next 7 days</h3>
              {next7DaysTimeline.length === 0 ? (
                <p className="text-xs text-muted-foreground">No activity scheduled in the next 7 days.</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {next7DaysTimeline.map((slot) => (
                    <button
                      key={slot.date.toISOString()}
                      className="shrink-0 min-w-[148px] rounded-xl border border-border px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                      onClick={() => setSelectedDate(slot.date)}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{format(slot.date, "EEE")}</p>
                      <p className="text-sm font-medium">{format(slot.date, "d MMM")}</p>
                      <div className="mt-1.5 space-y-0.5 text-[11px]">
                        <p className="text-orange-700">{slot.invoices.length} invoices</p>
                        <p className="text-blue-700">{slot.tasks.length} tasks</p>
                        <p className="text-emerald-700">{slot.invoices.filter((i) => String(i.status || "").toLowerCase() === "paid").length} payments</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside
            className={cn(
              "rounded-2xl border border-border bg-card shadow-sm p-4 xl:sticky xl:top-24 self-start",
              isContextPanelCollapsed ? "hidden xl:block" : "block"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Selected date</h3>
              <span className="text-[11px] text-muted-foreground">{format(selectedDate, "d MMM yyyy")}</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <div className="rounded-xl bg-orange-500/10 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Due</p>
                <p className="text-sm font-semibold tabular-nums text-orange-700">{formatCurrency(selectedDueAmount, "ZAR", 0)}</p>
              </div>
              <div className="rounded-xl bg-blue-500/10 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tasks</p>
                <p className="text-sm font-semibold tabular-nums text-blue-700">{selectedTasks.length}</p>
              </div>
              <div className="rounded-xl bg-emerald-500/10 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Events</p>
                <p className="text-sm font-semibold tabular-nums text-emerald-700">{selectedQuotes.length + selectedInvoices.length}</p>
              </div>
            </div>

            <div className="mt-3 space-y-2 max-h-[360px] overflow-auto pr-1">
              {selectedInvoices.length === 0 && selectedTasks.length === 0 && selectedQuotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-3 py-5 text-center">
                  <CalendarIcon className="w-6 h-6 mx-auto text-muted-foreground/70 mb-1.5" />
                  <p className="text-sm font-medium">No activity</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Add a task or event for this day.</p>
                  <Button
                    size="sm"
                    className="mt-3 h-8 rounded-xl text-xs font-medium"
                    onClick={() =>
                      openTaskForm({
                        title: "",
                        due_date: format(selectedDate, "yyyy-MM-dd"),
                        status: "pending",
                      })
                    }
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add item
                  </Button>
                </div>
              ) : (
                <>
                  {selectedInvoices.map((invoice) => (
                    <div key={`inv-${invoice.id}`} className="rounded-xl border border-border px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">Invoice #{invoice.invoice_number}</p>
                        <Badge className="bg-orange-500/12 text-orange-700 border-transparent text-[10px] font-medium">Due</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{getClientName(invoice.client_id)}</p>
                      <p className="text-xs font-medium tabular-nums mt-1.5">{formatCurrency(invoice.total_amount ?? invoice.grand_total ?? 0, "ZAR")}</p>
                    </div>
                  ))}
                  {selectedTasks.map((task) => (
                    <div key={`task-${task.id}`} className="rounded-xl border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <Badge className="bg-blue-500/12 text-blue-700 border-transparent capitalize text-[10px] font-medium">
                          {normalizeStatus(task.status).replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {selectedQuotes.map((quote) => (
                    <div key={`q-${quote.id}`} className="rounded-xl border border-border px-3 py-2">
                      <p className="text-sm font-medium">Quote #{quote.quote_number}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Expires on selected date</p>
                    </div>
                  ))}
                </>
              )}
            </div>

            {selectedInvoices.length > 0 || selectedTasks.length > 0 || selectedQuotes.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3 h-8 rounded-xl text-xs font-medium"
                onClick={() =>
                  openTaskForm({
                    title: "",
                    due_date: format(selectedDate, "yyyy-MM-dd"),
                    status: "pending",
                  })
                }
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add item
              </Button>
            ) : null}
          </aside>
        </section>

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="px-4 py-3 border-b border-border flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">Task management</h3>
              <p className="text-[11px] text-muted-foreground">
                Tasks due {format(selectedDate, "d MMM yyyy")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={taskFileInputRef}
                accept=".csv"
                className="hidden"
                onChange={handleImportTaskCsv}
              />
              <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs font-medium" disabled={isImportingTasks} onClick={() => taskFileInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {isImportingTasks ? "Importing..." : "Import CSV"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs font-medium" disabled={isExportingTasks} onClick={handleExportTaskCsv}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                {isExportingTasks ? "Exporting..." : "Export CSV"}
              </Button>
            </div>
          </div>

          {filteredTasksByDate.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Clock3 className="w-7 h-7 mx-auto text-muted-foreground/70 mb-2" />
              <p className="text-sm font-medium">No tasks on this date</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add a task to track deadlines for {format(selectedDate, "d MMM")}.
              </p>
              <Button
                size="sm"
                className="mt-3 h-8 rounded-xl text-xs font-medium"
                onClick={() => openTaskForm({ due_date: format(selectedDate, "yyyy-MM-dd"), status: "pending" })}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create task
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3">
              {[
                { key: "pending", label: "Pending", color: "text-blue-700 bg-blue-500/10" },
                { key: "in_progress", label: "In Progress", color: "text-orange-700 bg-orange-500/10" },
                { key: "completed", label: "Completed", color: "text-emerald-700 bg-emerald-500/10" },
              ].map((column) => (
                <div
                  key={column.key}
                  className="rounded-xl border border-border bg-muted/15 p-2.5 min-h-[180px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropToColumn(column.key)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={cn("border-transparent text-[10px] font-medium", column.color)}>{column.label}</Badge>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{kanbanColumns[column.key].length}</span>
                  </div>
                  <div className="space-y-2">
                    {kanbanColumns[column.key].map((task) => {
                      const linkedInvoice =
                        task.invoice_number ||
                        task.invoice_id ||
                        (task.metadata && typeof task.metadata === "object" ? task.metadata.invoice_number : null);
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDraggingTaskId(task.id)}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <TaskCard
                            task={task}
                            client={clients.find((c) => c.id === task.client_id)}
                            onEdit={(t) => openTaskForm(t)}
                            onDelete={handleDeleteTask}
                            onStatusChange={handleStatusChange}
                          />
                          {linkedInvoice ? (
                            <p className="text-[11px] text-muted-foreground mt-1 ml-1">Linked invoice: {linkedInvoice}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <TaskForm
        open={showTaskForm}
        onClose={() => {
          setShowTaskForm(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        task={editingTask}
        clients={clients}
        tasks={tasks}
      />
    </div>
  );
}