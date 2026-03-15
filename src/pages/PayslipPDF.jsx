import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Payroll, User } from '@/api/entities';
import { formatCurrency } from '../components/CurrencySelector';
import { format, isValid, parseISO } from 'date-fns';
import DocumentLayout from '../components/shared/DocumentLayout';

export default function PayslipPDF() {
    const location = useLocation();
    const urlParams = new URLSearchParams(location.search);
    const payslipId = urlParams.get('id');
    const autoDownload = urlParams.get('download') === 'true';
    const [payslip, setPayslip] = useState(null);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (payslipId) {
            loadPayslipData();
        }
    }, [payslipId]);

    useEffect(() => {
        if (autoDownload && !isLoading && payslip) {
            const timer = setTimeout(() => {
                window.print();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [autoDownload, isLoading, payslip]);

    const loadPayslipData = async () => {
        try {
            const [payslipData, userData] = await Promise.all([
                Payroll.get(payslipId),
                User.me()
            ]);
            setPayslip(payslipData);
            setUser(userData);
        } catch (error) {
            console.error('Error loading payslip data:', error);
        }
        setIsLoading(false);
    };
    
    const safeFormatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = parseISO(dateStr);
        return isValid(date) ? format(date, 'MMMM d, yyyy') : 'N/A';
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!payslip || !user) {
        return <div className="flex items-center justify-center min-h-screen">Document not found.</div>;
    }

    const payDate = safeFormatDate(payslip.pay_date);
    const userCurrency = user?.currency || 'ZAR';

    return (
        <DocumentLayout
            user={user}
            title="PAYSLIP"
            documentNumber={payslip.payslip_number}
            date={payDate}
        >
            {/* Employee Information */}
            <section className="mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-semibold text-foreground border-b border-border pb-2 mb-3">Employee Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs sm:text-sm">
                    <div><strong>Employee Name:</strong> {payslip.employee_name}</div>
                    <div><strong>Position:</strong> {payslip.position || 'N/A'}</div>
                    <div><strong>Employee ID:</strong> {payslip.employee_id}</div>
                    <div><strong>Department:</strong> {payslip.department || 'N/A'}</div>
                    <div className="sm:col-span-2"><strong>Pay Period:</strong> {safeFormatDate(payslip.pay_period_start)} - {safeFormatDate(payslip.pay_period_end)}</div>
                </div>
            </section>
            
            {/* Earnings & Deductions Tables */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
                {/* Earnings */}
                <div>
                    <h3 className="text-base sm:text-lg font-semibold text-foreground border-b border-border pb-2 mb-3">Earnings</h3>
                    <table className="w-full text-xs sm:text-sm">
                        <tbody>
                            <tr className="border-b"><td className="py-2">Basic Salary</td><td className="text-right">{formatCurrency(payslip.basic_salary, userCurrency)}</td></tr>
                            {payslip.overtime_hours > 0 && <tr className="border-b"><td className="py-2">Overtime</td><td className="text-right">{formatCurrency(payslip.overtime_hours * payslip.overtime_rate, userCurrency)}</td></tr>}
                            {payslip.allowances?.map((item, index) => (
                                <tr key={`allowance-${index}`} className="border-b"><td className="py-2">{item.name}</td><td className="text-right">{formatCurrency(item.amount, userCurrency)}</td></tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-muted font-bold"><td className="p-2">Gross Pay</td><td className="p-2 text-right">{formatCurrency(payslip.gross_pay, userCurrency)}</td></tr>
                        </tfoot>
                    </table>
                </div>

                {/* Deductions */}
                <div>
                    <h3 className="text-base sm:text-lg font-semibold text-foreground border-b border-border pb-2 mb-3">Deductions</h3>
                    <table className="w-full text-xs sm:text-sm">
                        <tbody>
                            <tr className="border-b"><td className="py-2">PAYE Tax</td><td className="text-right">{formatCurrency(payslip.tax_deduction, userCurrency)}</td></tr>
                            <tr className="border-b"><td className="py-2">UIF</td><td className="text-right">{formatCurrency(payslip.uif_deduction, userCurrency)}</td></tr>
                            {payslip.pension_deduction > 0 && <tr className="border-b"><td className="py-2">Pension Fund</td><td className="text-right">{formatCurrency(payslip.pension_deduction, userCurrency)}</td></tr>}
                            {payslip.medical_aid_deduction > 0 && <tr className="border-b"><td className="py-2">Medical Aid</td><td className="text-right">{formatCurrency(payslip.medical_aid_deduction, userCurrency)}</td></tr>}
                            {payslip.other_deductions?.map((item, index) => (
                                <tr key={`deduction-${index}`} className="border-b"><td className="py-2">{item.name}</td><td className="text-right">{formatCurrency(item.amount, userCurrency)}</td></tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-muted font-bold"><td className="p-2">Total Deductions</td><td className="p-2 text-right">{formatCurrency(payslip.total_deductions, userCurrency)}</td></tr>
                        </tfoot>
                    </table>
                </div>
            </section>

            {/* Summary */}
            <section className="mt-6 sm:mt-8 pt-4 border-t-2 border-border">
                 <div className="w-full sm:max-w-xs sm:ml-auto">
                    <div className="flex justify-between py-3 text-lg sm:text-xl bg-primary/10 px-4 rounded-md mt-2">
                        <span className="font-bold text-foreground">Net Pay</span>
                        <span className="font-bold text-primary">{formatCurrency(payslip.net_pay, userCurrency)}</span>
                    </div>
                </div>
            </section>
        </DocumentLayout>
    );
}