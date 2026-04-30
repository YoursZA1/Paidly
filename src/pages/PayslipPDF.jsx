import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Payroll, User } from '@/api/entities';
import { fetchPublicPayslipPayload } from '@/api/publicPayslipApiClient';
import { getPublicPayslipViewerToken } from '@/lib/publicPayslipViewerStorage';
import { format, isValid, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import generatePdfFromElement from '@/utils/generatePdfFromElement';
import { isAbortError } from '@/utils/retryOnAbort';
import PayslipDocument from '@/components/payslips/PayslipDocument';

export default function PayslipPDF() {
    const location = useLocation();
    const navigate = useNavigate();
    const urlParams = new URLSearchParams(location.search);
    const payslipId = urlParams.get('id');
    const shareToken = urlParams.get('token');
    const autoDownload = urlParams.get('download') === 'true';
    const [payslip, setPayslip] = useState(null);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const printRef = useRef(null);

    useEffect(() => {
        if (shareToken) {
            loadPublicPayslipByToken(shareToken, payslipId);
            return;
        }
        if (payslipId) {
            loadPayslipData();
            return;
        }
        setIsLoading(false);
    }, [payslipId, shareToken]);

    useEffect(() => {
        if (autoDownload && !isLoading && payslip) {
            const timer = setTimeout(() => {
                void handleDownloadPDF();
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [autoDownload, isLoading, payslip]);

    const loadPublicPayslipByToken = async (token, expectedId) => {
        setIsLoading(true);
        try {
            const viewerToken = getPublicPayslipViewerToken(token);
            const payload = await fetchPublicPayslipPayload(token, viewerToken);
            if (payload.requiresEmailVerification) {
                setPayslip(null);
                setUser(null);
                return;
            }
            const row = payload.payslip;
            if (!row) {
                setPayslip(null);
                setUser(null);
                return;
            }
            if (expectedId && row.id !== expectedId) {
                setPayslip(null);
                setUser(null);
                return;
            }
            setPayslip(row);
            setUser({
                company_name: row.owner_company_name,
                company_address: row.owner_company_address,
                logo_url: row.owner_logo_url,
                currency: row.owner_currency || 'ZAR',
            });
        } catch (error) {
            console.error('Error loading public payslip PDF:', error);
            setPayslip(null);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const loadPayslipData = async () => {
        try {
            const [payslipData, userData] = await Promise.all([
                Payroll.get(payslipId),
                User.me()
            ]);
            setPayslip(payslipData);
            setUser(userData);
        } catch (error) {
            console.error('Error loading payslip data:', error);
        } finally {
            setIsLoading(false);
        }
    };
    
    const safeFormatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = parseISO(dateStr);
        return isValid(date) ? format(date, 'MMMM d, yyyy') : 'N/A';
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!payslip || !user) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4 text-center text-muted-foreground">
                {shareToken
                    ? 'Document not found. Open the payslip link in your browser, verify your email if asked, then try again.'
                    : 'Document not found.'}
            </div>
        );
    }

    const payDate = safeFormatDate(payslip.pay_date);
    const userCurrency = user?.currency || 'ZAR';

    const payPeriodLabel = `${safeFormatDate(payslip.pay_period_start)} - ${safeFormatDate(payslip.pay_period_end)}`;
    const filename = `${payslip?.payslip_number || 'payslip'}.pdf`;

    const handleDownloadPDF = async () => {
        if (!printRef.current || isGeneratingPdf) return;
        setIsGeneratingPdf(true);
        try {
            await generatePdfFromElement(printRef.current, filename);
        } catch (error) {
            if (isAbortError(error)) return;
            console.error('Payslip PDF generation failed, falling back to print:', error);
            window.print();
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return (
        <>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { margin: 0; background-color: white; }
                    .print-container { box-shadow: none !important; margin: 0 !important; border: none !important; }
                }
                @page {
                    margin: 0.5in;
                    size: A4;
                }
            `}</style>
            <div className="min-h-screen bg-slate-100 py-4 sm:py-6 print:bg-white print:py-0">
                <div className="w-full px-page sm:px-6">
                    <div className="no-print mb-4 flex flex-col sm:flex-row justify-end gap-2 max-w-[210mm] mx-auto">
                        <Button variant="outline" onClick={() => navigate(-1)}>
                            Back
                        </Button>
                        <Button onClick={() => void handleDownloadPDF()} disabled={isGeneratingPdf}>
                            {isGeneratingPdf ? 'Generating PDF…' : 'Download PDF'}
                        </Button>
                    </div>

                    <div className="print-container max-w-[210mm] mx-auto">
                        <div ref={printRef}>
                            <PayslipDocument
                                payslip={payslip}
                                user={user}
                                payDate={payDate}
                                payPeriodLabel={payPeriodLabel}
                                className="rounded-none sm:rounded-2xl"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}