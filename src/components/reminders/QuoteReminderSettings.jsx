import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Save } from 'lucide-react';
import { toast } from 'sonner';
import { User } from '@/api/entities';
import { useAuth } from '@/contexts/AuthContext';

const defaultSettings = () => ({
    enabled: false,
    days_after_sent: 3,
    subject: 'Following up on Quote {{quote_number}}',
    body: 'Hi {{client_name}},\n\nI just wanted to follow up on the quote I sent a few days ago. Have you had a chance to review it?\n\nYou can view it here: {{view_link}}\n\nLet me know if you have any questions.\n\nBest regards,\n{{company_name}}',
});

export default function QuoteReminderSettings() {
    const { profile } = useAuth();
    const [settings, setSettings] = useState(defaultSettings);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!profile) return;
        const q = profile.quote_reminder_settings;
        if (q && typeof q === 'object') {
            setSettings({ ...defaultSettings(), ...q });
        } else {
            setSettings(defaultSettings());
        }
    }, [profile]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await User.updateMyUserData({
                quote_reminder_settings: settings,
            });
            toast.success('Quote reminder settings saved');
        } catch (error) {
            console.error('Error saving quote reminder settings:', error);
            toast.error('Could not save settings');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card className="bg-card border border-border">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Quote follow-up emails
                </CardTitle>
                <CardDescription>
                    Send one reminder email per sent quote after the number of days you choose. Uses the same email integration as invoice reminders.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="text-base font-medium">Enable quote reminders</Label>
                        <p className="text-sm text-muted-foreground">Applies to quotes still in Sent status.</p>
                    </div>
                    <Switch
                        checked={settings.enabled}
                        onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, enabled: checked }))}
                    />
                </div>

                {settings.enabled && (
                    <>
                        <div className="space-y-2">
                            <Label>Days after quote is sent</Label>
                            <Input
                                type="number"
                                min={1}
                                max={365}
                                value={settings.days_after_sent}
                                onChange={(e) =>
                                    setSettings((prev) => ({
                                        ...prev,
                                        days_after_sent: Math.max(1, parseInt(e.target.value, 10) || 1),
                                    }))
                                }
                                className="max-w-[120px]"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Email subject</Label>
                            <Input
                                value={settings.subject}
                                onChange={(e) => setSettings((prev) => ({ ...prev, subject: e.target.value }))}
                            />
                            <p className="text-xs text-muted-foreground">
                                Variables: {'{{quote_number}}'}, {'{{client_name}}'}, {'{{contact_person}}'}, {'{{project_title}}'}, {'{{company_name}}'}, {'{{view_link}}'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Message body</Label>
                            <Textarea value={settings.body} onChange={(e) => setSettings((prev) => ({ ...prev, body: e.target.value }))} rows={10} />
                        </div>
                    </>
                )}

                <div className="pt-2 flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white">
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
