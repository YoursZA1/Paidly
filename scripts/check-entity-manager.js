/**
 * EntityManager Support Verification
 * 
 * Verifies that EntityManager correctly supports clients and services tables
 * with org_id filtering.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const customClientPath = join(__dirname, '..', 'src', 'api', 'customClient.js');

console.log('🔍 Checking EntityManager Support...\n');
console.log('='.repeat(60));

try {
  const code = readFileSync(customClientPath, 'utf-8');
  
  const checks = [
    {
      name: 'pullFromSupabase gets org_id from memberships',
      pattern: /getOrgIdForUser|memberships.*org_id|\.from\(['"]memberships['"]\)/i,
      required: true
    },
    {
      name: 'pullFromSupabase filters clients by org_id',
      pattern: /clients.*org_id|\.eq\(['"]org_id['"]/i,
      required: true
    },
    {
      name: 'pullFromSupabase filters services by org_id',
      pattern: /services.*org_id|\.eq\(['"]org_id['"]/i,
      required: true
    },
    {
      name: 'create() includes org_id',
      pattern: /org_id.*membership|membership.*org_id/i,
      required: true
    },
    {
      name: 'create() handles invoice_items',
      pattern: /invoice_items|quote_items/i,
      required: true
    },
    {
      name: 'list() pulls from Supabase',
      pattern: /pullFromSupabase|await.*pullFromSupabase/i,
      required: true
    },
    {
      name: 'update() verifies org_id',
      pattern: /update.*org_id|org_id.*update/i,
      required: false // Nice to have but not critical
    },
    {
      name: 'Payroll → payslips table mapping',
      pattern: /payrolls.*payslips|table === ['"]payrolls['"].*['"]payslips['"]/i,
      required: true
    },
    {
      name: 'payslips in org_id filter list',
      pattern: /'payslips'.*includes\(supabaseTable\)|includes\(supabaseTable\).*'payslips'/i,
      required: true
    },
    {
      name: 'expenses table and org_id filter',
      pattern: /'expenses'.*includes\(supabaseTable\)|table === ['"]expenses['"].*['"]expenses['"]/i,
      required: true
    },
    {
      name: 'tasks table and org_id filter',
      pattern: /'tasks'.*includes\(supabaseTable\)|table === ['"]tasks['"].*['"]tasks['"]/i,
      required: true
    },
    {
      name: 'created_by_id set for payslips',
      pattern: /supabaseTable === ['"]payslips['"][\s\S]*?created_by_id/,
      required: true
    },
    {
      name: 'created_by_id set for expenses',
      pattern: /supabaseTable === ['"]expenses['"][\s\S]*?created_by_id/,
      required: true
    },
    {
      name: 'created_by_id set for tasks',
      pattern: /supabaseTable === ['"]tasks['"][\s\S]*?created_by_id/,
      required: true
    }
  ];
  
  let passed = 0;
  let failed = 0;
  let warnings = 0;
  
  for (const check of checks) {
    const matches = check.pattern.test(code);
    
    if (matches) {
      console.log(`✅ ${check.name}`);
      passed++;
    } else {
      if (check.required) {
        console.log(`❌ ${check.name} - REQUIRED`);
        failed++;
      } else {
        console.log(`⚠️  ${check.name} - Recommended`);
        warnings++;
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed} (REQUIRED)`);
  }
  if (warnings > 0) {
    console.log(`   ⚠️  Warnings: ${warnings} (Recommended)`);
  }
  
  if (failed === 0) {
    console.log('\n✅ EntityManager correctly supports org_id filtering and new schema (payslips, expenses, tasks)!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Run the migration: supabase/schema.postgres.sql (or ensure-*-schema.sql for single tables)');
    console.log('   2. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
    console.log('   3. Test creating clients, services, payslips, expenses, tasks in the app');
    console.log('   4. Verify users only see their organization\'s data\n');
  } else {
    console.log('\n❌ EntityManager needs updates to support org_id filtering');
    console.log('   Please review src/api/customClient.js\n');
    process.exit(1);
  }
  
} catch (error) {
  console.error(`❌ Error reading EntityManager code: ${error.message}`);
  console.error(`   File: ${customClientPath}`);
  process.exit(1);
}
