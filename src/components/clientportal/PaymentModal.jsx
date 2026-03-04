import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, Lock, CheckCircle } from 'lucide-react';
import { formatCurrency } from '../CurrencySelector';

export default function PaymentModal({ isOpen, onClose, invoice, onPaymentSuccess }) {
    const [step, setStep] = useState('amount'); // 'amount', 'payment', 'success'
    const [paymentAmount, setPaymentAmount] = useState(invoice?.total_amount || 0);
    const [cardDetails, setCardDetails] = useState({
        cardNumber: '',
        expiryDate: '',
        cvv: '',
        cardholderName: ''
    });
    const [isProcessing, setIsProcessing] = useState(false);

    const outstandingAmount = invoice?.total_amount || 0;
    const currency = invoice?.owner_currency || 'ZAR';

    const handlePaymentSubmit = async (e) => {
        e.preventDefault();
        setIsProcessing(true);

        // Simulate payment processing
        setTimeout(() => {
            setIsProcessing(false);
            setStep('success');
            
            // Call success callback after a short delay
            setTimeout(() => {
                onPaymentSuccess(invoice.id, paymentAmount);
                onClose();
                setStep('amount');
            }, 2000);
        }, 2000);
    };

    const formatCardNumber = (value) => {
        const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
        const matches = v.match(/\d{4,16}/g);
        const match = (matches && matches[0]) || '';
        const parts = [];
        for (let i = 0, len = match.length; i < len; i += 4) {
            parts.push(match.substring(i, i + 4));
        }
        return parts.length ? parts.join(' ') : value;
    };

    const formatExpiryDate = (value) => {
        const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
        if (v.length >= 2) {
            return v.substring(0, 2) + (v.length > 2 ? '/' + v.substring(2, 4) : '');
        }
        return v;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                {step === 'amount' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Make Payment</DialogTitle>
                            <DialogDescription>
                                Invoice #{invoice?.invoice_number}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="bg-slate-50 rounded-lg p-4">
                                <p className="text-sm text-slate-600 mb-1">Outstanding Amount</p>
                                <p className="text-2xl font-bold text-slate-900">
                                    {formatCurrency(outstandingAmount, currency)}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="amount">Payment Amount</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                                    max={outstandingAmount}
                                />
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPaymentAmount(outstandingAmount / 2)}
                                    >
                                        50%
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPaymentAmount(outstandingAmount)}
                                    >
                                        Full Amount
                                    </Button>
                                </div>
                            </div>

                            <Button 
                                onClick={() => setStep('payment')} 
                                className="w-full bg-emerald-600 hover:bg-emerald-700"
                                disabled={paymentAmount <= 0 || paymentAmount > outstandingAmount}
                            >
                                Continue to Payment
                            </Button>
                        </div>
                    </>
                )}

                {step === 'payment' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5" />
                                Payment Details
                            </DialogTitle>
                            <DialogDescription>
                                Paying {formatCurrency(paymentAmount, currency)} for Invoice #{invoice?.invoice_number}
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handlePaymentSubmit} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="cardholderName">Cardholder Name</Label>
                                <Input
                                    id="cardholderName"
                                    value={cardDetails.cardholderName}
                                    onChange={(e) => setCardDetails({...cardDetails, cardholderName: e.target.value})}
                                    placeholder="John Doe"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="cardNumber">Card Number</Label>
                                <Input
                                    id="cardNumber"
                                    value={cardDetails.cardNumber}
                                    onChange={(e) => setCardDetails({...cardDetails, cardNumber: formatCardNumber(e.target.value)})}
                                    placeholder="1234 5678 9012 3456"
                                    maxLength="19"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="expiryDate">Expiry Date</Label>
                                    <Input
                                        id="expiryDate"
                                        value={cardDetails.expiryDate}
                                        onChange={(e) => setCardDetails({...cardDetails, expiryDate: formatExpiryDate(e.target.value)})}
                                        placeholder="MM/YY"
                                        maxLength="5"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="cvv">CVV</Label>
                                    <Input
                                        id="cvv"
                                        type="password"
                                        value={cardDetails.cvv}
                                        onChange={(e) => setCardDetails({...cardDetails, cvv: e.target.value.replace(/\D/g, '')})}
                                        placeholder="123"
                                        maxLength="4"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
                                <Lock className="w-4 h-4 text-primary mt-0.5" />
                                <p className="text-xs text-primary">
                                    Your payment is secured with 256-bit SSL encryption. Card details are not stored.
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setStep('amount')}
                                    className="flex-1"
                                    disabled={isProcessing}
                                >
                                    Back
                                </Button>
                                <Button 
                                    type="submit" 
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? 'Processing...' : `Pay ${formatCurrency(paymentAmount, currency)}`}
                                </Button>
                            </div>
                        </form>
                    </>
                )}

                {step === 'success' && (
                    <div className="py-8 text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Payment Successful!</h3>
                        <p className="text-slate-600 mb-4">
                            Your payment of {formatCurrency(paymentAmount, currency)} has been processed.
                        </p>
                        <p className="text-sm text-slate-500">
                            A receipt has been sent to your email.
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}