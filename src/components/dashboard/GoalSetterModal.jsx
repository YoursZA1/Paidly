import { useState, useEffect } from 'react';
import {
  XMarkIcon,
  FlagIcon,
  RocketLaunchIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';
import { getCurrencySymbol } from '@/utils/currencyCalculations';
import { formatCurrency } from '@/utils/currencyCalculations';
import { upsertBusinessGoal } from '@/api/businessGoals';
import { useToast } from '@/components/ui/use-toast';

const GOAL_YEAR = 2026;

/**
 * Confidence: how realistic the goal is vs last year's revenue.
 * Returns { label, colorClass, percent } for display.
 */
function getConfidence(annualGoal, lastYearRevenue) {
  if (!annualGoal || annualGoal <= 0) {
    return { label: 'Set a target', colorClass: 'text-slate-400 bg-slate-100', percent: 0 };
  }
  if (!lastYearRevenue || lastYearRevenue <= 0) {
    return { label: 'New baseline', colorClass: 'text-emerald-600 bg-emerald-50', percent: 50 };
  }
  const ratio = annualGoal / lastYearRevenue;
  if (ratio <= 1.05) {
    return { label: 'On track', colorClass: 'text-emerald-600 bg-emerald-50', percent: 90 };
  }
  if (ratio <= 1.35) {
    return { label: 'Stretch goal', colorClass: 'text-amber-600 bg-amber-50', percent: 70 };
  }
  return { label: 'Ambitious', colorClass: 'text-orange-600 bg-orange-50', percent: 50 };
}

export function GoalSetterModal({ isOpen, onClose, onSaved, user, initialGoal, lastYearRevenue = 0 }) {
  const [annualGoal, setAnnualGoal] = useState(0);
  const [strategyType, setStrategyType] = useState('steady');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const currency = user?.currency || 'ZAR';
  const symbol = getCurrencySymbol(currency);

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
      await upsertBusinessGoal(userId, GOAL_YEAR, {
        annual_target: Number(annualGoal) || 0,
        strategy_type: strategyType,
      });
      onSaved?.();
      onClose();
      toast({ title: '2026 strategy saved', description: 'Your target is locked in.' });
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500 rounded-xl">
              <FlagIcon className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-black text-slate-900">Set 2026 Targets</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="p-10 space-y-10">
          {/* Main Revenue Input */}
          <div className="text-center space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Annual Revenue Goal
            </label>
            <div className="relative inline-block w-full">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-black text-slate-300 tabular-nums">
                {symbol}
              </span>
              <input
                type="number"
                min="0"
                step="1000"
                placeholder="0"
                value={annualGoal > 0 ? annualGoal : ''}
                onChange={(e) => setAnnualGoal(e.target.value === '' ? 0 : Number(e.target.value))}
                className="w-full text-5xl font-black text-center border-none focus:ring-0 text-slate-900 placeholder:text-slate-100 tabular-nums pl-12"
              />
            </div>
            <div className="flex justify-center items-center gap-2 text-emerald-500 font-bold text-sm bg-emerald-50 px-4 py-2 rounded-full w-fit mx-auto">
              <ArrowTrendingUpIcon className="w-4 h-4" />
              Target: {formatCurrency(monthlyAverage, currency)} / month
            </div>
            {/* Confidence Meter */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${confidence.colorClass}`}>
              <span>Confidence: {confidence.label}</span>
              <span className="tabular-nums">{confidence.percent}%</span>
            </div>
          </div>

          {/* Milestone Selection */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setStrategyType('aggressive')}
              className={`p-6 rounded-3xl border-2 text-left transition-all ${
                strategyType === 'aggressive'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <RocketLaunchIcon
                className={`w-6 h-6 mb-2 ${strategyType === 'aggressive' ? 'text-orange-600' : 'text-slate-400'}`}
              />
              <p className="text-sm font-bold text-slate-900">Aggressive Growth</p>
              <p className="text-[10px] text-orange-600 font-medium">Focus on new acquisition</p>
            </button>
            <button
              type="button"
              onClick={() => setStrategyType('steady')}
              className={`p-6 rounded-3xl border-2 text-left transition-all ${
                strategyType === 'steady'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <BanknotesIcon
                className={`w-6 h-6 mb-2 ${strategyType === 'steady' ? 'text-orange-600' : 'text-slate-400'}`}
              />
              <p className="text-sm font-bold text-slate-900">Steady Retention</p>
              <p className="text-[10px] text-slate-400 font-medium">Focus on recurring billing</p>
            </button>
          </div>

          {/* Action Footer */}
          <div className="pt-6 border-t border-slate-50 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl shadow-slate-200 hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loading ? (
                <div
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  aria-hidden
                />
              ) : (
                'Lock in 2026 Strategy'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
