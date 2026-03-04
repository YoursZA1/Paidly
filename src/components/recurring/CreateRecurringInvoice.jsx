import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RecurringInvoice, Client } from '@/api/entities';
import { RecurringInvoiceService } from '../../services/RecurringInvoiceService';
import { formatCurrency } from '@/utils/currencyCalculations';
import { AlertCircle, Plus, Trash2, Zap } from 'lucide-react';
import { format } from 'date-fns';
import PropTypes from 'prop-types';

const CreateRecurringInvoice = ({ isOpen, onClose, onSuccess, clientId: initialClientId }) => {
  const [step, setStep] = useState('template'); // template, details, items, review
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    client_id: initialClientId || '',
    frequency: 'monthly',
    template_name: '',
    invoice_prefix: 'REC',
    total_amount: 0,
    tax_rate: 0,
    notes: '',
    due_date_offset: 30,
    items: [{ description: '', amount: 0, quantity: 1 }],
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    status: 'active'
  });

  useEffect(() => {
    if (isOpen) {
      loadClients();
    }
  }, [isOpen]);

  const loadClients = async () => {
    try {
      const clientsData = await Client.list();
      setClients(clientsData || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const handleTemplateSelect = (templateId) => {
    setSelectedTemplate(templateId);
    const template = RecurringInvoiceService.getTemplate(templateId);
    if (template) {
      setFormData(prev => ({
        ...prev,
        frequency: template.frequency,
        template_name: template.name
      }));
    }
  };

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError('');
  };

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { description: '', amount: 0, quantity: 1 }]
    }));
  };

  const updateLineItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = field === 'quantity' ? parseInt(value) || 0 : value;
    
    // Recalculate total
    const total = newItems.reduce((sum, item) => sum + (item.amount * item.quantity), 0);
    
    setFormData(prev => ({
      ...prev,
      items: newItems,
      total_amount: total
    }));
  };

  const removeLineItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    const total = newItems.reduce((sum, item) => sum + (item.amount * item.quantity), 0);
    
    setFormData(prev => ({
      ...prev,
      items: newItems,
      total_amount: total
    }));
  };

  const validateCurrentStep = () => {
    if (step === 'template') {
      if (!formData.client_id) {
        setError('Please select a client');
        return false;
      }
      if (!formData.frequency) {
        setError('Please select a frequency');
        return false;
      }
    } else if (step === 'details') {
      if (!formData.template_name) {
        setError('Template name is required');
        return false;
      }
      if (!formData.invoice_prefix) {
        setError('Invoice prefix is required');
        return false;
      }
      if (formData.due_date_offset < 0) {
        setError('Due date offset must be positive');
        return false;
      }
    } else if (step === 'items') {
      if (formData.items.length === 0) {
        setError('At least one line item is required');
        return false;
      }
      const hasEmptyItems = formData.items.some(item => !item.description || item.amount <= 0);
      if (hasEmptyItems) {
        setError('All items must have description and amount');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    
    if (step === 'template') setStep('details');
    else if (step === 'details') setStep('items');
    else if (step === 'items') setStep('review');
  };

  const handleBack = () => {
    if (step === 'details') setStep('template');
    else if (step === 'items') setStep('details');
    else if (step === 'review') setStep('items');
  };

  const handleCreate = async () => {
    if (!validateCurrentStep()) return;

    setLoading(true);
    setError('');
    
    try {
      const validation = RecurringInvoiceService.validateData(formData);
      if (!validation.isValid) {
        setError(validation.errors.join(', '));
        setLoading(false);
        return;
      }

      const recurringData = {
        ...formData,
        next_generation_date: formData.start_date,
        created_date: new Date().toISOString()
      };

      const created = await RecurringInvoice.create(recurringData);
      
      onSuccess?.(created);
      resetForm();
      onClose();
    } catch (error) {
      setError(error.message || 'Failed to create recurring invoice');
      console.error('Error creating recurring invoice:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      client_id: initialClientId || '',
      frequency: 'monthly',
      template_name: '',
      invoice_prefix: 'REC',
      total_amount: 0,
      tax_rate: 0,
      notes: '',
      due_date_offset: 30,
      items: [{ description: '', amount: 0, quantity: 1 }],
      start_date: new Date().toISOString().slice(0, 10),
      end_date: '',
      status: 'active'
    });
    setSelectedTemplate(null);
    setStep('template');
  };

  const nextGenDate = formData.start_date ? format(new Date(formData.start_date), 'MMM dd, yyyy') : 'N/A';
  const calculatedTax = (formData.total_amount * (formData.tax_rate || 0)) / 100;
  const finalAmount = formData.total_amount + calculatedTax;

  const templates = RecurringInvoiceService.getAllTemplates();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        resetForm();
        onClose();
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Create Recurring Invoice
          </DialogTitle>
          <DialogDescription>
            {step === 'template' && 'Select a template or frequency'}
            {step === 'details' && 'Configure invoice details'}
            {step === 'items' && 'Add line items'}
            {step === 'review' && 'Review and create'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">{error}</AlertDescription>
          </Alert>
        )}

        {/* TEMPLATE SELECTION STEP */}
        {step === 'template' && (
          <div className="space-y-6 py-4">
            {/* Client Selection */}
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={formData.client_id} onValueChange={(value) => handleFieldChange('client_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Frequency Selection */}
            <div className="space-y-3">
              <Label>Billing Frequency *</Label>
              <div className="grid grid-cols-2 gap-3">
                {RecurringInvoiceService.getAllFrequencies().map(freq => (
                  <button
                    key={freq.id}
                    onClick={() => handleFieldChange('frequency', freq.id)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      formData.frequency === freq.id
                        ? 'border-primary bg-primary/10'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-semibold text-sm">{freq.label}</p>
                    <p className="text-xs text-gray-600">{freq.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Template Selection */}
            <div className="space-y-3">
              <Label>Template (Optional)</Label>
              <div className="grid gap-3">
                {templates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateSelect(template.id)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      selectedTemplate === template.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-semibold text-sm">{template.name}</p>
                    <p className="text-xs text-gray-600">{template.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DETAILS STEP */}
        {step === 'details' && (
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="template_name">Template Name *</Label>
              <Input
                id="template_name"
                value={formData.template_name}
                onChange={(e) => handleFieldChange('template_name', e.target.value)}
                placeholder="e.g., Monthly Service Retainer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="invoice_prefix">Invoice Prefix *</Label>
                <Input
                  id="invoice_prefix"
                  value={formData.invoice_prefix}
                  onChange={(e) => handleFieldChange('invoice_prefix', e.target.value)}
                  placeholder="REC"
                />
              </div>
              <div>
                <Label htmlFor="due_date_offset">Due in (days)</Label>
                <Input
                  id="due_date_offset"
                  type="number"
                  min="0"
                  value={formData.due_date_offset}
                  onChange={(e) => handleFieldChange('due_date_offset', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleFieldChange('start_date', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="end_date">End Date (Optional)</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => handleFieldChange('end_date', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleFieldChange('notes', e.target.value)}
                placeholder="Add any additional notes or terms..."
                rows={3}
              />
            </div>
          </div>
        )}

        {/* ITEMS STEP */}
        {step === 'items' && (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              {formData.items.map((item, idx) => (
                <div key={idx} className="p-3 border rounded-lg space-y-2">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-medium text-gray-600">Item {idx + 1}</span>
                    {formData.items.length > 1 && (
                      <button
                        onClick={() => removeLineItem(idx)}
                        className="p-1 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    )}
                  </div>

                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Amount"
                      value={item.amount}
                      onChange={(e) => updateLineItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                    />
                    <Input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                    />
                    <div className="bg-gray-50 rounded p-2 flex items-center justify-end font-semibold">
                      {formatCurrency(item.amount * item.quantity, 'USD')}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={addLineItem}
              variant="outline"
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Line Item
            </Button>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <Label htmlFor="tax_rate">Tax Rate (%)</Label>
                <Input
                  id="tax_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.tax_rate}
                  onChange={(e) => handleFieldChange('tax_rate', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-600 mb-1">Subtotal</p>
                <p className="text-lg font-bold">{formatCurrency(formData.total_amount, 'USD')}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-600 mb-1">Total</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(finalAmount, 'USD')}</p>
              </div>
            </div>
          </div>
        )}

        {/* REVIEW STEP */}
        {step === 'review' && (
          <div className="space-y-4 py-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Client:</span>
                  <span className="font-medium">{clients.find(c => c.id === formData.client_id)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Frequency:</span>
                  <span className="font-medium">{RecurringInvoiceService.getFrequency(formData.frequency).label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Start Date:</span>
                  <span className="font-medium">{nextGenDate}</span>
                </div>
                {formData.end_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">End Date:</span>
                    <span className="font-medium">{format(new Date(formData.end_date), 'MMM dd, yyyy')}</span>
                  </div>
                )}
                <div className="border-t pt-3 flex justify-between">
                  <span className="font-medium">Total Amount:</span>
                  <span className="text-lg font-bold text-primary">{formatCurrency(finalAmount, 'USD')}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {formData.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{item.description} (x{item.quantity})</span>
                      <span className="font-medium">{formatCurrency(item.amount * item.quantity, 'USD')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="pt-6 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 'template' || loading}
          >
            Back
          </Button>
          
          {step !== 'review' ? (
            <Button
              onClick={handleNext}
              disabled={loading}
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Recurring Invoice'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

CreateRecurringInvoice.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
  clientId: PropTypes.string
};

export default CreateRecurringInvoice;
