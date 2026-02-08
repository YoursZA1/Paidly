import { Quote, Client, QuoteReminder, User } from '@/api/entities';
import { SendEmail } from '@/api/integrations';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';

class QuoteReminderService {
    static async checkAndSendReminders() {
        try {
            const user = await User.me();
            const settings = user.quote_reminder_settings;

            if (!settings || !settings.enabled) {
                return;
            }

            // Default days if not set
            const daysAfterSent = settings.days_after_sent || 3;

            // Fetch active quotes (sent but not acted upon)
            const [quotes, clients] = await Promise.all([
                Quote.filter({ status: 'sent' }),
                Client.list()
            ]);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const quote of quotes) {
                // Determine if we should send a reminder
                // We check if (today - sent_date) >= days_after_sent
                // And if we haven't sent this specific reminder yet
                
                // For simplicity, let's assume 'created_date' is roughly when it was sent if status is 'sent', 
                // or ideally we'd track 'sent_date' on the quote. 
                // Since Quote doesn't have 'sent_date', we can use 'created_date' or updated_date if status changed.
                // Let's use updated_date as a proxy for when it was moved to 'sent', or created_date.
                // Actually, let's just use created_date for now as a fallback.
                
                const sentDate = new Date(quote.updated_date || quote.created_date);
                sentDate.setHours(0, 0, 0, 0);

                const diffTime = today - sentDate;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays >= daysAfterSent) {
                    const client = clients.find(c => c.id === quote.client_id);
                    if (!client) continue;

                    await this.processReminder(quote, client, daysAfterSent, user, settings);
                }
            }
        } catch (error) {
            console.error('Error checking quote reminders:', error);
        }
    }

    static async processReminder(quote, client, days, user, settings) {
        try {
            // Check if reminder already sent
            const reminderType = `followup_${days}_days`;
            const existingReminders = await QuoteReminder.filter({
                quote_id: quote.id,
                reminder_type: reminderType
            });

            if (existingReminders.length > 0) {
                return; // Already sent
            }

            // Send Email
            await this.sendEmail(quote, client, user, settings);

            // Record reminder
            await QuoteReminder.create({
                quote_id: quote.id,
                reminder_type: reminderType,
                sent_date: new Date().toISOString(),
                email_sent: true
            });

            console.log(`Sent quote reminder for ${quote.quote_number}`);

        } catch (error) {
            console.error(`Failed to process quote reminder for ${quote.id}:`, error);
        }
    }

    static async sendEmail(quote, client, user, settings) {
        const companyName = user.company_name || user.full_name || 'Your Company';
        const publicViewUrl = `${window.location.origin}${createPageUrl(`PublicQuote?id=${quote.id}`)}`;
        
        let subject = settings.subject || "Following up on Quote {{quote_number}}";
        let body = settings.body || "Hi {{client_name}},\n\nI just wanted to follow up on the quote I sent a few days ago. Have you had a chance to review it?\n\nYou can view it here: {{view_link}}\n\nLet me know if you have any questions.\n\nBest regards,\n{{company_name}}";

        const variables = {
            '{{quote_number}}': quote.quote_number,
            '{{client_name}}': client.name,
            '{{contact_person}}': client.contact_person || client.name,
            '{{company_name}}': companyName,
            '{{view_link}}': publicViewUrl,
            '{{project_title}}': quote.project_title
        };

        for (const [key, value] of Object.entries(variables)) {
            subject = subject.replace(new RegExp(key, 'g'), value);
            body = body.replace(new RegExp(key, 'g'), value);
        }

        // Simple HTML wrapper
        const htmlBody = `
            <div style="font-family: sans-serif; padding: 20px;">
                <p style="white-space: pre-wrap;">${body}</p>
                <br/>
                <a href="${publicViewUrl}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Quote</a>
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

export default QuoteReminderService;