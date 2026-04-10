import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import DocumentLayout from '../components/shared/DocumentLayout';
import { DocumentPageSkeleton } from '../components/shared/PageSkeleton';
import { createPageUrl } from '@/utils';
import {
    fetchPublicPayslipPayload,
    verifyPublicPayslipEmail,
} from '@/api/publicPayslipApiClient';
import {
    clearLegacyPayslipVerificationSessionKeys,
    getPublicPayslipViewerToken,
    setPublicPayslipViewerToken,
} from '@/lib/publicPayslipViewerStorage';
import { AlertCircle, Mail, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function PublicPayslipContent({ payslip, shareToken }) {
    if (!payslip || !shareToken) {
        return null;
    }
    const pdfSrc = `${createPageUrl(`PayslipPDF?id=${payslip.id}&token=${encodeURIComponent(shareToken)}`)}`;
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <iframe
                src={pdfSrc}
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
    const [sentToEmailHint, setSentToEmailHint] = useState('');
    const [shareToken, setShareToken] = useState('');

    useEffect(() => {
        clearLegacyPayslipVerificationSessionKeys();
    }, []);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams(location.search);
                const token = params.get('token');

                if (!token) {
                    setError("Invalid payslip link. No token provided.");
                    return;
                }

                setShareToken(token);
                const viewerToken = getPublicPayslipViewerToken(token);
                const payload = await fetchPublicPayslipPayload(token, viewerToken);

                const current = payload.payslip;
                if (!current) {
                    setError("Payslip not found or link has expired.");
                    return;
                }

                if (payload.requiresEmailVerification) {
                    setSentToEmailHint(payload.sentToEmailHint || '');
                    setNeedsEmailVerification(true);
                    setPayslip(current);
                    return;
                }

                setNeedsEmailVerification(false);
                setSentToEmailHint('');
                setPayslip(current);
            } catch (e) {
                console.error('Error loading public payslip:', e);
                setError(e?.message || "Could not load the payslip. Please check the link and try again.");
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [location.search]);

    const handleEmailVerification = async () => {
        if (!emailVerification.trim()) {
            setVerificationError('Please enter your email address');
            return;
        }
        if (!shareToken) {
            setVerificationError('Invalid link.');
            return;
        }

        setIsVerifying(true);
        setVerificationError('');

        try {
            const viewerToken = await verifyPublicPayslipEmail(shareToken, emailVerification);
            setPublicPayslipViewerToken(shareToken, viewerToken);
            const payload = await fetchPublicPayslipPayload(shareToken, viewerToken);
            const current = payload.payslip;
            if (!current || payload.requiresEmailVerification) {
                setVerificationError('Verification failed. Please try again.');
                return;
            }
            setNeedsEmailVerification(false);
            setSentToEmailHint('');
            setPayslip(current);
        } catch (err) {
            setVerificationError(
                err?.message ||
                    'The email address does not match our records. Please enter the email this payslip was sent to.'
            );
        } finally {
            setIsVerifying(false);
        }
    };

    if (isLoading) {
        return <DocumentPageSkeleton title="Loading payslip…" className="bg-slate-50" />;
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
                        <Mail className="w-12 h-12 text-primary mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">Email Verification Required</h1>
                        <p className="text-slate-600">
                            To view this payslip, please enter the email address it was sent to.
                            {sentToEmailHint ? (
                                <span className="block mt-2 text-sm text-muted-foreground">
                                    Hint: {sentToEmailHint}
                                </span>
                            ) : null}
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
                                onKeyDown={(e) => {
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
                            className="w-full bg-primary hover:bg-primary/90"
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

    const downloadPath = shareToken
        ? `PayslipPDF?id=${payslip.id}&token=${encodeURIComponent(shareToken)}&download=true`
        : `PayslipPDF?id=${payslip.id}&download=true`;

    return (
        <DocumentLayout
            user={user}
            title="PAYSLIP"
            documentNumber={payslip.payslip_number}
            date={payslip.pay_date ? format(new Date(payslip.pay_date), 'MMMM d, yyyy') : ''}
            downloadUrl={createPageUrl(downloadPath)}
        >
            <PublicPayslipContent payslip={payslip} shareToken={shareToken} />
        </DocumentLayout>
    );
}
