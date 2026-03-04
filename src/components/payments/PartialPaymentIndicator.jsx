import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/utils/currencyCalculations";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import PropTypes from 'prop-types';

export default function PartialPaymentIndicator({ invoice, totalPaid, currency = 'USD', size = 'default' }) {
    const remainingBalance = invoice.total_amount - totalPaid;
    const paymentProgress = (totalPaid / invoice.total_amount) * 100;
    
    if (totalPaid === 0) {
        return null;
    }

    if (size === 'compact') {
        return (
            <div className="flex items-center gap-1">
                <div className="h-1.5 w-12 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                        className={`h-full ${
                            paymentProgress === 100 ? 'bg-green-500' : 
                            paymentProgress >= 50 ? 'bg-primary/100' : 
                            'bg-yellow-500'
                        }`}
                        style={{ width: `${Math.min(paymentProgress, 100)}%` }}
                    />
                </div>
                <span className="text-xs text-gray-600">{paymentProgress.toFixed(0)}%</span>
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            {/* Progress Bar */}
            <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-300 ${
                            paymentProgress === 100 ? 'bg-green-500' : 
                            paymentProgress >= 50 ? 'bg-primary/100' : 
                            'bg-yellow-500'
                        }`}
                        style={{ width: `${Math.min(paymentProgress, 100)}%` }}
                    />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-10 text-right">
                    {paymentProgress.toFixed(0)}%
                </span>
            </div>

            {/* Payment Details */}
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-green-700">
                    <CheckCircle className="w-3 h-3" />
                    <span className="font-medium">Paid: {formatCurrency(totalPaid, currency)}</span>
                </div>
                {remainingBalance > 0 && (
                    <div className="flex items-center gap-1 text-orange-700">
                        <Clock className="w-3 h-3" />
                        <span className="font-medium">Due: {formatCurrency(remainingBalance, currency)}</span>
                    </div>
                )}
            </div>

            {/* Status Badge */}
            {paymentProgress < 100 && (
                <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 text-xs">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Partial Payment
                </Badge>
            )}
        </div>
    );
}

PartialPaymentIndicator.propTypes = {
    invoice: PropTypes.object.isRequired,
    totalPaid: PropTypes.number.isRequired,
    currency: PropTypes.string,
    size: PropTypes.oneOf(['default', 'compact'])
};
