import React from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';

export default function ModernTemplate({ invoice, client, user, bankingDetail, userCurrency, safeFormatDate, documentTitle }) {
    const deliveryDate = safeFormatDate(invoice.delivery_date);
    const issueDate = safeFormatDate(invoice.created_date);
    const resolvedTitle = documentTitle || (invoice.type === 'QUOTE' ? 'QUOTE' : 'INVOICE');
    const dueLabel = resolvedTitle === 'QUOTE' ? 'Valid Until' : 'Due Date';

    return (
        <div className="bg-card">
            {/* Header with gradient — same structure: logo/company left, INVOICE + number right */}
            <header className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white p-4 sm:p-8 -mx-4 sm:-mx-8 -mt-4 sm:-mt-8 mb-6 sm:mb-8 rounded-t-lg">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="max-w-md min-w-0">
                        {user?.logo_url ? (
                            <div className="mb-2 sm:mb-3">
                                <img
                                    src={user.logo_url}
                                    alt="Company Logo"
                                    className="w-auto max-w-[120px] sm:max-w-xs bg-white p-1.5 sm:p-2 rounded shadow-sm"
                                    style={{ height: "60px", maxWidth: "300px", objectFit: "contain" }}
                                />
                                {user?.company_name && (
                                    <p className="text-white/90 text-xs sm:text-sm font-semibold mt-2">{user.company_name}</p>
                                )}
                            </div>
                        ) : (
                            <h1 className="text-xl sm:text-2xl font-bold mb-2">
                                {user?.company_name || 'Your Company'}
                            </h1>
                        )}
                        {user?.company_address && (
                            <p className="text-white/90 text-xs sm:text-sm whitespace-pre-line leading-relaxed line-clamp-2">{user.company_address}</p>
                        )}
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                        <h2 className="text-2xl sm:text-4xl font-light tracking-wide mb-1 sm:mb-2">{resolvedTitle}</h2>
                        <p className="text-white/80 text-sm">#{invoice.invoice_number}</p>
                        <p className="text-white/80 text-xs sm:text-sm">Issued: {issueDate}</p>
                        <p className="text-white/80 text-xs sm:text-sm">{dueLabel}: {deliveryDate}</p>
                    </div>
                </div>
            </header>

            {/* Custom Header Message */}
            {user?.invoice_header && (
                <div className="mb-6 p-4 bg-primary/10 rounded-xl border border-primary/20">
                    <p className="text-foreground whitespace-pre-line">{user.invoice_header}</p>
                </div>
            )}

            {/* Client Info — same structure as web: Bill To left, Payment Due right */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
                <div className="bg-muted p-4 sm:p-5 rounded-xl">
                    <h3 className="text-[10px] sm:text-xs font-bold text-primary uppercase tracking-wide mb-2 sm:mb-3">Bill To</h3>
                    <p className="font-semibold text-foreground text-base sm:text-lg">{client.name}</p>
                    {client.contact_person && <p className="text-muted-foreground text-xs sm:text-sm">Attn: {client.contact_person}</p>}
                    {client.address && <p className="text-muted-foreground text-xs sm:text-sm mt-1">{client.address}</p>}
                    {client.tax_id && <p className="text-muted-foreground text-xs sm:text-sm">Tax ID: {client.tax_id}</p>}
                    
                    {/* Contact Details */}
                    {(client.email || client.phone || client.website) && (
                        <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-border space-y-0.5 text-xs sm:text-sm">
                            {client.email && <p className="text-muted-foreground"><span className="font-medium">Email:</span> {client.email}</p>}
                            {client.phone && <p className="text-muted-foreground"><span className="font-medium">Phone:</span> {client.phone}</p>}
                            {client.website && <p className="text-muted-foreground"><span className="font-medium">Web:</span> {client.website}</p>}
                        </div>
                    )}
                </div>
                <div className="bg-muted p-4 sm:p-5 rounded-xl text-left sm:text-right">
                    <h3 className="text-[10px] sm:text-xs font-bold text-primary uppercase tracking-wide mb-2 sm:mb-3">Payment Due</h3>
                    <p className="font-semibold text-foreground text-base sm:text-lg">{deliveryDate}</p>
                    <p className="text-xl sm:text-2xl font-bold text-primary mt-2 tabular-nums whitespace-nowrap">{formatCurrency(invoice.total_amount, userCurrency)}</p>
                </div>
            </section>
            
            {/* Items Table — Project Title left, Qty one line, Price/Total no wrap; fixed layout for space */}
            <section className="mb-6 sm:mb-8 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="invoice-table w-full text-sm border border-border rounded-xl overflow-hidden min-w-[320px] table-fixed">
                    <colgroup>
                        <col className="w-auto min-w-0" />
                        <col style={{ width: '2.5rem' }} />
                        <col style={{ width: '6rem', minWidth: '5.5rem' }} />
                        <col style={{ width: '6rem', minWidth: '5.5rem' }} />
                    </colgroup>
                    <thead>
                        <tr className="bg-primary/10 border-b-2 border-primary/20">
                            <th className="pl-2 pr-2 sm:pl-3 sm:pr-3 py-2.5 sm:py-3.5 text-left text-xs font-bold text-primary uppercase tracking-wider">Description</th>
                            <th className="px-1 py-2.5 sm:py-3.5 text-center text-xs font-bold text-primary uppercase whitespace-nowrap" style={{ minWidth: '2.25rem' }}>Qty</th>
                            <th className="pl-2 pr-4 sm:pl-3 sm:pr-4 py-2.5 sm:py-3.5 text-right text-xs font-bold text-primary uppercase whitespace-nowrap">Price</th>
                            <th className="pl-2 pr-4 sm:pl-3 sm:pr-4 py-2.5 sm:py-3.5 text-right text-xs font-bold text-primary uppercase whitespace-nowrap">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                            invoice.items.map((item, index) => (
                                <tr key={index} className="border-b border-slate-50">
                                    <td className="pl-2 pr-2 sm:pl-3 sm:pr-3 py-2.5 sm:py-3.5 min-w-0">
                                        <p className="font-medium text-foreground text-xs sm:text-sm truncate">{item.service_name || item.name || 'Item'}</p>
                                    </td>
                                    <td className="px-1 py-2.5 sm:py-3.5 text-center text-foreground tabular-nums whitespace-nowrap">{item.quantity}</td>
                                    <td className="pl-2 pr-4 sm:pl-3 sm:pr-4 py-2.5 sm:py-3.5 text-right text-foreground tabular-nums text-xs sm:text-sm whitespace-nowrap">{formatCurrency(item.unit_price, userCurrency)}</td>
                                    <td className="pl-2 pr-4 sm:pl-3 sm:pr-4 py-2.5 sm:py-3.5 text-right font-medium text-foreground tabular-nums text-xs sm:text-sm whitespace-nowrap">{formatCurrency(item.total_price || 0, userCurrency)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-3 sm:px-5 py-6 sm:py-8 text-center text-muted-foreground text-sm">No items found</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>

            {/* Totals */}
            <section className="flex justify-end mb-6 sm:mb-8">
                <div className="w-full sm:w-72">
                    <div className="flex justify-between py-2 text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{formatCurrency(invoice.subtotal, userCurrency)}</span>
                    </div>
                    {invoice.discount_amount && invoice.discount_amount > 0 && (
                        <div className="flex justify-between py-2 text-destructive">
                            <span>
                                Discount {invoice.discount_type === 'percentage' ? `(${invoice.discount_value}%)` : ''}:
                            </span>
                            <span className="font-medium tabular-nums">-{formatCurrency(invoice.discount_amount, userCurrency)}</span>
                        </div>
                    )}
                    {Array.isArray(invoice.items) && invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                        <div className="flex justify-between py-2 text-muted-foreground">
                            <span>Item Taxes</span>
                            <span className="text-primary font-medium tabular-nums">{formatCurrency(invoice.item_taxes || 0, userCurrency)}</span>
                        </div>
                    )}
                    {invoice.tax_rate > 0 && (
                        <div className="flex justify-between py-2 text-muted-foreground">
                            <span>Invoice Tax ({invoice.tax_rate}%)</span>
                            <span className="tabular-nums">{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-3 mt-2 bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white px-4 rounded-lg">
                        <span className="font-bold">Total Due</span>
                        <span
                            className="font-bold tabular-nums tracking-tighter whitespace-nowrap min-w-0 pr-1"
                            style={{ fontSize: 'clamp(1.25rem, 4vw + 1rem, 2.25rem)' }}
                        >
                            {formatCurrency(invoice.total_amount, userCurrency)}
                        </span>
                    </div>
                </div>
            </section>
            
            {/* Payment Details */}
            {bankingDetail && (
                <section className="mb-8 p-5 bg-primary/10 rounded-xl border border-primary/20">
                    <h3 className="font-bold text-primary mb-4 text-sm uppercase tracking-wide">Payment Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-primary text-xs uppercase">Bank</p>
                            <p className="font-medium text-foreground">{bankingDetail.bank_name}</p>
                        </div>
                        <div>
                            <p className="text-primary text-xs uppercase">Account Name</p>
                            <p className="font-medium text-foreground">{bankingDetail.account_name}</p>
                        </div>
                        {bankingDetail.account_number && (
                            <div>
                                <p className="text-primary text-xs uppercase">Account Number</p>
                                <p className="font-medium text-foreground">{bankingDetail.account_number}</p>
                            </div>
                        )}
                        {bankingDetail.routing_number && (
                            <div>
                                <p className="text-primary text-xs uppercase">Branch Code</p>
                                <p className="font-medium text-foreground">{bankingDetail.routing_number}</p>
                            </div>
                        )}
                        {bankingDetail.swift_code && (
                            <div>
                                <p className="text-primary text-xs uppercase">SWIFT Code</p>
                                <p className="font-medium text-foreground">{bankingDetail.swift_code}</p>
                            </div>
                        )}
                        {bankingDetail.additional_info && (
                            <div className="col-span-2">
                                <p className="text-primary text-xs uppercase">Additional Info</p>
                                <p className="font-medium text-foreground whitespace-pre-line">{bankingDetail.additional_info}</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Notes: invoice notes + line-item notes */}
            {(invoice.notes || (Array.isArray(invoice.items) && invoice.items.some((item) => item.description))) && (
                <section className="p-4 bg-muted rounded-xl">
                    <h3 className="font-bold text-foreground mb-2 text-sm">Notes</h3>
                    {invoice.notes && <p className="text-muted-foreground text-sm whitespace-pre-line">{invoice.notes}</p>}
                    {Array.isArray(invoice.items) && invoice.items.filter((item) => item.description).length > 0 && (
                        <div className={invoice.notes ? 'mt-3 pt-3 border-t border-border' : ''}>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Service / line item notes</p>
                            <ul className="text-muted-foreground text-sm list-none space-y-1">
                                {invoice.items.filter((item) => item.description).map((item, idx) => (
                                    <li key={idx}>
                                        <span className="font-medium text-foreground">{item.service_name || item.name || 'Item'}:</span>{' '}
                                        <span className="whitespace-pre-line">{item.description}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            )}

            {/* Terms & Conditions */}
            {invoice.terms_conditions && (
                <section className="mt-6 p-4 bg-muted rounded-xl">
                    <h3 className="font-bold text-foreground mb-2 text-sm">Payment Terms</h3>
                    <p className="text-muted-foreground text-sm whitespace-pre-line">{invoice.terms_conditions}</p>
                </section>
            )}
        </div>
    );
}