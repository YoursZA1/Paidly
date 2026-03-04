import React from 'react';
import { CheckCircle2, Circle, Clock, XCircle, Send } from 'lucide-react';

export default function QuoteStatusTracker({ status }) {
    const steps = [
        { id: 'draft', label: 'Draft', icon: Circle },
        { id: 'sent', label: 'Sent', icon: Send },
        { id: 'decision', label: 'Decision', icon: CheckCircle2 } // Represents Accepted or Rejected
    ];

    const getCurrentStepIndex = () => {
        if (status === 'draft') return 0;
        if (status === 'sent' || status === 'viewed') return 1;
        if (['accepted', 'rejected', 'expired'].includes(status)) return 2;
        return 0;
    };

    const currentStepIndex = getCurrentStepIndex();

    return (
        <div className="flex items-center w-full max-w-xs">
            {steps.map((step, index) => {
                const isCompleted = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const isLast = index === steps.length - 1;
                
                let StatusIcon = step.icon;
                let colorClass = "text-slate-300";
                let bgClass = "bg-slate-100";
                let textClass = "text-slate-400";

                if (isCompleted || isCurrent) {
                    colorClass = "text-primary";
                    bgClass = "bg-primary/15";
                    textClass = "text-primary font-medium";
                }

                // Special handling for the final step
                if (index === 2) {
                    if (status === 'accepted') {
                        StatusIcon = CheckCircle2;
                        colorClass = "text-emerald-600";
                        bgClass = "bg-emerald-100";
                        textClass = "text-emerald-900 font-medium";
                    } else if (status === 'rejected') {
                        StatusIcon = XCircle;
                        colorClass = "text-rose-600";
                        bgClass = "bg-rose-100";
                        textClass = "text-rose-900 font-medium";
                    } else if (status === 'expired') {
                        StatusIcon = Clock;
                        colorClass = "text-orange-600";
                        bgClass = "bg-orange-100";
                        textClass = "text-orange-900 font-medium";
                    } else if (isCurrent && status !== 'sent' && status !== 'viewed') {
                         // Waiting for decision
                         StatusIcon = Clock; 
                         colorClass = "text-slate-400";
                         bgClass = "bg-slate-100";
                    }
                }

                return (
                    <React.Fragment key={step.id}>
                        <div className="flex flex-col items-center relative">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bgClass} transition-colors duration-300`}>
                                <StatusIcon className={`w-4 h-4 ${colorClass}`} />
                            </div>
                            <span className={`text-[10px] absolute -bottom-5 whitespace-nowrap ${textClass}`}>
                                {index === 2 && ['accepted', 'rejected', 'expired'].includes(status) 
                                    ? status.charAt(0).toUpperCase() + status.slice(1) 
                                    : step.label}
                            </span>
                        </div>
                        {!isLast && (
                            <div className={`flex-1 h-0.5 mx-2 min-w-[20px] ${index < currentStepIndex ? 'bg-primary' : 'bg-muted'}`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}