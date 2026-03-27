import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Invoice, Expense, Payroll, User, Client } from '@/api/entities';
import { formatCurrency } from '../components/CurrencySelector';
import { format, parseISO, isValid, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, isWithinInterval } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Printer, Download, FileSpreadsheet } from 'lucide-react';
import { DocumentPageSkeleton } from '../components/shared/PageSkeleton';

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

            const [invoices, expenses, payrolls, userData, clients] = await Promise.all([
                Invoice.list(),
                Expense.list(),
                Payroll.list(),
                User.me(),
                Client.list()
            ]);

            setUser(userData);

            // Determine date range
            let start, end;
            const now = new Date();

            if (range === 'custom' && fromParam && toParam) {
                start = parseISO(fromParam);
                end = parseISO(toParam);
            } else {
                switch (range) {
                    case 'month':
                        start = startOfMonth(now);
                        end = endOfMonth(now);
                        break;
                    case 'quarter':
                        start = subMonths(now, 3);
                        end = now;
                        break;
                    case 'year':
                        start = startOfYear(now);
                        end = endOfYear(now);
                        break;
                    default: // all
                        start = new Date(2000, 0, 1);
                        end = now;
                }
            }

            setDateRangeDisplay(`${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`);

            // Process Transactions
            let allTxns = [];

            // 1. Invoices (Income - Cash Basis via Payments)
            // Note: If filtering by status (e.g. Draft, Sent), they won't appear here if we strictly show CASH basis (payments).
            // However, the user asked to filter by invoice status. 
            // If the user selects "Draft", they probably want to see Draft invoices even if not paid (Accrual view).
            // The previous logic was hybrid. 
            // Let's adapt: If status filter is applied, we list matching invoices regardless of payment status (Accrual style), 
            // OR we strictly follow the "Cash Basis" request but filter the source invoices.
            // Given "Accountant Report" usually implies a Statement of Transactions, showing unpaid invoices (Draft/Sent) 
            // as "Income" is incorrect for Cash Basis but correct for Accrual.
            // Let's assume Accrual if status is filtered to non-paid statuses, or just list them with 0 credit?
            // Let's stick to the previous hybrid approach: 
            // - If we have payments, list them (Cash). 
            // - If fallback, list invoice if Paid/Partial.
            // BUT now we must respect `statusParam`.
            // If `statusParam` is present, we should filter the invoices by it.
            
            invoices.forEach(inv => {
                if (clientId && inv.client_id !== clientId) return;
                if (statusParam && inv.status !== statusParam) return;

                const clientName = clients.find(c => c.id === inv.client_id)?.name || 'Unknown Client';

                // If filtering by non-paid status (e.g. Draft, Sent, Overdue), we should list them to respect the filter
                // even if they don't represent cash flow yet, so the accountant can see them.
                // However, they shouldn't affect the "Balance" if they are not paid. 
                // Let's list them with 0 Credit/Debit if unpaid, or just list the potential amount?
                // Let's list the full amount but maybe mark status clearly. 
                // Actually, for "Statement of Accounts", usually only effective transactions appear.
                // But the user asked for granular filtering for the report.
                
                // Strategy:
                // 1. If looking for Paid/Partial Paid (or no filter), show Payments (Cash flow).
                // 2. If looking for specific status (e.g. Overdue), show the Invoice itself (Accrual view for that status).
                
                const isPaidStatus = inv.status === 'paid' || inv.status === 'partial_paid';

                // If specific status filter is active and it's NOT a paid status, show the invoice entity
                if (statusParam && !isPaidStatus) {
                    const date = parseISO(inv.created_date);
                    if (isWithinInterval(date, { start, end })) {
                        allTxns.push({
                            date: date,
                            type: 'INVOICE',
                            reference: inv.invoice_number,
                            description: `Invoice to ${clientName} (${inv.status})`,
                            credit: 0, // No cash received yet
                            debit: 0,
                            status: inv.status,
                            memo: `Amount: ${inv.total_amount}` // Helper info
                        });
                    }
                    return;
                }

                // Standard processing (Cash flow for paid/partial, or fallback)
                if (inv.payments && Array.isArray(inv.payments) && inv.payments.length > 0) {
                    inv.payments.forEach((payment, idx) => {
                        const paymentDate = payment.date ? parseISO(payment.date) : parseISO(inv.created_date);
                        
                        if (isValid(paymentDate) && isWithinInterval(paymentDate, { start, end })) {
                            allTxns.push({
                                date: paymentDate,
                                type: 'PAYMENT',
                                reference: `${inv.invoice_number}-${idx + 1}`,
                                description: `Payment from ${clientName} (${payment.method || 'Unknown'})`,
                                credit: Number(payment.amount) || 0,
                                debit: 0,
                                status: 'paid'
                            });
                        }
                    });
                } 
                else if (isPaidStatus) {
                    const date = parseISO(inv.created_date);
                    if (isWithinInterval(date, { start, end })) {
                        allTxns.push({
                            date: date,
                            type: 'INVOICE',
                            reference: inv.invoice_number,
                            description: `Payment from ${clientName}`,
                            credit: Number(inv.total_amount) || 0,
                            debit: 0,
                            status: inv.status
                        });
                    }
                }
            });

            // 2. Expenses (Debit)
            expenses.forEach(exp => {
                const date = parseISO(exp.date);
                if (isWithinInterval(date, { start, end })) {
                    if (categoryParam && exp.category !== categoryParam) return;
                    if (vendorParam && exp.vendor !== vendorParam) return;

                    allTxns.push({
                        date: date,
                        type: 'EXPENSE',
                        reference: exp.expense_number || '-',
                        description: `${exp.vendor ? exp.vendor + ' - ' : ''}${exp.category}`,
                        credit: 0,
                        debit: exp.amount,
                        status: 'paid'
                    });
                }
            });

            // 3. Payroll (Debit)
            payrolls.forEach(pay => {
                const date = parseISO(pay.pay_date || pay.created_date);
                if (isWithinInterval(date, { start, end })) {
                    allTxns.push({
                        date: date,
                        type: 'PAYROLL',
                        reference: pay.payslip_number,
                        description: `Salary - ${pay.employee_name}`,
                        credit: 0,
                        debit: pay.net_pay,
                        status: pay.status
                    });
                }
            });

            // Sort by date
            allTxns.sort((a, b) => a.date - b.date);

            // Calculate Running Balance
            let runningBalance = 0;
            const processedTxns = allTxns.map(txn => {
                runningBalance += (txn.credit - txn.debit);
                return { ...txn, balance: runningBalance };
            });

            setTransactions(processedTxns);
            
            // Calculate Summary
            const totalIncome = processedTxns.reduce((sum, t) => sum + t.credit, 0);
            const totalExpenses = processedTxns.reduce((sum, t) => sum + t.debit, 0);
            
            setSummary({
                totalIncome,
                totalExpenses,
                netIncome: totalIncome - totalExpenses,
                openingBalance: 0, // Simplified
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