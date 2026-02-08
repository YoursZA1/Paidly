import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Target } from 'lucide-react';

export default function GoalProgress({ year = 2024, progress = 75, title = "Plan for 2024" }) {
    const circumference = 2 * Math.PI * 45;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <Card className="relative bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 text-white border-0 shadow-2xl overflow-hidden rounded-3xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-cyan-400/20 rounded-full blur-2xl" />
            
            <CardContent className="p-6 relative">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <p className="text-sm text-white/70 mb-1">{title}</p>
                        <p className="text-xl font-bold mb-2">Completed</p>
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center">
                                <Target className="w-5 h-5 text-cyan-600" />
                            </div>
                        </div>
                    </div>

                    <div className="relative w-28 h-28">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                cx="56"
                                cy="56"
                                r="45"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="8"
                                fill="none"
                            />
                            <circle
                                cx="56"
                                cy="56"
                                r="45"
                                stroke="#06b6d4"
                                strokeWidth="8"
                                fill="none"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                className="transition-all duration-1000 ease-out"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-2xl font-bold">{progress}%</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}