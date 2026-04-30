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
      <div className="min-h-screen bg-background">
        <div className="responsive-page-shell py-4 sm:py-6 md:py-8">
          <Skeleton className="h-10 w-64 rounded-xl mb-6" />
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)] gap-6">
            <Skeleton className="h-[560px] rounded-xl" />
            <Skeleton className="h-[560px] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="responsive-page-shell py-4 sm:py-6 md:py-8 space-y-6">
        <header className="responsive-page-header">
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl sm:text-2xl md:text-3xl font-semibold text-foreground">
              Calendar & Tasks
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Track deadlines, invoices, and team activity</p>
          </div>
          <div className="responsive-page-header-actions gap-2">
            <div className="flex h-10 items-center rounded-xl border border-border bg-muted/40 p-1">
              <Button
                variant="ghost"
                className={cn(
                  "h-8 px-3 rounded-lg text-sm",
                  layoutView === "timeline" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                )}
                onClick={() => setLayoutView("timeline")}
              >
                Timeline View
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "h-8 px-3 rounded-lg text-sm",
                  layoutView === "calendar" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                )}
                onClick={() => setLayoutView("calendar")}
              >
                Calendar View
              </Button>
            </div>
            <Button onClick={() => openTaskForm(null)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Task
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                openTaskForm({
                  title: "",
                  due_date: format(selectedDate, "yyyy-MM-dd"),
                  category: "meeting",
                  status: "pending",
                })
              }
            >
              + Add Event
            </Button>
            <Button
              variant="outline"
              className="xl:hidden"
              onClick={() => setIsContextPanelCollapsed((v) => !v)}
            >
              {isContextPanelCollapsed ? "Show Details" : "Hide Details"}
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)] gap-4 md:gap-6">
          <div className="space-y-4 min-w-0">
            <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border/40">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{format(viewMonth, "MMMM yyyy")}</h2>
                  <p className="text-xs text-muted-foreground">Business timeline across tasks, invoices, and payments</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setViewMonth((v) => subMonths(v, 1))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setViewMonth((v) => addMonths(v, 1))}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {layoutView === "calendar" ? (
                <div className="overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-7 border-b border-border/40 bg-muted/20">
                      {DAYS_HEADER.map((day) => (
                        <div key={day} className="px-3 py-2 text-[11px] uppercase tracking-wide font-medium text-muted-foreground text-center">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-px bg-border/60">
                      {daysInGrid.map((date, idx) => {
                        if (!date) return <div key={`empty-${idx}`} className="min-h-[120px] bg-card/70" />;
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

                        return (
                          <div
                            key={date.toISOString()}
                            className={cn(
                              "group relative min-h-[130px] bg-card p-2.5 transition-colors cursor-pointer",
                              isSelected && "bg-primary/5 ring-2 ring-inset ring-primary",
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
                                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                                  isToday(date) ? "bg-primary text-primary-foreground" : "text-foreground"
                                )}
                              >
                                {format(date, "d")}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
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
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                            </div>

                            <div className="mt-2 space-y-1">
                              {dayInvoices.length > 0 && (
                                <Badge className="bg-orange-500/12 text-orange-700 border-transparent text-[10px] px-1.5 py-0.5">
                                  {dayInvoices.length} invoice{dayInvoices.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                              {dayTasks.length > 0 && (
                                <Badge className="bg-blue-500/12 text-blue-700 border-transparent text-[10px] px-1.5 py-0.5">
                                  {dayTasks.length} task{dayTasks.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                              {dayPaid.length > 0 && (
                                <Badge className="bg-emerald-500/12 text-emerald-700 border-transparent text-[10px] px-1.5 py-0.5">
                                  {dayPaid.length} payment{dayPaid.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>

                            {hovered ? (
                              <div className="pointer-events-none absolute left-2 right-2 bottom-2 rounded-lg border border-border bg-background/95 shadow-sm p-2 space-y-1">
                                <p className="text-[11px] font-medium text-foreground truncate">{format(date, "EEE, MMM d")}</p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {dayInvoices.length + dayTasks.length + dayQuotes.length} item
                                  {dayInvoices.length + dayTasks.length + dayQuotes.length === 1 ? "" : "s"} today
                                </p>
                                {topPreviewItems.length ? (
                                  <div className="space-y-0.5">
                                    {topPreviewItems.map((item) => (
                                      <p key={item.key} className="text-[10px] text-foreground truncate">
                                        • {item.label}
                                      </p>
                                    ))}
                                  </div>
                                ) : null}
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
                <div className="p-4 space-y-3">
                  {timelineRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-8 text-center">
                      <p className="text-sm text-muted-foreground">No timeline activity for this month.</p>
                    </div>
                  ) : (
                    timelineRows.map((row) => (
                      <button
                        key={row.date.toISOString()}
                        className="w-full text-left rounded-xl border border-border/50 p-3 hover:bg-muted/20 transition-colors"
                        onClick={() => {
                          setSelectedDate(row.date);
                          setLayoutView("calendar");
                        }}
                      >
                        <p className="text-sm font-semibold">{format(row.date, "EEE, MMM d")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {row.invoices.length} invoices · {row.tasks.length} tasks · {row.quotes.length} events
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border/50 bg-card shadow-sm p-4">
              <h3 className="text-sm font-semibold mb-3">Next 7 Days</h3>
              {next7DaysTimeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity scheduled in the next 7 days.</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {next7DaysTimeline.map((slot) => (
                    <button
                      key={slot.date.toISOString()}
                      className="shrink-0 min-w-[180px] rounded-lg border border-border/50 p-3 text-left hover:bg-muted/20 transition-colors"
                      onClick={() => setSelectedDate(slot.date)}
                    >
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{format(slot.date, "EEE")}</p>
                      <p className="text-sm font-semibold">{format(slot.date, "MMM d")}</p>
                      <div className="mt-2 space-y-1 text-xs">
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
              "rounded-xl border border-border/50 bg-card shadow-sm p-4 md:p-5 xl:sticky xl:top-24 self-start",
              isContextPanelCollapsed ? "hidden xl:block" : "block"
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Selected Date</h3>
              <Badge variant="outline">{format(selectedDate, "MMM d, yyyy")}</Badge>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-orange-500/10 p-2">
                <p className="text-[11px] text-muted-foreground">Due</p>
                <p className="text-sm font-semibold text-orange-700">{formatCurrency(selectedDueAmount, "ZAR", 0)}</p>
              </div>
              <div className="rounded-lg bg-blue-500/10 p-2">
                <p className="text-[11px] text-muted-foreground">Tasks</p>
                <p className="text-sm font-semibold text-blue-700">{selectedTasks.length}</p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <p className="text-[11px] text-muted-foreground">Events</p>
                <p className="text-sm font-semibold text-emerald-700">{selectedQuotes.length + selectedInvoices.length}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 max-h-[420px] overflow-auto pr-1">
              {selectedInvoices.length === 0 && selectedTasks.length === 0 && selectedQuotes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-5 text-center">
                  <CalendarIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="font-medium">No activity on this day</p>
                  <p className="text-xs text-muted-foreground mt-1">Create task or event</p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      openTaskForm({
                        title: "",
                        due_date: format(selectedDate, "yyyy-MM-dd"),
                        status: "pending",
                      })
                    }
                  >
                    + Add item for this date
                  </Button>
                </div>
              ) : (
                <>
                  {selectedInvoices.map((invoice) => (
                    <div key={`inv-${invoice.id}`} className="rounded-lg border border-border/40 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">Invoice #{invoice.invoice_number}</p>
                        <Badge className="bg-orange-500/12 text-orange-700 border-transparent">Due</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{getClientName(invoice.client_id)}</p>
                      <p className="text-xs font-medium mt-2">{formatCurrency(invoice.total_amount ?? invoice.grand_total ?? 0, "ZAR")}</p>
                    </div>
                  ))}
                  {selectedTasks.map((task) => (
                    <div key={`task-${task.id}`} className="rounded-lg border border-border/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <Badge className="bg-blue-500/12 text-blue-700 border-transparent capitalize">
                          {normalizeStatus(task.status).replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {selectedQuotes.map((quote) => (
                    <div key={`q-${quote.id}`} className="rounded-lg border border-border/40 p-3">
                      <p className="text-sm font-medium">Quote #{quote.quote_number}</p>
                      <p className="text-xs text-muted-foreground mt-1">Expires on selected date</p>
                    </div>
                  ))}
                </>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() =>
                openTaskForm({
                  title: "",
                  due_date: format(selectedDate, "yyyy-MM-dd"),
                  status: "pending",
                })
              }
            >
              + Add item for this date
            </Button>
          </aside>
        </section>

        <section className="rounded-xl border border-border/50 bg-card shadow-sm">
          <div className="p-4 border-b border-border/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Task Management</h3>
              <p className="text-xs text-muted-foreground">
                Showing tasks due on {format(selectedDate, "MMM d, yyyy")} (drag cards between columns)
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
              <Button variant="outline" size="sm" disabled={isImportingTasks} onClick={() => taskFileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1.5" />
                {isImportingTasks ? "Importing..." : "Import CSV"}
              </Button>
              <Button variant="outline" size="sm" disabled={isExportingTasks} onClick={handleExportTaskCsv}>
                <Download className="w-4 h-4 mr-1.5" />
                {isExportingTasks ? "Exporting..." : "Export CSV"}
              </Button>
            </div>
          </div>

          {filteredTasksByDate.length === 0 ? (
            <div className="p-10 text-center">
              <Clock3 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-base font-medium">Start managing your business timeline</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add tasks, track invoices, and stay on top of deadlines.
              </p>
              <Button className="mt-4" onClick={() => openTaskForm({ due_date: format(selectedDate, "yyyy-MM-dd"), status: "pending" })}>
                Create your first task
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
              {[
                { key: "pending", label: "Pending", color: "text-blue-700 bg-blue-500/10" },
                { key: "in_progress", label: "In Progress", color: "text-orange-700 bg-orange-500/10" },
                { key: "completed", label: "Completed", color: "text-emerald-700 bg-emerald-500/10" },
              ].map((column) => (
                <div
                  key={column.key}
                  className="rounded-xl border border-border/40 bg-muted/15 p-3 min-h-[220px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropToColumn(column.key)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={cn("border-transparent", column.color)}>{column.label}</Badge>
                    <span className="text-xs text-muted-foreground">{kanbanColumns[column.key].length}</span>
                  </div>
                  <div className="space-y-3">
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