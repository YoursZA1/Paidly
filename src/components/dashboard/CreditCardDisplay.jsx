import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { NumberTicker } from '@/components/dashboard/NumberTicker';

export default function CreditCardDisplay({ balance, currency = 'ZAR', user, renewalDate: _renewalDate, onRefresh, title, isDataReady = true, variant = 'default' }) {
    const [syncing, setSyncing] = useState(false);
    const cardholder = user?.company_name || user?.full_name || 'Company Name';
    const displayTitle = title === 'Business Balance' ? 'Business Balance' : 'Total Income';
    const numericBalance = typeof balance === 'number' && Number.isFinite(balance) ? balance : 0;

    const handleRefresh = async () => {
        if (!onRefresh || syncing) return;
        setSyncing(true);
        try {
            await onRefresh();
        } finally {
            setSyncing(false);
        }
    };

    const isCarousel = variant === 'carousel';

    return (
        <div className={`relative w-full ${isCarousel ? 'w-full min-w-0' : 'max-w-[380px]'}`}>
            {/* Total Income card: vibrant orange gradient + glassmorphism + soft glow */}
            <div
                className="relative w-full min-h-[220px] overflow-hidden rounded-2xl p-6 sm:p-8 flex flex-col justify-between text-white transition-all duration-300 hover:shadow-[0_20px_50px_-12px_rgba(242,78,0,0.35)] backdrop-blur-xl border border-white/20"
                style={{
                    background: 'linear-gradient(145deg, #f24e00 0%, #ff7c00 45%, #e85a00 100%)',
                    boxShadow: '0 4px 24px -2px rgba(242, 78, 0, 0.25), 0 0 0 1px rgba(255,255,255,0.08) inset',
                }}
            >
                {/* Glassmorphism overlay */}
                <div
                    className="absolute inset-0 pointer-events-none rounded-2xl"
                    style={{
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.06) 100%)',
                        backdropFilter: 'blur(1px)',
                    }}
                />
                {/* Soft highlight top-left */}
                <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/12 to-transparent pointer-events-none rounded-t-2xl" />

                <div className="relative flex flex-col flex-1 justify-center text-center">
                    {/* Centered: Total Income */}
                    <h2 className="text-base sm:text-lg font-semibold text-white/95 tracking-tight mb-2">
                        {displayTitle}
                    </h2>
                    {/* Large bold currency value — spring ticker */}
                    <p className="text-3xl sm:text-4xl font-bold text-white tracking-tight drop-shadow-sm mb-6">
                        <NumberTicker value={numericBalance} currency={currency} enabled={isDataReady} />
                    </p>
                </div>

                {/* Bottom row: Company name (left) + Paidly logo (right) */}
                <div className="relative flex justify-between items-end pt-4 border-t border-white/15">
                    <p className="text-sm font-medium text-white/90 truncate max-w-[55%]">{cardholder}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <img src="/logo.svg" alt="Paidly" className="h-7 w-7 object-contain opacity-95" />
                        <span className="text-[10px] font-medium text-white/80 lowercase tracking-widest">paidly</span>
                    </div>
                </div>
            </div>

            {/* Action bar — hidden in carousel to save space */}
            {!isCarousel && (
            <div className="mt-4 flex items-center gap-3">
                <Link
                    to={createPageUrl("Invoices")}
                    className="inline-flex items-center gap-2 min-h-10 px-4 rounded-xl bg-muted/80 hover:bg-muted text-foreground text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
                    aria-label="View all income and invoices"
                >
                    View all income
                    <ArrowRight className="w-4 h-4 text-muted-foreground" aria-hidden />
                </Link>
                {typeof onRefresh === 'function' && (
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={syncing}
                        aria-label={syncing ? 'Syncing balance' : 'Sync balance now'}
                        className="inline-flex items-center gap-2 min-h-10 px-4 rounded-xl border border-border bg-card hover:bg-muted/80 text-foreground text-sm font-medium transition-colors disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
                        {syncing ? 'Syncing…' : 'Sync now'}
                    </button>
                )}
            </div>
            )}
        </div>
    );
}
