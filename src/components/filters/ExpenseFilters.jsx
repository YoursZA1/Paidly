import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X, CalendarIcon, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const STORAGE_KEY = 'expense_filters';

const categoryOptions = [
    { value: 'all', label: 'All Categories' },
    { value: 'office', label: 'Office' },
    { value: 'travel', label: 'Travel' },
    { value: 'utilities', label: 'Utilities' },
    { value: 'supplies', label: 'Supplies' },
    { value: 'salary', label: 'Salary' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'software', label: 'Software' },
    { value: 'other', label: 'Other' }
];

const amountRanges = [
    { value: 'all', label: 'Any Amount' },
    { value: '0-100', label: 'Under 100' },
    { value: '100-500', label: '100 - 500' },
    { value: '500-1000', label: '500 - 1,000' },
    { value: '1000-5000', label: '1,000 - 5,000' },
    { value: '5000+', label: 'Over 5,000' }
];

const paymentMethods = [
    { value: 'all', label: 'All Methods' },
    { value: 'cash', label: 'Cash' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'credit_card', label: 'Credit Card' },
    { value: 'debit_card', label: 'Debit Card' }
];

export default function ExpenseFilters({ onFilterChange }) {
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : {
            search: '',
            category: 'all',
            amountRange: 'all',
            paymentMethod: 'all',
            dateFrom: null,
            dateTo: null,
            claimable: 'all'
        };
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        onFilterChange(filters);
    }, [filters]);

    const updateFilter = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        const cleared = {
            search: '',
            category: 'all',
            amountRange: 'all',
            paymentMethod: 'all',
            dateFrom: null,
            dateTo: null,
            claimable: 'all'
        };
        setFilters(cleared);
    };

    const activeFilterCount = [
        filters.category !== 'all',
        filters.amountRange !== 'all',
        filters.paymentMethod !== 'all',
        filters.dateFrom,
        filters.dateTo,
        filters.claimable !== 'all'
    ].filter(Boolean).length;

    return (
        <div className="space-y-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        value={filters.search}
                        onChange={(e) => updateFilter('search', e.target.value)}
                        placeholder="Search expenses..."
                        className="pl-10 h-10 rounded-xl"
                    />
                </div>

                {/* Filter Toggle Button */}
                <Button
                    variant="outline"
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2 h-10"
                >
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFilterCount > 0 && (
                        <Badge className="bg-emerald-600 text-white ml-1">{activeFilterCount}</Badge>
                    )}
                    <ChevronDown className={cn("w-4 h-4 transition-transform", showFilters && "rotate-180")} />
                </Button>

                {activeFilterCount > 0 && (
                    <Button variant="ghost" onClick={clearFilters} className="gap-2 h-10 text-slate-600">
                        <X className="w-4 h-4" />
                        Clear
                    </Button>
                )}
            </div>

            {/* Filter Options */}
            {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-slate-50 rounded-xl border">
                    {/* Category Filter */}
                    <div className="space-y-1">
                        <Label htmlFor="expense-filter-category" className="text-xs font-medium text-slate-600">Category</Label>
                        <Select value={filters.category} onValueChange={(v) => updateFilter('category', v)}>
                            <SelectTrigger id="expense-filter-category" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {categoryOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Amount Range Filter */}
                    <div className="space-y-1">
                        <Label htmlFor="expense-filter-amount" className="text-xs font-medium text-slate-600">Amount Range</Label>
                        <Select value={filters.amountRange} onValueChange={(v) => updateFilter('amountRange', v)}>
                            <SelectTrigger id="expense-filter-amount" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {amountRanges.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Payment Method Filter */}
                    <div className="space-y-1">
                        <Label htmlFor="expense-filter-payment" className="text-xs font-medium text-slate-600">Payment Method</Label>
                        <Select value={filters.paymentMethod} onValueChange={(v) => updateFilter('paymentMethod', v)}>
                            <SelectTrigger id="expense-filter-payment" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {paymentMethods.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Range */}
                    <fieldset className="space-y-1 lg:col-span-2 border-0 p-0 m-0 min-w-0">
                        <legend className="text-xs font-medium text-slate-600">Date Range</legend>
                        <div className="flex gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button type="button" variant="outline" size="sm" className="h-9 flex-1 justify-start text-left font-normal" aria-label="Filter from date">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {filters.dateFrom ? format(new Date(filters.dateFrom), 'MMM d') : 'From'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                                        onSelect={(date) => updateFilter('dateFrom', date?.toISOString())}
                                    />
                                </PopoverContent>
                            </Popover>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button type="button" variant="outline" size="sm" className="h-9 flex-1 justify-start text-left font-normal" aria-label="Filter to date">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {filters.dateTo ? format(new Date(filters.dateTo), 'MMM d') : 'To'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                                        onSelect={(date) => updateFilter('dateTo', date?.toISOString())}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </fieldset>
                </div>
            )}
        </div>
    );
}

export function applyExpenseFilters(expenses, filters) {
    return expenses.filter(expense => {
        // Search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const matchesSearch = 
                expense.description?.toLowerCase().includes(searchLower) ||
                expense.vendor?.toLowerCase().includes(searchLower) ||
                expense.category?.toLowerCase().includes(searchLower);
            if (!matchesSearch) return false;
        }

        // Category filter
        if (filters.category !== 'all' && expense.category !== filters.category) {
            return false;
        }

        // Payment method filter
        if (filters.paymentMethod !== 'all' && expense.payment_method !== filters.paymentMethod) {
            return false;
        }

        // Amount range filter
        if (filters.amountRange !== 'all') {
            const amount = expense.amount || 0;
            if (filters.amountRange.includes('+')) {
                const min = parseInt(filters.amountRange);
                if (amount < min) return false;
            } else {
                const [min, max] = filters.amountRange.split('-').map(v => parseInt(v));
                if (amount < min || amount > max) return false;
            }
        }

        // Date range filter
        if (filters.dateFrom) {
            const expenseDate = new Date(expense.date);
            if (expenseDate < new Date(filters.dateFrom)) return false;
        }
        if (filters.dateTo) {
            const expenseDate = new Date(expense.date);
            if (expenseDate > new Date(filters.dateTo)) return false;
        }

        return true;
    });
}