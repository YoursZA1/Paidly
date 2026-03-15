import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Mail, Download, Edit, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Payroll } from '@/api/entities';
import ConfirmationDialog from '../shared/ConfirmationDialog';
import ManualShareModal from '../shared/ManualShareModal';

export default function PayslipActions({ payslip, onActionSuccess }) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showManualShare, setShowManualShare] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const navigate = useNavigate();

    const handleShare = async () => {
        let token = payslip.public_share_token;
        if (!token) {
            token = crypto.randomUUID();
            try {
                await Payroll.update(payslip.id, { public_share_token: token });
                onActionSuccess();
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
            onActionSuccess();
        } catch (error) {
            console.error("Failed to mark payslip as sent:", error);
        }
        setShowManualShare(false);
    };

    const handleDownloadPDF = () => {
        navigate(createPageUrl(`PayslipPDF?id=${payslip.id}&download=true`));
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await Payroll.delete(payslip.id);
            onActionSuccess();
            setShowDeleteConfirm(false);
        } catch (error) {
            console.error("Failed to delete payslip:", error);
            alert("Failed to delete payslip. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                        <Link to={createPageUrl(`ViewPayslip?id=${payslip.id}`)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Payslip
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link to={createPageUrl(`EditPayslip?id=${payslip.id}`)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Payslip
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShare}>
                        <Mail className="w-4 h-4 mr-2" />
                        Share with Employee
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadPDF}>
                        <Download className="w-4 h-4 mr-2" />
                        Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-red-600 focus:text-red-700 focus:bg-red-50">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Payslip
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ConfirmationDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Are you absolutely sure?"
                description="This action cannot be undone. This will permanently delete the payslip."
                confirmText="Delete"
                isConfirming={isDeleting}
            />

            {showManualShare && (
                <ManualShareModal
                    isOpen={showManualShare}
                    onClose={() => setShowManualShare(false)}
                    shareUrl={shareUrl}
                    itemType="payslip"
                    onMarkAsSent={handleMarkAsSent}
                />
            )}
        </>
    );
}