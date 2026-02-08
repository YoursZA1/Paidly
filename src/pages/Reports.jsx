import React, { useState, useEffect } from 'react';
import { Invoice } from '@/api/entities';
import { Client } from '@/api/entities';
import { Service } from '@/api/entities';
import { User } from '@/api/entities';
import { Payroll } from '@/api/entities';
import { Expense } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  DollarSign, 
  Users, 
  FileText, 
  Download,
  Calendar,
  AlertCircle,
  CheckCircle,
  BarChart2,
  Receipt,
  Mail
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { breakApi } from '@/api/apiClient';
import { formatCurrency } from '../components/CurrencySelector';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { startOfYear, endOfYear, startOfMonth, endOfMonth, format, subMonths, isWithinInterval, parseISO, isValid } from 'date-fns';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import CustomerSpendingChart from '../components/reports/CustomerSpendingChart';
import CustomerSpendingTimeline from '../components/reports/CustomerSpendingTimeline';
import AgingReport from '../components/reports/AgingReport';
import ReportFilters from '../components/reports/ReportFilters';
import ProfitLossReport from '../components/reports/ProfitLossReport';
import BalanceSheetReport from '../components/reports/BalanceSheetReport';
import ExportButtons from '../components/reports/ExportButtons';

const COLORS = ['#475569', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// Safe date parsing helper
const safeParseDate = (dateString) => {
    if (!dateString) return null;
    try {
        const parsed = parseISO(dateString);
        return isValid(parsed) ? parsed : null;
    } catch (error) {
        return null;
    }
};

export default function Reports() {
    const [invoices, setInvoices] = useState([]);
    const [clients, setClients] = useState([]);
    const [services, setServices] = useState([]);
    const [payslips, setPayslips] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [user, setUser] = useState(null);
    const [timeRange, setTimeRange] = useState('year');
    const [customDateRange, setCustomDateRange] = useState({ from: null, to: null });
    const [selectedClient, setSelectedClient] = useState(null);
    const [invoiceStatus, setInvoiceStatus] = useState(null);
    const [expenseCategory, setExpenseCategory] = useState(null);
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [analytics, setAnalytics] = useState({});
    const [showEmailDialog, setShowEmailDialog] = useState(false);
    const [recipientEmail, setRecipientEmail] = useState('');
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (invoices.length > 0 || payslips.length > 0 || expenses.length > 0) {
            generateAnalytics();
        }
    }, [invoices, clients, services, payslips, expenses, timeRange, customDateRange, selectedClient, invoiceStatus, expenseCategory, selectedVendor]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [invoicesData, clientsData, servicesData, payslipsData, expensesData, userData] = await Promise.all([
                Invoice.list('-created_date'),
                Client.list(),
                Service.list(),
                Payroll.list('-created_date'),
                Expense.list('-date'),
                User.me()
            ]);
            setInvoices(invoicesData || []);
            setClients(clientsData || []);
            setServices(servicesData || []);
            setPayslips(payslipsData || []);
            setExpenses(expensesData || []);
            setUser(userData);
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setIsLoading(false);
    };

    const getDateRange = () => {
        const now = new Date();
        if (timeRange === 'custom' && customDateRange.from && customDateRange.to) {
            return { start: customDateRange.from, end: customDateRange.to };
        }
        switch (timeRange) {
            case 'month':
                return { start: startOfMonth(now), end: endOfMonth(now) };
            case 'quarter':
                return { start: subMonths(now, 3), end: now };
            case 'year':
                return { start: startOfYear(now), end: endOfYear(now) };
            case 'all':
            default:
                return { start: new Date(2020, 0, 1), end: now };
        }
    };

    const filterInvoicesByDateRange = (invoices) => {
        const { start, end } = getDateRange();
        let filtered = invoices.filter(invoice => {
            const date = safeParseDate(invoice.created_date);
            if (!date) return false;
            return isWithinInterval(date, { start, end });
        });
        
        if (selectedClient) {
            filtered = filtered.filter(invoice => invoice.client_id === selectedClient);
        }

        if (invoiceStatus) {
            filtered = filtered.filter(invoice => invoice.status === invoiceStatus);
        }
        
        return filtered;
    };

    const filterPayslipsByDateRange = (payslips) => {
        const { start, end } = getDateRange();
        return payslips.filter(payslip => {
            const date = safeParseDate(payslip.pay_date || payslip.created_date);
            if (!date) return false;
            return isWithinInterval(date, { start, end });
        });
    };

    const generateAnalytics = () => {
        const filteredInvoices = filterInvoicesByDateRange(invoices);
        const filteredPayslips = filterPayslipsByDateRange(payslips);
        const userCurrency = user?.currency || 'ZAR';

        // Revenue Analytics
        const totalRevenue = filteredInvoices.reduce((sum, inv) => 
            (inv.status === 'paid' || inv.status === 'partial_paid') ? sum + (inv.total_amount || 0) : sum, 0
        );
        
        const outstandingAmount = filteredInvoices.reduce((sum, inv) => 
            (inv.status === 'sent' || inv.status === 'overdue') ? sum + (inv.total_amount || 0) : sum, 0
        );

        // Payroll Analytics
        const totalPayrollCost = filteredPayslips.reduce((sum, payslip) => sum + (payslip.net_pay || 0), 0);
        const avgSalary = filteredPayslips.length > 0 ? totalPayrollCost / filteredPayslips.length : 0;

        // Monthly Revenue and Payroll Trend (last 12 months)
        const monthlyData = Array(12).fill(0).map((_, i) => {
            const date = subMonths(new Date(), 11 - i);
            const monthStart = startOfMonth(date);
            const monthEnd = endOfMonth(date);
            
            const monthInvoices = invoices.filter(inv => {
                const invDate = safeParseDate(inv.created_date);
                if (!invDate) return false;
                return (inv.status === 'paid' || inv.status === 'partial_paid') &&
                       isWithinInterval(invDate, { start: monthStart, end: monthEnd });
            });

            const monthPayslips = payslips.filter(payslip => {
                const payDate = safeParseDate(payslip.pay_date || payslip.created_date);
                if (!payDate) return false;
                return payslip.status === 'paid' &&
                       isWithinInterval(payDate, { start: monthStart, end: monthEnd });
            });
            
            return {
                month: format(date, 'MMM yy'),
                revenue: monthInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0),
                payroll: monthPayslips.reduce((sum, payslip) => sum + (payslip.net_pay || 0), 0),
                invoiceCount: monthInvoices.length,
                payslipCount: monthPayslips.length
            };
        });

        // Client Analytics
        const clientRevenue = clients.map(client => {
            const clientInvoices = filteredInvoices.filter(inv => 
                inv.client_id === client.id && (inv.status === 'paid' || inv.status === 'partial_paid')
            );
            return {
                name: client.name,
                revenue: clientInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0),
                invoiceCount: clientInvoices.length
            };
        }).filter(item => item.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

        // Service Analytics
        const servicePerformance = services.map(service => {
            const serviceInvoices = filteredInvoices.flatMap(inv => inv.items || [])
                .filter(item => item.service_name === service.name);
            const total = serviceInvoices.reduce((sum, item) => sum + (item.total_price || 0), 0);
            return { name: service.name, revenue: total };
        }).filter(s => s.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

        // Invoice Status Distribution
        const statusDistribution = {
            paid: filteredInvoices.filter(inv => inv.status === 'paid').length,
            partial_paid: filteredInvoices.filter(inv => inv.status === 'partial_paid').length,
            sent: filteredInvoices.filter(inv => inv.status === 'sent').length,
            viewed: filteredInvoices.filter(inv => inv.status === 'viewed').length,
            overdue: filteredInvoices.filter(inv => inv.status === 'overdue').length,
            draft: filteredInvoices.filter(inv => inv.status === 'draft').length,
            cancelled: filteredInvoices.filter(inv => inv.status === 'cancelled').length
        };

        const statusChart = Object.entries(statusDistribution).map(([status, count]) => ({
            name: status.replace('_', ' ').toUpperCase(),
            value: count
        })).filter(item => item.value > 0);

        // Payroll Analytics
        const payrollByDepartmentRaw = {};
        filteredPayslips.forEach(payslip => {
            const dept = payslip.department || 'Unassigned';
            if (!payrollByDepartmentRaw[dept]) {
                payrollByDepartmentRaw[dept] = 0;
            }
            payrollByDepartmentRaw[dept] += payslip.net_pay || 0;
        });

        const departmentChart = Object.entries(payrollByDepartmentRaw)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 6);

        // Customer Spending Timeline
        const customerTimeline = Array(12).fill(0).map((_, i) => {
            const date = subMonths(new Date(), 11 - i);
            const monthStart = startOfMonth(date);
            const monthEnd = endOfMonth(date);
            
            const monthData = { month: format(date, 'MMM yy') };
            
            clientRevenue.slice(0, 5).forEach(client => {
                const clientMonthInvoices = invoices.filter(inv => {
                    const invDate = safeParseDate(inv.created_date);
                    if (!invDate) return false;
                    return inv.client_id === clients.find(c => c.name === client.name)?.id &&
                           (inv.status === 'paid' || inv.status === 'partial_paid') &&
                           isWithinInterval(invDate, { start: monthStart, end: monthEnd });
                });
                monthData[client.name] = clientMonthInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
            });
            
            return monthData;
        });

        // Expenses
        const totalExpenses = expenses
            .filter(exp => {
                const date = safeParseDate(exp.date);
                if (!date) return false;
                const { start, end } = getDateRange();
                const inDate = isWithinInterval(date, { start, end });
                const categoryMatch = !expenseCategory || exp.category === expenseCategory;
                const vendorMatch = !selectedVendor || exp.vendor === selectedVendor;
                return inDate && categoryMatch && vendorMatch;
            })
            .reduce((sum, exp) => sum + (exp.amount || 0), 0);

        // Tax Preparation Data
        const taxData = {
            totalIncome: totalRevenue,
            totalPayrollExpense: totalPayrollCost,
            totalExpenses: totalExpenses,
            netProfit: totalRevenue - totalPayrollCost - totalExpenses,
        };

        const totalInvoices = filteredInvoices.length;
        const paidInvoices = filteredInvoices.filter(inv => inv.status === 'paid').length;

        setAnalytics({
            totalRevenue,
            outstandingAmount,
            totalPayrollCost,
            totalExpenses,
            avgSalary,
            monthlyData,
            clientRevenue,
            customerTimeline,
            topServices: servicePerformance,
            statusChart,
            departmentChart,
            taxData,
            totalInvoices,
            totalPayslips: filteredPayslips.length,
            paidInvoices,
            userCurrency
        });
    };

    const getReportUrl = () => {
        const params = new URLSearchParams();
        params.set('range', timeRange);
        if (timeRange === 'custom' && customDateRange.from) {
            params.set('from', customDateRange.from.toISOString());
        }
        if (timeRange === 'custom' && customDateRange.to) {
            params.set('to', customDateRange.to.toISOString());
        }
        if (selectedClient) params.set('client', selectedClient);
        if (invoiceStatus) params.set('status', invoiceStatus);
        if (expenseCategory) params.set('category', expenseCategory);
        if (selectedVendor) params.set('vendor', selectedVendor);
        return `${window.location.origin}${createPageUrl('ReportPDF')}?${params.toString()}`;
    };

    const handleSendReportEmail = async () => {
        if (!recipientEmail) return;
        setIsSendingEmail(true);
        try {
            const reportUrl = getReportUrl();
            const companyName = user?.company_name || 'InvoiceBreek';
            
            await breakApi.integrations.Core.SendEmail({
                to: recipientEmail,
                subject: `Business Report - ${companyName}`,
                body: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
                        <div style="background: white; padding: 30px; border-radius: 10px; border: 1px solid #e1e5e9;">
                            <h1 style="color: #333; margin-top: 0;">Business Report</h1>
                            <p style="color: #666;">Generated on ${format(new Date(), 'PPP')}</p>
                            
                            <p>Please find the requested business report available at the link below. This report includes revenue, expenses, and other key financial metrics.</p>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${reportUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                                    View & Download Report PDF
                                </a>
                            </div>
                            
                            <p style="font-size: 12px; color: #999; text-align: center;">
                                Sent from ${companyName}
                            </p>
                        </div>
                    </div>
                `
            });
            setShowEmailDialog(false);
            setRecipientEmail('');
            alert('Report sent successfully!');
        } catch (error) {
            console.error('Error sending email:', error);
            alert('Failed to send email. Please try again.');
        }
        setIsSendingEmail(false);
    };

    const handleDownloadReport = () => {
        // Create a printable version of the report
        const printWindow = window.open('', '_blank');
        const reportHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Business Report - ${user?.company_name || 'InvoiceBreek'}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .header { text-align: center; margin-bottom: 40px; }
                    .metric { margin: 10px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
                    .metric-title { font-weight: bold; color: #333; }
                    .metric-value { font-size: 18px; color: #0066cc; }
                    @media print { body { margin: 0; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Business Report</h1>
                    <h2>${user?.company_name || 'InvoiceBreek'}</h2>
                    <p>Period: ${timeRange.charAt(0).toUpperCase() + timeRange.slice(1)} | Generated: ${format(new Date(), 'PPP')}</p>
                </div>
                
                <div class="metric">
                    <div class="metric-title">Total Revenue</div>
                    <div class="metric-value">${formatCurrency(analytics.totalRevenue || 0, analytics.userCurrency)}</div>
                </div>
                
                <div class="metric">
                    <div class="metric-title">Total Payroll Cost</div>
                    <div class="metric-value">${formatCurrency(analytics.totalPayrollCost || 0, analytics.userCurrency)}</div>
                </div>
                
                <div class="metric">
                    <div class="metric-title">Net Profit</div>
                    <div class="metric-value">${formatCurrency((analytics.totalRevenue || 0) - (analytics.totalPayrollCost || 0), analytics.userCurrency)}</div>
                </div>
                
                <div class="metric">
                    <div class="metric-title">Total Invoices</div>
                    <div class="metric-value">${analytics.totalInvoices || 0}</div>
                </div>
                
                <div class="metric">
                    <div class="metric-title">Total Payslips</div>
                    <div class="metric-value">${analytics.totalPayslips || 0}</div>
                </div>
                
                <div class="metric">
                    <div class="metric-title">Outstanding Amount</div>
                    <div class="metric-value">${formatCurrency(analytics.outstandingAmount || 0, analytics.userCurrency)}</div>
                </div>
            </body>
            </html>
        `;
        
        printWindow.document.write(reportHTML);
        printWindow.document.close();
        printWindow.print();
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="space-y-8">
                        <Skeleton className="h-16 w-full" />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {Array(4).fill(0).map((_, i) => (
                                <Skeleton key={i} className="h-32" />
                            ))}
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Skeleton className="h-96" />
                            <Skeleton className="h-96" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Business Reports</h1>
                        <p className="text-slate-600 mt-1">Advanced analytics and insights for your business.</p>
                    </div>
                    
                    <div className="flex gap-2 items-center w-full sm:w-auto">
                        <Button 
                            onClick={() => setShowEmailDialog(true)}
                            variant="outline"
                            className="w-full sm:w-auto"
                        >
                            <Mail className="w-4 h-4 mr-2" />
                            Email
                        </Button>
                        <Button 
                            onClick={handleDownloadReport} 
                            variant="outline"
                            className="w-full sm:w-auto"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                        </Button>
                        <Button 
                            onClick={() => window.location.href = getReportUrl()}
                            className="bg-slate-700 hover:bg-slate-800 text-white w-full sm:w-auto"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            Accountant Report
                        </Button>
                    </div>
                </motion.div>

                {/* Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="mb-8"
                >
                    <ReportFilters
                        timeRange={timeRange}
                        onTimeRangeChange={setTimeRange}
                        customDateRange={customDateRange}
                        onCustomDateRangeChange={setCustomDateRange}
                        selectedClient={selectedClient}
                        onClientChange={setSelectedClient}
                        clients={clients}
                        invoiceStatus={invoiceStatus}
                        onInvoiceStatusChange={setInvoiceStatus}
                        expenseCategory={expenseCategory}
                        onExpenseCategoryChange={setExpenseCategory}
                        selectedVendor={selectedVendor}
                        onVendorChange={setSelectedVendor}
                        vendors={[...new Set(expenses.map(e => e.vendor).filter(Boolean))]}
                        onReset={() => {
                            setTimeRange('year');
                            setCustomDateRange({ from: null, to: null });
                            setSelectedClient(null);
                            setInvoiceStatus(null);
                            setExpenseCategory(null);
                            setSelectedVendor(null);
                        }}
                    />
                </motion.div>

                {/* Key Metrics */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
                >
                    <StatCard
                        title="Total Revenue"
                        value={formatCurrency(analytics.totalRevenue || 0, analytics.userCurrency)}
                        icon={DollarSign}
                        bgColor="bg-emerald-100"
                    />
                    <StatCard
                        title="Outstanding"
                        value={formatCurrency(analytics.outstandingAmount || 0, analytics.userCurrency)}
                        icon={AlertCircle}
                        bgColor="bg-red-100"
                    />
                    <StatCard
                        title="Total Expenses"
                        value={formatCurrency((analytics.totalPayrollCost || 0) + (analytics.totalExpenses || 0), analytics.userCurrency)}
                        icon={Receipt}
                        bgColor="bg-blue-100"
                    />
                    <StatCard
                        title="Net Profit"
                        value={formatCurrency(analytics.taxData?.netProfit || 0, analytics.userCurrency)}
                        icon={TrendingUp}
                        bgColor="bg-purple-100"
                    />
                </motion.div>

                {/* Email Dialog */}
            <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Email Business Report</DialogTitle>
                        <DialogDescription>
                            Send a PDF copy of the current report configuration to an email address.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label>Recipient Email</Label>
                        <Input 
                            value={recipientEmail} 
                            onChange={(e) => setRecipientEmail(e.target.value)} 
                            placeholder="accountant@example.com"
                            className="mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Cancel</Button>
                        <Button onClick={handleSendReportEmail} disabled={!recipientEmail || isSendingEmail}>
                            {isSendingEmail ? 'Sending...' : 'Send Report'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Tabbed Content */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mb-8"
                >
                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 mb-6">
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="profitloss">P&L</TabsTrigger>
                            <TabsTrigger value="balance">Balance</TabsTrigger>
                            <TabsTrigger value="aging">Aging</TabsTrigger>
                            <TabsTrigger value="customers">Customers</TabsTrigger>
                            <TabsTrigger value="expenses">Expenses</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-6">
                            {/* Business Summary Cards */}
                            <Card className="bg-gradient-to-r from-slate-800 to-slate-900 border-0 shadow-xl text-white">
                                <CardHeader className="border-b border-slate-700 pb-4">
                                    <CardTitle className="text-white font-bold flex items-center gap-2">
                                        <TrendingUp className="w-5 h-5" />
                                        Business Summary
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                                            <h4 className="font-semibold text-white/80 mb-2 text-sm">Total Revenue</h4>
                                            <p className="text-3xl font-bold text-white">{formatCurrency(analytics.totalRevenue || 0, analytics.userCurrency)}</p>
                                            <p className="text-xs text-white/60 mt-2">{analytics.totalInvoices || 0} invoices</p>
                                        </div>
                                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                                            <h4 className="font-semibold text-white/80 mb-2 text-sm">Total Expenses</h4>
                                            <p className="text-3xl font-bold text-white">{formatCurrency((analytics.totalPayrollCost || 0) + (analytics.totalExpenses || 0), analytics.userCurrency)}</p>
                                            <p className="text-xs text-white/60 mt-2">Payroll + Operational</p>
                                        </div>
                                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                                            <h4 className="font-semibold text-white/80 mb-2 text-sm">Net Profit</h4>
                                            <p className="text-3xl font-bold text-emerald-300">{formatCurrency(analytics.taxData?.netProfit || 0, analytics.userCurrency)}</p>
                                            <p className="text-xs text-white/60 mt-2">{analytics.totalInvoices > 0 ? Math.round((analytics.taxData?.netProfit || 0) / analytics.totalRevenue * 100) : 0}% margin</p>
                                        </div>
                                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                                            <h4 className="font-semibold text-white/80 mb-2 text-sm">Outstanding</h4>
                                            <p className="text-3xl font-bold text-amber-300">{formatCurrency(analytics.outstandingAmount || 0, analytics.userCurrency)}</p>
                                            <p className="text-xs text-white/60 mt-2">Awaiting payment</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                                    <CardHeader className="border-b border-slate-100 pb-4">
                                        <CardTitle className="text-slate-900 font-bold">Revenue vs Expenses (12 Months)</CardTitle>
                                    </CardHeader>
                        <CardContent className="p-6">
                            {(analytics.monthlyData || []).length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={analytics.monthlyData || []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis 
                                            dataKey="month" 
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748b', fontSize: 12 }}
                                        />
                                        <YAxis 
                                            tickFormatter={(value) => formatCurrency(value, analytics.userCurrency, 0)}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: '#64748b', fontSize: 12 }}
                                        />
                                        <Tooltip 
                                            formatter={(value, name) => [formatCurrency(value, analytics.userCurrency), name === 'revenue' ? 'Revenue' : 'Payroll']}
                                            contentStyle={{
                                                backgroundColor: 'white',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '12px',
                                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                                            }}
                                        />
                                        <Legend />
                                        <Line 
                                            type="monotone" 
                                            dataKey="revenue" 
                                            stroke="#10b981" 
                                            strokeWidth={3}
                                            dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                                            name="Revenue"
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="payroll" 
                                            stroke="#ef4444" 
                                            strokeWidth={3}
                                            dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                                            name="Expenses"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-64 text-gray-500">
                                    <div className="text-center">
                                        <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>No data available</p>
                                        <p className="text-sm">Create invoices and payslips to see trends</p>
                                    </div>
                                </div>
                            )}
                                </CardContent>
                            </Card>

                            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                                <CardHeader className="border-b border-slate-100 pb-4">
                                    <CardTitle className="text-slate-900 font-bold">Invoice Status Distribution</CardTitle>
                                </CardHeader>
                        <CardContent className="p-6">
                            {(analytics.statusChart || []).length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={analytics.statusChart || []}
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={100}
                                            fill="#8884d8"
                                            dataKey="value"
                                            label={({ name, value }) => `${name}: ${value}`}
                                        >
                                            {(analytics.statusChart || []).map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{
                                            backgroundColor: 'white',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '12px',
                                            boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                                        }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-64 text-gray-500">
                                    <div className="text-center">
                                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>No invoices found</p>
                                        <p className="text-sm">Create some invoices to see status distribution</p>
                                    </div>
                                </div>
                            )}
                                </CardContent>
                            </Card>
                        </div>

                    </TabsContent>

                    <TabsContent value="profitloss" className="space-y-6">
                        <div className="flex justify-end mb-4">
                            <ExportButtons
                                reportType="profit-loss"
                                data={{
                                    revenue: analytics.totalRevenue || 0,
                                    costOfSales: 0,
                                    operatingExpenses: analytics.totalExpenses || 0,
                                    payrollExpenses: analytics.totalPayrollCost || 0,
                                    otherExpenses: 0
                                }}
                                fileName="profit-loss-statement"
                                currency={analytics.userCurrency}
                            />
                        </div>
                        <ProfitLossReport
                            data={{
                                revenue: analytics.totalRevenue || 0,
                                costOfSales: 0,
                                operatingExpenses: analytics.totalExpenses || 0,
                                payrollExpenses: analytics.totalPayrollCost || 0,
                                otherExpenses: 0
                            }}
                            currency={analytics.userCurrency}
                            dateRange={timeRange === 'custom' && customDateRange.from && customDateRange.to
                                ? `${format(customDateRange.from, 'MMM d, yyyy')} - ${format(customDateRange.to, 'MMM d, yyyy')}`
                                : `${timeRange.charAt(0).toUpperCase() + timeRange.slice(1)} to Date`}
                        />
                    </TabsContent>

                    <TabsContent value="balance" className="space-y-6">
                        <div className="flex justify-end mb-4">
                            <ExportButtons
                                reportType="balance-sheet"
                                data={{
                                    cashOnHand: (analytics.totalRevenue || 0) - (analytics.totalPayrollCost || 0) - (analytics.totalExpenses || 0),
                                    accountsReceivable: analytics.outstandingAmount || 0,
                                    otherAssets: 0,
                                    accountsPayable: 0,
                                    otherLiabilities: 0,
                                    equity: (analytics.totalRevenue || 0) - (analytics.totalPayrollCost || 0) - (analytics.totalExpenses || 0) + (analytics.outstandingAmount || 0)
                                }}
                                fileName="balance-sheet"
                                currency={analytics.userCurrency}
                            />
                        </div>
                        <BalanceSheetReport
                            data={{
                                cashOnHand: (analytics.totalRevenue || 0) - (analytics.totalPayrollCost || 0) - (analytics.totalExpenses || 0),
                                accountsReceivable: analytics.outstandingAmount || 0,
                                otherAssets: 0,
                                accountsPayable: 0,
                                otherLiabilities: 0,
                                equity: (analytics.totalRevenue || 0) - (analytics.totalPayrollCost || 0) - (analytics.totalExpenses || 0) + (analytics.outstandingAmount || 0)
                            }}
                            currency={analytics.userCurrency}
                            dateRange={format(new Date(), 'MMMM d, yyyy')}
                        />
                    </TabsContent>

                    <TabsContent value="aging" className="space-y-6">
                        <div className="flex justify-end mb-4">
                            <ExportButtons
                                reportType="aging"
                                data={[]}
                                fileName="aging-report"
                                currency={analytics.userCurrency}
                            />
                        </div>
                        <AgingReport invoices={invoices} clients={clients} currency={analytics.userCurrency} />
                    </TabsContent>

                    <TabsContent value="customers" className="space-y-6">
                        <CustomerSpendingChart data={analytics.clientRevenue} currency={analytics.userCurrency} />
                        <CustomerSpendingTimeline data={analytics.customerTimeline} currency={analytics.userCurrency} />
                    </TabsContent>

                    <TabsContent value="expenses" className="space-y-6">
                        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                            <CardHeader className="border-b border-slate-100 pb-4">
                                <CardTitle className="text-slate-900 font-bold">Expense Breakdown</CardTitle>
                            </CardHeader>
                            <CardContent className="p-8">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                    <div className="bg-red-50 rounded-2xl p-6 text-center">
                                        <h4 className="font-bold text-slate-900 mb-2">Operating Expenses</h4>
                                        <p className="text-3xl font-bold text-red-600">
                                            {formatCurrency(analytics.totalExpenses || 0, analytics.userCurrency)}
                                        </p>
                                    </div>
                                    <div className="bg-blue-50 rounded-2xl p-6 text-center">
                                        <h4 className="font-bold text-slate-900 mb-2">Payroll Costs</h4>
                                        <p className="text-3xl font-bold text-blue-600">
                                            {formatCurrency(analytics.totalPayrollCost || 0, analytics.userCurrency)}
                                        </p>
                                    </div>
                                    <div className="bg-purple-50 rounded-2xl p-6 text-center">
                                        <h4 className="font-bold text-slate-900 mb-2">Total Expenses</h4>
                                        <p className="text-3xl font-bold text-purple-600">
                                            {formatCurrency((analytics.totalExpenses || 0) + (analytics.totalPayrollCost || 0), analytics.userCurrency)}
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="text-center text-slate-600">
                                    <p className="mb-2">For detailed expense tracking and analysis</p>
                                    <Button 
                                        onClick={() => window.location.href = createPageUrl('CashFlow')}
                                        variant="outline"
                                    >
                                        View Cash Flow Report
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </motion.div>
            </div>
        </div>
    );
}

const StatCard = ({ title, value, icon: Icon, bgColor = "bg-slate-100" }) => (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
        <CardContent className="p-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-slate-600 mb-2">{title}</p>
                    <p className="text-2xl font-bold text-slate-900">{value}</p>
                </div>
                <div className={`h-16 w-16 ${bgColor} rounded-xl flex items-center justify-center shadow-lg`}>
                    <Icon className="h-8 w-8 text-slate-700" />
                </div>
            </div>
        </CardContent>
    </Card>
);