import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/utils/currencyCalculations';
import { createPageUrl } from '@/utils';
import { RefreshCw } from 'lucide-react';

const HERO_SHADOW = '0px 20px 40px rgba(0, 102, 119, 0.15)';

export default function CreditCardDisplay({ balance, currency = 'ZAR', user, renewalDate: _renewalDate, onRefresh, title }) {
    const [syncing, setSyncing] = useState(false);
    const cardholder = user?.company_name || user?.full_name || 'Cardholder';
    const displayTitle = title === 'Business Balance' ? 'Business Balance' : 'Total Income';

    const handleRefresh = async () => {
        if (!onRefresh || syncing) return;
        setSyncing(true);
        try {
            await onRefresh();
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="relative w-full max-w-[380px] overflow-hidden rounded-[24px]">
            {/* Hero card: gradient, 24px radius, branded shadow */}
            <div
                className="relative w-full min-h-[200px] overflow-hidden rounded-[24px] p-6 sm:p-8 flex flex-col justify-between text-white transition-transform duration-300 hover:scale-[1.01]"
                style={{
                    background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)',
                    boxShadow: HERO_SHADOW,
                }}
            >
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent pointer-events-none rounded-[24px]" />

                <div className="relative flex flex-col gap-6">
                    {/* Large white title: Total Income / Business Balance */}
                    <h2 className="text-xl sm:text-2xl font-bold font-display text-white tracking-tight">
                        {displayTitle}
                    </h2>

                    {/* Amount in large white typography */}
                    <p className="text-3xl sm:text-4xl font-bold tabular-nums text-white drop-shadow-subtle">
                        {formatCurrency(balance, currency)}
                    </p>

                    {/* Bottom row: cardholder + logo */}
                    <div className="flex justify-between items-end mt-auto pt-4">
                        <p className="text-sm font-medium text-white/95 truncate max-w-[60%]">{cardholder}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <img src="/logo.svg" alt="Paidly" className="h-8 w-8 object-contain" />
                            <span className="text-[9px] font-medium text-white/90 lowercase tracking-wide">paidly.</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Functional bar: View income + Sync Now */}
            <div className="mt-3 flex items-center justify-between gap-2">
                <Link
                    to={createPageUrl("Invoices")}
                    className="text-xs font-medium text-foreground/80 hover:text-foreground transition-colors"
                >
                    View all income →
                </Link>
                {typeof onRefresh === 'function' && (
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={syncing}
                        className="flex items-center gap-1.5 text-xs font-medium text-foreground/80 hover:text-foreground transition-colors disabled:opacity-60"
                        aria-label="Refresh balance"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Syncing…' : 'Sync now'}
                    </button>
                )}
            </div>
        </div>
    );
}
