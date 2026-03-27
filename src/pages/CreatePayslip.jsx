import React, { useState, useEffect } from "react";
import { Payroll } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Plus, Trash2, Calculator, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import { formatCurrency } from "@/components/CurrencySelector";
import { calculateFullPayroll } from "@/components/payroll/PayeTaxCalculator";

export default function CreatePayslip() {
    const navigate = useNavigate();
    const [payslipData, setPayslipData] = useState({
        employee_name: "",
        employee_id: "",
        employee_email: "",
        employee_phone: "",
        position: "",
        department: "",
        pay_period_start: "",
        pay_period_end: "",
        pay_date: "",
        basic_salary: 0,
        overtime_hours: 0,
        overtime_rate: 0,
        allowances: [],
        tax_deduction: 0, // Now auto-calculated
        uif_deduction: 0, // Now auto-calculated
        pension_deduction: 0,
        medical_aid_deduction: 0,
        other_deductions: [],
        status: "draft"
    });
    const [isFormValid, setIsFormValid] = useState(false);
    const [calculatedPayroll, setCalculatedPayroll] = useState(null);

    useEffect(() => {
        const { employee_name, employee_id, pay_period_start, pay_period_end, pay_date, basic_salary } = payslipData;
        const isValid = 
            employee_name.trim() !== "" &&
            employee_id.trim() !== "" &&
            pay_period_start !== "" &&
            pay_period_end !== "" &&
            pay_date !== "" &&
            parseFloat(basic_salary) > 0;
        setIsFormValid(isValid);
    }, [payslipData]);

    // Recalculate payroll when relevant fields change
    useEffect(() => {
        // Ensure values are numbers before passing to calculation
        const basicSalary = parseFloat(payslipData.basic_salary) || 0;
        const overtimeHours = parseFloat(payslipData.overtime_hours) || 0;
        const overtimeRate = parseFloat(payslipData.overtime_rate) || 0;
        const medicalAidDeduction = parseFloat(payslipData.medical_aid_deduction) || 0;
        const pensionDeduction = parseFloat(payslipData.pension_deduction) || 0;
        const parsedAllowances = payslipData.allowances.map(a => ({...a, amount: parseFloat(a.amount) || 0}));

        if (basicSalary > 0 || overtimeHours > 0 || parsedAllowances.length > 0) {
            const calculation = calculateFullPayroll(
                basicSalary,
                parsedAllowances,
                overtimeHours,
                overtimeRate,
                medicalAidDeduction,
                pensionDeduction
            );
            setCalculatedPayroll(calculation);
            
            // Auto-update PAYE and UIF in payslipData state
            setPayslipData(prev => ({
                ...prev,
                tax_deduction: calculation.payeDeduction,
                uif_deduction: calculation.uifDeduction
            }));
        } else {
            // Reset calculated payroll if basic salary is not entered
            setCalculatedPayroll(null);
            setPayslipData(prev => ({
                ...prev,
                tax_deduction: 0,
                uif_deduction: 0
            }));
        }
    }, [
        payslipData.basic_salary, 
        payslipData.allowances, 
        payslipData.overtime_hours, 
        payslipData.overtime_rate,
        payslipData.medical_aid_deduction,
        payslipData.pension_deduction
    ]);

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
                i === index ? { ...item, [field]: value } : item // Fixed syntax error here
            )
        }));
    };

    const calculateFinalTotals = () => {
        if (!calculatedPayroll) return { grossPay: 0, totalDeductions: 0, netPay: 0 };
        
        // Add other deductions to the calculated totals
        const otherDeductionsTotal = payslipData.other_deductions.reduce((sum, deduction) => 
            sum + (parseFloat(deduction.amount) || 0), 0);
        
        const totalDeductions = calculatedPayroll.totalDeductions + otherDeductionsTotal;
        const netPay = calculatedPayroll.grossPay - totalDeductions;

        return {
            grossPay: calculatedPayroll.grossPay,
            totalDeductions: totalDeductions,
            netPay: netPay
        };
    };

    const { grossPay, totalDeductions, netPay } = calculateFinalTotals();

    const handleCreatePayslip = async () => {
        try {
            const getInitials = (name) => {
                if (!name) return "XX";
                const parts = name.trim().split(/\s+/);
                if (parts.length > 1 && parts[0] && parts[parts.length - 1]) {
                    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                }
                return name.substring(0, 2).toUpperCase();
            };

            const now = new Date();
            const employeeInitials = getInitials(payslipData.employee_name);
            const timestamp = now.getTime().toString().slice(-6);
            const payslipNumber = `PAY-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}-${employeeInitials}${timestamp}`;

            await Payroll.create({
                ...payslipData,
                payslip_number: payslipNumber,
                gross_pay: grossPay,
                total_deductions: totalDeductions,
                net_pay: netPay,
                // Ensure all numeric fields are stored as numbers, now reflecting auto-calculated values
                basic_salary: parseFloat(payslipData.basic_salary) || 0,
                overtime_hours: parseFloat(payslipData.overtime_hours) || 0,
                overtime_rate: parseFloat(payslipData.overtime_rate) || 0,
                tax_deduction: parseFloat(payslipData.tax_deduction) || 0, // Auto-calculated
                uif_deduction: parseFloat(payslipData.uif_deduction) || 0, // Auto-calculated
                pension_deduction: parseFloat(payslipData.pension_deduction) || 0,
                medical_aid_deduction: parseFloat(payslipData.medical_aid_deduction) || 0,
                allowances: payslipData.allowances.map(a => ({...a, amount: parseFloat(a.amount) || 0})),
                other_deductions: payslipData.other_deductions.map(d => ({...d, amount: parseFloat(d.amount) || 0})),
            });

            navigate(createPageUrl("Payslips"));
        } catch (error) {
            console.error("Error creating payslip:", error);
            alert("Failed to create payslip. Please try again.");
        }
    };

    return (
        <div className="min-h-screen bg-background p-4 sm:p-6">
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
                        className="rounded-lg border-border hover:bg-muted"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Create New Payslip</h1>
                        <p className="text-sm sm:text-base text-muted-foreground mt-1">Generate payslips with automatic PAYE tax calculation</p>
                    </div>
                </motion.div>

                <div className="space-y-8">
                    {/* Employee Information */}
                    <Card className="bg-card border border-border">
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
                    <Card className="bg-card border border-border">
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
                    <Card className="bg-card border border-border">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calculator className="w-5 h-5" />
                                Earnings
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="basic_salary">Basic Salary (ZAR/month)*</Label>
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
                                    <span className="text-sm font-semibold">Allowances</span>
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

                            {calculatedPayroll && (
                                <div className="bg-green-50 rounded-lg p-4">
                                    <p className="text-sm text-green-700 font-medium">
                                        Gross Pay: {formatCurrency(calculatedPayroll.grossPay, 'ZAR')}
                                    </p>
                                    <p className="text-xs text-green-600 mt-1">
                                        Annual Salary (for tax calculation): {formatCurrency(calculatedPayroll.taxInfo.annualSalary, 'ZAR')} | 
                                        Marginal Tax Rate: {calculatedPayroll.taxInfo.marginalTaxRate}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Deductions */}
                    <Card className="bg-card border border-border">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                Deductions
                                <div className="ml-auto text-sm text-primary flex items-center gap-1">
                                    <Info className="w-4 h-4" />
                                    PAYE & UIF auto-calculated
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="tax_deduction">PAYE Tax (Auto-calculated)</Label>
                                    <Input
                                        id="tax_deduction"
                                        type="number"
                                        value={payslipData.tax_deduction.toFixed(2)}
                                        disabled
                                        className="bg-muted"
                                    />
                                    <p className="text-xs text-muted-foreground">Based on SARS 2024/2025 tax tables</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="uif_deduction">UIF (Auto-calculated)</Label>
                                    <Input
                                        id="uif_deduction"
                                        type="number"
                                        value={payslipData.uif_deduction.toFixed(2)}
                                        disabled
                                        className="bg-muted"
                                    />
                                    <p className="text-xs text-muted-foreground">1% of gross pay (max R177.12)</p>
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
                                    <p className="text-xs text-muted-foreground">Reduces taxable income (max 27.5% of remuneration)</p>
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
                                    <p className="text-xs text-muted-foreground">Provides tax credits (rebates) based on number of beneficiaries</p>
                                </div>
                            </div>

                            {/* Other Deductions */}
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-sm font-semibold">Other Deductions</span>
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
                    <Card className="bg-card border border-border">
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
                            
                            {calculatedPayroll && (
                                <div className="mt-4 p-4 bg-muted rounded-lg">
                                    <h4 className="font-medium text-foreground mb-2">Tax Information</h4>
                                    <div className="grid md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                                        <div>Annual Salary: {formatCurrency(calculatedPayroll.taxInfo.annualSalary, 'ZAR')}</div>
                                        <div>Marginal Tax Rate: {calculatedPayroll.taxInfo.marginalTaxRate}</div>
                                        <div>Taxable Income: {formatCurrency(calculatedPayroll.taxInfo.taxableIncome, 'ZAR')}</div>
                                        <div>Tax Credits: {formatCurrency(calculatedPayroll.taxInfo.taxCredits, 'ZAR')}</div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <div className="flex justify-end">
                        <Button
                            onClick={handleCreatePayslip}
                            size="lg"
                            className="bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed"
                            disabled={!isFormValid}
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Create Payslip
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}