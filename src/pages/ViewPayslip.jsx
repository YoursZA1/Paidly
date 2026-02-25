import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Payroll } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Share2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import ManualShareModal from '@/components/shared/ManualShareModal';

export default function ViewPayslip() {
    const location = useLocation();
    const navigate = useNavigate();
    const payslipId = new URLSearchParams(location.search).get('id');
    const [payslip, setPayslip] = useState(null);
    const [showManualShare, setShowManualShare] = useState(false);
    const [shareUrl, setShareUrl] = useState('');

    useEffect(() => {
        if (payslipId) {
            loadPayslip();
        }
    }, [payslipId]);

    const loadPayslip = async () => {
        try {
            const payslipData = await Payroll.get(payslipId);
            setPayslip(payslipData);
        } catch (error) {
            console.error('Error loading payslip:', error);
        }
    };

    const handleDownloadPDF = () => {
        const pdfUrl = createPageUrl(`PayslipPDF?id=${payslipId}`);
        window.location.href = pdfUrl;
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
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-4">
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
                            <h1 className="text-xl font-semibold text-gray-900">
                                {payslip ? `Payslip ${payslip.payslip_number}` : 'Loading...'}
                            </h1>
                            <p className="text-sm text-gray-600">
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

            {/* PDF Preview */}
            <div className="p-4">
                <div className="max-w-7xl mx-auto">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                        <iframe
                            src={createPageUrl(`PayslipPDF?id=${payslipId}`)}
                            title="Payslip Preview"
                            className="w-full h-screen border-none"
                            style={{ minHeight: '800px' }}
                        />
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