import { Invoice, Client, PaymentReminder, User } from '@/api/entities';
import { SendEmail } from '@/api/integrations';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { buildBrandedEmailDocumentHtml } from '@/utils/brandedEmailTemplates';
import { supabase } from '@/lib/supabaseClient';

class PaymentReminderService {
    static async checkAndSendReminders() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                return;
            }

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
            const msg = error?.message || String(error);
            if (msg === 'Not authenticated' || /not authenticated/i.test(msg)) {
                return;
            }
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

        const innerHtml = `
            <p style="margin:0 0 16px;color:#52525b;line-height:1.65;white-space:pre-wrap;">${body.replace(/</g, '&lt;')}</p>
            <div style="text-align:center;margin:24px 0 0;">
              <a href="${publicViewUrl.replace(/"/g, '&quot;')}" style="display:inline-block;background:linear-gradient(135deg,#f24e00 0%,#ff7c00 100%);color:#fff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">
                View invoice
              </a>
            </div>
        `;
        const htmlBody = buildBrandedEmailDocumentHtml({
            preheader: subject,
            title: 'Payment reminder',
            subtitle: `Invoice ${invoice.invoice_number}`,
            innerHtml,
            companyName,
            footerNote: 'Automated payment reminder. If you already paid, please disregard.',
            primaryHex: '#f24e00',
            secondaryHex: '#ff7c00',
            pixelUrl: '',
        });

        await SendEmail({
            to: client.email,
            subject: subject,
            body: htmlBody,
            from_name: companyName
        });
    }
}

export default PaymentReminderService;