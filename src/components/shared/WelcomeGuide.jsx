import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Lightbulb, Settings, Banknote, ChevronDown, ChevronUp } from 'lucide-react';

export default function WelcomeGuide({ user, hasBankingDetails }) {
    const [collapsed, setCollapsed] = useState(true);
    const isProfileComplete = user?.company_name && user?.company_address && user?.logo_url;

    if (isProfileComplete && hasBankingDetails) {
        return null;
    }

    return (
        <div
            className="rounded-fintech overflow-hidden"
            style={{
                background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)',
            }}
        >
            <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="w-full p-3 sm:p-4 flex items-center justify-between gap-3 text-left touch-manipulation min-h-[44px]"
                aria-expanded={!collapsed}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                        <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 text-amber-200" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white text-sm font-display">Complete your setup</h3>
                        <p className="text-xs text-white/80 mt-0.5 hidden sm:block">Add your company profile and banking details for professional invoices.</p>
                    </div>
                </div>
                <span className="text-white/90 shrink-0">
                    {collapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </span>
            </button>
            {!collapsed && (
                <div className="px-3 pb-4 sm:px-6 sm:pb-6 pt-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 border-t border-white/10">
                    <p className="text-xs text-white/80 sm:hidden">Add your company profile and banking details for professional invoices.</p>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {!isProfileComplete && (
                            <Link to={createPageUrl("Settings")}>
                                <Button size="sm" className="bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-lg h-9 min-h-[44px] sm:min-h-0 px-4 touch-manipulation">
                                    <Settings className="w-4 h-4 mr-1.5" /> Company profile
                                </Button>
                            </Link>
                        )}
                        {!hasBankingDetails && (
                            <Link to={createPageUrl("Settings") + "?tab=payments"}>
                                <Button size="sm" className="bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-lg h-9 min-h-[44px] sm:min-h-0 px-4 touch-manipulation">
                                    <Banknote className="w-4 h-4 mr-1.5" /> Banking details
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}