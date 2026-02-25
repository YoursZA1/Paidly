import React from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';
import LogoImage from '@/components/shared/LogoImage';

export default function MinimalTemplate({ invoice, client, user, bankingDetail, userCurrency, safeFormatDate, documentTitle }) {
    const deliveryDate = safeFormatDate(invoice.delivery_date);
    const issueDate = safeFormatDate(invoice.created_date);
    const resolvedTitle = documentTitle || (invoice.type === 'QUOTE' ? 'QUOTE' : 'INVOICE');
    const dueLabel = resolvedTitle === 'QUOTE' ? 'Valid Until' : 'Due Date';

    return (
        <div className="bg-white font-light">
            {/* Minimal Header */}
            <header className="border-b border-gray-900 pb-8 mb-8">
                <div className="flex justify-between items-end">
                    <div className="max-w-sm">
                        {user?.logo_url ? (
                            <div className="mb-4">
                                <LogoImage 
                                    src={user.logo_url} 
                                    alt="Logo" 
                                    className="h-12 w-auto max-w-xs object-contain grayscale" 
                                    style={{ maxHeight: '48px' }}
                                />
                                {user?.company_name && (
                                    <p className="text-sm text-gray-700 mt-2 tracking-tight">{user.company_name}</p>
                                )}
                            </div>
                        ) : (
                            <h1 className="text-xl font-normal text-gray-900 tracking-tight">
                                {user?.company_name || 'Company'}
                            </h1>
                        )}
                        {user?.company_address && (
                            <p className="text-gray-500 text-xs mt-2 whitespace-pre-line leading-relaxed">{user.company_address}</p>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-1">{resolvedTitle}</h2>
                        <p className="text-2xl font-normal text-gray-900">{invoice.invoice_number}</p>
                    </div>
                </div>
            </header>

            {/* Custom Header */}
            {user?.invoice_header && (
                <div className="mb-8 py-4 border-y border-gray-200">
                    <p className="text-gray-600 text-sm whitespace-pre-line">{user.invoice_header}</p>
                </div>
            )}

            {/* Client & Date */}
            <section className="grid grid-cols-3 gap-8 mb-12">
                <div>
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-2">Billed To</h3>
                    <p className="text-gray-900">{client.name}</p>
                    {client.contact_person && <p className="text-gray-500 text-sm">Attn: {client.contact_person}</p>}
                    {client.address && <p className="text-gray-500 text-sm">{client.address}</p>}
                    {client.tax_id && <p className="text-gray-500 text-xs">Tax ID: {client.tax_id}</p>}
                    
                    {/* Contact Info */}
                    <div className="mt-2 pt-2 border-t border-gray-200 text-[11px] space-y-1">
                        {client.email && <p className="text-gray-600">{client.email}</p>}
                        {client.phone && <p className="text-gray-600">{client.phone}</p>}
                        {client.website && <p className="text-gray-600">{client.website}</p>}
                    </div>
                </div>
                <div>
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-2">Date of Issue</h3>
                    <p className="text-gray-900">{issueDate}</p>
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mt-4 mb-2">{dueLabel}</h3>
                    <p className="text-gray-900">{deliveryDate}</p>
                </div>
                <div className="text-right">
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-2">Amount Due</h3>
                    <p className="text-2xl text-gray-900">{formatCurrency(invoice.total_amount, userCurrency)}</p>
                </div>
            </section>
            
            {/* Items */}
            <section className="mb-12">
                <div className="border-b border-gray-900 pb-2 mb-4 grid grid-cols-12 text-[10px] uppercase tracking-[0.2em] text-gray-400">
                    <div className="col-span-4">Item</div>
                    <div className="col-span-2 text-center">Qty</div>
                    <div className="col-span-2 text-right">Rate</div>
                    {Array.isArray(invoice.items) && invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                        <>
                            <div className="col-span-1 text-right">Tax %</div>
                            <div className="col-span-1 text-right">Tax</div>
                        </>
                    )}
                    <div className="col-span-2 text-right">Total</div>
                </div>
                {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                    invoice.items.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 py-3 border-b border-gray-100">
                            <div className="col-span-4">
                                <p className="text-gray-900">{item.service_name}</p>
                                {item.description && <p className="text-xs text-gray-400 mt-1">{item.description}</p>}
                            </div>
                            <div className="col-span-2 text-center text-gray-600">{item.quantity}</div>
                            <div className="col-span-2 text-right text-gray-600">{formatCurrency(item.unit_price, userCurrency)}</div>
                            {Array.isArray(invoice.items) && invoice.items.some(i => i.item_tax_rate && i.item_tax_rate > 0) && (
                                <>
                                    <div className="col-span-1 text-right text-gray-600">{item.item_tax_rate || 0}%</div>
                                    <div className="col-span-1 text-right text-gray-600">{formatCurrency(item.item_tax_amount || 0, userCurrency)}</div>
                                </>
                            )}
                            <div className="col-span-2 text-right text-gray-900">{formatCurrency((item.total_price || 0) + (item.item_tax_amount || 0), userCurrency)}</div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-12 py-4 text-center text-gray-500">No items found</div>
                )}
            </section>

            {/* Totals */}
            <section className="flex justify-end mb-12">
                <div className="w-64">
                    <div className="flex justify-between py-2 text-sm text-gray-500">
                        <span>Subtotal</span>
                        <span>{formatCurrency(invoice.subtotal, userCurrency)}</span>
                    </div>
                    {invoice.discount_amount && invoice.discount_amount > 0 && (
                        <div className="flex justify-between py-2 text-sm text-red-600">
                            <span>
                                Discount {invoice.discount_type === 'percentage' ? `(${invoice.discount_value}%)` : ''}:
                            </span>
                            <span className="font-medium">-{formatCurrency(invoice.discount_amount, userCurrency)}</span>
                        </div>
                    )}
                    {Array.isArray(invoice.items) && invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                        <div className="flex justify-between py-2 text-sm text-gray-500">
                            <span>Item Taxes</span>
                            <span className="text-orange-600 font-medium">{formatCurrency(invoice.item_taxes || 0, userCurrency)}</span>
                        </div>
                    )}
                    {invoice.tax_rate > 0 && (
                        <div className="flex justify-between py-2 text-sm text-gray-500">
                            <span>Invoice Tax ({invoice.tax_rate}%)</span>
                            <span>{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-3 mt-2 border-t border-gray-900">
                        <span className="text-gray-900">Total</span>
                        <span className="text-xl text-gray-900">{formatCurrency(invoice.total_amount, userCurrency)}</span>
                    </div>
                </div>
            </section>
            
            {/* Payment */}
            {bankingDetail && (
                <section className="mb-8 py-6 border-t border-gray-200">
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-4">Payment Details</h3>
                    <div className="grid grid-cols-4 gap-6 text-sm">
                        <div>
                            <p className="text-gray-400 text-xs">Bank</p>
                            <p className="text-gray-900">{bankingDetail.bank_name}</p>
                        </div>
                        <div>
                            <p className="text-gray-400 text-xs">Account</p>
                            <p className="text-gray-900">{bankingDetail.account_name}</p>
                        </div>
                        {bankingDetail.account_number && (
                            <div>
                                <p className="text-gray-400 text-xs">Number</p>
                                <p className="text-gray-900">{bankingDetail.account_number}</p>
                            </div>
                        )}
                        {bankingDetail.routing_number && (
                            <div>
                                <p className="text-gray-400 text-xs">Branch</p>
                                <p className="text-gray-900">{bankingDetail.routing_number}</p>
                            </div>
                        )}
                        {bankingDetail.swift_code && (
                            <div>
                                <p className="text-gray-400 text-xs">SWIFT</p>
                                <p className="text-gray-900">{bankingDetail.swift_code}</p>
                            </div>
                        )}
                        {bankingDetail.additional_info && (
                            <div className="col-span-4">
                                <p className="text-gray-400 text-xs">Additional Info</p>
                                <p className="text-gray-900 whitespace-pre-line">{bankingDetail.additional_info}</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Notes */}
            {invoice.notes && (
                <section className="pt-6 border-t border-gray-200">
                    <p className="text-gray-500 text-sm whitespace-pre-line">{invoice.notes}</p>
                </section>
            )}

            {/* Terms & Conditions */}
            {invoice.terms_conditions && (
                <section className="pt-6 border-t border-gray-200">
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-3">Payment Terms</h3>
                    <p className="text-gray-500 text-sm whitespace-pre-line">{invoice.terms_conditions}</p>
                </section>
            )}
        </div>
    );
}