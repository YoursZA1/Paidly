import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { User } from '@/api/entities';
import { Bell, Plus, Trash2, Edit2, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentReminderSettings() {
    const [settings, setSettings] = useState({
        reminders_enabled: true,
        auto_send: true,
        reminder_rules: []
    });
    const [isSaving, setIsSaving] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Default rules if none exist
    const defaultRules = [
        {
            id: 'upcoming-3',
            days: 3,
            type: 'before',
            subject: 'Friendly Reminder: Payment Due Soon - {{invoice_number}}',
            body: 'Dear {{client_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{currency}}{{amount}} is due on {{due_date}}.\n\nPlease ensure payment is made by the due date to avoid any interruption in service.\n\nBest regards,\n{{company_name}}'
        },
        {
            id: 'due-today',
            days: 0,
            type: 'after', // 0 days after = today
            subject: 'Payment Due Today: {{invoice_number}}',
            body: 'Dear {{client_name}},\n\nThis is a reminder that invoice {{invoice_number}} for {{currency}}{{amount}} is due today.\n\nPlease arrange for payment at your earliest convenience.\n\nBest regards,\n{{company_name}}'
        },
        {
            id: 'overdue-7',
            days: 7,
            type: 'after',
            subject: 'Overdue Notice: {{invoice_number}}',
            body: 'Dear {{client_name}},\n\nOur records indicate that invoice {{invoice_number}} for {{currency}}{{amount}} was due on {{due_date}} and is now 7 days overdue.\n\nPlease settle this amount immediately.\n\nBest regards,\n{{company_name}}'
        }
    ];

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const user = await User.me();
            if (user.reminder_settings) {
                // Ensure reminder_rules exists, if not use defaults or migration logic
                const loadedSettings = {
                    ...user.reminder_settings,
                    reminder_rules: user.reminder_settings.reminder_rules || defaultRules
                };
                setSettings(loadedSettings);
            } else {
                setSettings(prev => ({ ...prev, reminder_rules: defaultRules }));
            }
        } catch (error) {
            console.error('Error loading reminder settings:', error);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await User.updateMyUserData({
                reminder_settings: settings
            });
            toast.success("Settings saved successfully");
        } catch (error) {
            console.error('Error saving reminder settings:', error);
            toast.error("Failed to save settings");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddRule = () => {
        setEditingRule({
            id: crypto.randomUUID(),
            days: 1,
            type: 'after',
            subject: 'Reminder: {{invoice_number}}',
            body: 'Dear {{client_name}},\n\nThis is a reminder regarding invoice {{invoice_number}}.'
        });
        setIsDialogOpen(true);
    };

    const handleEditRule = (rule) => {
        setEditingRule({ ...rule });
        setIsDialogOpen(true);
    };

    const handleDeleteRule = (ruleId) => {
        setSettings(prev => ({
            ...prev,
            reminder_rules: prev.reminder_rules.filter(r => r.id !== ruleId)
        }));
    };

    const saveRule = () => {
        if (!editingRule) return;

        setSettings(prev => {
            const existingIndex = prev.reminder_rules.findIndex(r => r.id === editingRule.id);
            if (existingIndex >= 0) {
                const newRules = [...prev.reminder_rules];
                newRules[existingIndex] = editingRule;
                return { ...prev, reminder_rules: newRules };
            } else {
                return { ...prev, reminder_rules: [...prev.reminder_rules, editingRule] };
            }
        });
        setIsDialogOpen(false);
        setEditingRule(null);
    };

    return (
        <Card className="bg-card border border-border">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Bell className="w-5 h-5" />
                    Automated Payment Reminders
                </CardTitle>
                <CardDescription>
                    Configure when and how your clients receive payment reminders.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Global Settings */}
                <div className="space-y-4 border-b pb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base font-medium">Enable Reminders</Label>
                            <p className="text-sm text-muted-foreground">Turn on/off all automated reminders</p>
                        </div>
                        <Switch
                            checked={settings.reminders_enabled}
                            onCheckedChange={(checked) => 
                                setSettings(prev => ({ ...prev, reminders_enabled: checked }))
                            }
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-base font-medium">Auto-Send Emails</Label>
                            <p className="text-sm text-muted-foreground">Send emails automatically without manual review</p>
                        </div>
                        <Switch
                            checked={settings.auto_send}
                            onCheckedChange={(checked) => 
                                setSettings(prev => ({ ...prev, auto_send: checked }))
                            }
                        />
                    </div>
                </div>

                {/* Reminder Rules List */}
                {settings.reminders_enabled && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium text-foreground">Reminder Schedule</h3>
                            <Button onClick={handleAddRule} variant="outline" size="sm">
                                <Plus className="w-4 h-4 mr-2" />
                                Add Rule
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {settings.reminder_rules.sort((a, b) => {
                                // Sort logic: 'before' comes first (larger days first), then 'after' (smaller days first)
                                const aVal = a.type === 'before' ? -a.days : a.days;
                                const bVal = b.type === 'before' ? -b.days : b.days;
                                return aVal - bVal;
                            }).map((rule) => (
                                <div key={rule.id} className="flex items-center justify-between p-4 bg-muted rounded-lg border">
                                    <div>
                                        <div className="font-medium text-foreground">
                                            {rule.days === 0 ? 'On Due Date' : 
                                             `${rule.days} day${rule.days > 1 ? 's' : ''} ${rule.type} due date`}
                                        </div>
                                        <div className="text-sm text-muted-foreground truncate max-w-md">
                                            Subject: {rule.subject}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="icon" onClick={() => handleEditRule(rule)}>
                                            <Edit2 className="w-4 h-4 text-muted-foreground" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(rule.id)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {settings.reminder_rules.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground italic">
                                    No reminders configured. Add a rule to get started.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="pt-4 border-t flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white">
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </Button>
                </div>

                {/* Edit/Add Rule Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{editingRule?.id ? 'Edit Reminder Rule' : 'New Reminder Rule'}</DialogTitle>
                        </DialogHeader>
                        
                        {editingRule && (
                            <div className="space-y-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Timing</Label>
                                        <div className="flex gap-2 items-center">
                                            <Input 
                                                type="number" 
                                                min="0"
                                                value={editingRule.days}
                                                onChange={(e) => setEditingRule({...editingRule, days: parseInt(e.target.value) || 0})}
                                                className="w-24"
                                            />
                                            <span className="text-sm text-muted-foreground">days</span>
                                            <Select 
                                                value={editingRule.type} 
                                                onValueChange={(val) => setEditingRule({...editingRule, type: val})}
                                            >
                                                <SelectTrigger className="w-32">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="before">Before</SelectItem>
                                                    <SelectItem value="after">After</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span className="text-sm text-muted-foreground">due date</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Email Subject</Label>
                                    <Input 
                                        value={editingRule.subject}
                                        onChange={(e) => setEditingRule({...editingRule, subject: e.target.value})}
                                        placeholder="e.g., Reminder: Invoice {{invoice_number}}"
                                    />
                                    <p className="text-xs text-muted-foreground">Available variables: {'{{invoice_number}}'}, {'{{client_name}}'}, {'{{amount}}'}, {'{{due_date}}'}</p>
                                </div>

                                <div className="space-y-2">
                                    <Label>Email Content</Label>
                                    <Textarea 
                                        value={editingRule.body}
                                        onChange={(e) => setEditingRule({...editingRule, body: e.target.value})}
                                        rows={8}
                                        placeholder="Write your email content here..."
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Available variables: {'{{invoice_number}}'}, {'{{client_name}}'}, {'{{amount}}'}, {'{{due_date}}'}, {'{{currency}}'}, {'{{company_name}}'}, {'{{view_link}}'}
                                    </p>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={saveRule} className="bg-primary text-primary-foreground">Save Rule</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}