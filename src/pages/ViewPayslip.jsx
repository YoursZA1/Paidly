import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Payroll, User } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Share2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import ManualShareModal from '@/components/shared/ManualShareModal';
import PayslipDocument from '@/components/payslips/PayslipDocument';
import { format, isValid, parseISO } from 'date-fns';

export default function ViewPayslip() {
    const location = useLocation();
    const navigate = useNavigate();
    const payslipId = new URLSearchParams(location.search).get('id');
    const [payslip, setPayslip] = useState(null);
    const [user, setUser] = useState(null);
    const [showManualShare, setShowManualShare] = useState(false);
    const [shareUrl, setShareUrl] = useState('');

    useEffect(() => {
        if (payslipId) {
            loadPayslip();
        }
    }, [payslipId]);

    const loadPayslip = async () => {
        try {
            const [payslipData, userData] = await Promise.all([Payroll.get(payslipId), User.me()]);
            setPayslip(payslipData);
            setUser(userData);
        } catch (error) {
            console.error('Error loading payslip:', error);
        }
    };

    const handleDownloadPDF = () => {
        const pdfUrl = createPageUrl(`PayslipPDF?id=${payslipId}&download=true`);
        window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    };

    const safeFormatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = parseISO(dateStr);
        return isValid(date) ? format(date, 'MMMM d, yyyy') : 'N/A';
    };

    const handleShare = async () => {
        let token = payslip.public_share_token;
        if (!token) {
            token = crypto.randomUUID();
            try {
                await Payroll.update(payslip.id, { public_share_token: token });
                setPayslip(prev => ({ ...prev, public_share_token: token }));
            } catch (error) {
                console.error("Failed to generate share token:", error);
                alert("Could not generate a share link. Please try again.");
                return;
            }
        }
        
        const publicPayslipUrl = `${window.location.origin}${createPageUrl(`PublicPayslip?token=${token}`)}`;
        setShareUrl(publicPayslipUrl);
        setShowManualShare(true);
    };

    const handleMarkAsSent = async (sentToEmail) => {
        const updates = { sent_to_email: sentToEmail };
        if (payslip.status === 'draft') {
            updates.status = 'sent';
        }
        try {
            await Payroll.update(payslip.id, updates);
            setPayslip(prev => ({ ...prev, ...updates }));
        } catch (error) {
            console.error("Failed to mark payslip as sent:", error);
        }
        setShowManualShare(false);
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="bg-card border-b border-border px-4 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => navigate(createPageUrl("Payslips"))}
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <div>
                            <h1 className="text-xl font-semibold text-foreground">
                                {payslip ? `Payslip ${payslip.payslip_number}` : 'Loading...'}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {payslip ? `${payslip.employee_name}` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {payslipId && (
                            <>
                                <Button variant="outline" onClick={handleShare}>
                                    <Share2 className="w-4 h-4 mr-2" />
                                    Share
                                </Button>
                                <Button onClick={handleDownloadPDF}>
                                    <Download className="w-4 h-4 mr-2" />
                                    Download PDF
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Payslip Preview */}
            <div className="p-4">
                <div className="max-w-7xl mx-auto">
                    <div className="bg-slate-100 rounded-lg border border-border p-3 sm:p-6">
                        {payslip ? (
                            <PayslipDocument
                                payslip={payslip}
                                user={user}
                                payDate={safeFormatDate(payslip.pay_date)}
                                payPeriodLabel={`${safeFormatDate(payslip.pay_period_start)} - ${safeFormatDate(payslip.pay_period_end)}`}
                            />
                        ) : (
                            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                                Loading preview...
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Share Modal */}
            {showManualShare && (
                <ManualShareModal
                    isOpen={showManualShare}
                    onClose={() => setShowManualShare(false)}
                    shareUrl={shareUrl}
                    itemType="payslip"
                    onMarkAsSent={handleMarkAsSent}
                />
            )}
        </div>
    );
}