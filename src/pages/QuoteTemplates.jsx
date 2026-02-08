import React, { useState, useEffect } from 'react';
import { QuoteTemplate } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Edit, Save, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';

export default function QuoteTemplates() {
    const [templates, setTemplates] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [currentTemplate, setCurrentTemplate] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        try {
            const data = await QuoteTemplate.list("-created_date");
            setTemplates(data);
        } catch (error) {
            console.error("Failed to load templates", error);
        }
    };

    const handleCreateNew = () => {
        setCurrentTemplate({
            name: "",
            project_title: "",
            project_description: "",
            items: [{ service_name: "", description: "", quantity: 1, unit_price: 0, total_price: 0 }],
            notes: "",
            terms_conditions: ""
        });
        setIsEditing(true);
    };

    const handleEdit = (template) => {
        setCurrentTemplate(template);
        setIsEditing(true);
    };

    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this template?")) {
            await QuoteTemplate.delete(id);
            loadTemplates();
        }
    };

    const handleSave = async () => {
        try {
            if (currentTemplate.id) {
                await QuoteTemplate.update(currentTemplate.id, currentTemplate);
            } else {
                await QuoteTemplate.create(currentTemplate);
            }
            setIsEditing(false);
            setCurrentTemplate(null);
            loadTemplates();
        } catch (error) {
            console.error("Failed to save template", error);
        }
    };

    const updateItem = (index, field, value) => {
        const newItems = [...currentTemplate.items];
        newItems[index] = { ...newItems[index], [field]: value };
        
        // Auto-calculate total
        if (field === 'quantity' || field === 'unit_price') {
            const qty = field === 'quantity' ? parseFloat(value) : newItems[index].quantity;
            const price = field === 'unit_price' ? parseFloat(value) : newItems[index].unit_price;
            newItems[index].total_price = qty * price;
        }

        setCurrentTemplate({ ...currentTemplate, items: newItems });
    };

    const addItem = () => {
        setCurrentTemplate({
            ...currentTemplate,
            items: [...currentTemplate.items, { service_name: "", description: "", quantity: 1, unit_price: 0, total_price: 0 }]
        });
    };

    const removeItem = (index) => {
        const newItems = currentTemplate.items.filter((_, i) => i !== index);
        setCurrentTemplate({ ...currentTemplate, items: newItems });
    };

    if (isEditing) {
        return (
            <div className="p-6 max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">{currentTemplate.id ? 'Edit Template' : 'New Template'}</h1>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white"><Save className="w-4 h-4 mr-2"/> Save Template</Button>
                    </div>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Template Details</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label>Template Name</Label>
                                <Input value={currentTemplate.name} onChange={e => setCurrentTemplate({...currentTemplate, name: e.target.value})} placeholder="e.g. Web Design Standard" />
                            </div>
                            <div className="grid gap-2">
                                <Label>Default Project Title</Label>
                                <Input value={currentTemplate.project_title} onChange={e => setCurrentTemplate({...currentTemplate, project_title: e.target.value})} placeholder="Project Title" />
                            </div>
                            <div className="grid gap-2">
                                <Label>Default Description</Label>
                                <Textarea value={currentTemplate.project_description} onChange={e => setCurrentTemplate({...currentTemplate, project_description: e.target.value})} placeholder="Project Description" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Line Items</CardTitle>
                            <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-2"/> Add Item</Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {currentTemplate.items.map((item, index) => (
                                <div key={index} className="grid grid-cols-12 gap-4 items-start border-b pb-4 last:border-0">
                                    <div className="col-span-5 space-y-2">
                                        <Input placeholder="Service Name" value={item.service_name} onChange={e => updateItem(index, 'service_name', e.target.value)} />
                                        <Textarea placeholder="Description" className="h-14" value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} />
                                    </div>
                                    <div className="col-span-2">
                                        <Input type="number" placeholder="Qty" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} />
                                    </div>
                                    <div className="col-span-3">
                                        <Input type="number" placeholder="Price" value={item.unit_price} onChange={e => updateItem(index, 'unit_price', e.target.value)} />
                                    </div>
                                    <div className="col-span-2 flex items-center justify-between">
                                        <span className="font-bold">${item.total_price.toFixed(2)}</span>
                                        <Button variant="ghost" size="icon" className="text-red-500" onClick={() => removeItem(index)}><Trash2 className="w-4 h-4"/></Button>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="space-y-4 pt-6">
                            <div className="grid gap-2">
                                <Label>Default Notes</Label>
                                <Textarea value={currentTemplate.notes} onChange={e => setCurrentTemplate({...currentTemplate, notes: e.target.value})} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Default Terms</Label>
                                <Textarea value={currentTemplate.terms_conditions} onChange={e => setCurrentTemplate({...currentTemplate, terms_conditions: e.target.value})} />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Quote Templates</h1>
                        <p className="text-slate-600">Create reusable templates to speed up your workflow.</p>
                    </div>
                    <Button onClick={handleCreateNew} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        <Plus className="w-4 h-4 mr-2" /> New Template
                    </Button>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates.map(template => (
                        <Card key={template.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-bold">{template.name}</CardTitle>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(template)}><Edit className="w-4 h-4 text-slate-500"/></Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(template.id)}><Trash2 className="w-4 h-4 text-red-500"/></Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-slate-500 mb-4">{template.items.length} line items</p>
                                <div className="space-y-1">
                                    {template.project_title && <p className="text-sm font-medium">{template.project_title}</p>}
                                    <p className="text-xs text-slate-400 line-clamp-2">{template.project_description || "No description"}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {templates.length === 0 && (
                        <div className="col-span-full text-center py-12 text-slate-500">
                            No templates found. Create one to get started!
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}