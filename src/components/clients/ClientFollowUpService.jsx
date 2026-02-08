import { Invoice, Client } from '@/api/entities';
import { breakApi } from '@/api/apiClient';

export default class ClientFollowUpService {
    static async checkAndSendFollowUps() {
        const results = [];
        
        try {
            const [clients, invoices] = await Promise.all([
                Client.list(),
                Invoice.list()
            ]);

            for (const client of clients) {
                if (!client.follow_up_enabled) continue;

                // Get outstanding invoices for this client
                const outstandingInvoices = invoices.filter(
                    inv => inv.client_id === client.id && 
                    (inv.status === 'sent' || inv.status === 'overdue')
                );

                for (const invoice of outstandingInvoices) {
                    const dueDate = new Date(invoice.delivery_date);
                    const today = new Date();
                    const daysPastDue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

                    // Send reminder at 7, 14, and 30 days overdue
                    if (daysPastDue === 7 || daysPastDue === 14 || daysPastDue === 30) {
                        try {
                            await this.sendFollowUpEmail(client, invoice, daysPastDue);
                            results.push({
                                clientId: client.id,
                                invoiceId: invoice.id,
                                daysPastDue,
                                status: 'sent'
                            });
                        } catch (error) {
                            results.push({
                                clientId: client.id,
                                invoiceId: invoice.id,
                                daysPastDue,
                                status: 'failed',
                                error: error.message
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error checking follow-ups:', error);
        }

        return results;
    }

    static async sendFollowUpEmail(client, invoice, daysPastDue) {
        const urgencyLevel = daysPastDue >= 30 ? 'final' : daysPastDue >= 14 ? 'urgent' : 'friendly';
        
        const subjects = {
            friendly: `Friendly Reminder: Invoice #${invoice.invoice_number} is overdue`,
            urgent: `Urgent: Invoice #${invoice.invoice_number} - Payment Required`,
            final: `Final Notice: Invoice #${invoice.invoice_number} - Immediate Action Required`
        };

        const bodies = {
            friendly: `
Dear ${client.contact_person || client.name},

This is a friendly reminder that Invoice #${invoice.invoice_number} for ${invoice.project_title} is now ${daysPastDue} days overdue.

Amount Due: ${invoice.total_amount}

Please arrange payment at your earliest convenience. If you have already made payment, please disregard this reminder.

Thank you for your business.
            `.trim(),
            urgent: `
Dear ${client.contact_person || client.name},

This is an urgent reminder regarding Invoice #${invoice.invoice_number} for ${invoice.project_title}, which is now ${daysPastDue} days overdue.

Amount Due: ${invoice.total_amount}

Please arrange immediate payment to avoid any service disruptions.

If you're experiencing any difficulties, please contact us to discuss payment arrangements.

Thank you.
            `.trim(),
            final: `
Dear ${client.contact_person || client.name},

FINAL NOTICE

Invoice #${invoice.invoice_number} for ${invoice.project_title} is now ${daysPastDue} days overdue.

Amount Due: ${invoice.total_amount}

This is our final reminder before we escalate this matter. Please make payment immediately or contact us to discuss your account.

Thank you.
            `.trim()
        };

        await breakApi.integrations.Core.SendEmail({
            to: client.email,
            subject: subjects[urgencyLevel],
            body: bodies[urgencyLevel]
        });

        // Update invoice status to overdue if not already
        if (invoice.status !== 'overdue') {
            await Invoice.update(invoice.id, { status: 'overdue' });
        }
    }

    static async updateClientSegments() {
        try {
            const [clients, invoices] = await Promise.all([
                Client.list(),
                Invoice.list()
            ]);

            for (const client of clients) {
                const clientInvoices = invoices.filter(
                    inv => inv.client_id === client.id && 
                    (inv.status === 'paid' || inv.status === 'partial_paid')
                );

                const totalSpent = clientInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
                
                const lastInvoice = clientInvoices
                    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
                
                const lastInvoiceDate = lastInvoice?.created_date || null;

                // Calculate segment
                const daysSinceLastInvoice = lastInvoiceDate 
                    ? Math.floor((new Date() - new Date(lastInvoiceDate)) / (1000 * 60 * 60 * 24))
                    : Infinity;

                let segment = 'new';
                if (totalSpent > 0 && daysSinceLastInvoice > 90) {
                    segment = 'at_risk';
                } else if (totalSpent >= 50000) {
                    segment = 'vip';
                } else if (totalSpent >= 5000) {
                    segment = 'regular';
                }

                // Update client if segment changed
                if (client.segment !== segment || client.total_spent !== totalSpent) {
                    await Client.update(client.id, {
                        segment,
                        total_spent: totalSpent,
                        last_invoice_date: lastInvoiceDate
                    });
                }
            }
        } catch (error) {
            console.error('Error updating client segments:', error);
        }
    }
}