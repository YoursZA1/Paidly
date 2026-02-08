import React from 'react';
import { Card } from '@/components/ui/card';
import { CreditCard, Wifi } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyCalculations';

export default function CreditCardDisplay({ balance, currency = 'ZAR', user }) {
    return (
        <Card className="relative bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 text-white border-0 shadow-2xl overflow-hidden h-[220px] rounded-3xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-400/30 to-blue-400/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-br from-cyan-400/20 to-blue-500/20 rounded-full blur-3xl" />
            
            <div className="relative p-6 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-lg flex items-center justify-center">
                            <CreditCard className="w-6 h-6 text-white" />
                        </div>
                        <Wifi className="w-6 h-6 rotate-90" />
                    </div>
                </div>

                <div>
                    <p className="text-sm text-white/70 mb-2">Current Balance</p>
                    <p className="text-3xl font-bold mb-6">{formatCurrency(balance, currency)}</p>
                    
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-xs text-white/50 mb-1">Cardholder</p>
                            <p className="text-sm font-semibold">{user?.company_name || user?.full_name || 'Business Account'}</p>
                        </div>
                        <div className="flex gap-2">
                            <div className="w-8 h-8 rounded-full bg-red-500/80" />
                            <div className="w-8 h-8 rounded-full bg-yellow-500/80 -ml-4" />
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}