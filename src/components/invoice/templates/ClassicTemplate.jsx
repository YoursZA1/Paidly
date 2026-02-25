import React from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';
import { getUnitLabel } from '../itemTypeHelpers';
import LogoImage from '@/components/shared/LogoImage';

export default function ClassicTemplate({ invoice, client, user, bankingDetail, userCurrency, safeFormatDate, documentTitle }) {
    const deliveryDate = safeFormatDate(invoice.delivery_date);
    const issueDate = safeFormatDate(invoice.created_date);
    const resolvedTitle = documentTitle || (invoice.type === 'QUOTE' ? 'QUOTE' : 'INVOICE');
    const dueLabel = resolvedTitle === 'QUOTE' ? 'Valid Until' : 'Due Date';

    return (
        <div className="bg-white">
            {/* Header */}
            <header className="border-b-2 border-gray-200 pb-6 mb-6">
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
                                    <p className="text-sm font-semibold text-gray-700 mt-2">{user.company_name}</p>
                                )}
                            </div>
                        ) : (
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">
                                {user?.company_name || 'Your Company'}
                            </h1>
                        )}
                        {user?.company_address && (
                            <p className="text-gray-600 mt-2 whitespace-pre-line text-sm leading-relaxed">{user.company_address}</p>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className="text-3xl font-bold text-indigo-600 mb-2">{resolvedTitle}</h2>
                        <p className="text-gray-600"><strong>#:</strong> {invoice.invoice_number}</p>
                    </div>
                </div>
            </header>

            {/* Custom Header Message */}
            {user?.invoice_header && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border-l-4 border-indigo-500">
                    <p className="text-gray-700 whitespace-pre-line">{user.invoice_header}</p>
                </div>
            )}

            {/* From & To Section */}
            <section className="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Billed To</h3>
                    <p className="font-bold text-gray-800">{client.name}</p>
                    {client.contact_person && <p className="text-gray-600 text-sm">Attn: {client.contact_person}</p>}
                    {client.address && <p className="text-gray-600">{client.address}</p>}
                    {client.tax_id && <p className="text-gray-600 text-sm">Tax ID: {client.tax_id}</p>}
                    
                    {/* Contact Information */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                        {client.email && <p className="text-gray-600 text-sm"><span className="font-semibold">Email:</span> {client.email}</p>}
                        {client.alternate_email && <p className="text-gray-600 text-sm"><span className="font-semibold">Alt Email:</span> {client.alternate_email}</p>}
                        {client.phone && <p className="text-gray-600 text-sm"><span className="font-semibold">Phone:</span> {client.phone}</p>}
                        {client.fax && <p className="text-gray-600 text-sm"><span className="font-semibold">Fax:</span> {client.fax}</p>}
                        {client.website && <p className="text-gray-600 text-sm"><span className="font-semibold">Website:</span> {client.website}</p>}
                    </div>
                </div>
                <div className="text-right">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Date of Issue</h3>
                    <p className="font-bold text-gray-800">{issueDate}</p>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mt-4 mb-2">{dueLabel}</h3>
                    <p className="font-bold text-gray-800">{deliveryDate}</p>
                </div>
            </section>
            
            {/* Items Table */}
            <section className="mb-8">
                <table className="w-full text-left">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="p-3 text-sm font-semibold text-gray-700">Service/Item</th>
                            <th className="p-3 text-sm font-semibold text-gray-700 text-center">Qty</th>
                            <th className="p-3 text-sm font-semibold text-gray-700 text-right">Price</th>
                            {Array.isArray(invoice.items) && invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                                <>
                                    <th className="p-3 text-sm font-semibold text-gray-700 text-right">Tax Rate</th>
                                    <th className="p-3 text-sm font-semibold text-gray-700 text-right">Tax</th>
                                </>
                            )}
                            <th className="p-3 text-sm font-semibold text-gray-700 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                            invoice.items.map((item, index) => (
                                <tr key={index} className="border-b border-gray-100">
                                    <td className="p-3">
                                        <div>
                                            <p className="font-medium text-gray-800">{item.service_name}</p>
                                            {item.part_number && <p className="text-xs text-gray-600">Part #: {item.part_number}</p>}
                                            {item.sku && <p className="text-xs text-gray-600">SKU: {item.sku}</p>}
                                            <p className="text-xs text-gray-600">{item.description}</p>
                                            {item.details && <p className="text-xs text-gray-500 italic">{item.details}</p>}
                                        </div>
                                    </td>
                                    <td className="p-3 text-center text-gray-800">
                                        {item.quantity} {getUnitLabel(item.item_type || 'service', item.unit_type || 'unit')}
                                    </td>
                                    <td className="p-3 text-right">{formatCurrency(item.unit_price, userCurrency)}</td>
                                    {Array.isArray(invoice.items) && invoice.items.some(i => i.item_tax_rate && i.item_tax_rate > 0) && (
                                        <>
                                            <td className="p-3 text-right text-gray-600">{item.item_tax_rate || 0}%</td>
                                            <td className="p-3 text-right text-orange-600 font-medium">{formatCurrency(item.item_tax_amount || 0, userCurrency)}</td>
                                        </>
                                    )}
                                    <td className="p-3 text-right font-medium">{formatCurrency((item.total_price || 0) + (item.item_tax_amount || 0), userCurrency)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={Array.isArray(invoice.items) && invoice.items.some(i => i.item_tax_rate && i.item_tax_rate > 0) ? 6 : 4} className="p-3 text-center text-gray-500">No items found</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>

            {/* Totals Section */}
            <section className="flex justify-end mb-8">
                <div className="w-full max-w-sm">
                    <div className="flex justify-between py-2 border-b">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="font-medium">{formatCurrency(invoice.subtotal, userCurrency)}</span>
                    </div>
                    {invoice.discount_amount && invoice.discount_amount > 0 && (
                        <div className="flex justify-between py-2 border-b">
                            <span className="text-red-600">
                                Discount {invoice.discount_type === 'percentage' ? `(${invoice.discount_value}%)` : ''}:
                            </span>
                            <span className="font-medium text-red-600">-{formatCurrency(invoice.discount_amount, userCurrency)}</span>
                        </div>
                    )}
                    {Array.isArray(invoice.items) && invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                        <div className="flex justify-between py-2 border-b">
                            <span className="text-gray-600">Item Taxes</span>
                            <span className="font-medium text-orange-600">{formatCurrency(invoice.item_taxes || 0, userCurrency)}</span>
                        </div>
                    )}
                    {invoice.tax_rate > 0 && (
                        <div className="flex justify-between py-2 border-b">
                            <span className="text-gray-600">Invoice Tax ({invoice.tax_rate}%)</span>
                            <span className="font-medium">{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-3 text-lg bg-gray-100 px-3 rounded-md mt-2">
                        <span className="font-bold text-gray-800">Total</span>
                        <span className="font-bold text-indigo-600">{formatCurrency(invoice.total_amount, userCurrency)}</span>
                    </div>
                </div>
            </section>
            
            {/* Payment Details Section */}
            {bankingDetail && (
                <section className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <h3 className="font-semibold text-gray-800 mb-3">Payment Details</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-gray-500">Bank Name</p>
                            <p className="font-medium text-gray-800">{bankingDetail.bank_name}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Account Name</p>
                            <p className="font-medium text-gray-800">{bankingDetail.account_name}</p>
                        </div>
                        {bankingDetail.account_number && (
                            <div>
                                <p className="text-gray-500">Account Number</p>
                                <p className="font-medium text-gray-800">{bankingDetail.account_number}</p>
                            </div>
                        )}
                        {bankingDetail.routing_number && (
                            <div>
                                <p className="text-gray-500">Branch/Routing Code</p>
                                <p className="font-medium text-gray-800">{bankingDetail.routing_number}</p>
                            </div>
                        )}
                        {bankingDetail.swift_code && (
                            <div>
                                <p className="text-gray-500">SWIFT Code</p>
                                <p className="font-medium text-gray-800">{bankingDetail.swift_code}</p>
                            </div>
                        )}
                        {bankingDetail.additional_info && (
                            <div className="col-span-2">
                                <p className="text-gray-500">Additional Info</p>
                                <p className="font-medium text-gray-800">{bankingDetail.additional_info}</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Notes Section */}
            {invoice.notes && (
                <section>
                    <h3 className="font-semibold text-gray-800 mb-2">Notes</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-line">{invoice.notes}</p>
                </section>
            )}

            {/* Terms & Conditions */}
            {invoice.terms_conditions && (
                <section className="mt-6">
                    <h3 className="font-semibold text-gray-800 mb-2">Payment Terms</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-line">{invoice.terms_conditions}</p>
                </section>
            )}
        </div>
    );
}