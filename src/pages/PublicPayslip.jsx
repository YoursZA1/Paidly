import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
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
import { AlertCircle, Download, Mail, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/components/CurrencySelector';
import PublicDocumentPortal, {
    PublicDocumentSheet,
    PublicPortalMessage,
} from '@/components/documents/PublicDocumentPortal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import PayslipDocument from '@/components/payslips/PayslipDocument';

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
                const payload = await fetchPublicPayslipPayload(token, viewerToken, {
                    observe: 'opened',
                });

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
            const payload = await fetchPublicPayslipPayload(shareToken, viewerToken, {
                observe: 'opened',
            });
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
            <PublicPortalMessage icon={<AlertCircle className="h-8 w-8 text-red-500" />} title="This payslip could not be opened">
                <p className="text-center text-sm text-slate-500">{error}</p>
            </PublicPortalMessage>
        );
    }

    if (needsEmailVerification) {
        return (
            <PublicPortalMessage icon={<Mail className="h-8 w-8" />} title="Confirm your email">
                <p className="text-center text-sm text-slate-500">
                    Enter the email address this payslip was sent to
                    {sentToEmailHint ? (
                        <>
                            {' '}
                            <span className="font-medium text-slate-800">(hint: {sentToEmailHint})</span>
                        </>
                    ) : null}
                    .
                </p>
                <div className="mt-5 space-y-3">
                    <Input
                        type="email"
                        placeholder="your.email@example.com"
                        value={emailVerification}
                        onChange={(e) => {
                            setEmailVerification(e.target.value);
                            setVerificationError('');
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEmailVerification();
                        }}
                        className="w-full"
                    />
                    {verificationError ? <p className="text-sm text-red-500">{verificationError}</p> : null}
                    <Button
                        onClick={handleEmailVerification}
                        disabled={isVerifying || !emailVerification.trim()}
                        className="h-10 w-full rounded-xl"
                    >
                        {isVerifying ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verifying…
                            </>
                        ) : (
                            'View payslip'
                        )}
                    </Button>
                </div>
            </PublicPortalMessage>
        );
    }

    if (!payslip) {
        return (
            <PublicPortalMessage title="Payslip not found">
                <p className="text-center text-sm text-slate-500">This link does not match a payslip.</p>
            </PublicPortalMessage>
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

    const payDate = payslip.pay_date ? format(new Date(payslip.pay_date), 'MMMM d, yyyy') : 'N/A';
    const payPeriod = `${payslip.pay_period_start ? format(new Date(payslip.pay_period_start), 'MMMM d, yyyy') : 'N/A'} - ${payslip.pay_period_end ? format(new Date(payslip.pay_period_end), 'MMMM d, yyyy') : 'N/A'}`;

    const currency = payslip.currency || 'ZAR';

    return (
        <PublicDocumentPortal
            companyName={payslip.owner_company_name || 'Payslip'}
            documentLabel="Payslip"
            documentNumber={payslip.employee_name || ''}
            summary={payPeriod}
            amountLabel="Net pay"
            amount={formatCurrency(payslip.net_pay, currency)}
            meta={payDate !== 'N/A' ? `Paid ${payDate}` : ''}
            actions={
                <Button variant="outline" className="gap-2 border-slate-200 bg-white" asChild>
                    <a
                        href={createPageUrl(downloadPath)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                            if (!shareToken) return;
                            const viewerToken = getPublicPayslipViewerToken(shareToken);
                            void fetchPublicPayslipPayload(shareToken, viewerToken, { observe: 'clicked' });
                        }}
                    >
                        <Download className="h-4 w-4" />
                        <span className="sm:hidden">PDF</span>
                        <span className="hidden sm:inline">Download PDF</span>
                    </a>
                </Button>
            }
        >
            <PublicDocumentSheet className="p-3 sm:p-6">
                <PayslipDocument
                    payslip={payslip}
                    user={user}
                    payDate={payDate}
                    payPeriodLabel={payPeriod}
                />
            </PublicDocumentSheet>
        </PublicDocumentPortal>
    );
}
