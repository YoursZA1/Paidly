import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Payroll } from '@/api/entities';
import { formatCurrency } from '../components/CurrencySelector';
import { format } from 'date-fns';
import DocumentLayout from '../components/shared/DocumentLayout';
import { createPageUrl } from '@/utils';
import { Loader2, AlertCircle, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function PublicPayslipContent({ payslip, user }) {
    if (!payslip) {
        return null; // Should ideally not happen if parent handles !payslip
    }
    // The core content of the public payslip page is essentially an iframe
    // displaying the Payslip PDF. This component encapsulates that.
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <iframe
                src={`/PayslipPDF?id=${payslip.id}`} // Use payslip.id from the passed prop
                title="Payslip"
                className="w-full border-none"
                style={{ height: '1000px' }}
            />
        </div>
    );
}

export default function PublicPayslip() {
    const location = useLocation();
    const [payslip, setPayslip] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [emailVerification, setEmailVerification] = useState('');
    const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationError, setVerificationError] = useState('');

    useEffect(() => {
        loadPayslipData();
    }, [location]);

    const loadPayslipData = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams(location.search);
            const token = params.get('token');

            if (!token) {
                setError("Invalid payslip link. No token provided.");
                setIsLoading(false);
                return;
            }

            const payslips = await Payroll.filter({ public_share_token: token });
            
            if (payslips.length === 0) {
                setError("Payslip not found or link has expired.");
                setIsLoading(false);
                return;
            }
            
            const currentPayslip = payslips[0];
            
            // Check if email verification is required
            if (currentPayslip.sent_to_email) {
                const verifiedEmail = sessionStorage.getItem(`payslip_${currentPayslip.id}_verified_email`);
                if (verifiedEmail !== currentPayslip.sent_to_email) {
                    setNeedsEmailVerification(true);
                    setPayslip(currentPayslip);
                    setIsLoading(false);
                    return;
                }
            }
            
            setPayslip(currentPayslip);
        } catch (error) {
            console.error('Error loading public payslip:', error);
            setError("Could not load the payslip. Please check the link and try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleEmailVerification = async () => {
        if (!emailVerification.trim()) {
            setVerificationError('Please enter your email address');
            return;
        }

        setIsVerifying(true);
        setVerificationError('');

        try {
            if (emailVerification.toLowerCase().trim() === payslip.sent_to_email.toLowerCase().trim()) {
                sessionStorage.setItem(`payslip_${payslip.id}_verified_email`, payslip.sent_to_email);
                setNeedsEmailVerification(false);
                window.location.reload();
            } else {
                setVerificationError('The email address does not match our records.');
            }
        } catch (error) {
            setVerificationError('Verification failed. Please try again.');
        } finally {
            setIsVerifying(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
                <p className="ml-2 text-slate-600">Loading Payslip...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-center p-4">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h1 className="text-xl font-bold text-slate-800">Oops! Something went wrong.</h1>
                <p className="text-slate-600 mt-2">{error}</p>
            </div>
        );
    }

    if (needsEmailVerification) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
                <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
                    <div className="text-center mb-6">
                        <Mail className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">Email Verification Required</h1>
                        <p className="text-slate-600">
                            To view this payslip, please enter the email address it was sent to.
                        </p>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <Input
                                type="email"
                                placeholder="your.email@example.com"
                                value={emailVerification}
                                onChange={(e) => {
                                    setEmailVerification(e.target.value);
                                    setVerificationError('');
                                }}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        handleEmailVerification();
                                    }
                                }}
                                className="w-full"
                            />
                            {verificationError && (
                                <p className="text-red-500 text-sm mt-2">{verificationError}</p>
                            )}
                        </div>
                        
                        <Button
                            onClick={handleEmailVerification}
                            disabled={isVerifying || !emailVerification.trim()}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                            {isVerifying ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                'Verify & View Payslip'
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (!payslip) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <p className="text-slate-600">Payslip not found.</p>
            </div>
        );
    }

    const user = {
        company_name: payslip.owner_company_name,
        company_address: payslip.owner_company_address,
        logo_url: payslip.owner_logo_url
    };

    return (
        <DocumentLayout
            user={user}
            title="PAYSLIP"
            documentNumber={payslip.payslip_number}
            date={payslip.pay_date ? format(new Date(payslip.pay_date), 'MMMM d, yyyy') : ''}
            downloadUrl={createPageUrl(`PayslipPDF?id=${payslip.id}`)}
        >
            <PublicPayslipContent payslip={payslip} user={user} />
        </DocumentLayout>
    );
}