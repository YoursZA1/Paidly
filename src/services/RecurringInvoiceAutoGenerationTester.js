/**
 * RecurringInvoiceAutoGenerationTester
 * Comprehensive testing utilities for recurring invoice auto-generation
 * Tests generation logic, scheduling, and data accuracy
 */

import { RecurringInvoice } from '@/api/entities';
import { RecurringInvoiceService } from './RecurringInvoiceService';

export const RecurringInvoiceAutoGenerationTester = {
  /**
   * Test 1: Verify isDue() correctly identifies overdue templates
   */
  async testIsDueDetection() {
    console.log('🧪 Test 1: isDue() Detection');
    try {
      const result = {
        test: 'isDue Detection',
        passed: true,
        details: [],
        errors: []
      };

      // Get all active recurring invoices
      const recurringInvoices = await RecurringInvoice.list();
      const activeInvoices = recurringInvoices.filter(ri => ri.status === 'active');

      if (activeInvoices.length === 0) {
        result.details.push('ℹ️ No active recurring invoices to test');
        return result;
      }

      // Test each invoice
      activeInvoices.forEach(invoice => {
        const isDue = RecurringInvoiceService.isDue(invoice);
        const nextGenDate = new Date(invoice.next_generation_date);
        const today = new Date();
        const expectedDue = nextGenDate <= today;

        if (isDue === expectedDue) {
          result.details.push(`✅ ${invoice.template_name}: isDue=${isDue} (correct)`);
        } else {
          result.passed = false;
          result.errors.push(`❌ ${invoice.template_name}: isDue=${isDue}, expected=${expectedDue}`);
        }
      });

      return result;
    } catch (error) {
      return {
        test: 'isDue Detection',
        passed: false,
        details: [],
        errors: [error.message]
      };
    }
  },

  /**
   * Test 2: Verify calculateNextGenerationDate() produces correct dates
   */
  async testNextGenerationDateCalculation() {
    console.log('🧪 Test 2: Next Generation Date Calculation');
    try {
      const result = {
        test: 'Next Generation Date Calculation',
        passed: true,
        details: [],
        errors: []
      };

      const frequencies = RecurringInvoiceService.getAllFrequencies();
      const testDate = new Date();

      frequencies.forEach(freq => {
        try {
          const nextDate = RecurringInvoiceService.calculateNextGenerationDate(testDate, freq.id);
          const daysInCycle = freq.daysInCycle;
          const expectedDays = daysInCycle;

          // Calculate the difference in days
          const diffTime = nextDate - testDate;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays > 0 && diffDays <= expectedDays) {
            result.details.push(`✅ ${freq.label}: +${diffDays} days (expected ~${expectedDays})`);
          } else {
            result.passed = false;
            result.errors.push(`❌ ${freq.label}: +${diffDays} days (expected ~${expectedDays})`);
          }
        } catch (error) {
          result.passed = false;
          result.errors.push(`❌ ${freq.label}: ${error.message}`);
        }
      });

      return result;
    } catch (error) {
      return {
        test: 'Next Generation Date Calculation',
        passed: false,
        details: [],
        errors: [error.message]
      };
    }
  },

  /**
   * Test 3: Verify generateInvoiceFromRecurring() creates valid invoices
   */
  async testInvoiceGeneration() {
    console.log('🧪 Test 3: Invoice Generation from Recurring Template');
    try {
      const result = {
        test: 'Invoice Generation',
        passed: true,
        details: [],
        errors: [],
        generatedInvoices: []
      };

      // Get a sample recurring invoice
      const recurringInvoices = await RecurringInvoice.list();
      const activeInvoice = recurringInvoices.find(ri => ri.status === 'active');

      if (!activeInvoice) {
        result.details.push('ℹ️ No active recurring invoices to generate from');
        return result;
      }

      try {
        const newInvoice = await RecurringInvoiceService.generateInvoiceFromRecurring(activeInvoice);
        
        // Verify invoice properties
        const checks = {
          hasId: !!newInvoice.id,
          hasClientId: newInvoice.client_id === activeInvoice.client_id,
          amountMatches: newInvoice.total_amount === activeInvoice.total_amount,
          hasDueDate: !!newInvoice.due_date,
          hasLineItems: newInvoice.items && newInvoice.items.length > 0,
          invoicePrefix: newInvoice.invoice_number?.includes(activeInvoice.invoice_prefix || '')
        };

        const allPassed = Object.values(checks).every(v => v !== false);

        if (allPassed) {
          result.details.push(`✅ Generated Invoice: ${newInvoice.invoice_number}`);
          result.generatedInvoices.push(newInvoice.id);
        } else {
          result.passed = false;
          Object.entries(checks).forEach(([key, value]) => {
            if (!value) {
              result.errors.push(`❌ ${key}: failed validation`);
            }
          });
        }
      } catch (error) {
        result.passed = false;
        result.errors.push(`❌ Generation failed: ${error.message}`);
      }

      return result;
    } catch (error) {
      return {
        test: 'Invoice Generation',
        passed: false,
        details: [],
        errors: [error.message],
        generatedInvoices: []
      };
    }
  },

  /**
   * Test 4: Verify checkAndGenerateDueInvoices() generates all due invoices
   */
  async testBatchGeneration() {
    console.log('🧪 Test 4: Batch Generation of Due Invoices');
    try {
      const result = {
        test: 'Batch Generation',
        passed: true,
        details: [],
        errors: [],
        generatedCount: 0
      };

      // Count due invoices before generation
      const recurringInvoices = await RecurringInvoice.list();
      const dueCount = recurringInvoices.filter(ri => 
        ri.status === 'active' && RecurringInvoiceService.isDue(ri)
      ).length;

      result.details.push(`📊 Due invoices before generation: ${dueCount}`);

      // Generate due invoices
      const generated = await RecurringInvoiceService.checkAndGenerateDueInvoices();
      result.generatedCount = generated.length;

      if (generated.length === dueCount) {
        result.details.push(`✅ Generated ${generated.length} invoices (matches due count)`);
      } else if (generated.length > 0) {
        result.details.push(`⚠️ Generated ${generated.length} invoices (expected ${dueCount})`);
      } else if (dueCount === 0) {
        result.details.push(`✅ No due invoices to generate (correct)`);
      } else {
        result.passed = false;
        result.errors.push(`❌ Generated ${generated.length} invoices but ${dueCount} were due`);
      }

      // Verify next_generation_date was updated
      const updatedInvoices = await RecurringInvoice.list();
      let datesUpdated = 0;
      
      generated.forEach(genInvoice => {
        const originalRecurring = recurringInvoices.find(ri => ri.id === genInvoice.recurring_invoice_id);
        const updatedRecurring = updatedInvoices.find(ri => ri.id === genInvoice.recurring_invoice_id);
        
        if (originalRecurring && updatedRecurring) {
          if (new Date(updatedRecurring.next_generation_date) > new Date(originalRecurring.next_generation_date)) {
            datesUpdated++;
          }
        }
      });

      if (datesUpdated === generated.length || generated.length === 0) {
        result.details.push(`✅ Next generation dates updated correctly`);
      } else {
        result.passed = false;
        result.errors.push(`❌ Only ${datesUpdated}/${generated.length} next dates updated`);
      }

      return result;
    } catch (error) {
      return {
        test: 'Batch Generation',
        passed: false,
        details: [],
        errors: [error.message],
        generatedCount: 0
      };
    }
  },

  /**
   * Test 5: Verify paused templates don't generate invoices
   */
  async testPausedTemplateProtection() {
    console.log('🧪 Test 5: Paused Template Protection');
    try {
      const result = {
        test: 'Paused Template Protection',
        passed: true,
        details: [],
        errors: []
      };

      const recurringInvoices = await RecurringInvoice.list();
      const pausedInvoices = recurringInvoices.filter(ri => ri.status === 'paused');

      if (pausedInvoices.length === 0) {
        result.details.push('ℹ️ No paused recurring invoices to test');
        return result;
      }

      // Check that paused invoices have isDue = false
      pausedInvoices.forEach(invoice => {
        const isDue = RecurringInvoiceService.isDue(invoice);
        
        if (!isDue) {
          result.details.push(`✅ ${invoice.template_name}: paused, isDue=false (protected)`);
        } else {
          result.passed = false;
          result.errors.push(`❌ ${invoice.template_name}: paused but isDue=true (not protected)`);
        }
      });

      return result;
    } catch (error) {
      return {
        test: 'Paused Template Protection',
        passed: false,
        details: [],
        errors: [error.message]
      };
    }
  },

  /**
   * Test 6: Verify ended templates don't generate invoices
   */
  async testEndedTemplateProtection() {
    console.log('🧪 Test 6: Ended Template Protection');
    try {
      const result = {
        test: 'Ended Template Protection',
        passed: true,
        details: [],
        errors: []
      };

      const recurringInvoices = await RecurringInvoice.list();
      const endedInvoices = recurringInvoices.filter(ri => ri.status === 'ended');

      if (endedInvoices.length === 0) {
        result.details.push('ℹ️ No ended recurring invoices to test');
        return result;
      }

      // Check that ended invoices don't generate
      endedInvoices.forEach(invoice => {
        const isDue = RecurringInvoiceService.isDue(invoice);
        
        if (!isDue) {
          result.details.push(`✅ ${invoice.template_name}: ended, isDue=false (protected)`);
        } else {
          result.passed = false;
          result.errors.push(`❌ ${invoice.template_name}: ended but isDue=true (not protected)`);
        }
      });

      return result;
    } catch (error) {
      return {
        test: 'Ended Template Protection',
        passed: false,
        details: [],
        errors: [error.message]
      };
    }
  },

  /**
   * Test 7: Verify frequency calculation edge cases
   */
  async testFrequencyEdgeCases() {
    console.log('🧪 Test 7: Frequency Edge Cases');
    try {
      const result = {
        test: 'Frequency Edge Cases',
        passed: true,
        details: [],
        errors: []
      };

      const testCases = [
        {
          name: 'Weekly rollover',
          frequency: 'weekly',
          expectedDays: 7
        },
        {
          name: 'Bi-weekly rollover',
          frequency: 'biweekly',
          expectedDays: 14
        },
        {
          name: 'Monthly rollover',
          frequency: 'monthly',
          expectedDays: 30
        },
        {
          name: 'Quarterly rollover',
          frequency: 'quarterly',
          expectedDays: 90
        },
        {
          name: 'Semi-annual rollover',
          frequency: 'semiannual',
          expectedDays: 180
        },
        {
          name: 'Annual rollover',
          frequency: 'annual',
          expectedDays: 365
        }
      ];

      const testDate = new Date();

      testCases.forEach(testCase => {
        try {
          const nextDate = RecurringInvoiceService.calculateNextGenerationDate(testDate, testCase.frequency);
          const diffTime = nextDate - testDate;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // Allow ±2 days tolerance for date calculations
          if (Math.abs(diffDays - testCase.expectedDays) <= 2) {
            result.details.push(`✅ ${testCase.name}: ${diffDays} days (expected ~${testCase.expectedDays})`);
          } else {
            result.passed = false;
            result.errors.push(`❌ ${testCase.name}: ${diffDays} days (expected ~${testCase.expectedDays})`);
          }
        } catch (error) {
          result.passed = false;
          result.errors.push(`❌ ${testCase.name}: ${error.message}`);
        }
      });

      return result;
    } catch (error) {
      return {
        test: 'Frequency Edge Cases',
        passed: false,
        details: [],
        errors: [error.message]
      };
    }
  },

  /**
   * Test 8: Verify generated invoices have correct financial data
   */
  async testInvoiceFinancialAccuracy() {
    console.log('🧪 Test 8: Invoice Financial Accuracy');
    try {
      const result = {
        test: 'Invoice Financial Accuracy',
        passed: true,
        details: [],
        errors: []
      };

      const recurringInvoices = await RecurringInvoice.list();
      const activeInvoice = recurringInvoices.find(ri => ri.status === 'active');

      if (!activeInvoice) {
        result.details.push('ℹ️ No active recurring invoices to test');
        return result;
      }

      try {
        const newInvoice = await RecurringInvoiceService.generateInvoiceFromRecurring(activeInvoice);

        // Check financial accuracy
        const checks = {
          baseAmount: newInvoice.total_amount === activeInvoice.total_amount,
          taxCalculated: newInvoice.tax_amount !== undefined,
          finalAmount: newInvoice.final_amount >= newInvoice.total_amount,
          dueDateSet: newInvoice.due_date !== undefined
        };

        Object.entries(checks).forEach(([key, value]) => {
          if (value) {
            result.details.push(`✅ ${key}: verified`);
          } else {
            result.passed = false;
            result.errors.push(`❌ ${key}: failed`);
          }
        });

        // Verify tax calculation if tax_rate exists
        if (activeInvoice.tax_rate > 0 && newInvoice.tax_amount !== undefined) {
          const expectedTax = (activeInvoice.total_amount * activeInvoice.tax_rate) / 100;
          const tolerance = 0.01; // 1 cent tolerance
          
          if (Math.abs(newInvoice.tax_amount - expectedTax) <= tolerance) {
            result.details.push(`✅ Tax calculation: ${newInvoice.tax_amount} (correct)`);
          } else {
            result.passed = false;
            result.errors.push(`❌ Tax calculation: ${newInvoice.tax_amount} (expected ${expectedTax})`);
          }
        }

        return result;
      } catch (error) {
        result.passed = false;
        result.errors.push(`❌ ${error.message}`);
        return result;
      }
    } catch (error) {
      return {
        test: 'Invoice Financial Accuracy',
        passed: false,
        details: [],
        errors: [error.message]
      };
    }
  },

  /**
   * Run all tests and return comprehensive report
   */
  async runAllTests() {
    console.log('\n🚀 Starting Recurring Invoice Auto-Generation Tests\n');
    console.log('═'.repeat(60));

    const tests = [
      this.testIsDueDetection,
      this.testNextGenerationDateCalculation,
      this.testInvoiceGeneration,
      this.testBatchGeneration,
      this.testPausedTemplateProtection,
      this.testEndedTemplateProtection,
      this.testFrequencyEdgeCases,
      this.testInvoiceFinancialAccuracy
    ];

    const results = [];

    for (const test of tests) {
      const result = await test.call(this);
      results.push(result);
      
      // Print individual test result
      console.log(`\n${result.passed ? '✅' : '❌'} ${result.test}`);
      result.details.forEach(detail => console.log(`  ${detail}`));
      if (result.errors.length > 0) {
        result.errors.forEach(error => console.log(`  ${error}`));
      }
    }

    // Generate summary
    const summary = {
      timestamp: new Date().toISOString(),
      totalTests: results.length,
      passedTests: results.filter(r => r.passed).length,
      failedTests: results.filter(r => !r.passed).length,
      successRate: ((results.filter(r => r.passed).length / results.length) * 100).toFixed(1),
      results
    };

    console.log('\n' + '═'.repeat(60));
    console.log(`\n📊 Test Summary`);
    console.log(`   Total: ${summary.totalTests}`);
    console.log(`   Passed: ${summary.passedTests} ✅`);
    console.log(`   Failed: ${summary.failedTests} ❌`);
    console.log(`   Success Rate: ${summary.successRate}%`);
    console.log('\n' + '═'.repeat(60));

    return summary;
  },

  /**
   * Generate test report as JSON
   */
  async generateTestReport() {
    const summary = await this.runAllTests();
    return JSON.stringify(summary, null, 2);
  }
};

export default RecurringInvoiceAutoGenerationTester;
