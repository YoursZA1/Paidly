import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SubscriptionPlanCard({ plan, isCurrent, onSelect, isSelecting }) {
    const isEnterprise = plan.price === 0;

    return (
        <motion.div
            whileHover={{ y: -5 }}
            className={`h-full ${plan.is_recommended ? 'transform scale-105' : ''}`}
        >
            <Card className={`flex flex-col h-full border-2 ${plan.is_recommended ? 'border-indigo-600 shadow-2xl' : 'border-slate-200'}`}>
                {plan.is_recommended && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white">
                        Recommended
                    </Badge>
                )}
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                    <CardDescription className="text-4xl font-extrabold text-slate-900 mt-4">
                        {isEnterprise ? 'Custom' : `$${plan.price}`}
                        {!isEnterprise && <span className="text-base font-normal text-slate-500 ml-1">{plan.frequency}</span>}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col flex-grow p-6">
                    <ul className="space-y-3 mb-8 flex-grow">
                        {plan.features.map((feature, index) => (
                            <li key={index} className="flex items-start gap-3">
                                <CheckCircle className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
                                <span className="text-slate-600">{feature}</span>
                            </li>
                        ))}
                    </ul>
                    <Button
                        onClick={() => onSelect(plan)}
                        disabled={isCurrent || isSelecting}
                        className={`w-full py-3 rounded-lg text-lg font-semibold mt-auto ${
                            isCurrent 
                                ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed border-2 border-emerald-300' 
                                : isEnterprise 
                                    ? 'bg-slate-800 hover:bg-slate-900'
                                    : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                    >
                        {isCurrent ? '✓ Current Plan' : isSelecting ? 'Selecting...' : isEnterprise ? 'Contact Us' : 'Choose Plan'}
                    </Button>
                </CardContent>
            </Card>
        </motion.div>
    );
}