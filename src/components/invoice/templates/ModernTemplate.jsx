import React from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';
import LogoImage from '@/components/shared/LogoImage';

export default function ModernTemplate({ invoice, client, user, bankingDetail, userCurrency, safeFormatDate, documentTitle }) {
    const deliveryDate = safeFormatDate(invoice.delivery_date);
    const issueDate = safeFormatDate(invoice.created_date);
    const resolvedTitle = documentTitle || (invoice.type === 'QUOTE' ? 'QUOTE' : 'INVOICE');
    const dueLabel = resolvedTitle === 'QUOTE' ? 'Valid Until' : 'Due Date';

    return (
        <div className="bg-card">
            {/* Header with gradient */}
            <header className="bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white p-8 -mx-8 -mt-8 mb-8 rounded-t-lg">
                <div className="flex justify-between items-start">
                    <div className="max-w-md">
                        {user?.logo_url ? (
                            <div className="mb-3">
                                <LogoImage 
                                    src={user.logo_url} 
                                    alt="Company Logo" 
                                    className="h-14 w-auto max-w-xs object-contain bg-white p-2 rounded shadow-sm" 
                                    style={{ maxHeight: '56px' }}
                                />
                                {user?.company_name && (
                                    <p className="text-white/90 text-sm font-semibold mt-2">{user.company_name}</p>
                                )}
                            </div>
                        ) : (
                            <h1 className="text-2xl font-bold mb-2">
                                {user?.company_name || 'Your Company'}
                            </h1>
                        )}
                        {user?.company_address && (
                            <p className="text-white/90 text-sm whitespace-pre-line leading-relaxed">{user.company_address}</p>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className="text-4xl font-light tracking-wide mb-2">{resolvedTitle}</h2>
                        <p className="text-white/80">#{invoice.invoice_number}</p>
                        <p className="text-white/80">Issued: {issueDate}</p>
                        <p className="text-white/80">{dueLabel}: {deliveryDate}</p>
                    </div>
                </div>
            </header>

            {/* Custom Header Message */}
            {user?.invoice_header && (
                <div className="mb-6 p-4 bg-primary/10 rounded-xl border border-primary/20">
                    <p className="text-foreground whitespace-pre-line">{user.invoice_header}</p>
                </div>
            )}

            {/* Client Info */}
            <section className="grid grid-cols-2 gap-8 mb-8">
                <div className="bg-muted p-5 rounded-xl">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wide mb-3">Bill To</h3>
                    <p className="font-semibold text-foreground text-lg">{client.name}</p>
                    {client.contact_person && <p className="text-muted-foreground text-sm">Attn: {client.contact_person}</p>}
                    {client.address && <p className="text-muted-foreground mt-1">{client.address}</p>}
                    {client.tax_id && <p className="text-muted-foreground text-sm">Tax ID: {client.tax_id}</p>}
                    
                    {/* Contact Details */}
                    {(client.email || client.phone || client.website) && (
                        <div className="mt-3 pt-3 border-t border-border space-y-1">
                            {client.email && <p className="text-muted-foreground text-sm"><span className="font-medium">Email:</span> {client.email}</p>}
                            {client.phone && <p className="text-muted-foreground text-sm"><span className="font-medium">Phone:</span> {client.phone}</p>}
                            {client.website && <p className="text-muted-foreground text-sm"><span className="font-medium">Web:</span> {client.website}</p>}
                        </div>
                    )}
                </div>
                <div className="bg-muted p-5 rounded-xl text-right">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wide mb-3">Payment Due</h3>
                    <p className="font-semibold text-foreground text-lg">{deliveryDate}</p>
                    <p className="text-2xl font-bold text-primary mt-2">{formatCurrency(invoice.total_amount, userCurrency)}</p>
                </div>
            </section>
            
            {/* Items Table */}
            <section className="mb-8">
                <table className="w-full text-sm border border-border rounded-xl overflow-hidden">
                    <thead>
                        <tr className="bg-primary/10 border-b-2 border-primary/20">
                            <th className="px-5 py-3.5 text-left text-xs font-bold text-primary uppercase tracking-wider">Project Title</th>
                            <th className="px-5 py-3.5 text-center text-xs font-bold text-primary uppercase tracking-wider w-16">Qty</th>
                            <th className="px-5 py-3.5 text-right text-xs font-bold text-primary uppercase tracking-wider w-24">Price</th>
                            <th className="px-5 py-3.5 text-right text-xs font-bold text-primary uppercase tracking-wider w-24">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                            invoice.items.map((item, index) => (
                                <tr key={index}>
                                    <td className="px-5 py-3.5">
                                        <p className="font-medium text-foreground">{item.service_name || item.name || 'Item'}</p>
                                        {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                                    </td>
                                    <td className="px-5 py-3.5 text-center text-foreground tabular-nums">{item.quantity}</td>
                                    <td className="px-5 py-3.5 text-right text-foreground tabular-nums">{formatCurrency(item.unit_price, userCurrency)}</td>
                                    <td className="px-5 py-3.5 text-right font-medium text-foreground tabular-nums">{formatCurrency(item.total_price || 0, userCurrency)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No items found</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>

            {/* Totals */}
            <section className="flex justify-end mb-8">
                <div className="w-72">
                    <div className="flex justify-between py-2 text-muted-foreground">
                        <span>Subtotal</span>
                        <span>{formatCurrency(invoice.subtotal, userCurrency)}</span>
                    </div>
                    {invoice.discount_amount && invoice.discount_amount > 0 && (
                        <div className="flex justify-between py-2 text-destructive">
                            <span>
                                Discount {invoice.discount_type === 'percentage' ? `(${invoice.discount_value}%)` : ''}:
                            </span>
                            <span className="font-medium">-{formatCurrency(invoice.discount_amount, userCurrency)}</span>
                        </div>
                    )}
                    {Array.isArray(invoice.items) && invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                        <div className="flex justify-between py-2 text-muted-foreground">
                            <span>Item Taxes</span>
                            <span className="text-primary font-medium">{formatCurrency(invoice.item_taxes || 0, userCurrency)}</span>
                        </div>
                    )}
                    {invoice.tax_rate > 0 && (
                        <div className="flex justify-between py-2 text-muted-foreground">
                            <span>Invoice Tax ({invoice.tax_rate}%)</span>
                            <span>{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-3 mt-2 bg-gradient-to-r from-[#f24e00] to-[#ff7c00] text-white px-4 rounded-lg">
                        <span className="font-bold">Total Due</span>
                        <span className="font-bold text-lg">{formatCurrency(invoice.total_amount, userCurrency)}</span>
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

            {/* Notes */}
            {invoice.notes && (
                <section className="p-4 bg-muted rounded-xl">
                    <h3 className="font-bold text-foreground mb-2 text-sm">Notes</h3>
                    <p className="text-muted-foreground text-sm whitespace-pre-line">{invoice.notes}</p>
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