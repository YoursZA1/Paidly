import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Mail, CheckCircle, Send } from 'lucide-react';
import { breakApi } from '@/api/apiClient';
import { User } from '@/api/entities';

export default function ManualShareModal({ isOpen, onClose, shareUrl, itemType = "invoice", onMarkAsSent, invoice }) {
    const [copied, setCopied] = useState(false);
    const [emailTo, setEmailTo] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailMessage, setEmailMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSendEmail = async () => {
        if (!emailTo || !emailSubject) {
            alert('Please fill in the recipient email and subject.');
            return;
        }

        setIsSending(true);
        try {
            const user = await User.me();
            const emailBody = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #f9fafb;">
                    <div style="text-align: center; padding: 20px 0;">
                        <h1 style="font-size: 24px; color: #333;">You've received a new ${itemType}</h1>
                    </div>
                    <div style="background: white; padding: 30px; border: 1px solid #e1e5e9; border-radius: 8px;">
                        <p style="font-size: 16px; color: #555;">${emailMessage || `Please find your ${itemType} below.`}</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${shareUrl}" 
                               style="background-color: #4f46e5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block;">
                                View ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}
                            </a>
                        </div>
                        <p style="font-size: 14px; color: #888; margin-top: 20px;">
                            Or copy this link: <br/>
                            <a href="${shareUrl}" style="color: #4f46e5; word-break: break-all;">${shareUrl}</a>
                        </p>
                    </div>
                    <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
                        <p>Sent from ${user.company_name || user.full_name}</p>
                    </div>
                </div>
            `;

            await breakApi.integrations.Core.SendEmail({
                to: emailTo,
                subject: emailSubject,
                body: emailBody
            });

            alert('Email sent successfully!');
            if (onMarkAsSent) {
                await onMarkAsSent(emailTo);
            }
            onClose();
        } catch (error) {
            console.error('Failed to send email:', error);
            alert('Failed to send email. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Share {itemType.charAt(0).toUpperCase() + itemType.slice(1)}</DialogTitle>
                    <DialogDescription>
                        Copy the link or send it directly via email to your client.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Copy Link Section */}
                    <div className="space-y-2">
                        <Label>Public Link</Label>
                        <div className="flex gap-2">
                            <Input 
                                value={shareUrl} 
                                readOnly 
                                className="flex-1 font-mono text-sm"
                            />
                            <Button 
                                onClick={handleCopyLink}
                                variant="outline"
                                className="shrink-0"
                            >
                                {copied ? <CheckCircle className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />}
                                {copied ? 'Copied!' : 'Copy'}
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500">Share this secure link with your client. They can view and download without logging in.</p>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-semibold mb-4 flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            Or Send via Email
                        </h4>
                        
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email-to">Recipient Email *</Label>
                                <Input
                                    id="email-to"
                                    type="email"
                                    placeholder="client@example.com"
                                    value={emailTo}
                                    onChange={(e) => setEmailTo(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email-subject">Subject *</Label>
                                <Input
                                    id="email-subject"
                                    placeholder={`Your ${itemType} is ready`}
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email-message">Personal Message (Optional)</Label>
                                <Textarea
                                    id="email-message"
                                    placeholder={`Add a personal message to your client...`}
                                    value={emailMessage}
                                    onChange={(e) => setEmailMessage(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSendEmail}
                        disabled={isSending || !emailTo || !emailSubject}
                        className="bg-primary hover:bg-primary/90"
                    >
                        {isSending ? (
                            <>
                                <Send className="w-4 h-4 mr-2 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Send Email
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}