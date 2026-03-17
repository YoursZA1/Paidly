import React from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';

/* Agency-style: INVOICE left, company logo-aligned accent box right, Payable To | Bank Details, 4-col table, Notes, Totals. Colours match app/logo (primary). */

const CARD_ACCENT_BG = 'bg-primary/10';
const CARD_ACCENT_BORDER = 'border-primary/20';

export default function MinimalTemplate({ invoice, client, user, bankingDetail, userCurrency, safeFormatDate, documentTitle }) {
    const deliveryDate = safeFormatDate(invoice.delivery_date);
    const issueDate = safeFormatDate(invoice.created_date);
    const resolvedTitle = documentTitle || (invoice.type === 'QUOTE' ? 'QUOTE' : 'INVOICE');

    return (
        <div className="bg-card text-foreground font-normal">
            {/* Header: Title left, Company logo-aligned accent box right + Invoice No, Date — same structure as web */}
            <div className="flex flex-col sm:flex-row flex-wrap justify-between items-start gap-4 sm:gap-6 mb-6 sm:mb-8">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground uppercase tracking-tight order-2 sm:order-1">{resolvedTitle}</h1>
                <div className="text-left sm:text-right order-1 sm:order-2 shrink-0">
                    <div className={`inline-block rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 ${CARD_ACCENT_BG} border ${CARD_ACCENT_BORDER}`}>
                        {user?.logo_url ? (
                            <div className="flex items-center gap-2 sm:gap-3">
                                <img
                                    src={user.logo_url}
                                    alt="Company Logo"
                                    className="w-auto"
                                    style={{ height: "60px", maxWidth: "300px", objectFit: "contain" }}
                                />
                                <span className="font-semibold text-foreground text-sm sm:text-base">{user?.company_name || 'Company'}</span>
                            </div>
                        ) : (
                            <span className="font-semibold text-foreground text-sm sm:text-base">{user?.company_name || 'Company'}</span>
                        )}
                    </div>
                    <div className="mt-2 sm:mt-3 text-xs sm:text-sm text-muted-foreground">
                        <p>Invoice No: {invoice.invoice_number}</p>
                        <p>Date: {issueDate}</p>
                    </div>
                </div>
            </div>

            {/* Payable To | Bank Details — same structure as web, stack on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
                <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Payable To</h3>
                    <p className="font-medium text-foreground">{client?.name || '—'}</p>
                    {client?.address && <p className="text-sm text-muted-foreground mt-0.5">{client.address}</p>}
                    {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
                </div>
                <div className="text-left sm:text-right">
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

            {/* Itemized table: description left, Qty one line, Price/Total room for 6+ digit values */}
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 rounded-t-lg overflow-hidden mb-6 sm:mb-8">
                <table className="w-full text-sm min-w-[300px] table-fixed">
                    <colgroup>
                        <col className="w-auto min-w-0" />
                        <col style={{ width: '2.5rem' }} />
                        <col style={{ width: '6rem', minWidth: '5.5rem' }} />
                        <col style={{ width: '6rem', minWidth: '5.5rem' }} />
                    </colgroup>
                    <thead>
                        <tr className={`${CARD_ACCENT_BG} border ${CARD_ACCENT_BORDER}`}>
                            <th className="pl-2 pr-2 sm:pl-4 sm:pr-4 py-2.5 sm:py-3.5 text-left text-xs font-bold text-foreground uppercase tracking-wider">Description</th>
                            <th className="px-1 py-2.5 sm:py-3.5 text-center text-xs font-bold text-foreground uppercase whitespace-nowrap" style={{ minWidth: '2.25rem' }}>Qty</th>
                            <th className="pl-2 pr-4 sm:pl-4 sm:pr-4 py-2.5 sm:py-3.5 text-right text-xs font-bold text-foreground uppercase whitespace-nowrap">Price</th>
                            <th className="pl-2 pr-4 sm:pl-4 sm:pr-4 py-2.5 sm:py-3.5 text-right text-xs font-bold text-foreground uppercase whitespace-nowrap">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                            invoice.items.map((item, index) => (
                                <tr key={index} className="border-b border-slate-50">
                                    <td className="pl-2 pr-2 sm:pl-4 sm:pr-4 py-3 sm:py-4 text-foreground text-xs sm:text-sm min-w-0 truncate">{item.service_name || item.name || 'Item'}</td>
                                    <td className="px-1 py-3 sm:py-4 text-center text-foreground tabular-nums whitespace-nowrap">{item.quantity}</td>
                                    <td className="pl-2 pr-4 sm:pl-4 sm:pr-4 py-3 sm:py-4 text-right text-foreground tabular-nums text-xs sm:text-sm whitespace-nowrap">{formatCurrency(item.unit_price, userCurrency)}</td>
                                    <td className="pl-2 pr-4 sm:pl-4 sm:pr-4 py-3 sm:py-4 text-right font-medium text-foreground tabular-nums text-xs sm:text-sm whitespace-nowrap">{formatCurrency(item.total_price || 0, userCurrency)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-3 sm:px-4 py-8 sm:py-10 text-center text-muted-foreground text-sm">No items found</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Notes: invoice notes + line-item notes */}
            {(invoice.notes || (Array.isArray(invoice.items) && invoice.items.some((item) => item.description))) && (
                <div className="mb-8">
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Notes</h3>
                    {invoice.notes && <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{invoice.notes}</p>}
                    {Array.isArray(invoice.items) && invoice.items.filter((item) => item.description).length > 0 && (
                        <div className={invoice.notes ? 'mt-3 pt-3 border-t border-border' : ''}>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Service / line item notes</p>
                            <ul className="text-sm text-muted-foreground list-none space-y-1">
                                {invoice.items.filter((item) => item.description).map((item, idx) => (
                                    <li key={idx}>
                                        <span className="font-medium text-foreground">{item.service_name || item.name || 'Item'}:</span>{' '}
                                        <span className="whitespace-pre-line">{item.description}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Totals: right-aligned logo-aligned accent box — full width on mobile */}
            <div className="flex justify-end mb-6 sm:mb-8">
                <div className={`w-full max-w-full sm:max-w-xs rounded-lg border ${CARD_ACCENT_BORDER} ${CARD_ACCENT_BG} px-4 sm:px-5 py-3 sm:py-4`}>
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
                        <span
                            className="tabular-nums tracking-tighter whitespace-nowrap min-w-0 pr-1"
                            style={{ fontSize: 'clamp(1.125rem, 3vw + 0.75rem, 2rem)' }}
                        >
                            {formatCurrency(invoice.total_amount, userCurrency)}
                        </span>
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
