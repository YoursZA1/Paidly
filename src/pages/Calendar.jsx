import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Invoice, Quote, Client, Task, User } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    format,
    parseISO,
    isSameDay,
    startOfMonth,
    endOfMonth,
    addMonths,
    subMonths,
    eachDayOfInterval,
    getDay,
    isToday,
    addDays,
    startOfDay,
} from 'date-fns';
import {
    CalendarIcon,
    FileText,
    DollarSign,
    Plus,
    CheckSquare,
    ListTodo,
    BarChart2,
    Settings,
    Download,
    Upload,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { tasksToCsv, parseTaskCsv, csvRowToTaskPayload } from '@/utils/taskCsvMapping';
import { formatCurrency } from '../components/CurrencySelector';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import TaskForm from '../components/calendar/TaskForm';
import TaskCard from '../components/calendar/TaskCard';
import TeamPerformance from '../components/calendar/TeamPerformance';
import TaskNotificationService from '../components/calendar/TaskNotificationService';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

const DAYS_HEADER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getEventPillVariant(event) {
    if (event.type === 'invoice' || event.type === 'quote') {
        const s = (event.status || '').toLowerCase();
        if (s === 'paid') return 'emerald';
        return 'orange'; // Pending, Overdue, Sent, etc.
    }
    if (event.status === 'completed') return 'emerald';
    if (event.category === 'meeting' || event.category === 'follow_up') return 'blue';
    if (
        event.priority === 'high' ||
        event.priority === 'urgent' ||
        event.category === 'deadline' ||
        event.category === 'payment'
    )
        return 'orange';
    return 'blue';
}

function EventPill({ event, variant, index = 0 }) {
    const v = variant || getEventPillVariant(event);
    const styles = {
        orange:
            'border border-border bg-muted/40 border-l-[3px] border-l-orange-500 text-foreground shadow-none dark:border-l-orange-500',
        blue: 'border border-border bg-muted/40 border-l-[3px] border-l-blue-500 text-foreground shadow-none dark:border-l-blue-500',
        emerald:
            'border border-border bg-muted/40 border-l-[3px] border-l-emerald-500 text-foreground shadow-none dark:border-l-emerald-500',
    };
    const label =
        event.type === 'invoice'
            ? (event.client_name || `Invoice #${event.invoice_number || event.data?.invoice_number}`)
            : event.type === 'quote'
              ? `Quote #${event.quote_number || event.data?.quote_number}`
              : event.title;
    const sub =
        event.type === 'invoice' || event.type === 'quote'
            ? event.amount != null && formatCurrency(event.amount, 'ZAR', 0)
            : event.status === 'completed'
              ? 'Done'
              : null;
    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.03 }}
            className={`mt-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight truncate ${styles[v]}`}
            title={label}
        >
            <p className="truncate">{label}</p>
            {sub && <p className="text-[9px] font-medium opacity-90 truncate">{sub}</p>}
        </motion.div>
    );
}

function AgendaItem({ day, month, title, time, type, color = 'text-foreground' }) {
    return (
        <div className="flex gap-3 items-center rounded-xl border border-transparent px-1 py-1 transition-colors hover:border-border hover:bg-muted/30">
            <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-background shadow-sm">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{month}</span>
                <span className="text-sm font-bold leading-tight text-foreground">{day}</span>
            </div>
            <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-semibold', color)}>{title}</p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {time} • {type}
                </p>
            </div>
        </div>
    );
}

export default function CalendarPage() {
    const [invoices, setInvoices] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [clients, setClients] = useState([]);
    const [user, setUser] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewMonth, setViewMonth] = useState(new Date());
    const [monthInvoices, setMonthInvoices] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [activeTab, setActiveTab] = useState('all');
    const [viewMode, setViewMode] = useState('tasks'); // 'tasks' | 'analytics'
    const [isExportingTasks, setIsExportingTasks] = useState(false);
    const [isImportingTasks, setIsImportingTasks] = useState(false);
    const taskFileInputRef = useRef(null);
    const { toast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    /** Fetch invoices for the visible month from Supabase (due_date/delivery_date in range) */
    useEffect(() => {
        let cancelled = false;
        setMonthInvoices(null);
        const start = startOfMonth(viewMonth).toISOString();
        const end = endOfMonth(viewMonth).toISOString();
        const dateCol = 'delivery_date';
        supabase
            .from('invoices')
            .select('id, client_id, delivery_date, total_amount, status, invoice_number')
            .gte(dateCol, start)
            .lte(dateCol, end)
            .then(({ data, error }) => {
                if (!cancelled && !error) setMonthInvoices(data ?? []);
            });
        return () => { cancelled = true; };
    }, [viewMonth]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [invoicesData, quotesData, tasksData, clientsData, userData] = await Promise.all([
                Invoice.list('-delivery_date'),
                Quote.list('-valid_until'),
                Task.list('-due_date'),
                Client.list(),
                User.me()
            ]);
            setInvoices(invoicesData || []);
            setQuotes(quotesData || []);
            setTasks(tasksData || []);
            setClients(clientsData || []);
            setUser(userData);

            // Check for task due reminders
            if (userData) {
                TaskNotificationService.checkAndSendDueReminders(tasksData || [], userData.id);
            }
        } catch (error) {
            console.error('Error loading calendar data:', error);
            toast({ title: 'Could not load calendar data', description: error?.message, variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportTaskCsv = async () => {
        setIsExportingTasks(true);
        try {
            const list = await Task.list('-due_date');
            if (!list?.length) {
                toast({ title: 'No tasks to export', variant: 'destructive' });
                return;
            }
            const csv = tasksToCsv(list);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Task_export.csv';
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: 'Export complete', description: `${list.length} task(s) exported.`, variant: 'default' });
        } catch (error) {
            toast({ title: 'Export failed', description: error?.message || 'Failed to export.', variant: 'destructive' });
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
                const text = ev.target?.result ?? '';
                const { headers, rows } = parseTaskCsv(text);
                if (!headers?.length || !rows?.length) {
                    toast({ title: 'Import failed', description: 'CSV is empty or invalid.', variant: 'destructive' });
                    return;
                }
                let created = 0;
                for (const row of rows) {
                    const payload = csvRowToTaskPayload(headers, row);
                    if (payload.title) {
                        await Task.create(payload);
                        created++;
                    }
                }
                toast({ title: 'Import complete', description: `${created} task(s) imported.`, variant: 'default' });
                loadData();
            } catch (err) {
                toast({ title: 'Import failed', description: err?.message || 'Could not parse CSV.', variant: 'destructive' });
            } finally {
                setIsImportingTasks(false);
                if (taskFileInputRef.current) taskFileInputRef.current.value = '';
            }
        };
        reader.readAsText(file, 'UTF-8');
    };

    const handleSaveTask = async (taskData) => {
        try {
            if (editingTask) {
                const changes = {};
                if (taskData.status !== editingTask.status) changes.status = taskData.status;
                if (taskData.due_date !== editingTask.due_date) changes.due_date = taskData.due_date;
                if (taskData.priority !== editingTask.priority) changes.priority = taskData.priority;
                
                await Task.update(editingTask.id, taskData);
                
                // Notify if assigned user changed or task updated
                if (Object.keys(changes).length > 0 && taskData.assigned_to) {
                    TaskNotificationService.notifyTaskUpdated(taskData, user?.full_name || 'Someone', changes);
                }
            } else {
                const newTask = await Task.create(taskData);
                
                // Notify assigned user
                if (taskData.assigned_to && user) {
                    TaskNotificationService.notifyTaskAssigned({ ...taskData, id: newTask.id }, user.full_name || 'Someone');
                }
            }
            setShowTaskForm(false);
            setEditingTask(null);
            loadData();
        } catch (error) {
            console.error('Error saving task:', error);
        }
    };

    const handleDeleteTask = async (task) => {
        if (confirm('Are you sure you want to delete this task?')) {
            try {
                await Task.delete(task.id);
                loadData();
            } catch (error) {
                console.error('Error deleting task:', error);
            }
        }
    };

    const handleStatusChange = async (task, newStatus) => {
        try {
            const updateData = { 
                ...task, 
                status: newStatus,
                completed_date: newStatus === 'completed' ? new Date().toISOString() : null
            };
            await Task.update(task.id, updateData);
            
            // Notify on completion
            if (newStatus === 'completed' && user) {
                TaskNotificationService.notifyTaskCompleted(task, user.full_name || 'Someone', task.created_by);
                
                // Check if any dependent tasks are now unblocked
                const dependentTasks = tasks.filter(t => t.depends_on?.includes(task.id));
                for (const depTask of dependentTasks) {
                    TaskNotificationService.notifyDependencyMet(depTask, task);
                }
            }
            
            loadData();
        } catch (error) {
            console.error('Error updating task status:', error);
        }
    };

    const getClientById = (clientId) => clients.find(c => c.id === clientId);
    
    const getSubTasks = (parentId) => tasks.filter(t => t.parent_task_id === parentId);
    const getDependencyTasks = (dependsOn) => tasks.filter(t => dependsOn?.includes(t.id));
    
    // Filter to show parent tasks and standalone tasks (not sub-tasks)
    const topLevelTasks = tasks.filter(t => !t.parent_task_id);

    /** Invoices whose delivery_date falls in the visible calendar month (from Supabase fetch or filtered full list) */
    const invoicesForViewMonth = useMemo(() => {
        const filtered = invoices.filter(i => {
            const dateField = i.due_date || i.delivery_date;
            if (!dateField) return false;
            try {
                const d = parseISO(dateField);
                return d >= startOfMonth(viewMonth) && d <= endOfMonth(viewMonth);
            } catch (e) {
                return false;
            }
        });
        return monthInvoices !== null ? monthInvoices : filtered;
    }, [invoices, viewMonth, monthInvoices]);

    /** Map invoice due dates to calendar day cells: get events for a date, optionally scoped to an invoice list (e.g. visible month). */
    const getEventsForDate = (date, invoiceSource = invoices) => {
        const events = [];

        invoiceSource.forEach(invoice => {
            const dueDateRaw = invoice.due_date || invoice.delivery_date;
            if (!dueDateRaw) return;
            try {
                const dueDate = parseISO(dueDateRaw);
                if (isSameDay(dueDate, date)) {
                    events.push({
                        type: 'invoice',
                        invoice_number: invoice.invoice_number,
                        client_name: getClientById(invoice.client_id)?.name ?? 'Client',
                        title: `Invoice #${invoice.invoice_number}`,
                        amount: invoice.total_amount ?? invoice.grand_total,
                        status: invoice.status,
                        data: invoice
                    });
                }
            } catch (e) {
                // Skip invalid dates
            }
        });

        quotes.forEach(quote => {
            if (quote.valid_until) {
                try {
                    const validDate = parseISO(quote.valid_until);
                    if (isSameDay(validDate, date)) {
                        events.push({
                            type: 'quote',
                            quote_number: quote.quote_number,
                            title: `Quote #${quote.quote_number}`,
                            amount: quote.total_amount,
                            status: quote.status,
                            data: quote
                        });
                    }
                } catch (e) {
                    // Skip invalid dates
                }
            }
        });

        return events;
    };

    const getTasksForDate = (date) => {
        return tasks.filter(task => {
            if (!task.due_date) return false;
            try {
                return isSameDay(parseISO(task.due_date), date);
            } catch (e) {
                return false;
            }
        });
    };

    function getCellEventsForDate(date) {
        const list = [];
        getEventsForDate(date, invoicesForViewMonth).forEach(ev => list.push(ev));
        getTasksForDate(date).forEach(task =>
            list.push({
                type: 'task',
                title: task.title,
                status: task.status,
                priority: task.priority,
                category: task.category,
                invoice_number: null,
                quote_number: null,
            })
        );
        return list.slice(0, 4);
    }

    function getUpcomingAgendaItems() {
        const today = startOfDay(new Date());
        const end = addDays(today, 14);
        const items = [];
        invoices.forEach(inv => {
            if (!inv.delivery_date) return;
            try {
                const d = parseISO(inv.delivery_date);
                if (d >= today && d <= end) {
                    items.push({
                        date: d,
                        title: `Invoice #${inv.invoice_number}`,
                        time: 'Due',
                        type: 'Finance',
                        color: inv.status === 'overdue' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-900 dark:text-slate-100',
                    });
                }
            } catch (e) {}
        });
        quotes.forEach(q => {
            if (!q.valid_until) return;
            try {
                const d = parseISO(q.valid_until);
                if (d >= today && d <= end) {
                    items.push({
                        date: d,
                        title: `Quote #${q.quote_number}`,
                        time: 'Expires',
                        type: 'Quote',
                        color: 'text-slate-900 dark:text-slate-100',
                    });
                }
            } catch (e) {}
        });
        tasks.forEach(task => {
            if (!task.due_date || task.status === 'completed') return;
            try {
                const d = parseISO(task.due_date);
                if (d >= today && d <= end) {
                    items.push({
                        date: d,
                        title: task.title,
                        time: 'All Day',
                        type: task.category === 'meeting' ? 'Meeting' : 'Task',
                        color: task.priority === 'high' || task.priority === 'urgent' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-900 dark:text-slate-100',
                    });
                }
            } catch (e) {}
        });
        items.sort((a, b) => a.date - b.date);
        return items.slice(0, 12);
    }

    const filteredTasks = topLevelTasks.filter(task => {
        if (activeTab === 'all') return true;
        if (activeTab === 'pending') return task.status === 'pending' || task.status === 'in_progress';
        if (activeTab === 'completed') return task.status === 'completed';
        if (activeTab === 'blocked') return task.status === 'blocked' || getDependencyTasks(task.depends_on).some(t => t.status !== 'completed');
        return true;
    });

    const selectedEvents = getEventsForDate(selectedDate);
    const selectedTasks = getTasksForDate(selectedDate);
    const invoiceCountThisMonth = invoices.filter(i => {
        try {
            const d = parseISO(i.delivery_date);
            return d >= startOfMonth(viewMonth) && d <= endOfMonth(viewMonth);
        } catch (e) {
            return false;
        }
    }).length;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background">
                <div className="responsive-page-shell py-4 sm:py-6 md:py-8">
                    <Skeleton className="mb-8 h-12 w-64 rounded-xl" />
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
                        <Skeleton className="h-96 rounded-2xl" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="responsive-page-shell py-4 sm:py-6 md:py-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="responsive-page-header mb-4 sm:mb-6 md:mb-8"
                >
                    <div className="min-w-0">
                        <h1 className="truncate font-display text-lg font-semibold text-foreground sm:text-xl md:text-2xl lg:text-3xl">
                            Calendar & Tasks
                        </h1>
                        <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Track due dates and manage team tasks</p>
                    </div>
                    <div className="responsive-page-header-actions gap-2.5">
                        <div className="flex h-10 w-full shrink-0 items-center rounded-xl border border-border bg-muted/50 p-1 shadow-sm sm:w-auto">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setViewMode('tasks')}
                                className={cn(
                                    'h-8 flex-1 gap-2 rounded-lg px-3 text-sm font-semibold transition-colors sm:flex-none',
                                    viewMode === 'tasks'
                                        ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <ListTodo className="h-4 w-4 shrink-0" />
                                Tasks
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setViewMode('analytics')}
                                className={cn(
                                    'h-8 flex-1 gap-2 rounded-lg px-3 text-sm font-semibold transition-colors sm:flex-none',
                                    viewMode === 'analytics'
                                        ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <BarChart2 className="h-4 w-4 shrink-0" />
                                Analytics
                            </Button>
                        </div>
                        <Link to={createPageUrl('TaskSettings')} className="shrink-0">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 min-h-10 min-w-10 shrink-0 rounded-xl border-border bg-background/80 shadow-sm backdrop-blur-sm"
                                aria-label="Task settings"
                                title="Task settings"
                            >
                                <Settings className="h-4 w-4" />
                            </Button>
                        </Link>
                        <Button
                            type="button"
                            onClick={() => {
                                setEditingTask(null);
                                setShowTaskForm(true);
                            }}
                            className="inline-flex h-9 w-full min-h-9 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-[1px] hover:bg-primary/90 hover:shadow-md sm:w-auto md:h-10 md:min-h-10 md:text-base touch-manipulation"
                        >
                            <Plus className="h-4 w-4 shrink-0" />
                            Add Task
                        </Button>
                    </div>
                </motion.div>

                <div className="flex flex-col gap-6 lg:flex-row">
                    {/* Calendar + Side Agenda */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:flex-row"
                    >
                        <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
                            <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between lg:mb-8">
                                <div className="min-w-0">
                                    <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl">
                                        {format(viewMonth, 'MMMM yyyy')}
                                    </h2>
                                    <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                                        {invoiceCountThisMonth} invoices due this month
                                    </p>
                                </div>
                                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-2.5">
                                    <div className="flex h-10 shrink-0 items-center rounded-xl border border-border bg-muted/50 p-1 shadow-sm">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setViewMonth((m) => subMonths(m, 1))}
                                            className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                            aria-label="Previous month"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setViewMonth((m) => addMonths(m, 1))}
                                            className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                            aria-label="Next month"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            setEditingTask(null);
                                            setShowTaskForm(true);
                                        }}
                                        className="inline-flex h-9 min-h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-[1px] hover:bg-primary/90 hover:shadow-md sm:h-10 sm:min-h-10 sm:flex-none md:text-base touch-manipulation"
                                    >
                                        <Plus className="h-4 w-4 shrink-0" />
                                        Add Event
                                    </Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border bg-border">
                                {DAYS_HEADER.map(day => (
                                    <div key={day} className="bg-muted/50 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:py-3">
                                        {day}
                                    </div>
                                ))}
                                {(() => {
                                    const start = startOfMonth(viewMonth);
                                    const end = endOfMonth(viewMonth);
                                    const days = eachDayOfInterval({ start, end });
                                    const pad = getDay(start);
                                    const total = pad + days.length;
                                    const rows = Math.ceil(total / 7);
                                    let cells = [];
                                    for (let i = 0; i < pad; i++) cells.push(null);
                                    days.forEach(d => cells.push(d));
                                    const remainder = rows * 7 - cells.length;
                                    for (let i = 0; i < remainder; i++) cells.push(null);
                                    return cells.map((date, idx) => {
                                        if (!date) {
                                            return <div key={`e-${idx}`} className="min-h-[80px] bg-muted/20 sm:min-h-[100px]" />;
                                        }
                                        const dayEvents = getCellEventsForDate(date);
                                        const today = isToday(date);
                                        const isSelected = isSameDay(date, selectedDate);
                                        return (
                                            <button
                                                key={date.toISOString()}
                                                type="button"
                                                onClick={() => setSelectedDate(date)}
                                                className={cn(
                                                    'min-h-[80px] bg-card p-2 text-left transition-colors hover:bg-muted/40 active:scale-[0.99] sm:min-h-[120px] sm:p-3',
                                                    isSelected && 'bg-primary/5 ring-2 ring-inset ring-primary',
                                                    !isSelected && today && 'bg-muted/30'
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                                                        today && 'bg-primary text-primary-foreground shadow-sm',
                                                        !today && 'text-muted-foreground'
                                                    )}
                                                >
                                                    {format(date, 'd')}
                                                </span>
                                                <div className="mt-1 space-y-0.5">
                                                    {dayEvents.map((ev, i) => <EventPill key={i} event={ev} index={i} />)}
                                                </div>
                                            </button>
                                        );
                                    });
                                })()}
                            </div>
                            <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1.5">
                                    <span className="h-2.5 w-2.5 rounded-sm border border-orange-500/40 bg-orange-500/20" aria-hidden />
                                    Finance
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1.5">
                                    <span className="h-2.5 w-2.5 rounded-sm border border-blue-500/40 bg-blue-500/20" aria-hidden />
                                    Meeting
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1.5">
                                    <span className="h-2.5 w-2.5 rounded-sm border border-emerald-500/40 bg-emerald-500/20" aria-hidden />
                                    Done
                                </span>
                            </div>
                        </div>
                        <div className="w-full shrink-0 border-t border-border bg-muted/20 p-4 sm:p-6 lg:w-80 lg:border-l lg:border-t-0 lg:p-8">
                            <h3 className="mb-4 text-base font-semibold tracking-tight text-foreground">Upcoming</h3>
                            <div className="space-y-3">
                                {getUpcomingAgendaItems().length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No upcoming events this week.</p>
                                ) : (
                                    getUpcomingAgendaItems().map((item, i) => (
                                        <AgendaItem key={i} day={format(item.date, 'd')} month={format(item.date, 'MMM')} title={item.title} time={item.time} type={item.type} color={item.color} />
                                    ))
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* Events for Selected Date */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="w-full lg:w-96 shrink-0"
                    >
                        <Card className="rounded-2xl border border-border bg-card shadow-sm">
                            <CardHeader className="border-b border-border">
                                <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                                    <CalendarIcon className="w-5 h-5" />
                                    {format(selectedDate, 'MMMM d, yyyy')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
                                    <div className="py-8 text-center text-muted-foreground">
                                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>No events on this date</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Tasks for selected date */}
                                        {selectedTasks.map((task) => (
                                            <TaskCard
                                                key={task.id}
                                                task={task}
                                                client={getClientById(task.client_id)}
                                                onEdit={(t) => { setEditingTask(t); setShowTaskForm(true); }}
                                                onDelete={handleDeleteTask}
                                                onStatusChange={handleStatusChange}
                                            />
                                        ))}
                                        
                                        {/* Invoices/Quotes for selected date */}
                                        {selectedEvents.map((event, index) => (
                                            <div
                                                key={index}
                                                className="rounded-xl border border-border bg-muted/20 p-4 transition-shadow hover:shadow-sm"
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        {event.type === 'invoice' ? (
                                                            <FileText className="w-5 h-5 text-primary" />
                                                        ) : (
                                                            <FileText className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
                                                        )}
                                                        <span className="font-semibold text-foreground">
                                                            {event.title}
                                                        </span>
                                                    </div>
                                                    <Badge
                                                        variant={
                                                            event.status === 'paid' ? 'success' :
                                                            event.status === 'overdue' ? 'destructive' :
                                                            'secondary'
                                                        }
                                                    >
                                                        {event.status}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <DollarSign className="w-4 h-4" />
                                                    <span className="font-medium">
                                                        {formatCurrency(event.amount, 'ZAR')}
                                                    </span>
                                                </div>
                                                <div className="mt-2 text-xs text-muted-foreground">
                                                    {event.type === 'invoice' ? 'Payment Due' : 'Quote Expires'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Task Management Section or Analytics */}
                {viewMode === 'tasks' ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="mt-8"
                    >
                        <Card className="rounded-2xl border border-border bg-card shadow-sm">
                            <CardHeader className="border-b border-border">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                                        <ListTodo className="w-5 h-5" />
                                        Task Management
                                    </CardTitle>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            type="file"
                                            name="calendar_tasks_import_csv"
                                            ref={taskFileInputRef}
                                            accept=".csv"
                                            className="hidden"
                                            onChange={handleImportTaskCsv}
                                        />
                                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-1.5 shadow-sm">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={isImportingTasks}
                                                onClick={() => taskFileInputRef.current?.click()}
                                                className="h-9 rounded-lg border-border bg-background px-3 text-xs font-medium shadow-none sm:h-10 sm:text-sm"
                                            >
                                                <Upload className={`mr-2 h-4 w-4 ${isImportingTasks ? 'animate-pulse' : ''}`} />
                                                {isImportingTasks ? 'Importing…' : 'Import CSV'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={isExportingTasks}
                                                onClick={handleExportTaskCsv}
                                                className="h-9 rounded-lg border-border bg-background px-3 text-xs font-medium shadow-none sm:h-10 sm:text-sm"
                                            >
                                                <Download className="h-4 w-4 mr-2" />
                                                {isExportingTasks ? 'Exporting…' : 'Export CSV'}
                                            </Button>
                                        </div>
                                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
                                            <TabsList>
                                                <TabsTrigger value="all">All</TabsTrigger>
                                                <TabsTrigger value="pending">Pending</TabsTrigger>
                                                <TabsTrigger value="blocked">Blocked</TabsTrigger>
                                                <TabsTrigger value="completed">Completed</TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                {filteredTasks.length === 0 ? (
                                    <div className="py-12 text-center text-muted-foreground">
                                        <CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p className="mb-4">No tasks found</p>
                                        <Button 
                                            onClick={() => { setEditingTask(null); setShowTaskForm(true); }}
                                            variant="outline"
                                        >
                                            <Plus className="w-4 h-4 mr-2" />
                                            Create your first task
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {filteredTasks.map((task) => (
                                            <TaskCard
                                                key={task.id}
                                                task={task}
                                                client={getClientById(task.client_id)}
                                                subTasks={getSubTasks(task.id)}
                                                dependencyTasks={getDependencyTasks(task.depends_on)}
                                                onEdit={(t) => { setEditingTask(t); setShowTaskForm(true); }}
                                                onDelete={handleDeleteTask}
                                                onStatusChange={handleStatusChange}
                                            />
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="mt-8"
                    >
                        <TeamPerformance tasks={tasks} />
                    </motion.div>
                )}

                {/* Task Form Modal */}
                <TaskForm
                    open={showTaskForm}
                    onClose={() => { setShowTaskForm(false); setEditingTask(null); }}
                    onSave={handleSaveTask}
                    task={editingTask}
                    clients={clients}
                    tasks={tasks}
                />
            </div>
        </div>
    );
}