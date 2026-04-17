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
        <div className="w-full">
            <div className="flex items-start">
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
                        colorClass = "text-status-paid";
                        bgClass = "bg-status-paid/15";
                        textClass = "text-status-paid font-medium";
                    } else if (status === 'rejected') {
                        StatusIcon = XCircle;
                        colorClass = "text-status-declined";
                        bgClass = "bg-status-declined/15";
                        textClass = "text-status-declined font-medium";
                    } else if (status === 'expired') {
                        StatusIcon = Clock;
                        colorClass = "text-status-declined";
                        bgClass = "bg-status-declined/12";
                        textClass = "text-status-declined font-medium";
                    } else if (isCurrent && status !== 'sent' && status !== 'viewed') {
                         // Waiting for decision
                         StatusIcon = Clock; 
                         colorClass = "text-slate-400";
                         bgClass = "bg-slate-100";
                    }
                }

                    return (
                    <React.Fragment key={step.id}>
                            <div className="flex flex-col items-center gap-2">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${bgClass} transition-colors duration-300`}>
                                <StatusIcon className={`h-4 w-4 ${colorClass}`} />
                            </div>
                            <span className={`text-[11px] leading-none whitespace-nowrap ${textClass}`}>
                                {index === 2 && ['accepted', 'rejected', 'expired'].includes(status) 
                                    ? status.charAt(0).toUpperCase() + status.slice(1) 
                                    : step.label}
                            </span>
                        </div>
                        {!isLast && (
                                <div className="flex-1 px-3 pt-5">
                                    <div
                                        className={`h-0.5 w-full rounded-full transition-colors ${
                                            index < currentStepIndex ? 'bg-primary' : 'bg-border'
                                        }`}
                                    />
                                </div>
                        )}
                    </React.Fragment>
                );
                })}
            </div>
        </div>
    );
}