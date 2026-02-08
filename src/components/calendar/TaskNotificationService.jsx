import { Notification, Task } from '@/api/entities';
import { parseISO, isToday, isTomorrow, isPast, format } from 'date-fns';

const TaskNotificationService = {
    async createTaskNotification(userId, title, message, type, taskId) {
        try {
            await Notification.create({
                user_id: userId,
                title,
                message,
                type: type || 'system',
                link: taskId ? `/Calendar?task=${taskId}` : '/Calendar',
                is_read: false
            });
        } catch (error) {
            console.error('Error creating task notification:', error);
        }
    },

    async notifyTaskAssigned(task, assignerName) {
        if (!task.assigned_to) return;
        
        await this.createTaskNotification(
            task.assigned_to,
            'New Task Assigned',
            `${assignerName} assigned you a task: "${task.title}" due ${format(parseISO(task.due_date), 'MMM d')}`,
            'system',
            task.id
        );
    },

    async notifyTaskUpdated(task, updaterName, changes) {
        if (!task.assigned_to || task.assigned_to === task.created_by) return;
        
        let changeDesc = '';
        if (changes.status) changeDesc = `status changed to ${changes.status}`;
        else if (changes.due_date) changeDesc = `due date updated to ${format(parseISO(changes.due_date), 'MMM d')}`;
        else if (changes.priority) changeDesc = `priority changed to ${changes.priority}`;
        else changeDesc = 'task details updated';

        await this.createTaskNotification(
            task.assigned_to,
            'Task Updated',
            `"${task.title}" - ${changeDesc}`,
            'system',
            task.id
        );
    },

    async notifyTaskCompleted(task, completerName, userId) {
        if (!userId || task.created_by === completerName) return;
        
        await this.createTaskNotification(
            userId,
            'Task Completed',
            `${completerName} completed the task: "${task.title}"`,
            'system',
            task.id
        );
    },

    async notifyDependencyMet(task, completedDependency) {
        if (!task.assigned_to) return;
        
        const remainingDeps = (task.depends_on || []).filter(id => id !== completedDependency.id);
        
        if (remainingDeps.length === 0) {
            await this.createTaskNotification(
                task.assigned_to,
                'Task Unblocked',
                `All dependencies met for "${task.title}" - you can now proceed!`,
                'system',
                task.id
            );
        }
    },

    async checkAndSendDueReminders(tasks, userId) {
        const now = new Date();
        const remindersToSend = [];

        for (const task of tasks) {
            if (!task.due_date || task.status === 'completed') continue;
            
            const dueDate = parseISO(task.due_date);
            
            if (isToday(dueDate)) {
                remindersToSend.push({
                    title: 'Task Due Today',
                    message: `"${task.title}" is due today!`,
                    taskId: task.id
                });
            } else if (isTomorrow(dueDate)) {
                remindersToSend.push({
                    title: 'Task Due Tomorrow',
                    message: `"${task.title}" is due tomorrow`,
                    taskId: task.id
                });
            } else if (isPast(dueDate)) {
                remindersToSend.push({
                    title: 'Overdue Task',
                    message: `"${task.title}" is overdue since ${format(dueDate, 'MMM d')}`,
                    taskId: task.id
                });
            }
        }

        // Only send if we haven't already today (check localStorage)
        const lastCheck = localStorage.getItem('lastTaskReminderCheck');
        const today = format(now, 'yyyy-MM-dd');
        
        if (lastCheck !== today && remindersToSend.length > 0) {
            for (const reminder of remindersToSend.slice(0, 5)) { // Limit to 5 notifications
                await this.createTaskNotification(userId, reminder.title, reminder.message, 'payment_due', reminder.taskId);
            }
            localStorage.setItem('lastTaskReminderCheck', today);
        }

        return remindersToSend;
    }
};

export default TaskNotificationService;