import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Target } from 'lucide-react';

const currentYear = () => new Date().getFullYear();

export default function GoalProgress({ year = currentYear(), progress = 75, title }) {
    const displayTitle = title ?? `Plan for ${year}`;
    const circumference = 2 * Math.PI * 45;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <Card
            className="relative border border-border overflow-hidden rounded-fintech card-shadow"
            style={{
                background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)',
            }}
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl" />

            <CardContent className="p-6 relative">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <p className="text-sm text-white/80 mb-1">{displayTitle}</p>
                        <p className="text-xl font-bold text-white mb-2 font-display">Completed</p>
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                                <Target className="w-5 h-5 text-white" />
                            </div>
                        </div>
                    </div>

                    <div className="relative w-28 h-28">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                cx="56"
                                cy="56"
                                r="45"
                                stroke="rgba(255,255,255,0.2)"
                                strokeWidth="8"
                                fill="none"
                            />
                            <circle
                                cx="56"
                                cy="56"
                                r="45"
                                stroke="rgba(255,255,255,0.9)"
                                strokeWidth="8"
                                fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                className="transition-all duration-1000 ease-out"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-2xl font-bold text-white">{progress}%</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}