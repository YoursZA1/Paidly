import { formatCurrency } from '@/utils/currencyCalculations';

/** Derive a stable 16-digit card number from user id (unique per user, same every time). */
function getCardNumberForUser(userId) {
    if (!userId || typeof userId !== 'string') return '5412 7512 3412 3456';
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        const c = userId.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash = hash & 0x7fffffff;
    }
    const n = Math.abs(hash) % 1e16;
    const s = String(n).padStart(16, '0');
    return [s.slice(0, 4), s.slice(4, 8), s.slice(8, 12), s.slice(12, 16)].join(' ');
}

/** Format a renewal date as MM/YY for the card. */
function formatValidThru(renewalDate) {
    if (!renewalDate) return '—/—';
    const d = renewalDate instanceof Date ? renewalDate : new Date(renewalDate);
    if (Number.isNaN(d.getTime())) return '—/—';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${month}/${year}`;
}

export default function CreditCardDisplay({ balance, currency = 'ZAR', user, renewalDate: renewalDateProp }) {
    const cardholder = user?.company_name || user?.full_name || 'Cardholder';
    const cardNumber = getCardNumberForUser(user?.id);
    const renewalDate = renewalDateProp ?? user?.renewal_date ?? user?.subscription_renewal_date;
    const validThru = formatValidThru(renewalDate);

    return (
        <div className="relative w-full max-w-[380px] aspect-[1.586/1] min-h-[200px] rounded-[16px] overflow-hidden shadow-2xl ring-1 ring-white/5 transition-transform duration-300 hover:scale-[1.02]">
            {/* Base: dark slate blue / charcoal */}
            <div
                className="absolute inset-0"
                style={{ backgroundColor: '#2d3748' }}
            />
            {/* Subtle dot halftone texture */}
            <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                    backgroundSize: '12px 12px',
                }}
            />
            {/* Soft reflection along top edge */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent pointer-events-none" />

            {/* Two white curved arcs */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 380 240" fill="none">
                <path
                    d="M-20 40 Q 200 120 420 80"
                    stroke="rgba(255,255,255,0.35)"
                    strokeWidth="1.5"
                    fill="none"
                />
                <path
                    d="M 280 -10 Q 340 40 380 60"
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth="1.2"
                    fill="none"
                />
            </svg>

            <div className="relative p-5 sm:p-6 h-full flex flex-col justify-between text-white">
                {/* Top row: "world" left, contactless right */}
                <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-white/95 lowercase tracking-wide">world</span>
                    {/* Contactless: three arcs (standard symbol) */}
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-white/95 shrink-0 -rotate-90">
                        <path d="M12 4 a8 8 0 0 1 0 16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                        <path d="M12 8 a4 4 0 0 1 0 8" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                        <path d="M12 11 a1 1 0 0 1 0 2" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    </svg>
                </div>

                {/* Middle: "debit" label */}
                <div className="flex justify-end">
                    <span className="text-sm font-medium text-white/95 lowercase tracking-wide">debit</span>
                </div>

                {/* Card number: unique per user, centered, bold monospace */}
                <div className="tracking-[0.2em] font-mono text-base sm:text-lg font-bold text-white select-none text-center">
                    {cardNumber}
                </div>

                {/* Valid thru (next renewal) + Current balance row */}
                <div className="flex justify-between items-end gap-4">
                    <div>
                        <p className="text-[10px] uppercase tracking-widest text-white/50 font-medium">Valid thru</p>
                        <p className="text-sm font-medium text-white/95">{validThru}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest text-white/50 font-medium">Current balance</p>
                        <p className="text-lg font-bold tabular-nums text-white/95">{formatCurrency(balance, currency)}</p>
                    </div>
                </div>

                {/* Bottom: cardholder left, InvoiceBreek logo (Mastercard-style circles) + wordmark right */}
                <div className="flex justify-between items-end">
                    <div className="min-w-0 max-w-[60%]">
                        <p className="text-sm font-medium text-white/95 truncate">{cardholder}</p>
                    </div>
                    {/* InvoiceBreek logo icon + wordmark */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <img
                            src="/Logo icon.png"
                            alt="InvoiceBreek"
                            className="h-8 w-8 object-contain"
                        />
                        <span className="text-[9px] font-medium text-white/90 lowercase tracking-wide">invoicebreek.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
