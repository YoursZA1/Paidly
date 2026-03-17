import React, { useState, useEffect } from 'react';
import { TaskAssignmentRule, Client } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Settings, ArrowLeft, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Badge } from '@/components/ui/badge';

export default function TaskSettingsPage() {
    const [rules, setRules] = useState([]);
    const [clients, setClients] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        client_id: '',
        category: '',
        assign_to_email: '',
        assign_to_name: '',
        is_active: true
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [rulesData, clientsData] = await Promise.all([
                TaskAssignmentRule.list(),
                Client.list()
            ]);
            setRules(rulesData || []);
            setClients(clientsData || []);
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setIsLoading(false);
    };

    const handleSave = async () => {
        try {
            if (editingRule) {
                await TaskAssignmentRule.update(editingRule.id, formData);
            } else {
                await TaskAssignmentRule.create(formData);
            }
            setShowForm(false);
            setEditingRule(null);
            setFormData({ name: '', client_id: '', category: '', assign_to_email: '', assign_to_name: '', is_active: true });
            loadData();
        } catch (error) {
            console.error('Error saving rule:', error);
        }
    };

    const handleEdit = (rule) => {
        setEditingRule(rule);
        setFormData({
            name: rule.name || '',
            client_id: rule.client_id || '',
            category: rule.category || '',
            assign_to_email: rule.assign_to_email || '',
            assign_to_name: rule.assign_to_name || '',
            is_active: rule.is_active !== false
        });
        setShowForm(true);
    };

    const handleDelete = async (rule) => {
        if (confirm('Delete this assignment rule?')) {
            await TaskAssignmentRule.delete(rule.id);
            loadData();
        }
    };

    const handleToggleActive = async (rule) => {
        await TaskAssignmentRule.update(rule.id, { ...rule, is_active: !rule.is_active });
        loadData();
    };

    const getClientName = (clientId) => clients.find(c => c.id === clientId)?.name || 'Any Client';

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4 mb-8"
                >
                    <Link to={createPageUrl('Calendar')}>
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">Task Settings</h1>
                        <p className="text-slate-600">Configure automatic task assignment rules</p>
                    </div>
                    <Button onClick={() => { setEditingRule(null); setFormData({ name: '', client_id: '', category: '', assign_to_email: '', assign_to_name: '', is_active: true }); setShowForm(true); }} className="bg-primary hover:bg-primary/90">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Rule
                    </Button>
                </motion.div>

                <Card className="bg-white shadow-xl border-0">
                    <CardHeader className="border-b border-slate-100">
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="w-5 h-5" />
                            Auto-Assignment Rules
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        {rules.length === 0 ? (
                            <div className="text-center text-slate-500 py-12">
                                <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p className="mb-4">No assignment rules configured</p>
                                <p className="text-sm">Create rules to automatically assign tasks based on client or category</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {rules.map((rule) => (
                                    <div key={rule.id} className={`border rounded-lg p-4 ${rule.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h4 className="font-semibold text-slate-900">{rule.name}</h4>
                                                    <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                                                        {rule.is_active ? 'Active' : 'Inactive'}
                                                    </Badge>
                                                </div>
                                                <div className="text-sm text-slate-600 space-y-1">
                                                    <p>
                                                        <span className="font-medium">When:</span>{' '}
                                                        {rule.client_id ? `Client is "${getClientName(rule.client_id)}"` : 'Any client'}
                                                        {rule.category ? ` AND category is "${rule.category.replace('_', ' ')}"` : ''}
                                                    </p>
                                                    <p>
                                                        <span className="font-medium">Assign to:</span> {rule.assign_to_name || rule.assign_to_email}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={rule.is_active}
                                                    onCheckedChange={() => handleToggleActive(rule)}
                                                />
                                                <Button variant="ghost" size="icon" onClick={() => handleEdit(rule)}>
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(rule)}>
                                                    <Trash2 className="w-4 h-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Dialog open={showForm} onOpenChange={setShowForm}>
                    <DialogContent aria-describedby={undefined}>
                        <DialogHeader>
                            <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Assignment Rule'}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Rule Name *</Label>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Assign VIP clients to John"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>When Client Is</Label>
                                <Select
                                    value={formData.client_id}
                                    onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Any client" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={null}>Any Client</SelectItem>
                                        {clients.map(client => (
                                            <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>And Category Is</Label>
                                <Select
                                    value={formData.category}
                                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Any category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={null}>Any Category</SelectItem>
                                        <SelectItem value="follow_up">Follow Up</SelectItem>
                                        <SelectItem value="meeting">Meeting</SelectItem>
                                        <SelectItem value="deadline">Deadline</SelectItem>
                                        <SelectItem value="payment">Payment</SelectItem>
                                        <SelectItem value="delivery">Delivery</SelectItem>
                                        <SelectItem value="review">Review</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Assign To (Name) *</Label>
                                <Input
                                    value={formData.assign_to_name}
                                    onChange={(e) => setFormData({ ...formData, assign_to_name: e.target.value })}
                                    placeholder="Team member name"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Assign To (Email)</Label>
                                <Input
                                    type="email"
                                    value={formData.assign_to_email}
                                    onChange={(e) => setFormData({ ...formData, assign_to_email: e.target.value })}
                                    placeholder="team.member@email.com"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={!formData.name || !formData.assign_to_name} className="bg-primary hover:bg-primary/90">
                                {editingRule ? 'Update' : 'Create'} Rule
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}