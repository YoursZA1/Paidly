import React from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';
import LogoImage from '@/components/shared/LogoImage';

/* Agency-style: INVOICE left, company logo-aligned accent box right, Payable To | Bank Details, 4-col table, Notes, Totals. Colours match app/logo (primary). */

const CARD_ACCENT_BG = 'bg-primary/10';
const CARD_ACCENT_BORDER = 'border-primary/20';

export default function MinimalTemplate({ invoice, client, user, bankingDetail, userCurrency, safeFormatDate, documentTitle }) {
    const deliveryDate = safeFormatDate(invoice.delivery_date);
    const issueDate = safeFormatDate(invoice.created_date);
    const resolvedTitle = documentTitle || (invoice.type === 'QUOTE' ? 'QUOTE' : 'INVOICE');

    return (
        <div className="bg-card text-foreground font-normal">
            {/* Header: Title left, Company logo-aligned accent box right + Invoice No, Date */}
            <div className="flex flex-wrap justify-between items-start gap-6 mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground uppercase tracking-tight">{resolvedTitle}</h1>
                <div className="text-right">
                    <div className={`inline-block rounded-lg px-4 py-3 ${CARD_ACCENT_BG} border ${CARD_ACCENT_BORDER}`}>
                        {user?.logo_url ? (
                            <div className="flex items-center gap-3">
                                <LogoImage src={user.logo_url} alt="" className="h-10 w-auto" style={{ maxHeight: '40px' }} />
                                <span className="font-semibold text-foreground">{user?.company_name || 'Company'}</span>
                            </div>
                        ) : (
                            <span className="font-semibold text-foreground">{user?.company_name || 'Company'}</span>
                        )}
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                        <p>Invoice No: {invoice.invoice_number}</p>
                        <p>Date: {issueDate}</p>
                    </div>
                </div>
            </div>

            {/* Payable To | Bank Details */}
            <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Payable To</h3>
                    <p className="font-medium text-foreground">{client?.name || '—'}</p>
                    {client?.address && <p className="text-sm text-muted-foreground mt-0.5">{client.address}</p>}
                    {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
                </div>
                <div className="text-right">
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Bank Details</h3>
                    {bankingDetail ? (
                        <>
                            <p className="font-medium text-foreground">{bankingDetail.account_name || bankingDetail.bank_name}</p>
                            {bankingDetail.account_number && <p className="text-sm text-muted-foreground">{bankingDetail.account_number}</p>}
                            {bankingDetail.bank_name && bankingDetail.account_name && <p className="text-sm text-muted-foreground">{bankingDetail.bank_name}</p>}
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                    )}
                </div>
            </div>

            {/* Itemized table: logo-aligned accent header, 4 columns */}
            <div className="overflow-x-auto rounded-t-lg overflow-hidden mb-8">
                <table className="w-full text-sm">
                    <thead>
                        <tr className={`${CARD_ACCENT_BG} border ${CARD_ACCENT_BORDER}`}>
                            <th className="px-4 py-3.5 text-left text-xs font-bold text-foreground uppercase tracking-wider">Item Description</th>
                            <th className="px-4 py-3.5 text-right text-xs font-bold text-foreground uppercase tracking-wider w-20">Qty</th>
                            <th className="px-4 py-3.5 text-right text-xs font-bold text-foreground uppercase tracking-wider w-28">Price</th>
                            <th className="px-4 py-3.5 text-right text-xs font-bold text-foreground uppercase tracking-wider w-28">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                            invoice.items.map((item, index) => (
                                <tr key={index} className="border-b border-border">
                                    <td className="px-4 py-4 text-foreground">{item.service_name || item.name || 'Item'}</td>
                                    <td className="px-4 py-4 text-right text-foreground tabular-nums">{item.quantity}</td>
                                    <td className="px-4 py-4 text-right text-foreground tabular-nums">{formatCurrency(item.unit_price, userCurrency)}</td>
                                    <td className="px-4 py-4 text-right font-medium text-foreground tabular-nums">{formatCurrency(item.total_price || 0, userCurrency)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No items found</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Notes */}
            {invoice.notes && (
                <div className="mb-8">
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Notes</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{invoice.notes}</p>
                </div>
            )}

            {/* Totals: right-aligned logo-aligned accent box */}
            <div className="flex justify-end mb-8">
                <div className={`w-full max-w-xs rounded-lg border ${CARD_ACCENT_BORDER} ${CARD_ACCENT_BG} px-5 py-4`}>
                    <div className="flex justify-between py-2 text-sm text-foreground">
                        <span>Sub Total</span>
                        <span className="tabular-nums">{formatCurrency(invoice.subtotal, userCurrency)}</span>
                    </div>
                    {invoice.discount_amount > 0 && (
                        <div className="flex justify-between py-2 text-sm text-destructive">
                            <span>Discount</span>
                            <span className="tabular-nums">-{formatCurrency(invoice.discount_amount, userCurrency)}</span>
                        </div>
                    )}
                    {invoice.tax_rate > 0 && (
                        <div className="flex justify-between py-2 text-sm text-foreground">
                            <span>Tax ({invoice.tax_rate}%)</span>
                            <span className="tabular-nums">{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                        </div>
                    )}
                    <div className="border-t border-border mt-2 pt-3 flex justify-between text-base font-bold text-foreground">
                        <span>Grand Total</span>
                        <span className="tabular-nums">{formatCurrency(invoice.total_amount, userCurrency)}</span>
                    </div>
                </div>
            </div>

            {/* Terms */}
            {invoice.terms_conditions && (
                <section className="pt-6 border-t border-border">
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Payment Terms</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.terms_conditions}</p>
                </section>
            )}
        </div>
    );
}
