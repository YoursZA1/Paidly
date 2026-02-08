import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '../CurrencySelector';
import { Building2, Wallet } from 'lucide-react';

export default function BalanceSheetReport({ data, currency = 'ZAR', dateRange }) {
    const {
        cashOnHand = 0,
        accountsReceivable = 0,
        otherAssets = 0,
        accountsPayable = 0,
        otherLiabilities = 0,
        equity = 0,
    } = data;

    const totalAssets = cashOnHand + accountsReceivable + otherAssets;
    const totalLiabilities = accountsPayable + otherLiabilities;
    const totalEquity = equity;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

    const RowItem = ({ label, value, isSubtotal, isTotal, indent = false }) => (
        <div className={`flex justify-between py-3 border-b ${
            isTotal ? 'border-slate-300 bg-slate-50 px-4 -mx-4 font-bold text-lg' :
            isSubtotal ? 'font-semibold bg-slate-50 px-4 -mx-4' : 
            indent ? 'pl-6' : ''
        }`}>
            <span className="text-slate-800">{label}</span>
            <span className="text-slate-900">{formatCurrency(value, currency)}</span>
        </div>
    );

    return (
        <Card className="bg-white border-0 shadow-xl">
            <CardHeader className="border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50">
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="text-slate-900 text-2xl">Balance Sheet</CardTitle>
                        {dateRange && (
                            <p className="text-sm text-slate-600 mt-1">As of {dateRange}</p>
                        )}
                    </div>
                    <div className="flex gap-4">
                        <div className="text-center">
                            <p className="text-xs text-slate-500">Total Assets</p>
                            <p className="text-lg font-bold text-purple-600">{formatCurrency(totalAssets, currency)}</p>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Assets */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Wallet className="w-6 h-6 text-green-600" />
                            <h3 className="font-bold text-slate-900 text-xl">Assets</h3>
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-semibold text-slate-700 mt-4 mb-2">Current Assets</h4>
                            <RowItem label="Cash on Hand" value={cashOnHand} indent />
                            <RowItem label="Accounts Receivable" value={accountsReceivable} indent />
                            <RowItem label="Other Assets" value={otherAssets} indent />
                            <RowItem label="Total Assets" value={totalAssets} isTotal />
                        </div>
                    </div>

                    {/* Liabilities & Equity */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Building2 className="w-6 h-6 text-blue-600" />
                            <h3 className="font-bold text-slate-900 text-xl">Liabilities & Equity</h3>
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-semibold text-slate-700 mt-4 mb-2">Liabilities</h4>
                            <RowItem label="Accounts Payable" value={accountsPayable} indent />
                            <RowItem label="Other Liabilities" value={otherLiabilities} indent />
                            <RowItem label="Total Liabilities" value={totalLiabilities} isSubtotal />
                            
                            <h4 className="font-semibold text-slate-700 mt-4 mb-2">Equity</h4>
                            <RowItem label="Owner's Equity" value={totalEquity} indent />
                            <RowItem label="Total Equity" value={totalEquity} isSubtotal />
                            
                            <RowItem label="Total Liabilities & Equity" value={totalLiabilitiesAndEquity} isTotal />
                        </div>
                    </div>
                </div>

                {/* Balance Check */}
                <div className="mt-8 pt-6 border-t">
                    <div className={`p-4 rounded-xl ${
                        Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01 
                            ? 'bg-green-50 border border-green-200' 
                            : 'bg-yellow-50 border border-yellow-200'
                    }`}>
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">Balance Check:</span>
                            <span className={`font-bold ${
                                Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01 
                                    ? 'text-green-600' 
                                    : 'text-yellow-600'
                            }`}>
                                {Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01 
                                    ? '✓ Balanced' 
                                    : `⚠ Difference: ${formatCurrency(totalAssets - totalLiabilitiesAndEquity, currency)}`}
                            </span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}