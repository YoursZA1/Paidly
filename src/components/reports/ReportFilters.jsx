import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Filter, X } from 'lucide-react';
import { format } from 'date-fns';

export default function ReportFilters({ 
    timeRange, 
    onTimeRangeChange, 
    customDateRange, 
    onCustomDateRangeChange,
    selectedClient,
    onClientChange,
    clients,
    invoiceStatus,
    onInvoiceStatusChange,
    expenseCategory,
    onExpenseCategoryChange,
    selectedVendor,
    onVendorChange,
    vendors = [],
    onReset
}) {
    const hasCustomFilters = customDateRange?.from || customDateRange?.to || selectedClient || invoiceStatus || expenseCategory || selectedVendor;

    const invoiceStatuses = ['draft', 'sent', 'viewed', 'partial_paid', 'paid', 'overdue', 'cancelled'];
    const expenseCategories = ['office', 'travel', 'utilities', 'supplies', 'salary', 'marketing', 'software', 'other'];

    return (
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardContent className="p-6">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Filter className="w-4 h-4 text-slate-600" />
                        <span className="font-semibold text-slate-900">Report Filters</span>
                        {hasCustomFilters && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={onReset}
                                className="ml-auto text-xs"
                            >
                                <X className="w-3 h-3 mr-1" />
                                Reset Filters
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label htmlFor="report-filter-time-range" className="text-sm font-medium text-slate-700 mb-2 block">Time Period</Label>
                            <Select value={timeRange} onValueChange={onTimeRangeChange}>
                                <SelectTrigger id="report-filter-time-range" className="w-full bg-white border-slate-200">
                                    <SelectValue placeholder="Select time range" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="month">This Month</SelectItem>
                                    <SelectItem value="quarter">Last 3 Months</SelectItem>
                                    <SelectItem value="year">This Year</SelectItem>
                                    <SelectItem value="all">All Time</SelectItem>
                                    <SelectItem value="custom">Custom Range</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {timeRange === 'custom' && (
                            <>
                                <div>
                                    <Label htmlFor="report-custom-from-trigger" className="text-sm font-medium text-slate-700 mb-2 block">From Date</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button 
                                                id="report-custom-from-trigger"
                                                type="button"
                                                variant="outline" 
                                                className="w-full justify-start text-left font-normal"
                                                aria-label="Report custom range from date"
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {customDateRange?.from ? format(customDateRange.from, 'PPP') : 'Pick a date'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={customDateRange?.from}
                                                onSelect={(date) => onCustomDateRangeChange({ ...customDateRange, from: date })}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <div>
                                    <Label htmlFor="report-custom-to-trigger" className="text-sm font-medium text-slate-700 mb-2 block">To Date</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button 
                                                id="report-custom-to-trigger"
                                                type="button"
                                                variant="outline" 
                                                className="w-full justify-start text-left font-normal"
                                                aria-label="Report custom range to date"
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {customDateRange?.to ? format(customDateRange.to, 'PPP') : 'Pick a date'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={customDateRange?.to}
                                                onSelect={(date) => onCustomDateRangeChange({ ...customDateRange, to: date })}
                                                disabled={(date) => customDateRange?.from && date < customDateRange.from}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </>
                        )}

                        <div>
                            <Label htmlFor="report-filter-customer" className="text-sm font-medium text-slate-700 mb-2 block">Filter by Customer</Label>
                            <Select value={selectedClient || 'all'} onValueChange={(value) => onClientChange(value === 'all' ? null : value)}>
                                <SelectTrigger id="report-filter-customer" className="w-full bg-white border-slate-200">
                                    <SelectValue placeholder="All Customers" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Customers</SelectItem>
                                    {clients.map(client => (
                                        <SelectItem key={client.id} value={client.id}>
                                            {client.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="report-filter-invoice-status" className="text-sm font-medium text-slate-700 mb-2 block">Invoice Status</Label>
                            <Select value={invoiceStatus || 'all'} onValueChange={(value) => onInvoiceStatusChange(value === 'all' ? null : value)}>
                                <SelectTrigger id="report-filter-invoice-status" className="w-full bg-white border-slate-200">
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    {invoiceStatuses.map(status => (
                                        <SelectItem key={status} value={status}>
                                            {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="report-filter-expense-category" className="text-sm font-medium text-slate-700 mb-2 block">Expense Category</Label>
                            <Select value={expenseCategory || 'all'} onValueChange={(value) => onExpenseCategoryChange(value === 'all' ? null : value)}>
                                <SelectTrigger id="report-filter-expense-category" className="w-full bg-white border-slate-200">
                                    <SelectValue placeholder="All Categories" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {expenseCategories.map(cat => (
                                        <SelectItem key={cat} value={cat}>
                                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="report-filter-vendor" className="text-sm font-medium text-slate-700 mb-2 block">Service Provider / Vendor</Label>
                            <Select value={selectedVendor || 'all'} onValueChange={(value) => onVendorChange(value === 'all' ? null : value)}>
                                <SelectTrigger id="report-filter-vendor" className="w-full bg-white border-slate-200">
                                    <SelectValue placeholder="All Vendors" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Vendors</SelectItem>
                                    {vendors.map(vendor => (
                                        <SelectItem key={vendor} value={vendor}>
                                            {vendor}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}