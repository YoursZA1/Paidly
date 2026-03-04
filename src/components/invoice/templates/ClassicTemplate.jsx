import React from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';
import LogoImage from '@/components/shared/LogoImage';

export default function ClassicTemplate({ invoice, client, user, bankingDetail, userCurrency, safeFormatDate, documentTitle }) {
    const deliveryDate = safeFormatDate(invoice.delivery_date);
    const issueDate = safeFormatDate(invoice.created_date);
    const resolvedTitle = documentTitle || (invoice.type === 'QUOTE' ? 'QUOTE' : 'INVOICE');
    const dueLabel = resolvedTitle === 'QUOTE' ? 'Valid Until' : 'Due Date';

    return (
        <div className="bg-card">
            {/* Header */}
            <header className="border-b-2 border-border pb-6 mb-6">
                <div className="flex justify-between items-start">
                    <div className="max-w-md">
                        {user?.logo_url ? (
                            <div className="mb-4">
                                <LogoImage 
                                    src={user.logo_url} 
                                    alt="Company Logo" 
                                    className="h-16 w-auto max-w-xs object-contain" 
                                    style={{ maxHeight: '64px' }}
                                />
                                {user?.company_name && (
                                    <p className="text-sm font-semibold text-muted-foreground mt-2">{user.company_name}</p>
                                )}
                            </div>
                        ) : (
                            <h1 className="text-2xl font-bold text-foreground mb-2">
                                {user?.company_name || 'Your Company'}
                            </h1>
                        )}
                        {user?.company_address && (
                            <p className="text-muted-foreground mt-2 whitespace-pre-line text-sm leading-relaxed">{user.company_address}</p>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className="text-3xl font-bold text-primary mb-2">{resolvedTitle}</h2>
                        <p className="text-muted-foreground"><strong>#:</strong> {invoice.invoice_number}</p>
                    </div>
                </div>
            </header>

            {/* Custom Header Message */}
            {user?.invoice_header && (
                <div className="mb-6 p-4 bg-muted rounded-lg border-l-4 border-primary">
                    <p className="text-foreground whitespace-pre-line">{user.invoice_header}</p>
                </div>
            )}

            {/* From & To Section */}
            <section className="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Billed To</h3>
                    <p className="font-bold text-foreground">{client.name}</p>
                    {client.contact_person && <p className="text-muted-foreground text-sm">Attn: {client.contact_person}</p>}
                    {client.address && <p className="text-muted-foreground">{client.address}</p>}
                    {client.tax_id && <p className="text-muted-foreground text-sm">Tax ID: {client.tax_id}</p>}
                    
                    {/* Contact Information */}
                    <div className="mt-4 pt-4 border-t border-border">
                        {client.email && <p className="text-muted-foreground text-sm"><span className="font-semibold">Email:</span> {client.email}</p>}
                        {client.alternate_email && <p className="text-muted-foreground text-sm"><span className="font-semibold">Alt Email:</span> {client.alternate_email}</p>}
                        {client.phone && <p className="text-muted-foreground text-sm"><span className="font-semibold">Phone:</span> {client.phone}</p>}
                        {client.fax && <p className="text-muted-foreground text-sm"><span className="font-semibold">Fax:</span> {client.fax}</p>}
                        {client.website && <p className="text-muted-foreground text-sm"><span className="font-semibold">Website:</span> {client.website}</p>}
                    </div>
                </div>
                <div className="text-right">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Date of Issue</h3>
                    <p className="font-bold text-foreground">{issueDate}</p>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase mt-4 mb-2">{dueLabel}</h3>
                    <p className="font-bold text-foreground">{deliveryDate}</p>
                </div>
            </section>
            
            {/* Items Table */}
            <section className="mb-8">
                <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                    <thead className="bg-primary/10 border-b border-primary/20">
                        <tr>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">Project Title</th>
                            <th className="px-5 py-3 text-center text-xs font-semibold text-foreground uppercase tracking-wider w-16">Qty</th>
                            <th className="px-5 py-3 text-right text-xs font-semibold text-foreground uppercase tracking-wider w-24">Price</th>
                            <th className="px-5 py-3 text-right text-xs font-semibold text-foreground uppercase tracking-wider w-24">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                            invoice.items.map((item, index) => (
                                <tr key={index}>
                                    <td className="px-5 py-3">
                                        <p className="font-medium text-foreground">{item.service_name || item.name || 'Item'}</p>
                                        {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                                    </td>
                                    <td className="px-5 py-3 text-center text-foreground tabular-nums">{item.quantity}</td>
                                    <td className="px-5 py-3 text-right text-foreground tabular-nums">{formatCurrency(item.unit_price, userCurrency)}</td>
                                    <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatCurrency(item.total_price || 0, userCurrency)}</td>
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

            {/* Totals Section */}
            <section className="flex justify-end mb-8">
                <div className="w-full max-w-sm">
                    <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">{formatCurrency(invoice.subtotal, userCurrency)}</span>
                    </div>
                    {invoice.discount_amount && invoice.discount_amount > 0 && (
                        <div className="flex justify-between py-2 border-b border-border">
                            <span className="text-destructive">
                                Discount {invoice.discount_type === 'percentage' ? `(${invoice.discount_value}%)` : ''}:
                            </span>
                            <span className="font-medium text-destructive">-{formatCurrency(invoice.discount_amount, userCurrency)}</span>
                        </div>
                    )}
                    {Array.isArray(invoice.items) && invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                        <div className="flex justify-between py-2 border-b border-border">
                            <span className="text-muted-foreground">Item Taxes</span>
                            <span className="font-medium text-primary">{formatCurrency(invoice.item_taxes || 0, userCurrency)}</span>
                        </div>
                    )}
                    {invoice.tax_rate > 0 && (
                        <div className="flex justify-between py-2 border-b border-border">
                            <span className="text-muted-foreground">Invoice Tax ({invoice.tax_rate}%)</span>
                            <span className="font-medium">{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-3 text-lg bg-primary/10 px-3 rounded-md mt-2 border border-primary/20">
                        <span className="font-bold text-foreground">Total</span>
                        <span className="font-bold text-primary">{formatCurrency(invoice.total_amount, userCurrency)}</span>
                    </div>
                </div>
            </section>
            
            {/* Payment Details Section */}
            {bankingDetail && (
                <section className="mb-8 p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <h3 className="font-semibold text-foreground mb-3">Payment Details</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-muted-foreground">Bank Name</p>
                            <p className="font-medium text-foreground">{bankingDetail.bank_name}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Account Name</p>
                            <p className="font-medium text-foreground">{bankingDetail.account_name}</p>
                        </div>
                        {bankingDetail.account_number && (
                            <div>
                                <p className="text-muted-foreground">Account Number</p>
                                <p className="font-medium text-foreground">{bankingDetail.account_number}</p>
                            </div>
                        )}
                        {bankingDetail.routing_number && (
                            <div>
                                <p className="text-muted-foreground">Branch/Routing Code</p>
                                <p className="font-medium text-foreground">{bankingDetail.routing_number}</p>
                            </div>
                        )}
                        {bankingDetail.swift_code && (
                            <div>
                                <p className="text-muted-foreground">SWIFT Code</p>
                                <p className="font-medium text-foreground">{bankingDetail.swift_code}</p>
                            </div>
                        )}
                        {bankingDetail.additional_info && (
                            <div className="col-span-2">
                                <p className="text-muted-foreground">Additional Info</p>
                                <p className="font-medium text-foreground">{bankingDetail.additional_info}</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Notes Section */}
            {invoice.notes && (
                <section>
                    <h3 className="font-semibold text-foreground mb-2">Notes</h3>
                    <p className="text-muted-foreground text-sm whitespace-pre-line">{invoice.notes}</p>
                </section>
            )}

            {/* Terms & Conditions */}
            {invoice.terms_conditions && (
                <section className="mt-6">
                    <h3 className="font-semibold text-foreground mb-2">Payment Terms</h3>
                    <p className="text-muted-foreground text-sm whitespace-pre-line">{invoice.terms_conditions}</p>
                </section>
            )}
        </div>
    );
}