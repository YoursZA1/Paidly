import { RecurringInvoice, Invoice, Client } from '@/api/entities';
import { add, formatISO, startOfToday, isAfter, isBefore, isEqual } from 'date-fns';

class RecurringInvoiceService {
    /**
     * Checks all active recurring profiles and generates invoices if they are due.
     * @returns {Promise<Array>} A list of newly created invoices.
     */
    static async checkAndGenerateDueInvoices() {
        const activeProfiles = await RecurringInvoice.filter({ status: 'active' });
        const today = startOfToday();
        const generatedInvoices = [];

        for (const profile of activeProfiles) {
            const nextGenDate = new Date(profile.next_generation_date);

            // Check if the next generation date is today or in the past
            if (isEqual(nextGenDate, today) || isBefore(nextGenDate, today)) {
                // Check if the profile has an end date and if it has passed
                if (profile.end_date && isAfter(today, new Date(profile.end_date))) {
                    // If end date has passed, update status to 'ended'
                    await RecurringInvoice.update(profile.id, { status: 'ended' });
                    continue; // Skip to the next profile
                }

                const newInvoice = await this.generateInvoiceFromProfile(profile);
                generatedInvoices.push(newInvoice);

                // Calculate the next generation date and update the profile
                const nextDate = this.calculateNextGenerationDate(nextGenDate, profile.frequency);
                const updatePayload = {
                    next_generation_date: formatISO(nextDate, { representation: 'date' }),
                    last_generated_invoice_id: newInvoice.id,
                };

                await RecurringInvoice.update(profile.id, updatePayload);
            }
        }
        return generatedInvoices;
    }

    /**
     * Generates a single invoice from a recurring profile.
     * @param {object} profile The recurring invoice profile.
     * @returns {Promise<object>} The newly created invoice object.
     */
    static async generateInvoiceFromProfile(profile) {
        const { client_id, invoice_template } = profile;
        const client = await Client.get(client_id);

        const subtotal = invoice_template.items.reduce((sum, item) => sum + (item.total_price || 0), 0);
        const taxAmount = subtotal * ((invoice_template.tax_rate || 0) / 100);
        const totalAmount = subtotal + taxAmount;
        
        const now = new Date();
        const datePart = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
        const timePart = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
        const invoiceNumber = `INV-${datePart}-${client?.name.substring(0,3).toUpperCase()}-${timePart}`;

        const newInvoiceData = {
            ...invoice_template,
            client_id: client_id,
            invoice_number: invoiceNumber,
            subtotal,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            delivery_date: formatISO(add(now, { days: 30 }), { representation: 'date' }), // Due in 30 days
            status: 'draft',
            recurring_invoice_id: profile.id,
        };

        return await Invoice.create(newInvoiceData);
    }

    /**
     * Calculates the next generation date based on the current date and frequency.
     * @param {Date} currentDate The current generation date.
     * @param {string} frequency The recurrence frequency ('weekly', 'monthly', 'yearly').
     * @returns {Date} The next generation date.
     */
    static calculateNextGenerationDate(currentDate, frequency) {
        switch (frequency) {
            case 'weekly':
                return add(currentDate, { weeks: 1 });
            case 'monthly':
                return add(currentDate, { months: 1 });
            case 'yearly':
                return add(currentDate, { years: 1 });
            default:
                return add(currentDate, { months: 1 }); // Default to monthly
        }
    }
}

export default RecurringInvoiceService;