// South African PAYE Tax Calculator for 2024/2025 tax year
// Based on SARS tax tables

export const calculatePAYE = (annualSalary, monthlyMedicalAid = 0, pensionContribution = 0) => {
    // Convert monthly salary to annual if needed
    const annual = annualSalary > 100000 ? annualSalary : annualSalary * 12;
    
    // Tax brackets for 2024/2025 tax year
    const taxBrackets = [
        { min: 0, max: 237100, rate: 0.18, baseAmount: 0 },
        { min: 237101, max: 370500, rate: 0.26, baseAmount: 42678 },
        { min: 370501, max: 512800, rate: 0.31, baseAmount: 77362 },
        { min: 512801, max: 673000, rate: 0.36, baseAmount: 121475 },
        { min: 673001, max: 857900, rate: 0.39, baseAmount: 179147 },
        { min: 857901, max: 1817000, rate: 0.41, baseAmount: 251258 },
        { min: 1817001, max: Infinity, rate: 0.45, baseAmount: 644489 }
    ];

    // Primary rebate for 2024/2025
    const primaryRebate = 17235;
    
    // Medical aid tax credit (first two members R347, additional R234 each)
    let medicalTaxCredit = 0;
    if (monthlyMedicalAid > 0) {
        medicalTaxCredit = (347 * 2) * 12; // Assuming employee + 1 dependent
    }

    // Calculate taxable income (after pension deductions)
    const annualPensionContribution = pensionContribution * 12;
    const maxPensionDeduction = Math.min(annualPensionContribution, annual * 0.275); // Max 27.5% of income
    const taxableIncome = annual - maxPensionDeduction;

    // Find applicable tax bracket
    let taxAmount = 0;
    for (const bracket of taxBrackets) {
        if (taxableIncome >= bracket.min && taxableIncome <= bracket.max) {
            taxAmount = bracket.baseAmount + ((taxableIncome - bracket.min) * bracket.rate);
            break;
        }
    }

    // Apply rebates and credits
    const totalTaxCredits = primaryRebate + medicalTaxCredit;
    const finalTaxAmount = Math.max(0, taxAmount - totalTaxCredits);

    // Return monthly PAYE amount
    return {
        monthlyPAYE: Math.round(finalTaxAmount / 12),
        annualPAYE: Math.round(finalTaxAmount),
        taxableIncome: Math.round(taxableIncome),
        taxCredits: Math.round(totalTaxCredits),
        pensionDeduction: Math.round(maxPensionDeduction),
        marginalTaxRate: taxBrackets.find(b => taxableIncome >= b.min && taxableIncome <= b.max)?.rate || 0
    };
};

// Calculate UIF (Unemployment Insurance Fund)
export const calculateUIF = (monthlyGrossPay) => {
    // UIF is 1% of gross pay, max R177.12 per month (employee portion)
    const uifAmount = Math.min(monthlyGrossPay * 0.01, 177.12);
    return Math.round(uifAmount * 100) / 100; // Round to 2 decimal places
};

// Calculate SDL (Skills Development Levy) - employer only, but shown for completeness
export const calculateSDL = (monthlyGrossPay) => {
    // SDL is 1% of gross pay, but only for employers with payroll > R500k per year
    // This is employer-only cost, not deducted from employee
    return Math.round((monthlyGrossPay * 0.01) * 100) / 100;
};

// Comprehensive payroll calculation
export const calculateFullPayroll = (basicSalary, allowances = [], overtimeHours = 0, overtimeRate = 0, medicalAid = 0, pensionFund = 0) => {
    // Calculate gross pay
    const overtimePay = overtimeHours * overtimeRate;
    const totalAllowances = allowances.reduce((sum, allowance) => sum + (parseFloat(allowance.amount) || 0), 0);
    const grossPay = basicSalary + overtimePay + totalAllowances;

    // Calculate PAYE
    const payeCalculation = calculatePAYE(basicSalary, medicalAid, pensionFund);
    const monthlyPAYE = payeCalculation.monthlyPAYE;

    // Calculate UIF
    const uifDeduction = calculateUIF(grossPay);

    // Total deductions
    const totalDeductions = monthlyPAYE + uifDeduction + medicalAid + pensionFund;

    // Net pay
    const netPay = grossPay - totalDeductions;

    return {
        grossPay: Math.round(grossPay * 100) / 100,
        basicSalary: Math.round(basicSalary * 100) / 100,
        overtimePay: Math.round(overtimePay * 100) / 100,
        totalAllowances: Math.round(totalAllowances * 100) / 100,
        payeDeduction: Math.round(monthlyPAYE * 100) / 100,
        uifDeduction: Math.round(uifDeduction * 100) / 100,
        medicalAidDeduction: Math.round(medicalAid * 100) / 100,
        pensionDeduction: Math.round(pensionFund * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        netPay: Math.round(netPay * 100) / 100,
        taxInfo: {
            annualSalary: Math.round(basicSalary * 12),
            taxableIncome: payeCalculation.taxableIncome,
            marginalTaxRate: (payeCalculation.marginalTaxRate * 100).toFixed(1) + '%',
            taxCredits: payeCalculation.taxCredits
        }
    };
};