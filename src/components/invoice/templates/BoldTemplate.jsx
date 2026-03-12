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
            {/* Bold Header — same structure: logo/company left, INVOICE right */}
            <header className="bg-[#f24e00] text-white p-4 sm:p-8 -mx-4 sm:-mx-8 -mt-4 sm:-mt-8 mb-0">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="max-w-md min-w-0">
                        {user?.logo_url ? (
                            <div>
                                <LogoImage 
                                    src={user.logo_url} 
                                    alt="Logo" 
                                    className="h-12 sm:h-16 w-auto max-w-[140px] sm:max-w-xs object-contain bg-white p-2 sm:p-3 rounded-lg shadow-lg" 
                                    style={{ maxHeight: '48px' }}
                                />
                                {user?.company_name && (
                                    <p className="text-white text-xs sm:text-sm font-bold mt-2">{user.company_name}</p>
                                )}
                            </div>
                        ) : (
                            <h1 className="text-xl sm:text-3xl font-black">
                                {user?.company_name || 'COMPANY'}
                            </h1>
                        )}
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                        <h2 className="text-3xl sm:text-5xl font-black">{resolvedTitle}</h2>
                    </div>
                </div>
            </header>

            {/* Invoice Info Bar */}
            <div className="bg-[#ff7c00] text-white px-4 sm:px-8 py-3 sm:py-4 -mx-4 sm:-mx-8 mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between gap-2 sm:gap-3 text-sm flex-wrap">
                <div>
                    <span className="opacity-70">Invoice #:</span>
                    <span className="font-bold ml-2">{invoice.invoice_number}</span>
                </div>
                {user?.company_address && (
                    <div className="flex-1 min-w-0 max-w-full sm:min-w-[200px]">
                        <span className="opacity-70 text-xs whitespace-pre-line line-clamp-2">{user.company_address}</span>
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
                <div className="mb-6 p-4 bg-[#fff7ed] rounded-lg border-l-4 border-[#f24e00]">
                    <p className="text-[#9a3412] font-medium whitespace-pre-line">{user.invoice_header}</p>
                </div>
            )}

            {/* Client Info — same structure as web: Bill To left, From right */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
                <div>
                    <h3 className="text-[#f24e00] font-black text-xs sm:text-sm uppercase mb-2 sm:mb-3">Bill To</h3>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                        <p className="font-bold text-gray-900 text-base sm:text-lg">{client.name}</p>
                        {client.contact_person && <p className="text-gray-600 text-xs sm:text-sm">Attn: {client.contact_person}</p>}
                        {client.address && <p className="text-gray-600 text-xs sm:text-sm mt-1">{client.address}</p>}
                        {client.tax_id && <p className="text-gray-600 text-xs sm:text-sm">Tax ID: {client.tax_id}</p>}
                        
                        {/* Contact Details */}
                        {(client.email || client.phone || client.website) && (
                            <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-200 space-y-0.5 sm:space-y-1 text-xs sm:text-sm">
                                {client.email && <p className="text-gray-600"><span className="font-semibold">Email:</span> {client.email}</p>}
                                {client.phone && <p className="text-gray-600"><span className="font-semibold">Phone:</span> {client.phone}</p>}
                                {client.website && <p className="text-gray-600"><span className="font-semibold">Web:</span> {client.website}</p>}
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <h3 className="text-[#f24e00] font-black text-xs sm:text-sm uppercase mb-2 sm:mb-3">From</h3>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                        <p className="font-bold text-gray-900 text-base sm:text-lg">{user?.company_name}</p>
                        <p className="text-gray-600 text-xs sm:text-sm mt-1 whitespace-pre-line">{user?.company_address}</p>
                    </div>
                </div>
            </section>
            
            {/* Items Table — same columns: Project Title, Qty, Price, Total */}
            <section className="mb-6 sm:mb-8 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full text-sm min-w-[320px]">
                    <thead>
                        <tr className="bg-[#f24e00] text-white">
                            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-left text-xs font-bold uppercase tracking-wider">Project Title</th>
                            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-center text-xs font-bold uppercase tracking-wider w-12 sm:w-16">Qty</th>
                            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right text-xs font-bold uppercase tracking-wider w-20 sm:w-24">Price</th>
                            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right text-xs font-bold uppercase tracking-wider w-20 sm:w-24">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                            invoice.items.map((item, index) => (
                                <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                    <td className="px-3 sm:px-5 py-2.5 sm:py-3.5">
                                        <p className="font-semibold text-gray-900 text-xs sm:text-sm">{item.service_name || item.name || 'Item'}</p>
                                        {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                                    </td>
                                    <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-center text-gray-700 tabular-nums">{item.quantity}</td>
                                    <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right text-gray-700 tabular-nums text-xs sm:text-sm">{formatCurrency(item.unit_price, userCurrency)}</td>
                                    <td className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right font-semibold text-gray-900 tabular-nums text-xs sm:text-sm">{formatCurrency(item.total_price || 0, userCurrency)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-3 sm:px-5 py-6 sm:py-8 text-center text-gray-500 text-sm">No items found</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>

            {/* Totals */}
            <section className="flex justify-end mb-6 sm:mb-8">
                <div className="w-full sm:w-80">
                    <div className="flex justify-between py-3 px-4 border-b border-gray-200">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="font-medium tabular-nums">{formatCurrency(invoice.subtotal, userCurrency)}</span>
                    </div>
                    {invoice.discount_amount && invoice.discount_amount > 0 && (
                        <div className="flex justify-between py-3 px-4 border-b border-gray-200">
                            <span className="text-red-600">
                                Discount {invoice.discount_type === 'percentage' ? `(${invoice.discount_value}%)` : ''}:
                            </span>
                            <span className="font-medium text-red-600 tabular-nums">-{formatCurrency(invoice.discount_amount, userCurrency)}</span>
                        </div>
                    )}
                    {Array.isArray(invoice.items) && invoice.items.some(item => item.item_tax_rate && item.item_tax_rate > 0) && (
                        <div className="flex justify-between py-3 px-4 border-b border-gray-200">
                            <span className="text-gray-600">Item Taxes</span>
                            <span className="font-medium text-orange-600 tabular-nums">{formatCurrency(invoice.item_taxes || 0, userCurrency)}</span>
                        </div>
                    )}
                    {invoice.tax_rate > 0 && (
                        <div className="flex justify-between py-3 px-4 border-b border-gray-200">
                            <span className="text-gray-600">Invoice Tax ({invoice.tax_rate}%)</span>
                            <span className="font-medium tabular-nums">{formatCurrency(invoice.tax_amount, userCurrency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-4 px-4 bg-[#f24e00] text-white rounded-lg mt-2">
                        <span className="font-black uppercase">Total Due</span>
                        <span
                            className="font-black tabular-nums tracking-tighter whitespace-nowrap min-w-0"
                            style={{ fontSize: 'clamp(1.25rem, 4vw + 1rem, 2.25rem)' }}
                        >
                            {formatCurrency(invoice.total_amount, userCurrency)}
                        </span>
                    </div>
                </div>
            </section>
            
            {/* Payment Details */}
            {bankingDetail && (
                <section className="mb-8 p-5 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
                    <h3 className="font-black text-[#9a3412] mb-4 uppercase text-sm">Payment Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-[#ea580c] text-xs uppercase font-bold">Bank</p>
                            <p className="font-medium text-gray-900">{bankingDetail.bank_name}</p>
                        </div>
                        <div>
                            <p className="text-[#ea580c] text-xs uppercase font-bold">Account Name</p>
                            <p className="font-medium text-gray-900">{bankingDetail.account_name}</p>
                        </div>
                        {bankingDetail.account_number && (
                            <div>
                                <p className="text-[#ea580c] text-xs uppercase font-bold">Account Number</p>
                                <p className="font-medium text-gray-900">{bankingDetail.account_number}</p>
                            </div>
                        )}
                        {bankingDetail.routing_number && (
                            <div>
                                <p className="text-[#ea580c] text-xs uppercase font-bold">Branch Code</p>
                                <p className="font-medium text-gray-900">{bankingDetail.routing_number}</p>
                            </div>
                        )}
                        {bankingDetail.swift_code && (
                            <div>
                                <p className="text-[#ea580c] text-xs uppercase font-bold">SWIFT Code</p>
                                <p className="font-medium text-gray-900">{bankingDetail.swift_code}</p>
                            </div>
                        )}
                        {bankingDetail.additional_info && (
                            <div className="col-span-2">
                                <p className="text-[#ea580c] text-xs uppercase font-bold">Additional Info</p>
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