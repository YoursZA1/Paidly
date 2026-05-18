import { Invoice, Client, PaymentReminder } from '@/api/entities';
import { SendEmail } from '@/api/integrations';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { buildBrandedEmailDocumentHtml } from '@/utils/brandedEmailTemplates';
import { escapeHtml, sanitizeHttpUrl } from '@/utils/htmlSecurity';
import { getLogo } from '@/services/AssetService';
import { isAbortError } from '@/utils/retryOnAbort';
import { getStableSession } from '@/core/auth/SessionCoordinator';

class PaymentReminderService {
    static async checkAndSendReminders(profileOverride = null) {
        try {
            const session = await getStableSession();
            if (!session?.user) {
                return;
            }

            const user = profileOverride || null;
            if (!user?.id) return;
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
                if (client.follow_up_enabled === false) continue;

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
            if (msg === 'Not authenticated' || /not authenticated/i.test(msg) || isAbortError(error)) {
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
        const safeViewUrl = sanitizeHttpUrl(publicViewUrl, window.location.origin) || '#';

        // Replace variables in subject and body
        const variables = {
            '{{invoice_number}}': invoice.invoice_number,
            '{{client_name}}': client.name,
            '{{contact_person}}': client.contact_person || client.name,
            '{{amount}}': amountFormatted, // Just the formatted string
            '{{currency}}': currency,
            '{{due_date}}': dueDateFormatted,
            '{{company_name}}': companyName,
            '{{view_link}}': safeViewUrl
        };

        let subject = rule.subject;
        let body = rule.body;

        for (const [key, value] of Object.entries(variables)) {
            subject = subject.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value ?? ''));
            body = body.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value ?? ''));
        }

        const innerHtml = `
            <p style="margin:0 0 16px;color:#52525b;line-height:1.65;white-space:pre-wrap;">${escapeHtml(body)}</p>
            <div style="text-align:center;margin:24px 0 0;">
              <a href="${escapeHtml(safeViewUrl)}" style="display:inline-block;background:linear-gradient(135deg,#f24e00 0%,#ff7c00 100%);color:#fff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">
                View invoice
              </a>
            </div>
        `;
        const rawLogoPath = user?.logo_url || user?.company_logo_url || '';
        const resolvedLogo = rawLogoPath ? getLogo(rawLogoPath) : '';
        const logoUrl = resolvedLogo && resolvedLogo.startsWith('https://') ? resolvedLogo : '';
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
            logoUrl,
        });

        await SendEmail({
            to: client.email,
            subject: subject,
            body: htmlBody,
            from_name: companyName
        });
    }

    /**
     * Reminders created when auto_send is off (manual approval in Settings).
     * @returns {Promise<Array<{ reminder: object, invoice: object, client: object }>>}
     */
    static async getPendingReminders() {
        try {
            const session = await getStableSession();
            if (!session?.user) return [];

            const reminders = await PaymentReminder.filter({ email_sent: false });
            if (!reminders.length) return [];

            const [invoices, clients] = await Promise.all([Invoice.list(), Client.list()]);
            const byId = (rows, id) => rows.find((r) => r.id === id);

            const out = [];
            for (const reminder of reminders) {
                const invoice = byId(invoices, reminder.invoice_id);
                if (!invoice) continue;
                const client = byId(clients, invoice.client_id);
                if (!client) continue;
                if (client.follow_up_enabled === false) continue;
                out.push({ reminder, invoice, client });
            }
            return out;
        } catch (error) {
            const msg = error?.message || String(error);
            if (msg === 'Not authenticated' || /not authenticated/i.test(msg) || isAbortError(error)) {
                return [];
            }
            console.error('Error loading pending reminders:', error);
            return [];
        }
    }

    /**
     * Send one draft reminder and mark it sent.
     * @param {string} reminderId
     * @param {object|null} user - profile row (reminder_rules, company_name, currency, …)
     */
    static async sendPendingReminder(reminderId, user) {
        if (!user?.id) return false;
        const settings = user.reminder_settings;
        const rules = settings?.reminder_rules;
        if (!rules?.length) return false;

        const pending = await PaymentReminder.filter({ id: reminderId, email_sent: false });
        const reminder = pending[0];
        if (!reminder) return false;

        const invoice = await Invoice.get(reminder.invoice_id);
        if (!invoice) return false;
        const client = await Client.get(invoice.client_id);
        if (!client) return false;
        if (client.follow_up_enabled === false) return false;

        const rule = rules.find((r) => r.id === reminder.reminder_type);
        if (!rule) return false;

        try {
            await this.sendEmail(invoice, client, rule, user);
            if (rule.type === 'after' && rule.days > 0 && invoice.status !== 'overdue') {
                await Invoice.update(invoice.id, { status: 'overdue' });
            }
            await PaymentReminder.update(reminder.id, { email_sent: true });
            return true;
        } catch (e) {
            console.error('sendPendingReminder failed:', e);
            return false;
        }
    }
}

export default PaymentReminderService;