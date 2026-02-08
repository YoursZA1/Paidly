import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';

export default function ExportButtons({ 
    reportType = 'general',
    data, 
    fileName = 'report',
    onPDFExport,
    currency = 'ZAR'
}) {
    const [isExporting, setIsExporting] = useState(false);

    const exportToCSV = () => {
        setIsExporting(true);
        try {
            let csvContent = '';
            
            switch(reportType) {
                case 'profit-loss':
                    csvContent = generateProfitLossCSV(data, currency);
                    break;
                case 'balance-sheet':
                    csvContent = generateBalanceSheetCSV(data, currency);
                    break;
                case 'aging':
                    csvContent = generateAgingReportCSV(data, currency);
                    break;
                default:
                    csvContent = generateGeneralCSV(data);
            }
            
            downloadCSV(csvContent, `${fileName}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        } catch (error) {
            console.error('Error exporting to CSV:', error);
            alert('Failed to export CSV. Please try again.');
        }
        setIsExporting(false);
    };

    const downloadCSV = (content, filename) => {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const generateProfitLossCSV = (data, currency) => {
        const { revenue, costOfSales, operatingExpenses, payrollExpenses, otherExpenses } = data;
        const grossProfit = revenue - costOfSales;
        const totalExpenses = operatingExpenses + payrollExpenses + otherExpenses;
        const netProfit = grossProfit - totalExpenses;

        return `Profit & Loss Statement
Generated: ${format(new Date(), 'PPP')}

Category,Amount (${currency})
Revenue,${revenue}
Cost of Sales,-${costOfSales}
Gross Profit,${grossProfit}

Operating Expenses:
Operating Expenses,-${operatingExpenses}
Payroll Expenses,-${payrollExpenses}
Other Expenses,-${otherExpenses}
Total Operating Expenses,-${totalExpenses}

Net Profit,${netProfit}
`;
    };

    const generateBalanceSheetCSV = (data, currency) => {
        const { cashOnHand, accountsReceivable, otherAssets, accountsPayable, otherLiabilities, equity } = data;
        const totalAssets = cashOnHand + accountsReceivable + otherAssets;
        const totalLiabilities = accountsPayable + otherLiabilities;

        return `Balance Sheet
Generated: ${format(new Date(), 'PPP')}

Assets,Amount (${currency})
Cash on Hand,${cashOnHand}
Accounts Receivable,${accountsReceivable}
Other Assets,${otherAssets}
Total Assets,${totalAssets}

Liabilities & Equity,Amount (${currency})
Accounts Payable,${accountsPayable}
Other Liabilities,${otherLiabilities}
Total Liabilities,${totalLiabilities}
Owner's Equity,${equity}
Total Liabilities & Equity,${totalLiabilities + equity}
`;
    };

    const generateAgingReportCSV = (data, currency) => {
        let csv = `Accounts Receivable Aging Report
Generated: ${format(new Date(), 'PPP')}

Client,Invoice #,Amount (${currency}),Days Overdue,Status
`;
        
        data.forEach(item => {
            csv += `${item.clientName},${item.invoiceNumber},${item.amount},${item.daysOverdue},${item.status}\n`;
        });
        
        return csv;
    };

    const generateGeneralCSV = (data) => {
        if (!data || !Array.isArray(data) || data.length === 0) {
            return 'No data available\n';
        }

        const headers = Object.keys(data[0]);
        let csv = headers.join(',') + '\n';
        
        data.forEach(row => {
            csv += headers.map(header => row[header]).join(',') + '\n';
        });
        
        return csv;
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button 
                    variant="outline" 
                    disabled={isExporting}
                    className="gap-2"
                >
                    {isExporting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4" />
                    )}
                    Export
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToCSV}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as CSV
                </DropdownMenuItem>
                {onPDFExport && (
                    <DropdownMenuItem onClick={onPDFExport}>
                        <FileText className="w-4 h-4 mr-2" />
                        Export as PDF
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}