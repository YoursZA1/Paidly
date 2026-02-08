import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit, Trash2, CheckCircle, Circle, Clock, AlertTriangle, Link2, GitBranch } from 'lucide-react';
import { format, parseISO, isPast, isToday } from 'date-fns';

const priorityColors = {
    low: 'bg-slate-100 text-slate-700',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700'
};

const statusIcons = {
    pending: <Circle className="w-4 h-4 text-slate-400" />,
    in_progress: <Clock className="w-4 h-4 text-blue-500" />,
    completed: <CheckCircle className="w-4 h-4 text-green-500" />,
    blocked: <AlertTriangle className="w-4 h-4 text-red-500" />,
    cancelled: <Circle className="w-4 h-4 text-slate-300" />
};

const categoryColors = {
    follow_up: 'bg-purple-100 text-purple-700',
    meeting: 'bg-cyan-100 text-cyan-700',
    deadline: 'bg-red-100 text-red-700',
    payment: 'bg-green-100 text-green-700',
    delivery: 'bg-yellow-100 text-yellow-700',
    review: 'bg-indigo-100 text-indigo-700',
    other: 'bg-slate-100 text-slate-700'
};

export default function TaskCard({ task, client, onEdit, onDelete, onStatusChange, subTasks = [], dependencyTasks = [] }) {
    const dueDate = task.due_date ? parseISO(task.due_date) : null;
    const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate) && task.status !== 'completed';
    const isDueToday = dueDate && isToday(dueDate);
    const hasBlockingDeps = dependencyTasks.some(t => t.status !== 'completed');
    const completedSubTasks = subTasks.filter(t => t.status === 'completed').length;

    return (
        <Card className={`border-0 shadow-md hover:shadow-lg transition-all ${
            task.status === 'completed' ? 'opacity-60' : ''
        } ${isOverdue ? 'ring-2 ring-red-200' : ''} ${hasBlockingDeps ? 'ring-2 ring-yellow-200' : ''}`}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1">
                        <button
                            onClick={() => onStatusChange(task, task.status === 'completed' ? 'pending' : 'completed')}
                            className="mt-0.5"
                        >
                            {statusIcons[task.status]}
                        </button>
                        <div className="flex-1 min-w-0">
                            <h4 className={`font-semibold text-slate-900 ${task.status === 'completed' ? 'line-through' : ''}`}>
                                {task.title}
                            </h4>
                            {task.description && (
                                <p className="text-sm text-slate-500 mt-1 line-clamp-2">{task.description}</p>
                            )}
                            
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                <Badge className={priorityColors[task.priority]} variant="secondary">
                                    {task.priority}
                                </Badge>
                                <Badge className={categoryColors[task.category]} variant="secondary">
                                    {task.category?.replace('_', ' ')}
                                </Badge>
                                {client && (
                                    <Badge variant="outline">{client.name}</Badge>
                                )}
                            </div>

                            {/* Sub-tasks indicator */}
                            {subTasks.length > 0 && (
                                <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                                    <GitBranch className="w-3 h-3" />
                                    <span>{completedSubTasks}/{subTasks.length} sub-tasks</span>
                                    <div className="flex-1 bg-slate-200 rounded-full h-1.5 max-w-20">
                                        <div 
                                            className="bg-green-500 h-1.5 rounded-full transition-all"
                                            style={{ width: `${(completedSubTasks / subTasks.length) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Dependencies indicator */}
                            {dependencyTasks.length > 0 && (
                                <div className="flex items-center gap-2 mt-2 text-xs">
                                    <Link2 className="w-3 h-3 text-slate-400" />
                                    <span className={hasBlockingDeps ? 'text-yellow-600' : 'text-green-600'}>
                                        {hasBlockingDeps 
                                            ? `Blocked by ${dependencyTasks.filter(t => t.status !== 'completed').length} task(s)` 
                                            : 'All dependencies met'}
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                                {dueDate && (
                                    <span className={`${isOverdue ? 'text-red-600 font-medium' : isDueToday ? 'text-orange-600 font-medium' : ''}`}>
                                        {isOverdue ? 'Overdue: ' : isDueToday ? 'Due Today: ' : 'Due: '}
                                        {format(dueDate, 'MMM d')}
                                    </span>
                                )}
                                {task.assigned_to_name && (
                                    <span>👤 {task.assigned_to_name}</span>
                                )}
                                {task.estimated_hours && (
                                    <span>⏱️ {task.estimated_hours}h</span>
                                )}
                            </div>

                            {task.tags?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {task.tags.map(tag => (
                                        <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(task)}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onStatusChange(task, 'in_progress')}>
                                <Clock className="w-4 h-4 mr-2" />
                                Mark In Progress
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onStatusChange(task, 'completed')}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Mark Complete
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(task)} className="text-red-600">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardContent>
        </Card>
    );
}