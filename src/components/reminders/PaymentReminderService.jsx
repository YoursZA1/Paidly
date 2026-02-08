import { Invoice, Client, PaymentReminder, User } from '@/api/entities';
import { SendEmail } from '@/api/integrations';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';

class PaymentReminderService {
    static async checkAndSendReminders() {
        try {
            const user = await User.me();
            const settings = user.reminder_settings;

            // Default fallback if no settings exist (though UI should enforce defaults)
            if (!settings || !settings.reminders_enabled || !settings.reminder_rules || settings.reminder_rules.length === 0) {
                return;
            }

            // Fetch active invoices
            const [invoices, clients] = await Promise.all([
                Invoice.filter({ status: ['sent', 'partial_paid', 'overdue'] }),
                Client.list()
            ]);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const invoice of invoices) {
                const client = clients.find(c => c.id === invoice.client_id);
                if (!client) continue;

                const dueDate = new Date(invoice.delivery_date);
                dueDate.setHours(0, 0, 0, 0);
                
                // Calculate days difference: today - due_date
                // Positive means overdue (today > due), Negative means upcoming (today < due)
                const diffTime = today - dueDate;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                for (const rule of settings.reminder_rules) {
                    const ruleDays = rule.days;
                    const ruleType = rule.type; // 'before' or 'after'

                    let match = false;
                    if (ruleType === 'before') {
                        // e.g., 3 days before: diffDays should be -3
                        if (diffDays === -ruleDays) match = true;
                    } else {
                        // e.g., 7 days after: diffDays should be 7
                        // e.g., 0 days after (due today): diffDays should be 0
                        if (diffDays === ruleDays) match = true;
                    }

                    if (match) {
                        await this.processReminder(invoice, client, rule, settings.auto_send, user);
                    }
                }
            }
        } catch (error) {
            console.error('Error checking payment reminders:', error);
        }
    }

    static async processReminder(invoice, client, rule, autoSend, user) {
        try {
            // Check if this specific reminder rule has already been sent for this invoice
            const existingReminders = await PaymentReminder.filter({
                invoice_id: invoice.id,
                reminder_type: rule.id // Use rule ID to track specific reminders
            });

            if (existingReminders.length > 0) {
                return; // Already sent
            }

            // Prepare reminder data
            const reminderData = {
                invoice_id: invoice.id,
                reminder_type: rule.id,
                sent_date: new Date().toISOString(),
                email_sent: false,
                reminder_count: 1
            };

            if (autoSend) {
                await this.sendEmail(invoice, client, rule, user);
                reminderData.email_sent = true;

                // Update invoice status to 'overdue' if it is overdue and not already marked
                if (rule.type === 'after' && rule.days > 0 && invoice.status !== 'overdue') {
                    await Invoice.update(invoice.id, { status: 'overdue' });
                }
            }

            await PaymentReminder.create(reminderData);
            console.log(`Processed reminder '${rule.id}' for invoice ${invoice.invoice_number}`);

        } catch (error) {
            console.error(`Failed to process reminder ${rule.id} for invoice ${invoice.id}:`, error);
        }
    }

    static async sendEmail(invoice, client, rule, user) {
        const companyName = user.company_name || user.full_name || 'Your Company';
        const currency = user.currency || 'ZAR'; // Default currency if not found
        const amountFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(invoice.total_amount);
        const dueDateFormatted = format(new Date(invoice.delivery_date), 'MMM d, yyyy');
        const publicViewUrl = `${window.location.origin}${createPageUrl(`PublicInvoice?id=${invoice.id}`)}`;
        
        // Replace variables in subject and body
        const variables = {
            '{{invoice_number}}': invoice.invoice_number,
            '{{client_name}}': client.name,
            '{{contact_person}}': client.contact_person || client.name,
            '{{amount}}': amountFormatted, // Just the formatted string
            '{{currency}}': currency,
            '{{due_date}}': dueDateFormatted,
            '{{company_name}}': companyName,
            '{{view_link}}': publicViewUrl
        };

        let subject = rule.subject;
        let body = rule.body;

        for (const [key, value] of Object.entries(variables)) {
            subject = subject.replace(new RegExp(key, 'g'), value);
            body = body.replace(new RegExp(key, 'g'), value);
        }

        // Construct HTML Body
        const htmlBody = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333;">${companyName}</h2>
                <p style="white-space: pre-wrap;">${body}</p>
                <br/>
                <div style="text-align: center; margin-top: 30px;">
                    <a href="${publicViewUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        View Invoice
                    </a>
                </div>
                <p style="text-align: center; margin-top: 20px; font-size: 12px; color: #888;">
                    This is an automated reminder.
                </p>
            </div>
        `;

        await SendEmail({
            to: client.email,
            subject: subject,
            body: htmlBody,
            from_name: companyName
        });
    }
}

export default PaymentReminderService;