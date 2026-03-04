import React, { useState, useEffect } from "react";
import { Payroll } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Plus, Trash2, Calculator } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import { formatCurrency } from "../components/CurrencySelector";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditPayslip() {
    const navigate = useNavigate();
    const location = useLocation();
    const [payslipData, setPayslipData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const payslipId = new URLSearchParams(location.search).get("id");

    useEffect(() => {
        if (!payslipId) {
            navigate(createPageUrl("Payslips"));
            return;
        }
        loadPayslip();
    }, [payslipId]);

    const loadPayslip = async () => {
        setIsLoading(true);
        try {
            const data = await Payroll.get(payslipId);
            setPayslipData({
                ...data,
                allowances: data.allowances || [],
                other_deductions: data.other_deductions || [],
            });
        } catch (error) {
            console.error("Error loading payslip:", error);
            navigate(createPageUrl("Payslips"));
        }
        setIsLoading(false);
    };

    const addAllowance = () => {
        setPayslipData(prev => ({
            ...prev,
            allowances: [...prev.allowances, { name: "", amount: 0 }]
        }));
    };

    const removeAllowance = (index) => {
        setPayslipData(prev => ({
            ...prev,
            allowances: prev.allowances.filter((_, i) => i !== index)
        }));
    };

    const updateAllowance = (index, field, value) => {
        setPayslipData(prev => ({
            ...prev,
            allowances: prev.allowances.map((item, i) => 
                i === index ? { ...item, [field]: value } : item
            )
        }));
    };

    const addOtherDeduction = () => {
        setPayslipData(prev => ({
            ...prev,
            other_deductions: [...prev.other_deductions, { name: "", amount: 0 }]
        }));
    };

    const removeOtherDeduction = (index) => {
        setPayslipData(prev => ({
            ...prev,
            other_deductions: prev.other_deductions.filter((_, i) => i !== index)
        }));
    };

    const updateOtherDeduction = (index, field, value) => {
        setPayslipData(prev => ({
            ...prev,
            other_deductions: prev.other_deductions.map((item, i) => 
                i === index ? { ...item, [field]: value } : item
            )
        }));
    };

    const calculateTotals = () => {
        if (!payslipData) return { grossPay: 0, uifDeduction: 0, totalDeductions: 0, netPay: 0 };
        
        const basicSalary = parseFloat(payslipData.basic_salary) || 0;
        const overtimePay = (parseFloat(payslipData.overtime_hours) || 0) * (parseFloat(payslipData.overtime_rate) || 0);
        const totalAllowances = payslipData.allowances.reduce((sum, allowance) => sum + (parseFloat(allowance.amount) || 0), 0);
        
        const grossPay = basicSalary + overtimePay + totalAllowances;
        
        const uifDeduction = Math.min(grossPay * 0.01, 177.12);
        
        const totalOtherDeductions = payslipData.other_deductions.reduce((sum, deduction) => sum + (parseFloat(deduction.amount) || 0), 0);
        const totalDeductions = (parseFloat(payslipData.tax_deduction) || 0) + 
                              uifDeduction + 
                              (parseFloat(payslipData.pension_deduction) || 0) + 
                              (parseFloat(payslipData.medical_aid_deduction) || 0) + 
                              totalOtherDeductions;
        
        const netPay = grossPay - totalDeductions;

        return { grossPay, uifDeduction, totalDeductions, netPay };
    };

    const { grossPay, uifDeduction, totalDeductions, netPay } = calculateTotals();

    const handleUpdatePayslip = async () => {
        try {
            const { id, created_date, updated_date, created_by, ...updateData } = payslipData;
            
            await Payroll.update(payslipId, {
                ...updateData,
                gross_pay: grossPay,
                uif_deduction: uifDeduction,
                total_deductions: totalDeductions,
                net_pay: netPay
            });

            navigate(createPageUrl("Payslips"));
        } catch (error) {
            console.error("Error updating payslip:", error);
            alert("Failed to update payslip. Please try again.");
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
                <div className="max-w-4xl mx-auto space-y-8">
                    <Skeleton className="h-10 w-1/2" />
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-4 mb-8"
                >
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => navigate(createPageUrl("Payslips"))}
                        className="rounded-lg border-gray-200 hover:bg-gray-50"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Edit Payslip</h1>
                        <p className="text-sm sm:text-base text-gray-600 mt-1">Update payslip for {payslipData.employee_name}</p>
                    </div>
                </motion.div>

                <div className="space-y-8">
                    {/* Employee Information */}
                    <Card className="bg-white border border-slate-200">
                        <CardHeader>
                            <CardTitle>Employee Information</CardTitle>
                        </CardHeader>
                        <CardContent className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="employee_name">Full Name*</Label>
                                <Input
                                    id="employee_name"
                                    value={payslipData.employee_name}
                                    onChange={(e) => setPayslipData({...payslipData, employee_name: e.target.value})}
                                    placeholder="John Doe"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="employee_id">Employee ID*</Label>
                                <Input
                                    id="employee_id"
                                    value={payslipData.employee_id}
                                    onChange={(e) => setPayslipData({...payslipData, employee_id: e.target.value})}
                                    placeholder="EMP001"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="employee_email">Email</Label>
                                <Input
                                    id="employee_email"
                                    type="email"
                                    value={payslipData.employee_email}
                                    onChange={(e) => setPayslipData({...payslipData, employee_email: e.target.value})}
                                    placeholder="john@example.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="employee_phone">Phone</Label>
                                <Input
                                    id="employee_phone"
                                    value={payslipData.employee_phone}
                                    onChange={(e) => setPayslipData({...payslipData, employee_phone: e.target.value})}
                                    placeholder="+27 12 345 6789"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="position">Position</Label>
                                <Input
                                    id="position"
                                    value={payslipData.position}
                                    onChange={(e) => setPayslipData({...payslipData, position: e.target.value})}
                                    placeholder="Software Developer"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="department">Department</Label>
                                <Input
                                    id="department"
                                    value={payslipData.department}
                                    onChange={(e) => setPayslipData({...payslipData, department: e.target.value})}
                                    placeholder="IT Department"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pay Period */}
                    <Card className="bg-white border border-slate-200">
                        <CardHeader>
                            <CardTitle>Pay Period Information</CardTitle>
                        </CardHeader>
                        <CardContent className="grid md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="pay_period_start">Pay Period Start*</Label>
                                <Input
                                    id="pay_period_start"
                                    type="date"
                                    value={payslipData.pay_period_start}
                                    onChange={(e) => setPayslipData({...payslipData, pay_period_start: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pay_period_end">Pay Period End*</Label>
                                <Input
                                    id="pay_period_end"
                                    type="date"
                                    value={payslipData.pay_period_end}
                                    onChange={(e) => setPayslipData({...payslipData, pay_period_end: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pay_date">Pay Date*</Label>
                                <Input
                                    id="pay_date"
                                    type="date"
                                    value={payslipData.pay_date}
                                    onChange={(e) => setPayslipData({...payslipData, pay_date: e.target.value})}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Earnings */}
                    <Card className="bg-white border border-slate-200">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calculator className="w-5 h-5" />
                                Earnings
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="basic_salary">Basic Salary (ZAR)*</Label>
                                    <Input
                                        id="basic_salary"
                                        type="number"
                                        value={payslipData.basic_salary}
                                        onChange={(e) => setPayslipData({...payslipData, basic_salary: e.target.value})}
                                        placeholder="25000"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="overtime_hours">Overtime Hours</Label>
                                    <Input
                                        id="overtime_hours"
                                        type="number"
                                        value={payslipData.overtime_hours}
                                        onChange={(e) => setPayslipData({...payslipData, overtime_hours: e.target.value})}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="overtime_rate">Overtime Rate (ZAR/hour)</Label>
                                    <Input
                                        id="overtime_rate"
                                        type="number"
                                        value={payslipData.overtime_rate}
                                        onChange={(e) => setPayslipData({...payslipData, overtime_rate: e.target.value})}
                                        placeholder="200"
                                    />
                                </div>
                            </div>

                            {/* Allowances */}
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <Label>Allowances</Label>
                                    <Button type="button" onClick={addAllowance} variant="outline" size="sm">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Allowance
                                    </Button>
                                </div>
                                {payslipData.allowances.map((allowance, index) => (
                                    <div key={index} className="flex gap-2 mb-2">
                                        <Input
                                            placeholder="Allowance name"
                                            value={allowance.name}
                                            onChange={(e) => updateAllowance(index, 'name', e.target.value)}
                                        />
                                        <Input
                                            type="number"
                                            placeholder="Amount"
                                            value={allowance.amount}
                                            onChange={(e) => updateAllowance(index, 'amount', e.target.value)}
                                        />
                                        <Button type="button" onClick={() => removeAllowance(index)} variant="outline" size="icon">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-green-50 rounded-lg p-4">
                                <p className="text-sm text-green-700 font-medium">
                                    Gross Pay: {formatCurrency(grossPay, 'ZAR')}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Deductions */}
                    <Card className="bg-white border border-slate-200">
                        <CardHeader>
                            <CardTitle>Deductions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="tax_deduction">PAYE Tax (ZAR)</Label>
                                    <Input
                                        id="tax_deduction"
                                        type="number"
                                        value={payslipData.tax_deduction}
                                        onChange={(e) => setPayslipData({...payslipData, tax_deduction: e.target.value})}
                                        placeholder="4500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="uif_calculated">UIF (Auto-calculated)</Label>
                                    <Input
                                        id="uif_calculated"
                                        type="number"
                                        value={uifDeduction.toFixed(2)}
                                        disabled
                                        className="bg-gray-100"
                                    />
                                    <p className="text-xs text-gray-500">1% of gross pay (max R177.12)</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="pension_deduction">Pension Fund (ZAR)</Label>
                                    <Input
                                        id="pension_deduction"
                                        type="number"
                                        value={payslipData.pension_deduction}
                                        onChange={(e) => setPayslipData({...payslipData, pension_deduction: e.target.value})}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="medical_aid_deduction">Medical Aid (ZAR)</Label>
                                    <Input
                                        id="medical_aid_deduction"
                                        type="number"
                                        value={payslipData.medical_aid_deduction}
                                        onChange={(e) => setPayslipData({...payslipData, medical_aid_deduction: e.target.value})}
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            {/* Other Deductions */}
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <Label>Other Deductions</Label>
                                    <Button type="button" onClick={addOtherDeduction} variant="outline" size="sm">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Deduction
                                    </Button>
                                </div>
                                {payslipData.other_deductions.map((deduction, index) => (
                                    <div key={index} className="flex gap-2 mb-2">
                                        <Input
                                            placeholder="Deduction name"
                                            value={deduction.name}
                                            onChange={(e) => updateOtherDeduction(index, 'name', e.target.value)}
                                        />
                                        <Input
                                            type="number"
                                            placeholder="Amount"
                                            value={deduction.amount}
                                            onChange={(e) => updateOtherDeduction(index, 'amount', e.target.value)}
                                        />
                                        <Button type="button" onClick={() => removeOtherDeduction(index)} variant="outline" size="icon">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-red-50 rounded-lg p-4">
                                <p className="text-sm text-red-700 font-medium">
                                    Total Deductions: {formatCurrency(totalDeductions, 'ZAR')}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Summary */}
                    <Card className="bg-white border border-slate-200">
                        <CardHeader>
                            <CardTitle>Payslip Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-3 gap-6 text-center">
                                <div className="bg-green-50 rounded-lg p-4">
                                    <p className="text-sm text-green-600 font-medium">Gross Pay</p>
                                    <p className="text-2xl font-bold text-green-700">{formatCurrency(grossPay, 'ZAR')}</p>
                                </div>
                                <div className="bg-red-50 rounded-lg p-4">
                                    <p className="text-sm text-red-600 font-medium">Total Deductions</p>
                                    <p className="text-2xl font-bold text-red-700">{formatCurrency(totalDeductions, 'ZAR')}</p>
                                </div>
                                <div className="bg-primary/10 rounded-lg p-4">
                                    <p className="text-sm text-primary font-medium">Net Pay</p>
                                    <p className="text-2xl font-bold text-primary">{formatCurrency(netPay, 'ZAR')}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <div className="flex justify-end">
                        <Button onClick={handleUpdatePayslip} size="lg" className="bg-primary hover:bg-primary/90">
                            <Save className="w-4 h-4 mr-2" />
                            Update Payslip
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}