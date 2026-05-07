import { Invoice, Client } from '@/api/entities';

/**
 * Client segmentation derived from invoice history (VIP / regular / at-risk / new).
 * Invoice overdue emails use PaymentReminderService + per-client follow_up_enabled.
 */
export default class ClientFollowUpService {
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
