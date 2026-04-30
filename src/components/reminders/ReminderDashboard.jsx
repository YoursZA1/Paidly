import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PaymentReminderService from './PaymentReminderService';
import { Bell, Send, Clock, AlertTriangle, CheckCircle, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function ReminderDashboard() {
    const { profile } = useAuth();
    const [pendingReminders, setPendingReminders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        loadPendingReminders();
    }, []);

    const loadPendingReminders = async () => {
        setIsLoading(true);
        try {
            const reminders = await PaymentReminderService.getPendingReminders();
            setPendingReminders(reminders);
        } catch (error) {
            console.error('Error loading pending reminders:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCheckReminders = async () => {
        setIsLoading(true);
        try {
            await PaymentReminderService.checkAndSendReminders(profile || null);
            await loadPendingReminders();
        } catch (error) {
            console.error('Error checking reminders:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendReminder = async (reminderId) => {
        setIsSending(true);
        try {
            const success = await PaymentReminderService.sendPendingReminder(reminderId);
            if (success) {
                await loadPendingReminders();
            }
        } catch (error) {
            console.error('Error sending reminder:', error);
        } finally {
            setIsSending(false);
        }
    };

    const getReminderTypeInfo = (type) => {
        switch (type) {
            case 'upcoming':
                return { label: 'Due Soon', icon: Clock, color: 'bg-primary/15 text-primary' };
            case 'due_today':
                return { label: 'Due Today', icon: AlertTriangle, color: 'bg-yellow-100 text-yellow-800' };
            case 'overdue_1':
                return { label: 'Overdue', icon: AlertTriangle, color: 'bg-red-100 text-red-800' };
            case 'overdue_7':
                return { label: 'Overdue 7+ Days', icon: AlertTriangle, color: 'bg-red-100 text-red-800' };
            case 'overdue_14':
                return { label: 'Overdue 14+ Days', icon: AlertTriangle, color: 'bg-red-100 text-red-800' };
            default:
                return { label: 'Reminder', icon: Bell, color: 'bg-gray-100 text-gray-800' };
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <Bell className="w-5 h-5" />
                            Payment Reminders
                        </span>
                        <Button onClick={handleCheckReminders} disabled={isLoading}>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {isLoading ? 'Checking...' : 'Check for New Reminders'}
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading && pendingReminders.length === 0 ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                            <p className="mt-2 text-gray-500">Loading reminders...</p>
                        </div>
                    ) : pendingReminders.length === 0 ? (
                        <div className="text-center py-8">
                            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                            <p className="text-gray-500">No pending reminders at this time.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {pendingReminders.map(({ reminder, invoice, client }) => {
                                const typeInfo = getReminderTypeInfo(reminder.reminder_type);
                                const TypeIcon = typeInfo.icon;
                                
                                return (
                                    <div key={reminder.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                                        <div className="flex items-center gap-4">
                                            <TypeIcon className="w-5 h-5 text-gray-500" />
                                            <div>
                                                <p className="font-semibold">{client.name}</p>
                                                <p className="text-sm text-gray-500">
                                                    Invoice #{invoice.invoice_number} - ${invoice.total_amount?.toLocaleString()}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    Due: {new Date(invoice.delivery_date).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge className={typeInfo.color}>
                                                {typeInfo.label}
                                            </Badge>
                                            <Button 
                                                size="sm"
                                                onClick={() => handleSendReminder(reminder.id)}
                                                disabled={isSending}
                                            >
                                                <Mail className="w-4 h-4 mr-1" />
                                                Send
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}