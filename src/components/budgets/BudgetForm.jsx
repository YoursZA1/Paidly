import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";

export default function BudgetForm({ budget, onSave, onCancel, onDelete }) {
    const [formData, setFormData] = useState(budget || {
        name: "",
        type: "expense",
        category: "total",
        amount: "",
        period: "monthly",
        notifications_enabled: true,
        alert_threshold: 80
    });

    const expenseCategories = [
        "total", "office", "travel", "utilities", "supplies", "salary", 
        "marketing", "software", "consulting", "legal", 
        "maintenance", "vehicle", "meals", "other"
    ];

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...formData,
            amount: parseFloat(formData.amount)
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div>
                <Label>Budget Name</Label>
                <Input 
                    value={formData.name} 
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. Monthly Marketing Cap"
                    required 
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label>Type</Label>
                    <Select 
                        value={formData.type} 
                        onValueChange={(val) => setFormData({...formData, type: val})}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="expense">Expense</SelectItem>
                            <SelectItem value="income">Income Goal</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label>Period</Label>
                    <Select 
                        value={formData.period} 
                        onValueChange={(val) => setFormData({...formData, period: val})}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {formData.type === 'expense' && (
                <div>
                    <Label>Category</Label>
                    <Select 
                        value={formData.category} 
                        onValueChange={(val) => setFormData({...formData, category: val})}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="total">All Expenses (Total)</SelectItem>
                            {expenseCategories.filter(c => c !== 'total').map(cat => (
                                <SelectItem key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            <div>
                <Label>Amount (Limit/Goal)</Label>
                <Input 
                    type="number" 
                    value={formData.amount} 
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    required 
                />
            </div>

            <div className="flex items-center space-x-2 pt-2">
                <Checkbox 
                    id="notif" 
                    checked={formData.notifications_enabled} 
                    onCheckedChange={(checked) => setFormData({...formData, notifications_enabled: checked})}
                />
                <Label htmlFor="notif" className="text-sm font-normal">Alert me when I reach</Label>
                <Input 
                    type="number" 
                    className="w-16 h-8" 
                    value={formData.alert_threshold} 
                    onChange={(e) => setFormData({...formData, alert_threshold: e.target.value})}
                />
                <span className="text-sm">%</span>
            </div>

            <div className="flex gap-2 pt-4">
                {budget && (
                    <Button type="button" variant="destructive" size="icon" onClick={onDelete}>
                        <Trash2 className="w-4 h-4" />
                    </Button>
                )}
                <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" className="flex-1">
                    {budget ? 'Update' : 'Set'} Budget
                </Button>
            </div>
        </form>
    );
}