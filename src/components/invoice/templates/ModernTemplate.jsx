import React from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';
import { getUnitLabel } from '../itemTypeHelpers';

export default function ModernTemplate({ invoice, client, user, bankingDetail, userCurrency, safeFormatDate, documentTitle }) {
    const deliveryDate = safeFormatDate(invoice.delivery_date);
    const issueDate = safeFormatDate(invoice.created_date);
    const resolvedTitle = documentTitle || (invoice.type === 'QUOTE' ? 'QUOTE' : 'INVOICE');
    const dueLabel = resolvedTitle === 'QUOTE' ? 'Valid Until' : 'Due Date';

    return (
        <div className="bg-white">
            {/* Header with gradient */}
            <header className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-8 -mx-8 -mt-8 mb-8 rounded-t-lg">
                <div className="flex justify-between items-start">
                    <div className="max-w-md">
                        {user?.logo_url ? (
                            <div className="mb-3">
                                <img 
                                    src={user.logo_url} 
                                    alt="Company Logo" 
                                    className="h-14 w-auto max-w-xs object-contain bg-white p-2 rounded shadow-sm" 
                                    style={{ maxHeight: '56px' }}
                                />
                                {user?.company_name && (
                                    <p className="text-purple-100 text-sm font-semibold mt-2">{user.company_name}</p>
                                )}
                            </div>
                        ) : (
                            <h1 className="text-2xl font-bold mb-2">
                                {user?.company_name || 'Your Company'}
                            </h1>
                        )}
                        {user?.company_address && (
                            <p className="text-purple-100 text-sm whitespace-pre-line leading-relaxed">{user.company_address}</p>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className="text-4xl font-light tracking-wide mb-2">{resolvedTitle}</h2>
                        <p className="text-purple-200">#{invoice.invoice_number}</p>
                        <p className="text-purple-200">Issued: {issueDate}</p>
                        <p className="text-purple-200">{dueLabel}: {deliveryDate}</p>
                    </div>
                </div>
            </header>

            {/* Custom Header Message */}
            {user?.invoice_header && (
                <div className="mb-6 p-4 bg-purple-50 rounded-xl border border-purple-200">
                    <p className="text-purple-800 whitespace-pre-line">{user.invoice_header}</p>
                </div>
            )}

            {/* Client Info */}
            <section className="grid grid-cols-2 gap-8 mb-8">
                <div className="bg-gray-50 p-5 rounded-xl">
                    <h3 className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-3">Bill To</h3>
                    <p className="font-semibold text-gray-900 text-lg">{client.name}</p>
                    {client.contact_person && <p className="text-gray-600 text-sm">Attn: {client.contact_person}</p>}
                    {client.address && <p className="text-gray-600 mt-1">{client.address}</p>}
                    {client.tax_id && <p className="text-gray-600 text-sm">Tax ID: {client.tax_id}</p>}
                    
                    {/* Contact Details */}
                    {(client.email || client.phone || client.website) && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                            {client.email && <p className="text-gray-600 text-sm"><span className="font-medium">Email:</span> {client.email}</p>}
                            {client.phone && <p className="text-gray-600 text-sm"><span className="font-medium">Phone:</span> {client.phone}</p>}
                            {client.website && <p className="text-gray-600 text-sm"><span className="font-medium">Web:</span> {client.website}</p>}
                        </div>
                    )}
                </div>
                <div className="bg-gray-50 p-5 rounded-xl text-right">
                    <h3 className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-3">Payment Due</h3>
                    <p className="font-semibold text-gray-900 text-lg">{deliveryDate}</p>
                    <p className="text-2xl font-bold text-purple-600 mt-2">{formatCurrency(invoice.total_amount, userCurrency)}</p>
                </div>
            </section>
            
            {/* Items Table */}
            <section className="mb-8">
                <table className="w-full">
                    <thead>
                        <tr className="border-b-2 border-purple-200">
                            <th className="py-3 text-left text-xs font-bold text-purple-600 uppercase tracking-wide">Description</th>
                            <th className="py-3 text-center text-xs font-bold text-purple-600 uppercase tracking-wide">Qty</th>
                            <th className="py-3 text-right text-xs font-bold text-purple-600 uppercase tracking-wide">Rate</th>
                            {invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                                <>
                                    <th className="py-3 text-right text-xs font-bold text-purple-600 uppercase tracking-wide">Tax %</th>
                                    <th className="py-3 text-right text-xs font-bold text-purple-600 uppercase tracking-wide">Tax</th>
                                </>
                            )}
                            <th className="py-3 text-right text-xs font-bold text-purple-600 uppercase tracking-wide">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoice.items.map((item, index) => (
                            <tr key={index} className="border-b border-gray-100">
                                <td className="py-4">
                                    <div>
                                        <p className="font-medium text-gray-900">{item.service_name}</p>
                                        {item.part_number && <p className="text-xs text-gray-500">Part #: {item.part_number}</p>}
                                        {item.sku && <p className="text-xs text-gray-500">SKU: {item.sku}</p>}
                                        {item.description && <p className="text-sm text-gray-500 mt-1">{item.description}</p>}
                                        {item.details && <p className="text-xs text-gray-400 italic">{item.details}</p>}
                                    </div>
                                </td>
                                <td className="py-4 text-center text-gray-700">
                                    {item.quantity} {getUnitLabel(item.item_type || 'service', item.unit_type || 'unit')}
                                </td>
                                <td className="py-4 text-right text-gray-700">{formatCurrency(item.unit_price, userCurrency)}</td>
                                {invoice.items.some(i => i.item_tax_rate && i.item_tax_rate > 0) && (
                                    <>
                                        <td className="py-4 text-right text-gray-600">{item.item_tax_rate || 0}%</td>
                                        <td className="py-4 text-right font-medium text-orange-600">{formatCurrency(item.item_tax_amount || 0, userCurrency)}</td>
                                    </>
                                )}
                                <td className="py-4 text-right font-medium text-gray-900">{formatCurrency((item.total_price || 0) + (item.item_tax_amount || 0), userCurrency)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {/* Totals */}
            <section className="flex justify-end mb-8">
                <div className="w-72">
                    <div className="flex justify-between py-2 text-gray-600">
                        <span>Subtotal</span>
                        <span>{formatCurrency(invoice.subtotal, userCurrency)}</span>
                    </div>
                    {invoice.discount_amount && invoice.discount_amount > 0 && (
                        <div className="flex justify-between py-2 text-red-600">
                            <span>
                                Discount {invoice.discount_type === 'percentage' ? `(${invoice.discount_value}%)` : ''}:
                            </span>
                            <span className="font-medium">-{formatCurrency(invoice.discount_amount, userCurrency)}</span>
                        </div>
                    )}
                    {invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                        <div className="flex justify-between py-2 text-gray-600">
                            <span>Item Taxes</span>
                            <span className="text-orange-600 font-medium">{formatCurrency(invoice.item_taxes || 0, userCurrency)}</span>
                        </div>
                    )}
                    {invoice.tax_rate > 0 && (
                        <div className="flex justify-between py-2 text-gray-600">
                            <span>Invoice Tax ({invoice.tax_rate}%)</span>
                            <span>{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-3 mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 rounded-lg">
                        <span className="font-bold">Total Due</span>
                        <span className="font-bold text-lg">{formatCurrency(invoice.total_amount, userCurrency)}</span>
                    </div>
                </div>
            </section>
            
            {/* Payment Details */}
            {bankingDetail && (
                <section className="mb-8 p-5 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl">
                    <h3 className="font-bold text-purple-700 mb-4 text-sm uppercase tracking-wide">Payment Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-purple-500 text-xs uppercase">Bank</p>
                            <p className="font-medium text-gray-900">{bankingDetail.bank_name}</p>
                        </div>
                        <div>
                            <p className="text-purple-500 text-xs uppercase">Account Name</p>
                            <p className="font-medium text-gray-900">{bankingDetail.account_name}</p>
                        </div>
                        {bankingDetail.account_number && (
                            <div>
                                <p className="text-purple-500 text-xs uppercase">Account Number</p>
                                <p className="font-medium text-gray-900">{bankingDetail.account_number}</p>
                            </div>
                        )}
                        {bankingDetail.routing_number && (
                            <div>
                                <p className="text-purple-500 text-xs uppercase">Branch Code</p>
                                <p className="font-medium text-gray-900">{bankingDetail.routing_number}</p>
                            </div>
                        )}
                        {bankingDetail.swift_code && (
                            <div>
                                <p className="text-purple-500 text-xs uppercase">SWIFT Code</p>
                                <p className="font-medium text-gray-900">{bankingDetail.swift_code}</p>
                            </div>
                        )}
                        {bankingDetail.additional_info && (
                            <div className="col-span-2">
                                <p className="text-purple-500 text-xs uppercase">Additional Info</p>
                                <p className="font-medium text-gray-900 whitespace-pre-line">{bankingDetail.additional_info}</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Notes */}
            {invoice.notes && (
                <section className="p-4 bg-gray-50 rounded-xl">
                    <h3 className="font-bold text-gray-700 mb-2 text-sm">Notes</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-line">{invoice.notes}</p>
                </section>
            )}

            {/* Terms & Conditions */}
            {invoice.terms_conditions && (
                <section className="mt-6 p-4 bg-gray-50 rounded-xl">
                    <h3 className="font-bold text-gray-700 mb-2 text-sm">Payment Terms</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-line">{invoice.terms_conditions}</p>
                </section>
            )}
        </div>
    );
}