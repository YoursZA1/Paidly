import { useEffect, useMemo, useRef, useState } from "react";
import { Payroll } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Plus, Trash2, Calculator, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import { formatCurrency } from "@/components/CurrencySelector";
import { useServerPayrollPreview } from "@/hooks/useServerPayrollPreview";
import { useAuth } from "@/contexts/AuthContext";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { useToast } from "@/components/ui/use-toast";
import { listWorkforceEmployees } from "@/services/CompanyTeamService";
import { payrollApi } from "@/services/PayrollApiService";
import EmployeeSelect from "@/components/workforce/EmployeeSelect";
import { parseUuid } from "@shared/ids/uuid.js";
import { buildPayslipNumber } from "@shared/payroll/payslipNumber.js";
import { requirePayslipMembershipId } from "@shared/payroll/payslipWriteGuard.js";

export default function CreatePayslip() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { authUserId } = useAuth();
    const lastDraftNoticeIdRef = useRef(null);
    const [employees, setEmployees] = useState([]);
    const [employeeUuid, setEmployeeUuid] = useState("");
    const [periodCovered, setPeriodCovered] = useState(false);
    const [payslipData, setPayslipData] = useState({
        employee_name: "",
        employee_id: "",
        employee_email: "",
        employee_phone: "",
        position: "",
        department: "",
        payroll_profile_id: "",
        pay_run_id: "",
        pay_run_item_id: "",
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
    const {
        hasConflict: draftHasConflict,
        restoreNotice: draftRestoreNotice,
        statusLabel: draftStatusLabel,
        lastSavedAt: draftLastSavedAt,
        clearDraft,
    } = useAutoDraft({
        enabled: Boolean(authUserId),
        userId: authUserId,
        documentType: "payslip",
        draftKey: "create",
        formData: payslipData,
        onRestore: (restored) => {
            if (!restored || typeof restored !== "object") return;
            setPayslipData((prev) => ({ ...prev, ...restored }));
        },
    });
    const draftSavedAtLabel = draftLastSavedAt
        ? `Last saved at ${new Date(draftLastSavedAt).toLocaleTimeString([], { hour12: false })}`
        : "";

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const rows = await listWorkforceEmployees();
                if (!cancelled) setEmployees(Array.isArray(rows) ? rows : []);
            } catch {
                try {
                    const profiles = await payrollApi.profiles();
                    if (cancelled) return;
                    setEmployees(
                        (profiles || [])
                            .map((p) => {
                                const id = parseUuid(p.membership_id);
                                if (!id) return null;
                                return {
                                    id,
                                    employee_id: p.employee_number || "",
                                    membership_id: id,
                                    payroll_profile_id: parseUuid(p.id),
                                    user_id: parseUuid(p.user_id),
                                    employee_number: p.employee_number,
                                    full_name: p.full_name,
                                    email: p.email,
                                    job_title: p.job_title,
                                    department: p.department,
                                    base_salary: p.base_salary,
                                    label: p.full_name,
                                };
                            })
                            .filter(Boolean)
                    );
                } catch (err) {
                    if (!cancelled) {
                        toast({ title: "Could not load employees", description: err.message, variant: "destructive" });
                    }
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [toast]);

    const applyEmployee = (id) => {
        const selectedId = parseUuid(id) || "";
        setEmployeeUuid(selectedId);
        const emp = employees.find(
            (row) =>
                parseUuid(row.id) === selectedId ||
                parseUuid(row.membership_id) === selectedId
        );
        if (!emp) {
            setPayslipData((prev) => ({
                ...prev,
                employee_name: "",
                employee_id: "",
                employee_email: "",
                payroll_profile_id: "",
                pay_run_id: "",
                pay_run_item_id: "",
            }));
            return;
        }
        setPayslipData((prev) => ({
            ...prev,
            employee_name: emp.full_name || emp.label || "",
            employee_id: emp.employee_number || "",
            employee_email: emp.email || "",
            employee_phone: emp.phone || prev.employee_phone,
            position: emp.job_title || "",
            department: emp.department || "",
            basic_salary: Number(emp.base_salary) > 0 ? Number(emp.base_salary) : prev.basic_salary,
            payroll_profile_id: parseUuid(emp.payroll_profile_id) || "",
            pay_run_id: "",
            pay_run_item_id: "",
        }));
    };

    useEffect(() => {
        const membershipId = parseUuid(employeeUuid);
        const start = payslipData.pay_period_start;
        const end = payslipData.pay_period_end;
        if (!membershipId || !start || !end) {
            setPeriodCovered(false);
            return undefined;
        }
        let cancelled = false;
        (async () => {
            try {
                const result = await payrollApi.preview({
                    membership_id: membershipId,
                    period_start: start,
                    period_end: end,
                    profile: {
                        base_salary: Number(payslipData.basic_salary) || 0,
                        pay_frequency: "monthly",
                        pay_type: "monthly_salary",
                    },
                });
                if (cancelled) return;
                if (result?.source === "pay_run_item" && result.locked) {
                    setPeriodCovered(true);
                    return;
                }
                setPeriodCovered(false);
                if (result?.source !== "pay_run_item") return;
                const allowances = (result.earnings || []).filter(
                    (line) => String(line.code || "").toUpperCase() !== "BASIC" && String(line.type || "") !== "basic"
                );
                setPayslipData((prev) => ({
                    ...prev,
                    pay_run_id: parseUuid(result.pay_run_id) || "",
                    pay_run_item_id: parseUuid(result.pay_run_item_id) || "",
                    basic_salary: Number(result.basic) || prev.basic_salary,
                    overtime_hours: Number(result.overtime_hours) || 0,
                    overtime_rate: Number(result.overtime_rate) || 0,
                    allowances: allowances.length
                        ? allowances.map((line) => ({ name: line.name || "Allowance", amount: Number(line.amount) || 0 }))
                        : prev.allowances,
                    tax_deduction: Number(result.tax_deduction) || 0,
                    uif_deduction: Number(result.uif_deduction) || 0,
                }));
            } catch {
                if (!cancelled) setPeriodCovered(false);
                /* standalone compose still uses the live preview */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [employeeUuid, payslipData.pay_period_start, payslipData.pay_period_end]);

    useEffect(() => {
        if (!draftRestoreNotice?.id) return;
        if (lastDraftNoticeIdRef.current === draftRestoreNotice.id) return;
        lastDraftNoticeIdRef.current = draftRestoreNotice.id;
        toast({
            title: draftRestoreNotice.title || "Newer draft restored",
            description:
                draftRestoreNotice.description ||
                "A newer draft was restored to avoid accidental overwrite.",
            variant: "default",
        });
    }, [draftRestoreNotice, toast]);

    const isFormValid = useMemo(() => {
        const { employee_name, pay_period_start, pay_period_end, pay_date, basic_salary } = payslipData;
        return (
            Boolean(parseUuid(employeeUuid)) &&
            employee_name.trim() !== "" &&
            pay_period_start !== "" &&
            pay_period_end !== "" &&
            pay_date !== "" &&
            parseFloat(basic_salary) > 0 &&
            Boolean(calculatedPayroll) &&
            !previewError
        );
    }, [payslipData, employeeUuid, calculatedPayroll, previewError]);

    const { calculatedPayroll, previewError } = useServerPayrollPreview({
        basicSalary: payslipData.basic_salary,
        allowances: payslipData.allowances,
        overtimeHours: payslipData.overtime_hours,
        overtimeRate: payslipData.overtime_rate,
        medicalAid: payslipData.medical_aid_deduction,
        pensionFund: payslipData.pension_deduction,
        otherDeductions: payslipData.other_deductions,
        periodEnd: payslipData.pay_period_end,
    });

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

    const { grossPay, totalDeductions, netPay } = useMemo(() => {
        if (!calculatedPayroll) return { grossPay: 0, totalDeductions: 0, netPay: 0 };
        return {
            grossPay: calculatedPayroll.grossPay,
            totalDeductions: calculatedPayroll.totalDeductions,
            netPay: calculatedPayroll.netPay
        };
    }, [calculatedPayroll]);

    const handleCreatePayslip = async () => {
        if (periodCovered) {
            toast({
                title: "This period is already covered",
                description: "Payslips for a finalized pay run cannot be recreated here. Open an adjustment run in Payroll if leave was approved after finalize.",
                variant: "destructive",
            });
            return;
        }
        try {
            const payslipNumber = buildPayslipNumber({
                periodStart: payslipData.pay_period_start,
                employeeNumber: payslipData.employee_id,
            });

            let employee_user_id = null;
            const selected = employees.find(
                (row) =>
                    parseUuid(row.id) === parseUuid(employeeUuid) ||
                    parseUuid(row.membership_id) === parseUuid(employeeUuid)
            );
            employee_user_id = parseUuid(selected?.user_id);
            let membershipId;
            try {
                membershipId = requirePayslipMembershipId({ membership_id: employeeUuid });
            } catch (err) {
                toast({
                    title: "Select an employee",
                    description: err?.message || "Payslips require a workforce membership UUID.",
                    variant: "destructive",
                });
                return;
            }

            await Payroll.create({
                ...payslipData,
                payslip_number: payslipNumber,
                employee_user_id: employee_user_id || undefined,
                payroll_profile_id: parseUuid(payslipData.payroll_profile_id) || undefined,
                membership_id: membershipId,
                pay_run_id: parseUuid(payslipData.pay_run_id) || undefined,
                pay_run_item_id: parseUuid(payslipData.pay_run_item_id) || undefined,
                gross_pay: grossPay,
                total_deductions: totalDeductions,
                net_pay: netPay,
                // Ensure all numeric fields are stored as numbers, now reflecting auto-calculated values
                basic_salary: parseFloat(payslipData.basic_salary) || 0,
                overtime_hours: parseFloat(payslipData.overtime_hours) || 0,
                overtime_rate: parseFloat(payslipData.overtime_rate) || 0,
                tax_deduction: parseFloat(calculatedPayroll?.payeDeduction) || 0,
                uif_deduction: parseFloat(calculatedPayroll?.uifDeduction) || 0,
                pension_deduction: parseFloat(payslipData.pension_deduction) || 0,
                medical_aid_deduction: parseFloat(payslipData.medical_aid_deduction) || 0,
                allowances: payslipData.allowances.map(a => ({...a, amount: parseFloat(a.amount) || 0})),
                other_deductions: payslipData.other_deductions.map(d => ({...d, amount: parseFloat(d.amount) || 0})),
            });
            await clearDraft();

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
                        <p className="text-sm sm:text-base text-muted-foreground mt-1">
                            Prefer generating payslips from a processed pay run so amounts match payroll.
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Payslips use your organization profile — they are not assigned to a company / brand.
                            {" "}
                            <button
                                type="button"
                                className="underline"
                                onClick={() => navigate(createPageUrl("Payroll"))}
                            >
                                Run payroll
                            </button>
                            {" "}to issue payslips from processed entries.
                        </p>
                    </div>
                </motion.div>

                <div className="space-y-8">
                    {/* Employee Information */}
                    <Card className="bg-card border border-border">
                        <CardHeader>
                            <CardTitle>Employee</CardTitle>
                        </CardHeader>
                        <CardContent className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="employee">Employee*</Label>
                                <EmployeeSelect
                                    id="employee"
                                    employees={employees}
                                    value={employeeUuid}
                                    onChange={applyEmployee}
                                    required
                                    emptyLabel={employees.length ? "Select employee" : "No employees yet"}
                                />
                                {!employees.length ? (
                                    <p className="text-xs text-muted-foreground">
                                        Add the person once in{" "}
                                        <button
                                            type="button"
                                            className="underline"
                                            onClick={() => navigate(createPageUrl("TeamMembers"))}
                                        >
                                            Team Members
                                        </button>
                                        . Payroll, leave, and payslips use that record.
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Name, employee number, and salary come from the employee record. You do not re-enter them here.
                                        {parseUuid(payslipData.pay_run_item_id)
                                            ? " Amounts are taken from the processed payroll entry for this period."
                                            : ""}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="employee_name">Full Name</Label>
                                <Input
                                    id="employee_name"
                                    value={payslipData.employee_name}
                                    readOnly
                                    placeholder="Select an employee"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="employee_id">Employee number</Label>
                                <Input
                                    id="employee_id"
                                    value={payslipData.employee_id}
                                    readOnly
                                    placeholder="EMP-002"
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
                                        value={(calculatedPayroll?.payeDeduction || 0).toFixed(2)}
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
                                        value={(calculatedPayroll?.uifDeduction || 0).toFixed(2)}
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
                    <div className="flex flex-col items-end gap-2">
                        {previewError ? (
                            <p className="text-sm text-amber-800 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 w-full">
                                {previewError}
                            </p>
                        ) : null}
                        {periodCovered ? (
                            <p className="text-sm text-amber-800 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 w-full">
                                This pay period is already covered by a finalized pay run. Use Payroll to open an adjustment run instead of creating a second payslip.
                            </p>
                        ) : null}
                        {draftStatusLabel ? (
                            <span
                                className={`self-center mr-3 text-xs ${draftHasConflict ? "text-destructive font-medium" : "text-muted-foreground"}`}
                                role={draftHasConflict ? "alert" : undefined}
                            >
                                {draftStatusLabel}
                                {draftSavedAtLabel ? ` · ${draftSavedAtLabel}` : ""}
                            </span>
                        ) : null}
                        <Button
                            onClick={handleCreatePayslip}
                            size="lg"
                            className="bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed"
                            disabled={!isFormValid || periodCovered}
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