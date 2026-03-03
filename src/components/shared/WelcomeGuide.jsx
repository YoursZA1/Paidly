import React from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Lightbulb, Settings, Banknote } from 'lucide-react';

export default function WelcomeGuide({ user, hasBankingDetails }) {
    const isProfileComplete = user?.company_name && user?.company_address && user?.logo_url;

    if (isProfileComplete && hasBankingDetails) {
        return null;
    }

    return (
        <div
            className="p-6 rounded-fintech"
            style={{
                background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)',
            }}
        >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                        <Lightbulb className="w-5 h-5 text-amber-200" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white text-sm font-display">Complete your setup</h3>
                        <p className="text-xs text-white/80 mt-0.5">Add your company profile and banking details for professional invoices.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!isProfileComplete && (
                        <Link to={createPageUrl("Settings")}>
                            <Button size="sm" className="bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-lg h-9">
                                <Settings className="w-4 h-4 mr-1.5" /> Company profile
                            </Button>
                        </Link>
                    )}
                    {!hasBankingDetails && (
                        <Link to={createPageUrl("Settings") + "?tab=payments"}>
                            <Button size="sm" className="bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-lg h-9">
                                <Banknote className="w-4 h-4 mr-1.5" /> Banking details
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}