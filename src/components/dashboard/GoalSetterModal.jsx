import { useState, useEffect } from 'react';
import {
  FlagIcon,
  RocketLaunchIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';
import { getCurrencySymbol } from '@/utils/currencyCalculations';
import { formatCurrency } from '@/utils/currencyCalculations';
import { upsertBusinessGoal } from '@/api/businessGoals';
import { useToast } from '@/components/ui/use-toast';
import { getBusinessGoalYear } from '@/constants/businessGoalYear';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Confidence: how realistic the goal is vs last year's revenue.
 * Returns { label, colorClass, percent } for display.
 */
function getConfidence(annualGoal, lastYearRevenue) {
  if (!annualGoal || annualGoal <= 0) {
    return { label: 'Set a target', colorClass: 'text-muted-foreground bg-muted', percent: 0 };
  }
  if (!lastYearRevenue || lastYearRevenue <= 0) {
    return { label: 'New baseline', colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40', percent: 50 };
  }
  const ratio = annualGoal / lastYearRevenue;
  if (ratio <= 1.05) {
    return { label: 'On track', colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40', percent: 90 };
  }
  if (ratio <= 1.35) {
    return { label: 'Stretch goal', colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40', percent: 70 };
  }
  return { label: 'Ambitious', colorClass: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40', percent: 50 };
}

export function GoalSetterModal({ isOpen, onClose, onSaved, user, initialGoal, lastYearRevenue = 0 }) {
  const [annualGoal, setAnnualGoal] = useState(0);
  const [strategyType, setStrategyType] = useState('steady');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const currency = user?.currency || 'ZAR';
  const symbol = getCurrencySymbol(currency);
  const year = getBusinessGoalYear();

  useEffect(() => {
    if (isOpen) {
      setAnnualGoal(initialGoal?.annual_target ?? 0);
      setStrategyType(initialGoal?.strategy_type === 'aggressive' ? 'aggressive' : 'steady');
    }
  }, [isOpen, initialGoal?.annual_target, initialGoal?.strategy_type]);

  const monthlyAverage = annualGoal && Number(annualGoal) > 0 ? (Number(annualGoal) / 12) : 0;
  const confidence = getConfidence(Number(annualGoal), lastYearRevenue);

  const handleSave = async () => {
    const userId = user?.id;
    if (!userId) {
      toast({ title: 'Not signed in', description: 'Sign in to set goals.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const goalYear = getBusinessGoalYear();
      await upsertBusinessGoal(userId, goalYear, {
        annual_target: Number(annualGoal) || 0,
        strategy_type: strategyType,
      });
      onSaved?.();
      onClose();
      toast({ title: `${goalYear} target saved`, description: 'Your annual revenue goal is updated.' });
    } catch (err) {
      const msg = err?.message || '';
      const isForbidden = msg.includes('policy') || msg.includes('row-level') || msg.includes('permission');
      toast({
        title: isForbidden ? 'Only workspace owner can set goals' : 'Could not save goal',
        description: isForbidden ? 'Ask your workspace owner to update targets.' : (msg || 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-xl w-[calc(100%-2rem)] rounded-[32px] sm:rounded-[40px] p-0 gap-0 overflow-hidden border-border bg-card shadow-2xl sm:max-w-xl">
        <DialogDescription className="sr-only">
          Set your annual revenue goal and strategy for {year}. Monthly run rate and confidence hints update as you type.
        </DialogDescription>

        <DialogHeader className="p-6 sm:p-8 border-b border-border bg-muted/50 space-y-0 text-left flex flex-row items-center justify-between gap-4 pr-14">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-primary rounded-xl shrink-0">
              <FlagIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <DialogTitle className="text-lg sm:text-xl font-black text-foreground tracking-tight">
              Set {year} targets
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="p-6 sm:p-10 space-y-8 sm:space-y-10">
          <div className="text-center space-y-4">
            <label htmlFor="goal-annual-revenue" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Annual revenue goal
            </label>
            <div className="relative inline-block w-full">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-black text-muted-foreground tabular-nums">
                {symbol}
              </span>
              <input
                id="goal-annual-revenue"
                type="number"
                min="0"
                step="1000"
                placeholder="0"
                value={annualGoal > 0 ? annualGoal : ''}
                onChange={(e) => setAnnualGoal(e.target.value === '' ? 0 : Number(e.target.value))}
                className="w-full text-4xl sm:text-5xl font-black text-center border-none focus:ring-0 bg-transparent text-foreground placeholder:text-muted-foreground tabular-nums pl-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg"
              />
            </div>
            <div className="flex justify-center items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 rounded-full w-fit mx-auto">
              <ArrowTrendingUpIcon className="w-4 h-4 shrink-0" />
              Target: {formatCurrency(monthlyAverage, currency)} / month
            </div>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${confidence.colorClass}`}>
              <span>Confidence: {confidence.label}</span>
              <span className="tabular-nums">{confidence.percent}%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setStrategyType('aggressive')}
              className={`p-6 rounded-3xl border-2 text-left transition-all ${
                strategyType === 'aggressive'
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-border hover:bg-muted/50'
              }`}
            >
              <RocketLaunchIcon
                className={`w-6 h-6 mb-2 ${strategyType === 'aggressive' ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <p className="text-sm font-bold text-foreground">Aggressive growth</p>
              <p className="text-[10px] text-primary font-medium">Focus on new acquisition</p>
            </button>
            <button
              type="button"
              onClick={() => setStrategyType('steady')}
              className={`p-6 rounded-3xl border-2 text-left transition-all ${
                strategyType === 'steady'
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-border hover:bg-muted/50'
              }`}
            >
              <BanknotesIcon
                className={`w-6 h-6 mb-2 ${strategyType === 'steady' ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <p className="text-sm font-bold text-foreground">Steady retention</p>
              <p className="text-[10px] text-muted-foreground font-medium">Focus on recurring billing</p>
            </button>
          </div>

          <div className="pt-6 border-t border-border flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors rounded-2xl sm:rounded-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="flex-[2] py-4 bg-primary text-primary-foreground rounded-2xl font-black shadow-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loading ? (
                <div
                  className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"
                  aria-hidden
                />
              ) : (
                `Save ${year} target`
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
