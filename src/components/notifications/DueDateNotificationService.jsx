import { Invoice, Quote } from '@/api/entities';
import { differenceInDays, parseISO, isValid, format } from 'date-fns';
import { breakApi } from '@/api/apiClient';

class DueDateNotificationService {
    async checkAndSendDueDateReminders() {
        try {
            const [invoices, quotes] = await Promise.all([
                Invoice.list(),
                Quote.list()
            ]);

            const notifications = [];
            const today = new Date();

            // Check invoices
            for (const invoice of invoices) {
                if (invoice.delivery_date && (invoice.status === 'sent' || invoice.status === 'viewed')) {
                    try {
                        const dueDate = parseISO(invoice.delivery_date);
                        if (!isValid(dueDate)) continue;

                        const daysUntilDue = differenceInDays(dueDate, today);

                    // Send notification 1 day before due
                    if (daysUntilDue === 1) {
                        const lastSent = localStorage.getItem(`invoice_reminder_${invoice.id}`);
                        const lastSentDate = lastSent ? new Date(lastSent) : null;
                        
                        // Only send once per day
                        if (!lastSentDate || differenceInDays(today, lastSentDate) >= 1) {
                            notifications.push({
                                type: 'invoice',
                                title: 'Invoice Due Tomorrow',
                                message: `Invoice #${invoice.invoice_number} is due tomorrow (${format(dueDate, 'MMM d, yyyy')})`,
                                data: invoice
                            });
                            localStorage.setItem(`invoice_reminder_${invoice.id}`, today.toISOString());
                        }
                    }
                    } catch (e) {
                        // Skip invalid dates
                    }
                }
            }

            // Check quotes
            for (const quote of quotes) {
                if (quote.valid_until && (quote.status === 'sent' || quote.status === 'viewed')) {
                    try {
                        const validDate = parseISO(quote.valid_until);
                        if (!isValid(validDate)) continue;

                        const daysUntilExpiry = differenceInDays(validDate, today);

                    // Send notification 1 day before expiry
                    if (daysUntilExpiry === 1) {
                        const lastSent = localStorage.getItem(`quote_reminder_${quote.id}`);
                        const lastSentDate = lastSent ? new Date(lastSent) : null;
                        
                        // Only send once per day
                        if (!lastSentDate || differenceInDays(today, lastSentDate) >= 1) {
                            notifications.push({
                                type: 'quote',
                                title: 'Quote Expires Tomorrow',
                                message: `Quote #${quote.quote_number} expires tomorrow (${format(validDate, 'MMM d, yyyy')})`,
                                data: quote
                            });
                            localStorage.setItem(`quote_reminder_${quote.id}`, today.toISOString());
                        }
                    }
                    } catch (e) {
                        // Skip invalid dates
                    }
                }
            }

            // Create notifications in the system
            for (const notification of notifications) {
                try {
                    const user = await breakApi.auth.me();
                    await breakApi.entities.Notification.create({
                        user_id: user.id,
                        title: notification.title,
                        message: notification.message,
                        type: notification.type === 'invoice' ? 'payment_due' : 'system',
                        link: notification.type === 'invoice' 
                            ? `/Invoices?id=${notification.data.id}`
                            : `/Quotes?id=${notification.data.id}`
                    });
                } catch (error) {
                    console.error('Failed to create notification:', error);
                }
            }

            return notifications;
        } catch (error) {
            console.error('Error checking due date reminders:', error);
            return [];
        }
    }
}

export default new DueDateNotificationService();