import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Plus, X, Link2 } from 'lucide-react';
import { format } from 'date-fns';
import { Task, TaskAssignmentRule } from '@/api/entities';

export default function TaskForm({ open, onClose, onSave, task, clients = [], tasks = [] }) {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        client_id: '',
        assigned_to: '',
        assigned_to_name: '',
        due_date: '',
        priority: 'medium',
        status: 'pending',
        category: 'other',
        parent_task_id: '',
        depends_on: [],
        estimated_hours: '',
        tags: []
    });
    const [newTag, setNewTag] = useState('');
    const [assignmentRules, setAssignmentRules] = useState([]);

    useEffect(() => {
        loadAssignmentRules();
    }, []);

    useEffect(() => {
        if (task) {
            setFormData({
                ...task,
                depends_on: task.depends_on || [],
                tags: task.tags || [],
                estimated_hours: task.estimated_hours || ''
            });
        } else {
            setFormData({
                title: '',
                description: '',
                client_id: '',
                assigned_to: '',
                assigned_to_name: '',
                due_date: format(new Date(), 'yyyy-MM-dd'),
                priority: 'medium',
                status: 'pending',
                category: 'other',
                parent_task_id: '',
                depends_on: [],
                estimated_hours: '',
                tags: []
            });
        }
    }, [task, open]);

    const loadAssignmentRules = async () => {
        try {
            const rules = await TaskAssignmentRule.filter({ is_active: true });
            setAssignmentRules(rules);
        } catch (error) {
            console.error('Error loading assignment rules:', error);
        }
    };

    // Auto-assign based on rules when client or category changes
    useEffect(() => {
        if (!task && assignmentRules.length > 0) {
            const matchingRule = assignmentRules.find(rule => {
                const clientMatch = !rule.client_id || rule.client_id === formData.client_id;
                const categoryMatch = !rule.category || rule.category === formData.category;
                return clientMatch && categoryMatch && (rule.client_id || rule.category);
            });

            if (matchingRule && !formData.assigned_to) {
                setFormData(prev => ({
                    ...prev,
                    assigned_to: matchingRule.assign_to_email,
                    assigned_to_name: matchingRule.assign_to_name
                }));
            }
        }
    }, [formData.client_id, formData.category, assignmentRules, task]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...formData,
            estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null
        });
    };

    const addTag = () => {
        if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
            setFormData({ ...formData, tags: [...formData.tags, newTag.trim()] });
            setNewTag('');
        }
    };

    const removeTag = (tag) => {
        setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
    };

    const toggleDependency = (taskId) => {
        const deps = formData.depends_on || [];
        if (deps.includes(taskId)) {
            setFormData({ ...formData, depends_on: deps.filter(id => id !== taskId) });
        } else {
            setFormData({ ...formData, depends_on: [...deps, taskId] });
        }
    };

    const availableTasks = tasks.filter(t => t.id !== task?.id && t.status !== 'completed');
    const parentTasks = tasks.filter(t => t.id !== task?.id && !t.parent_task_id);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{task ? 'Edit Task' : 'Create Task'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2 space-y-2">
                            <Label>Title *</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Task title"
                                required
                            />
                        </div>

                        <div className="md:col-span-2 space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Task description"
                                rows={3}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Client</Label>
                            <Select
                                value={formData.client_id}
                                onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select client" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>None</SelectItem>
                                    {clients.map(client => (
                                        <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select
                                value={formData.category}
                                onValueChange={(value) => setFormData({ ...formData, category: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="follow_up">Follow Up</SelectItem>
                                    <SelectItem value="meeting">Meeting</SelectItem>
                                    <SelectItem value="deadline">Deadline</SelectItem>
                                    <SelectItem value="payment">Payment</SelectItem>
                                    <SelectItem value="delivery">Delivery</SelectItem>
                                    <SelectItem value="review">Review</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Due Date *</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {formData.due_date ? format(new Date(formData.due_date), 'PPP') : 'Select date'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={formData.due_date ? new Date(formData.due_date) : undefined}
                                        onSelect={(date) => setFormData({ ...formData, due_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label>Priority</Label>
                            <Select
                                value={formData.priority}
                                onValueChange={(value) => setFormData({ ...formData, priority: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="urgent">Urgent</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(value) => setFormData({ ...formData, status: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="blocked">Blocked</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Estimated Hours</Label>
                            <Input
                                type="number"
                                step="0.5"
                                value={formData.estimated_hours}
                                onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
                                placeholder="e.g., 2.5"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Assigned To</Label>
                            <Input
                                value={formData.assigned_to_name}
                                onChange={(e) => setFormData({ ...formData, assigned_to_name: e.target.value })}
                                placeholder="Team member name"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Parent Task (Sub-task of)</Label>
                            <Select
                                value={formData.parent_task_id}
                                onValueChange={(value) => setFormData({ ...formData, parent_task_id: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="None (Top-level task)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>None</SelectItem>
                                    {parentTasks.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Dependencies */}
                        <div className="md:col-span-2 space-y-2">
                            <Label className="flex items-center gap-2">
                                <Link2 className="w-4 h-4" />
                                Dependencies (Blocked by)
                            </Label>
                            <div className="flex flex-wrap gap-2 p-3 border rounded-lg min-h-[60px] bg-slate-50">
                                {availableTasks.map(t => (
                                    <Badge
                                        key={t.id}
                                        variant={formData.depends_on?.includes(t.id) ? 'default' : 'outline'}
                                        className="cursor-pointer"
                                        onClick={() => toggleDependency(t.id)}
                                    >
                                        {t.title}
                                    </Badge>
                                ))}
                                {availableTasks.length === 0 && (
                                    <span className="text-sm text-slate-400">No other tasks available</span>
                                )}
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="md:col-span-2 space-y-2">
                            <Label>Tags</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    placeholder="Add tag"
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                />
                                <Button type="button" variant="outline" onClick={addTag}>
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                            {formData.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {formData.tags.map(tag => (
                                        <Badge key={tag} variant="secondary" className="gap-1">
                                            {tag}
                                            <X className="w-3 h-3 cursor-pointer" onClick={() => removeTag(tag)} />
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                            {task ? 'Update Task' : 'Create Task'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}