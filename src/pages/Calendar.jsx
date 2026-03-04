import React, { useState, useEffect, useRef } from 'react';
import { Invoice, Quote, Client, Task, User } from '@/api/entities';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parseISO, isSameDay } from 'date-fns';
import { CalendarIcon, FileText, DollarSign, Plus, CheckSquare, ListTodo, BarChart2, Settings, Download, Upload } from 'lucide-react';
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

export default function CalendarPage() {
    const [invoices, setInvoices] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [clients, setClients] = useState([]);
    const [user, setUser] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date());
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
        }
        setIsLoading(false);
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
        }
        setIsExportingTasks(false);
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
            }
            setIsImportingTasks(false);
            if (taskFileInputRef.current) taskFileInputRef.current.value = '';
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

    const getEventsForDate = (date) => {
        const events = [];

        invoices.forEach(invoice => {
            if (invoice.delivery_date) {
                try {
                    const dueDate = parseISO(invoice.delivery_date);
                    if (isSameDay(dueDate, date)) {
                        events.push({
                            type: 'invoice',
                            title: `Invoice #${invoice.invoice_number}`,
                            amount: invoice.total_amount,
                            status: invoice.status,
                            data: invoice
                        });
                    }
                } catch (e) {
                    // Skip invalid dates
                }
            }
        });

        quotes.forEach(quote => {
            if (quote.valid_until) {
                try {
                    const validDate = parseISO(quote.valid_until);
                    if (isSameDay(validDate, date)) {
                        events.push({
                            type: 'quote',
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

    const filteredTasks = topLevelTasks.filter(task => {
        if (activeTab === 'all') return true;
        if (activeTab === 'pending') return task.status === 'pending' || task.status === 'in_progress';
        if (activeTab === 'completed') return task.status === 'completed';
        if (activeTab === 'blocked') return task.status === 'blocked' || getDependencyTasks(task.depends_on).some(t => t.status !== 'completed');
        return true;
    });

    const getModifiers = () => {
        const modifiers = {};
        const invoiceDates = [];
        const quoteDates = [];
        const taskDates = [];

        invoices.forEach(invoice => {
            if (invoice.delivery_date && (invoice.status === 'sent' || invoice.status === 'overdue')) {
                try {
                    invoiceDates.push(parseISO(invoice.delivery_date));
                } catch (e) {
                    // Skip invalid dates
                }
            }
        });

        quotes.forEach(quote => {
            if (quote.valid_until && (quote.status === 'sent' || quote.status === 'viewed')) {
                try {
                    quoteDates.push(parseISO(quote.valid_until));
                } catch (e) {
                    // Skip invalid dates
                }
            }
        });

        tasks.forEach(task => {
            if (task.due_date && task.status !== 'completed') {
                try {
                    taskDates.push(parseISO(task.due_date));
                } catch (e) {
                    // Skip invalid dates
                }
            }
        });

        modifiers.invoice = invoiceDates;
        modifiers.quote = quoteDates;
        modifiers.task = taskDates;

        return modifiers;
    };

    const selectedEvents = getEventsForDate(selectedDate);
    const selectedTasks = getTasksForDate(selectedDate);
    const modifiers = getModifiers();

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
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
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">Calendar & Tasks</h1>
                        <p className="text-slate-600">Track due dates and manage team tasks</p>
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

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Calendar */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="lg:col-span-2"
                    >
                        <Card className="bg-white shadow-xl border-0">
                            <CardContent className="p-6">
                                <style>{`
                                    .rdp-day_invoice {
                                        background-color: #dbeafe;
                                        border-radius: 4px;
                                    }
                                    .rdp-day_quote {
                                        background-color: #fef3c7;
                                        border-radius: 4px;
                                    }
                                    .rdp-day_task {
                                        background-color: #d1fae5;
                                        border-radius: 4px;
                                    }
                                `}</style>
                                <CalendarComponent
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={setSelectedDate}
                                    modifiers={modifiers}
                                    className="w-full"
                                />
                                
                                <div className="mt-6 flex flex-wrap gap-4 justify-center">
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 bg-primary/20 rounded"></div>
                                        <span className="text-sm text-slate-600">Invoice Due</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 bg-yellow-200 rounded"></div>
                                        <span className="text-sm text-slate-600">Quote Expires</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 bg-emerald-200 rounded"></div>
                                        <span className="text-sm text-slate-600">Task Due</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Events for Selected Date */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <Card className="bg-white shadow-xl border-0">
                            <CardHeader className="border-b border-slate-100">
                                <CardTitle className="flex items-center gap-2">
                                    <CalendarIcon className="w-5 h-5" />
                                    {format(selectedDate, 'MMMM d, yyyy')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
                                    <div className="text-center text-slate-500 py-8">
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
                                                className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        {event.type === 'invoice' ? (
                                                            <FileText className="w-5 h-5 text-primary" />
                                                        ) : (
                                                            <FileText className="w-5 h-5 text-yellow-600" />
                                                        )}
                                                        <span className="font-semibold text-slate-900">
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
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    <DollarSign className="w-4 h-4" />
                                                    <span className="font-medium">
                                                        {formatCurrency(event.amount, 'ZAR')}
                                                    </span>
                                                </div>
                                                <div className="mt-2 text-xs text-slate-500">
                                                    {event.type === 'invoice' ? 'Payment Due' : 'Quote Expires'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Upcoming Events */}
                        <Card className="bg-white shadow-xl border-0 mt-6">
                            <CardHeader className="border-b border-slate-100">
                                <CardTitle className="text-base">Upcoming Due Dates</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                                <div className="space-y-3">
                                    {[...invoices, ...quotes]
                                        .filter(item => {
                                            const date = item.delivery_date || item.valid_until;
                                            if (!date) return false;
                                            try {
                                                return parseISO(date) > new Date();
                                            } catch (e) {
                                                return false;
                                            }
                                        })
                                        .sort((a, b) => {
                                            try {
                                                const dateA = parseISO(a.delivery_date || a.valid_until);
                                                const dateB = parseISO(b.delivery_date || b.valid_until);
                                                return dateA - dateB;
                                            } catch (e) {
                                                return 0;
                                            }
                                        })
                                        .slice(0, 5)
                                        .map((item, index) => {
                                            const isInvoice = !!item.invoice_number;
                                            try {
                                                const dueDate = parseISO(item.delivery_date || item.valid_until);
                                                return (
                                                <div
                                                    key={index}
                                                    className="flex items-center justify-between text-sm"
                                                >
                                                    <div>
                                                        <span className="font-medium text-slate-900">
                                                            {format(dueDate, 'MMM d')}
                                                        </span>
                                                        <span className="text-slate-500 ml-2">
                                                            {isInvoice ? 'Invoice' : 'Quote'} #{item.invoice_number || item.quote_number}
                                                        </span>
                                                    </div>
                                                    <span className="font-semibold text-slate-700">
                                                        {formatCurrency(item.total_amount, 'ZAR', 0)}
                                                    </span>
                                                </div>
                                            );
                                            } catch (e) {
                                                return null;
                                            }
                                        })
                                        .filter(Boolean)}
                                </div>
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
                        <Card className="bg-white shadow-xl border-0">
                            <CardHeader className="border-b border-slate-100">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <CardTitle className="flex items-center gap-2">
                                        <ListTodo className="w-5 h-5" />
                                        Task Management
                                    </CardTitle>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            type="file"
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
                                    <div className="text-center text-slate-500 py-12">
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