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
        orange: 'bg-orange-50 dark:bg-orange-950/50 border-l-4 border-orange-500 dark:border-orange-600 text-orange-800 dark:text-orange-200',
        blue: 'bg-blue-50 dark:bg-blue-950/50 border-l-4 border-blue-500 dark:border-blue-600 text-blue-800 dark:text-blue-200',
        emerald: 'bg-emerald-50 dark:bg-emerald-950/50 border-l-4 border-emerald-500 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200',
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
            className={`mt-1.5 p-1.5 rounded-lg text-[10px] font-semibold truncate shadow-sm ${styles[v]}`}
            title={label}
        >
            <p className="truncate">{label}</p>
            {sub && <p className="text-[9px] font-medium opacity-90 truncate">{sub}</p>}
        </motion.div>
    );
}

function AgendaItem({ day, month, title, time, type, color = 'text-slate-900' }) {
    return (
        <div className="flex gap-3 items-center">
            <div className="flex flex-col items-center justify-center w-11 h-11 bg-white rounded-xl shadow-sm border border-slate-100 shrink-0">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{month}</span>
                <span className="text-sm font-bold text-slate-900 leading-tight">{day}</span>
            </div>
            <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold truncate ${color}`}>{title}</p>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
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
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <Skeleton className="h-12 w-64 mb-8" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Skeleton className="h-96 lg:col-span-2" />
                        <Skeleton className="h-96" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Calendar & Tasks</h1>
                        <p className="text-slate-600 dark:text-slate-400">Track due dates and manage team tasks</p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant={viewMode === 'tasks' ? 'default' : 'outline'}
                            onClick={() => setViewMode('tasks')}
                            size="sm"
                        >
                            <ListTodo className="w-4 h-4 mr-2" />
                            Tasks
                        </Button>
                        <Button
                            variant={viewMode === 'analytics' ? 'default' : 'outline'}
                            onClick={() => setViewMode('analytics')}
                            size="sm"
                        >
                            <BarChart2 className="w-4 h-4 mr-2" />
                            Analytics
                        </Button>
                        <Link to={createPageUrl('TaskSettings')}>
                            <Button variant="outline" size="sm">
                                <Settings className="w-4 h-4" />
                            </Button>
                        </Link>
                        <Button 
                            onClick={() => { setEditingTask(null); setShowTaskForm(true); }}
                            className="bg-primary hover:bg-primary/90"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Task
                        </Button>
                    </div>
                </motion.div>

                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Calendar + Side Agenda */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex-1 flex flex-col lg:flex-row bg-white dark:bg-slate-800 rounded-2xl lg:rounded-3xl shadow-2xl shadow-slate-200/80 dark:shadow-slate-900/80 overflow-hidden border border-slate-100 dark:border-slate-700 min-w-0"
                    >
                        <div className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 lg:mb-8">
                                <div>
                                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">
                                        {format(viewMonth, 'MMMM yyyy')}
                                    </h2>
                                    <p className="text-sm text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                                        {invoiceCountThisMonth} invoices due this month
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-4">
                                    <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                                        <button type="button" onClick={() => setViewMonth(m => subMonths(m, 1))} className="p-2 hover:bg-white dark:hover:bg-slate-600 hover:shadow-sm rounded-lg transition-all text-slate-600 dark:text-slate-300" aria-label="Previous month">
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        <button type="button" onClick={() => setViewMonth(m => addMonths(m, 1))} className="p-2 hover:bg-white dark:hover:bg-slate-600 hover:shadow-sm rounded-lg transition-all text-slate-600 dark:text-slate-300" aria-label="Next month">
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <Button onClick={() => { setEditingTask(null); setShowTaskForm(true); }} className="bg-orange-600 hover:bg-orange-700 text-white px-4 sm:px-6 py-2.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-orange-200 dark:shadow-orange-900/30">
                                        <Plus className="w-5 h-5" /> Add Event
                                    </Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-7 gap-px bg-slate-100 dark:bg-slate-700 border border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden">
                                {DAYS_HEADER.map(day => (
                                    <div key={day} className="bg-slate-50 dark:bg-slate-800 py-2 sm:py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
                                            return <div key={`e-${idx}`} className="bg-slate-50/50 dark:bg-slate-800/50 min-h-[80px] sm:min-h-[100px]" />;
                                        }
                                        const dayEvents = getCellEventsForDate(date);
                                        const today = isToday(date);
                                        const isSelected = isSameDay(date, selectedDate);
                                        return (
                                            <button
                                                key={date.toISOString()}
                                                type="button"
                                                onClick={() => setSelectedDate(date)}
                                                className={`bg-white dark:bg-slate-800 min-h-[80px] sm:min-h-[120px] p-2 sm:p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/80 active:scale-95 transition-all rounded-sm ${isSelected ? 'ring-2 ring-inset ring-primary' : ''}`}
                                            >
                                                <span className={`inline-flex items-center justify-center text-sm font-bold w-7 h-7 rounded-full shrink-0 ${today ? 'bg-orange-600 text-white ring-2 ring-orange-400 dark:ring-orange-500 ring-offset-2 dark:ring-offset-slate-800' : 'text-slate-600 dark:text-slate-300'}`}>
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
                            <div className="mt-4 flex flex-wrap gap-4 justify-center text-xs text-slate-600 dark:text-slate-400">
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-200 dark:bg-orange-800 border-l-4 border-orange-500" /> Finance</span>
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-800 border-l-4 border-blue-500" /> Meeting</span>
                                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-200 dark:bg-emerald-800 border-l-4 border-emerald-500" /> Done</span>
                            </div>
                        </div>
                        <div className="w-full lg:w-80 shrink-0 bg-slate-50/80 dark:bg-slate-800/80 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-700 p-4 sm:p-6 lg:p-8">
                            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-4">Upcoming</h3>
                            <div className="space-y-4">
                                {getUpcomingAgendaItems().length === 0 ? (
                                    <p className="text-sm text-slate-400 dark:text-slate-500">No upcoming events this week.</p>
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
                        <Card className="bg-white dark:bg-slate-800 shadow-xl border-0 dark:border dark:border-slate-700">
                            <CardHeader className="border-b border-slate-100 dark:border-slate-700">
                                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                                    <CalendarIcon className="w-5 h-5" />
                                    {format(selectedDate, 'MMMM d, yyyy')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
                                    <div className="text-center text-slate-500 dark:text-slate-400 py-8">
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
                                                className="border border-slate-200 dark:border-slate-600 rounded-lg p-4 hover:shadow-md dark:bg-slate-700/30 transition-shadow"
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        {event.type === 'invoice' ? (
                                                            <FileText className="w-5 h-5 text-primary" />
                                                        ) : (
                                                            <FileText className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
                                                        )}
                                                        <span className="font-semibold text-slate-900 dark:text-slate-100">
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
                                                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                                    <DollarSign className="w-4 h-4" />
                                                    <span className="font-medium">
                                                        {formatCurrency(event.amount, 'ZAR')}
                                                    </span>
                                                </div>
                                                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
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
                        <Card className="bg-white dark:bg-slate-800 shadow-xl border-0 dark:border dark:border-slate-700">
                            <CardHeader className="border-b border-slate-100 dark:border-slate-700">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
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
                                        <Button variant="outline" size="sm" disabled={isImportingTasks} onClick={() => taskFileInputRef.current?.click()}>
                                            <Upload className="w-4 h-4 mr-2" />
                                            {isImportingTasks ? 'Importing…' : 'Import CSV'}
                                        </Button>
                                        <Button variant="outline" size="sm" disabled={isExportingTasks} onClick={handleExportTaskCsv}>
                                            <Download className="w-4 h-4 mr-2" />
                                            {isExportingTasks ? 'Exporting…' : 'Export CSV'}
                                        </Button>
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
                                    <div className="text-center text-slate-500 dark:text-slate-400 py-12">
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