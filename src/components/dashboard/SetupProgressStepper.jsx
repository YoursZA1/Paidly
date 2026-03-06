import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Check, Building2, Landmark, FileText, Send, ChevronDown, ChevronUp } from 'lucide-react';

const steps = [
  { id: 'profile', label: 'Company profile', href: createPageUrl('Settings'), icon: Building2 },
  { id: 'banking', label: 'Banking details', href: createPageUrl('Settings') + '?tab=payments', icon: Landmark },
  { id: 'first_invoice', label: 'First invoice', href: createPageUrl('CreateInvoice'), icon: FileText },
  { id: 'send_invoice', label: 'Send invoice', href: createPageUrl('Invoices'), icon: Send },
];

export default function SetupProgressStepper({ user, hasBankingDetails, invoices }) {
  const [collapsed, setCollapsed] = useState(true);
  const completed = {
    profile: !!(user?.company_name && user?.company_address),
    banking: !!hasBankingDetails,
    first_invoice: !!(invoices?.length > 0),
    send_invoice: !!(invoices?.length > 0 && invoices.some((i) => ['sent', 'viewed', 'paid'].includes(i.status || ''))),
  };
  const allDone = steps.every((s) => completed[s.id]);

  if (allDone) return null;

  return (
    <div className="glass-card rounded-fintech border border-border p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-2 mb-4 sm:mb-4 md:pointer-events-none md:cursor-default touch-manipulation min-h-[44px] -m-2 p-2 rounded-lg hover:bg-muted/50 md:hover:bg-transparent"
        aria-expanded={!collapsed}
      >
        <h3 className="text-sm font-semibold text-foreground font-display">Setup progress</h3>
        <span className="md:hidden text-muted-foreground shrink-0">
          {collapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </span>
      </button>
      <div className={`relative pl-1 ${collapsed ? "hidden md:block" : ""}`}>
        {steps.map((step, index) => {
          const done = completed[step.id];
          const Icon = step.icon;
          const isLast = index === steps.length - 1;
          const nextDone = !isLast && completed[steps[index + 1].id];
          return (
            <div key={step.id} className="flex gap-3 relative">
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 z-10 ${
                    done
                      ? 'bg-status-paid border-status-paid text-white'
                      : 'bg-muted/50 border-border text-muted-foreground'
                  }`}
                >
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                {!isLast && (
                  <div
                    className={`w-0.5 flex-1 min-h-[12px] ${
                      done || nextDone ? 'bg-status-paid/30' : 'bg-border'
                    }`}
                    style={{ minHeight: 20 }}
                  />
                )}
              </div>
              <div className={`pt-0.5 ${isLast ? 'pb-0' : 'pb-1'}`}>
                {done ? (
                  <span className="text-sm font-medium text-muted-foreground">{step.label}</span>
                ) : (
                  <Link
                    to={step.href}
                    className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {step.label}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
