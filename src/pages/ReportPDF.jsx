import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Invoice, Expense, Payroll, Payment, User, Client } from '@/api/entities';
import { formatCurrency } from '../components/CurrencySelector';
import { format, parseISO, isValid } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Printer, FileSpreadsheet } from 'lucide-react';
import { DocumentPageSkeleton } from '../components/shared/PageSkeleton';
import {
    collectExpenseEvents,
    collectIncomeEvents,
    expenseOccurredAt,
    getReportPeriodBounds,
    inDayRange,
    isCashExpense,
    listAllCashFlowRecords,
    moneyAmount,
    toDayKey,
} from '@/utils/cashFlowTruth';
import { listAllPosSalesEvents } from '@/utils/cashFlowData';

function eventDate(value) {
    const key = toDayKey(value);
    if (!key) return null;
    const parsed = parseISO(`${key}T00:00:00`);
    return isValid(parsed) ? parsed : null;
}

function isCashPayroll(pay) {
    const amount = moneyAmount(pay?.net_pay ?? pay?.amount);
    if (amount <= 0) return false;
    const status = String(pay?.status || '').trim().toLowerCase();
    if (['draft', 'cancelled', 'canceled', 'void'].includes(status)) return false;
    return true;
}

export default function ReportPDF() {
    const location = useLocation();
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({
        totalIncome: 0,
        totalExpenses: 0,
        netIncome: 0,
        openingBalance: 0,
        closingBalance: 0
    });
    const [user, setUser] = useState(null);
    const [dateRangeDisplay, setDateRangeDisplay] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadReportData();
    }, [location.search]);

    const loadReportData = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams(location.search);
            const range = params.get('range') || 'month';
            const fromParam = params.get('from');
            const toParam = params.get('to');
            const clientId = params.get('client');
            const statusParam = params.get('status');
            const categoryParam = params.get('category');
            const vendorParam = params.get('vendor');

            const payrollResult = await Promise.allSettled([
                listAllCashFlowRecords(Invoice, '-created_date'),
                listAllCashFlowRecords(Expense, '-date'),
                listAllCashFlowRecords(Payment, '-paid_at'),
                User.me(),
                listAllCashFlowRecords(Client, '-created_date'),
                listAllCashFlowRecords(Payroll, '-pay_date'),
                listAllPosSalesEvents(),
            ]);

            const invoices = payrollResult[0].status === 'fulfilled' ? payrollResult[0].value || [] : [];
            const expenses = payrollResult[1].status === 'fulfilled' ? payrollResult[1].value || [] : [];
            const payments = payrollResult[2].status === 'fulfilled' ? payrollResult[2].value || [] : [];
            const userData = payrollResult[3].status === 'fulfilled' ? payrollResult[3].value : null;
            const clients = payrollResult[4].status === 'fulfilled' ? payrollResult[4].value || [] : [];
            const payrolls = payrollResult[5].status === 'fulfilled' ? payrollResult[5].value || [] : [];
            const posSales = payrollResult[6].status === 'fulfilled' ? payrollResult[6].value || [] : [];

            if (payrollResult[0].status === 'rejected' || payrollResult[1].status === 'rejected') {
                throw payrollResult[0].reason || payrollResult[1].reason;
            }

            setUser(userData);

            const { start, end } = getReportPeriodBounds(range, new Date(), fromParam, toParam);
            setDateRangeDisplay(`${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`);

            const clientNameById = new Map((clients || []).map((c) => [c.id, c.name]));
            const invoiceById = new Map((invoices || []).map((inv) => [inv.id, inv]));

            const allTxns = [];

            const incomeEvents = collectIncomeEvents(payments, invoices, posSales);
            for (const event of incomeEvents) {
                const invoice = event.invoiceId ? invoiceById.get(event.invoiceId) : null;
                if (clientId && invoice && invoice.client_id !== clientId) continue;
                if (clientId && !invoice) continue;
                if (statusParam && invoice && invoice.status !== statusParam) continue;
                if (!inDayRange(event.date, start, end)) continue;
                const date = eventDate(event.date);
                if (!date) continue;
                const amount = moneyAmount(event.amount);
                const isPos = event.channel === 'pos';
                const clientName = invoice
                    ? (clientNameById.get(invoice.client_id) || invoice.client_name || 'Unknown Client')
                    : event.name;
                allTxns.push({
                    date,
                    type: isPos ? (amount < 0 ? 'POS REFUND' : 'POS') : (String(event.id).startsWith('pay-') ? 'PAYMENT' : 'INVOICE'),
                    reference: invoice?.invoice_number || event.name || '-',
                    description: isPos
                      ? event.name
                      : `Payment from ${clientName}`,
                    credit: amount > 0 ? amount : 0,
                    debit: amount < 0 ? -amount : 0,
                    status: invoice?.status || 'paid',
                });
            }

            const isPaidStatusFilter = !statusParam || statusParam === 'paid' || statusParam === 'partial_paid';
            if (statusParam && !isPaidStatusFilter) {
                for (const inv of invoices) {
                    if (clientId && inv.client_id !== clientId) continue;
                    if (inv.status !== statusParam) continue;
                    const occurred = inv.created_date || inv.invoice_date || inv.created_at;
                    if (!inDayRange(occurred, start, end)) continue;
                    const date = eventDate(occurred);
                    if (!date) continue;
                    const clientName = clientNameById.get(inv.client_id) || inv.client_name || 'Unknown Client';
                    allTxns.push({
                        date,
                        type: 'INVOICE',
                        reference: inv.invoice_number,
                        description: `Invoice to ${clientName} (${inv.status})`,
                        credit: 0,
                        debit: 0,
                        status: inv.status,
                        memo: `Amount: ${inv.total_amount}`,
                    });
                }
            }

            for (const exp of expenses) {
                if (!isCashExpense(exp)) continue;
                if (categoryParam && exp.category !== categoryParam) continue;
                if (vendorParam && exp.vendor !== vendorParam) continue;
                const occurred = expenseOccurredAt(exp);
                if (!inDayRange(occurred, start, end)) continue;
                const date = eventDate(occurred);
                if (!date) continue;
                allTxns.push({
                    date,
                    type: 'EXPENSE',
                    reference: exp.expense_number || '-',
                    description: `${exp.vendor ? exp.vendor + ' - ' : ''}${exp.category || exp.description || 'Expense'}`,
                    credit: 0,
                    debit: moneyAmount(exp.amount),
                    status: 'paid',
                });
            }

            for (const pay of payrolls) {
                if (!isCashPayroll(pay)) continue;
                const occurred = pay.pay_date || pay.created_date || pay.created_at;
                if (!inDayRange(occurred, start, end)) continue;
                const date = eventDate(occurred);
                if (!date) continue;
                allTxns.push({
                    date,
                    type: 'PAYROLL',
                    reference: pay.payslip_number || '-',
                    description: `Salary - ${pay.employee_name || 'Employee'}`,
                    credit: 0,
                    debit: moneyAmount(pay.net_pay ?? pay.amount),
                    status: pay.status,
                });
            }

            allTxns.sort((a, b) => a.date - b.date);

            const openingTotals = range === 'all'
                ? { profit: 0 }
                : {
                    profit: collectIncomeEvents(payments, invoices, posSales)
                        .concat(collectExpenseEvents(expenses).map((row) => ({ ...row, amount: -moneyAmount(row.amount) })))
                        .filter((row) => {
                            const key = toDayKey(row.date);
                            const startKey = toDayKey(start);
                            return key && startKey && key < startKey;
                        })
                        .reduce((sum, row) => sum + moneyAmount(row.amount), 0),
                };
            // Payroll before the period also affects opening cash.
            const openingPayroll = payrolls
                .filter(isCashPayroll)
                .filter((pay) => {
                    const key = toDayKey(pay.pay_date || pay.created_date || pay.created_at);
                    const startKey = toDayKey(start);
                    return key && startKey && key < startKey;
                })
                .reduce((sum, pay) => sum + moneyAmount(pay.net_pay ?? pay.amount), 0);
            const openingBalance = range === 'all' ? 0 : openingTotals.profit - openingPayroll;

            let runningBalance = openingBalance;
            const processedTxns = allTxns.map((txn) => {
                runningBalance += (txn.credit - txn.debit);
                return { ...txn, balance: runningBalance };
            });

            setTransactions(processedTxns);

            const totalIncome = processedTxns.reduce((sum, t) => sum + t.credit, 0);
            const totalExpenses = processedTxns.reduce((sum, t) => sum + t.debit, 0);

            setSummary({
                totalIncome,
                totalExpenses,
                netIncome: totalIncome - totalExpenses,
                openingBalance,
                closingBalance: runningBalance
            });

        } catch (error) {
            console.error("Failed to load report data", error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <DocumentPageSkeleton title="Loading report…" />;

    const currency = user?.currency || 'ZAR';

    const exportToCSV = () => {
        const headers = ['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'];
        const rows = transactions.map(t => [
            format(t.date, 'yyyy-MM-dd'),
            t.type,
            t.reference,
            `"${t.description.replace(/"/g, '""')}"`, // Escape quotes
            t.debit.toFixed(2),
            t.credit.toFixed(2),
            t.balance.toFixed(2)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `Accountant_Report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="min-h-screen bg-white text-slate-900 font-mono text-sm p-8 print:p-0">
            {/* Print Controls */}
            <div className="no-print fixed top-4 right-4 flex gap-2">
                <Button onClick={exportToCSV} variant="outline" className="shadow-lg">
                    <FileSpreadsheet className="w-4 h-4 mr-2" /> Export CSV
                </Button>
                <Button onClick={() => window.print()} variant="outline" className="shadow-lg">
                    <Printer className="w-4 h-4 mr-2" /> Print
                </Button>
            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { -webkit-print-color-adjust: exact; }
                    @page { margin: 1cm; size: A4; }
                }
            `}</style>

            {/* Header */}
            <header className="mb-8 border-b-2 border-slate-800 pb-4">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-2xl font-bold uppercase tracking-wider mb-1">{user?.company_name || 'Business Name'}</h1>
                        <div className="text-xs text-slate-600 space-y-0.5">
                            <p>{user?.company_address}</p>
                            <p>Generated: {format(new Date(), 'yyyy-MM-dd HH:mm')}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <h2 className="text-xl font-bold text-slate-800">Statement of Accounts</h2>
                        <p className="text-slate-600 font-medium">{dateRangeDisplay}</p>
                    </div>
                </div>
            </header>

            {/* Summary Section */}
            <div className="grid grid-cols-4 gap-4 mb-8 bg-slate-50 p-4 border border-slate-200 rounded-sm">
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Opening Balance</p>
                    <p className="font-bold text-lg text-slate-700">{formatCurrency(summary.openingBalance, currency)}</p>
                </div>
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Total Money In</p>
                    <p className="font-bold text-lg text-green-700">+{formatCurrency(summary.totalIncome, currency)}</p>
                </div>
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Total Money Out</p>
                    <p className="font-bold text-lg text-red-700">-{formatCurrency(summary.totalExpenses, currency)}</p>
                </div>
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Closing Balance</p>
                    <p className="font-bold text-lg text-slate-900 border-t-2 border-slate-300 inline-block mt-1">
                        {formatCurrency(summary.closingBalance, currency)}
                    </p>
                </div>
            </div>

            {/* Transactions Table */}
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b-2 border-slate-800 text-xs uppercase text-slate-600">
                        <th className="py-2 w-24">Date</th>
                        <th className="py-2 w-24">Ref</th>
                        <th className="py-2">Description</th>
                        <th className="py-2 w-20">Type</th>
                        <th className="py-2 w-28 text-right">Debit</th>
                        <th className="py-2 w-28 text-right">Credit</th>
                        <th className="py-2 w-28 text-right">Balance</th>
                    </tr>
                </thead>
                <tbody className="text-sm">
                    {transactions.length === 0 ? (
                        <tr>
                            <td colSpan="7" className="py-8 text-center text-slate-500 italic">No transactions found for this period.</td>
                        </tr>
                    ) : (
                        transactions.map((txn, index) => (
                            <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-2 text-slate-600">{format(txn.date, 'yyyy-MM-dd')}</td>
                                <td className="py-2 text-slate-600 font-mono text-xs">{txn.reference}</td>
                                <td className="py-2 font-medium text-slate-800">{txn.description}</td>
                                <td className="py-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase ${
                                        txn.type === 'INVOICE' ? 'bg-green-50 border-green-200 text-green-700' :
                                        txn.type === 'EXPENSE' ? 'bg-red-50 border-red-200 text-red-700' :
                                        'bg-primary/10 border-primary/20 text-primary'
                                    }`}>
                                        {txn.type}
                                    </span>
                                </td>
                                <td className="py-2 text-right text-slate-600">
                                    {txn.debit > 0 ? formatCurrency(txn.debit, currency) : '-'}
                                </td>
                                <td className="py-2 text-right text-slate-600">
                                    {txn.credit > 0 ? formatCurrency(txn.credit, currency) : '-'}
                                </td>
                                <td className="py-2 text-right font-bold text-slate-800 bg-slate-50/50">
                                    {formatCurrency(txn.balance, currency)}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
                <tfoot>
                    <tr className="border-t-2 border-slate-800 font-bold bg-slate-50">
                        <td colSpan="4" className="py-3 text-right pr-4 uppercase text-xs">Period Totals</td>
                        <td className="py-3 text-right text-red-700">{formatCurrency(summary.totalExpenses, currency)}</td>
                        <td className="py-3 text-right text-green-700">{formatCurrency(summary.totalIncome, currency)}</td>
                        <td className="py-3 text-right">{formatCurrency(summary.closingBalance, currency)}</td>
                    </tr>
                </tfoot>
            </table>

            <div className="mt-12 pt-8 border-t border-slate-200 flex justify-between text-xs text-slate-500">
                <div>
                    <p>Certified by:</p>
                    <div className="h-8 border-b border-slate-300 w-48 mt-4"></div>
                </div>
                <div className="text-right">
                    <p>{user?.company_name}</p>
                    <p>Generated via Paidly</p>
                </div>
            </div>
        </div>
    );
}