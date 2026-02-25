import React from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';
import LogoImage from '@/components/shared/LogoImage';

export default function BoldTemplate({ invoice, client, user, bankingDetail, userCurrency, safeFormatDate, documentTitle }) {
    const deliveryDate = safeFormatDate(invoice.delivery_date);
    const issueDate = safeFormatDate(invoice.created_date);
    const resolvedTitle = documentTitle || (invoice.type === 'QUOTE' ? 'QUOTE' : 'INVOICE');
    const dueLabel = resolvedTitle === 'QUOTE' ? 'Valid Until' : 'Due Date';

    return (
        <div className="bg-white">
            {/* Bold Header */}
            <header className="bg-teal-700 text-white p-8 -mx-8 -mt-8 mb-0">
                <div className="flex justify-between items-center">
                    <div className="max-w-md">
                        {user?.logo_url ? (
                            <div>
                                <LogoImage 
                                    src={user.logo_url} 
                                    alt="Logo" 
                                    className="h-16 w-auto max-w-xs object-contain bg-white p-3 rounded-lg shadow-lg" 
                                    style={{ maxHeight: '64px' }}
                                />
                                {user?.company_name && (
                                    <p className="text-white text-sm font-bold mt-2">{user.company_name}</p>
                                )}
                            </div>
                        ) : (
                            <h1 className="text-3xl font-black">
                                {user?.company_name || 'COMPANY'}
                            </h1>
                        )}
                    </div>
                    <div className="text-right">
                        <h2 className="text-5xl font-black">{resolvedTitle}</h2>
                    </div>
                </div>
            </header>

            {/* Invoice Info Bar */}
            <div className="bg-teal-600 text-white px-8 py-4 -mx-8 mb-8 flex justify-between text-sm flex-wrap gap-3">
                <div>
                    <span className="opacity-70">Invoice #:</span>
                    <span className="font-bold ml-2">{invoice.invoice_number}</span>
                </div>
                {user?.company_address && (
                    <div className="flex-1 min-w-[200px]">
                        <span className="opacity-70 text-xs whitespace-pre-line">{user.company_address}</span>
                    </div>
                )}
                <div>
                    <span className="opacity-70">Issued:</span>
                    <span className="font-bold ml-2">{issueDate}</span>
                </div>
                <div>
                    <span className="opacity-70">{dueLabel}:</span>
                    <span className="font-bold ml-2">{deliveryDate}</span>
                </div>
            </div>

            {/* Custom Header */}
            {user?.invoice_header && (
                <div className="mb-6 p-4 bg-teal-50 rounded-lg border-l-4 border-teal-500">
                    <p className="text-teal-800 font-medium whitespace-pre-line">{user.invoice_header}</p>
                </div>
            )}

            {/* Client Info */}
            <section className="grid grid-cols-2 gap-8 mb-8">
                <div>
                    <h3 className="text-teal-600 font-black text-sm uppercase mb-3">Bill To</h3>
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="font-bold text-gray-900 text-lg">{client.name}</p>
                        {client.contact_person && <p className="text-gray-600 text-sm">Attn: {client.contact_person}</p>}
                        {client.address && <p className="text-gray-600 mt-1">{client.address}</p>}
                        {client.tax_id && <p className="text-gray-600 text-sm">Tax ID: {client.tax_id}</p>}
                        
                        {/* Contact Details */}
                        {(client.email || client.phone || client.website) && (
                            <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-sm">
                                {client.email && <p className="text-gray-600"><span className="font-semibold">Email:</span> {client.email}</p>}
                                {client.phone && <p className="text-gray-600"><span className="font-semibold">Phone:</span> {client.phone}</p>}
                                {client.website && <p className="text-gray-600"><span className="font-semibold">Web:</span> {client.website}</p>}
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <h3 className="text-teal-600 font-black text-sm uppercase mb-3">From</h3>
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="font-bold text-gray-900 text-lg">{user?.company_name}</p>
                        <p className="text-gray-600 mt-1 whitespace-pre-line">{user?.company_address}</p>
                    </div>
                </div>
            </section>
            
            {/* Items Table */}
            <section className="mb-8">
                <table className="w-full">
                    <thead>
                        <tr className="bg-teal-700 text-white">
                            <th className="p-4 text-left font-bold uppercase text-sm">Service</th>
                            <th className="p-4 text-center font-bold uppercase text-sm">Qty</th>
                            <th className="p-4 text-right font-bold uppercase text-sm">Price</th>
                            {Array.isArray(invoice.items) && invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                                <>
                                    <th className="p-4 text-right font-bold uppercase text-sm">Tax %</th>
                                    <th className="p-4 text-right font-bold uppercase text-sm">Tax</th>
                                </>
                            )}
                            <th className="p-4 text-right font-bold uppercase text-sm">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                            invoice.items.map((item, index) => (
                                <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                    <td className="p-4">
                                        <p className="font-bold text-gray-900">{item.service_name}</p>
                                        {item.description && <p className="text-sm text-gray-500">{item.description}</p>}
                                    </td>
                                    <td className="p-4 text-center font-medium">{item.quantity}</td>
                                    <td className="p-4 text-right">{formatCurrency(item.unit_price, userCurrency)}</td>
                                    {Array.isArray(invoice.items) && invoice.items.some(i => i.item_tax_rate && i.item_tax_rate > 0) && (
                                        <>
                                            <td className="p-4 text-right text-gray-600">{item.item_tax_rate || 0}%</td>
                                            <td className="p-4 text-right text-orange-600 font-medium">{formatCurrency(item.item_tax_amount || 0, userCurrency)}</td>
                                        </>
                                    )}
                                    <td className="p-4 text-right font-bold">{formatCurrency((item.total_price || 0) + (item.item_tax_amount || 0), userCurrency)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={Array.isArray(invoice.items) && invoice.items.some(i => i.item_tax_rate && i.item_tax_rate > 0) ? 6 : 4} className="p-4 text-center text-gray-500">No items found</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>

            {/* Totals */}
            <section className="flex justify-end mb-8">
                <div className="w-80">
                    <div className="flex justify-between py-3 px-4 border-b border-gray-200">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="font-medium">{formatCurrency(invoice.subtotal, userCurrency)}</span>
                    </div>
                    {invoice.discount_amount && invoice.discount_amount > 0 && (
                        <div className="flex justify-between py-3 px-4 border-b border-gray-200">
                            <span className="text-red-600">
                                Discount {invoice.discount_type === 'percentage' ? `(${invoice.discount_value}%)` : ''}:
                            </span>
                            <span className="font-medium text-red-600">-{formatCurrency(invoice.discount_amount, userCurrency)}</span>
                        </div>
                    )}
                    {Array.isArray(invoice.items) && invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                        <div className="flex justify-between py-3 px-4 border-b border-gray-200">
                            <span className="text-gray-600">Item Taxes</span>
                            <span className="font-medium text-orange-600">{formatCurrency(invoice.item_taxes || 0, userCurrency)}</span>
                        </div>
                    )}
                    {invoice.tax_rate > 0 && (
                        <div className="flex justify-between py-3 px-4 border-b border-gray-200">
                            <span className="text-gray-600">Invoice Tax ({invoice.tax_rate}%)</span>
                            <span className="font-medium">{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-4 px-4 bg-teal-700 text-white rounded-lg mt-2">
                        <span className="font-black uppercase">Total Due</span>
                        <span className="font-black text-xl">{formatCurrency(invoice.total_amount, userCurrency)}</span>
                    </div>
                </div>
            </section>
            
            {/* Payment Details */}
            {bankingDetail && (
                <section className="mb-8 p-5 bg-teal-50 rounded-lg border border-teal-200">
                    <h3 className="font-black text-teal-700 mb-4 uppercase text-sm">Payment Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-teal-600 text-xs uppercase font-bold">Bank</p>
                            <p className="font-medium text-gray-900">{bankingDetail.bank_name}</p>
                        </div>
                        <div>
                            <p className="text-teal-600 text-xs uppercase font-bold">Account Name</p>
                            <p className="font-medium text-gray-900">{bankingDetail.account_name}</p>
                        </div>
                        {bankingDetail.account_number && (
                            <div>
                                <p className="text-teal-600 text-xs uppercase font-bold">Account Number</p>
                                <p className="font-medium text-gray-900">{bankingDetail.account_number}</p>
                            </div>
                        )}
                        {bankingDetail.routing_number && (
                            <div>
                                <p className="text-teal-600 text-xs uppercase font-bold">Branch Code</p>
                                <p className="font-medium text-gray-900">{bankingDetail.routing_number}</p>
                            </div>
                        )}
                        {bankingDetail.swift_code && (
                            <div>
                                <p className="text-teal-600 text-xs uppercase font-bold">SWIFT Code</p>
                                <p className="font-medium text-gray-900">{bankingDetail.swift_code}</p>
                            </div>
                        )}
                        {bankingDetail.additional_info && (
                            <div className="col-span-2">
                                <p className="text-teal-600 text-xs uppercase font-bold">Additional Info</p>
                                <p className="font-medium text-gray-900 whitespace-pre-line">{bankingDetail.additional_info}</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Notes */}
            {invoice.notes && (
                <section className="p-4 bg-gray-100 rounded-lg">
                    <h3 className="font-black text-gray-700 mb-2 uppercase text-sm">Notes</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-line">{invoice.notes}</p>
                </section>
            )}

            {/* Terms & Conditions */}
            {invoice.terms_conditions && (
                <section className="mt-6 p-4 bg-gray-100 rounded-lg">
                    <h3 className="font-black text-gray-700 mb-2 uppercase text-sm">Payment Terms</h3>
                    <p className="text-gray-600 text-sm whitespace-pre-line">{invoice.terms_conditions}</p>
                </section>
            )}
        </div>
    );
}