import { Notification, User } from '@/api/entities';
import { createPageUrl } from '@/utils';

class NotificationService {
    static async createNotification(userId, title, message, type, relatedId) {
        let link = createPageUrl("Dashboard");
        switch(type) {
            case 'invoice_viewed':
            case 'invoice_paid':
                link = createPageUrl(`ViewInvoice?id=${relatedId}`);
                break;
            case 'payment_due':
                 link = createPageUrl(`ViewInvoice?id=${relatedId}`);
                break;
            case 'recurring_generated':
                link = createPageUrl('RecurringInvoices');
                break;
            case 'subscription_payment_update':
                link = createPageUrl('Settings?tab=subscription');
                break;
            default:
                break;
        }

        try {
            await Notification.create({
                user_id: userId,
                title,
                message,
                link,
                type,
                is_read: false,
            });
        } catch (error) {
            console.error("Failed to create notification:", error);
        }
    }
    
    static async markAsRead(notificationId) {
        try {
            await Notification.update(notificationId, { is_read: true });
        } catch (error) {
            console.error("Failed to mark notification as read:", error);
        }
    }
    
    static async markAllAsRead(userId) {
         try {
            const unread = await Notification.filter({ user_id: userId, is_read: false });
            const promises = unread.map(n => Notification.update(n.id, { is_read: true }));
            await Promise.all(promises);
        } catch (error) {
            console.error("Failed to mark all notifications as read:", error);
        }
    }
}

export default NotificationService;