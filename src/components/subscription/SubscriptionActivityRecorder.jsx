import { useState } from 'react';
import PropTypes from 'prop-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TrendingUp, TrendingDown, XCircle, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  recordUpgrade,
  recordDowngrade,
  recordCancellation,
  recordReactivation,
  recordExtension,
  isUpgrade,
  isDowngrade,
  calculateMRRDifference,
  getActivityLabel,
  formatCurrency
} from '@/utils/subscriptionUtils';

export default function SubscriptionActivityRecorder({ user, oldPlan, newPlan, onActivityRecorded }) {
  const [open, setOpen] = useState(false);
  const [activityType, setActivityType] = useState('');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('month');
  const [isRecording, setIsRecording] = useState(false);

  // Determine activity type based on plan change
  const determineActivityType = () => {
    if (newPlan === oldPlan) return null;
    if (isUpgrade(oldPlan, newPlan)) return 'upgrade';
    if (isDowngrade(oldPlan, newPlan)) return 'downgrade';
    return 'change';
  };

  const handleRecord = async () => {
    if (!activityType || !user) return;

    setIsRecording(true);
    try {
      let result;
      switch (activityType) {
        case 'upgrade':
          result = recordUpgrade(
            user.id,
            user.full_name,
            user.email,
            oldPlan,
            newPlan
          );
          break;
        case 'downgrade':
          result = recordDowngrade(
            user.id,
            user.full_name,
            user.email,
            oldPlan,
            newPlan,
            reason
          );
          break;
        case 'cancel':
          result = recordCancellation(
            user.id,
            user.full_name,
            user.email,
            oldPlan,
            reason
          );
          break;
        case 'reactivate':
          result = recordReactivation(
            user.id,
            user.full_name,
            user.email,
            newPlan
          );
          break;
        case 'extend':
          result = recordExtension(
            user.id,
            user.full_name,
            user.email,
            newPlan,
            duration
          );
          break;
        default:
          return;
      }

      if (result) {
        console.log('Activity recorded:', result);
        if (onActivityRecorded) {
          onActivityRecorded(result);
        }
        setOpen(false);
        setActivityType('');
        setReason('');
      }
    } catch (error) {
      console.error('Error recording activity:', error);
    } finally {
      setIsRecording(false);
    }
  };

  const mrrDifference = calculateMRRDifference(oldPlan, newPlan);
  const defaultType = determineActivityType();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Record Activity
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Record Subscription Activity</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* User Info */}
          <div className="bg-slate-50 p-4 rounded-lg">
            <p className="text-sm text-slate-600">User</p>
            <p className="text-lg font-semibold text-slate-900">{user?.full_name}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>

          {/* Plan Change Summary */}
          {newPlan && oldPlan && (
            <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-primary font-medium">
                    {oldPlan.toUpperCase()} → {newPlan.toUpperCase()}
                  </p>
                  <p className="text-xs text-primary mt-1">
                    MRR Change: {mrrDifference > 0 ? '+' : ''}{formatCurrency(mrrDifference)}
                  </p>
                </div>
                {defaultType === 'upgrade' && (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                )}
                {defaultType === 'downgrade' && (
                  <TrendingDown className="h-5 w-5 text-orange-500" />
                )}
              </div>
            </div>
          )}

          {/* Activity Type */}
          <div className="space-y-2">
            <Label htmlFor="activity-type">Activity Type</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger>
                <SelectValue placeholder="Select activity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upgrade">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Upgrade
                  </div>
                </SelectItem>
                <SelectItem value="downgrade">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-orange-500" />
                    Downgrade
                  </div>
                </SelectItem>
                <SelectItem value="cancel">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Cancellation
                  </div>
                </SelectItem>
                <SelectItem value="reactivate">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    Reactivation
                  </div>
                </SelectItem>
                <SelectItem value="extend">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-purple-500" />
                    Extension
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Duration for Extension */}
          {activityType === 'extend' && (
            <div className="space-y-2">
              <Label htmlFor="duration">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">1 Week</SelectItem>
                  <SelectItem value="month">1 Month</SelectItem>
                  <SelectItem value="quarter">1 Quarter</SelectItem>
                  <SelectItem value="year">1 Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Reason for Downgrade/Cancellation */}
          {(activityType === 'downgrade' || activityType === 'cancel') && (
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                placeholder="Why did this happen?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="resize-none h-20"
              />
            </div>
          )}

          {/* Activity Details */}
          {activityType && (
            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <p className="text-sm font-semibold text-slate-900">Activity Summary</p>
              <div className="text-sm text-slate-600 space-y-1">
                <p>Type: <Badge variant="outline">{getActivityLabel(activityType)}</Badge></p>
                {newPlan && oldPlan && (
                  <p>Plan Change: {oldPlan} → {newPlan}</p>
                )}
                {activityType !== 'extend' && (
                  <p>MRR Impact: <span className={mrrDifference > 0 ? 'text-green-600 font-semibold' : mrrDifference < 0 ? 'text-red-600 font-semibold' : ''}>
                    {mrrDifference > 0 ? '+' : ''}{formatCurrency(mrrDifference)}
                  </span></p>
                )}
                <p>Date: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isRecording}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRecord}
            disabled={!activityType || isRecording}
          >
            {isRecording ? 'Recording...' : 'Record Activity'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

SubscriptionActivityRecorder.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.string,
    full_name: PropTypes.string,
    email: PropTypes.string
  }),
  oldPlan: PropTypes.string,
  newPlan: PropTypes.string,
  onActivityRecorded: PropTypes.func
};

SubscriptionActivityRecorder.defaultProps = {
  user: null,
  oldPlan: '',
  newPlan: '',
  onActivityRecorded: null
};
