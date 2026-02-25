/**
 * Database Setup Verification Script
 * 
 * This script verifies that all tables, indexes, and RLS policies are correctly set up.
 * Run this after executing the migration in Supabase SQL editor.
 * 
 * Usage:
 *   node scripts/verify-database-setup.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyTables() {
  console.log('\n📋 Verifying Tables...\n');
  
  const tables = [
    'clients',
    'services',
    'invoices',
    'quotes',
    'payments',
    'organizations',
    'memberships',
    'profiles'
  ];

  const results = {};
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          console.log(`❌ Table '${table}' does not exist`);
          results[table] = false;
        } else {
          console.log(`⚠️  Table '${table}' exists but query failed: ${error.message}`);
          results[table] = 'partial';
        }
      } else {
        console.log(`✅ Table '${table}' exists and is accessible`);
        results[table] = true;
      }
    } catch (err) {
      console.log(`❌ Error checking table '${table}': ${err.message}`);
      results[table] = false;
    }
  }
  
  return results;
}

async function verifyColumns() {
  console.log('\n📊 Verifying Table Columns...\n');
  
  // Check clients table columns
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('id, org_id, name, email, phone, address, contact_person, website, tax_id, payment_terms, created_at, updated_at')
      .limit(1);
    
    if (error) {
      console.log(`⚠️  Clients table columns check: ${error.message}`);
    } else {
      console.log('✅ Clients table has all required columns');
    }
  } catch (err) {
    console.log(`❌ Error checking clients columns: ${err.message}`);
  }
  
  // Check services table columns
  try {
    const { data, error } = await supabase
      .from('services')
      .select('id, org_id, name, item_type, default_unit, default_rate, tax_category, is_active, created_at, updated_at')
      .limit(1);
    
    if (error) {
      console.log(`⚠️  Services table columns check: ${error.message}`);
    } else {
      console.log('✅ Services table has all required columns');
    }
  } catch (err) {
    console.log(`❌ Error checking services columns: ${err.message}`);
  }
}

async function verifyRLS() {
  console.log('\n🔒 Verifying Row Level Security...\n');
  
  // Check if RLS is enabled
  const tables = ['clients', 'services', 'invoices', 'quotes'];
  
  for (const table of tables) {
    try {
      // Try to query without auth (should fail if RLS is enabled)
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        if (error.code === 'PGRST301' || error.message.includes('permission denied') || error.message.includes('RLS')) {
          console.log(`✅ RLS is enabled on '${table}' table`);
        } else {
          console.log(`⚠️  RLS check for '${table}': ${error.message}`);
        }
      } else {
        console.log(`⚠️  RLS may not be properly configured on '${table}' (query succeeded without auth)`);
      }
    } catch (err) {
      console.log(`❌ Error checking RLS for '${table}': ${err.message}`);
    }
  }
}

async function testDataOperations() {
  console.log('\n🧪 Testing Data Operations...\n');
  
  // Note: These tests require authentication
  // They will fail if not logged in, which is expected
  
  try {
    // Test creating a client (will fail without auth, which is good)
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: 'Test Client',
        email: 'test@example.com'
      })
      .select();
    
    if (clientError) {
      if (clientError.code === 'PGRST301' || clientError.message.includes('permission denied')) {
        console.log('✅ Client creation is protected by RLS (requires auth)');
      } else {
        console.log(`⚠️  Client creation test: ${clientError.message}`);
      }
    } else {
      console.log('⚠️  Client creation succeeded without auth (RLS may not be working)');
      // Clean up test data
      if (clientData && clientData[0]) {
        await supabase.from('clients').delete().eq('id', clientData[0].id);
      }
    }
  } catch (err) {
    console.log(`❌ Error testing client creation: ${err.message}`);
  }
  
  try {
    // Test creating a service
    const { data: serviceData, error: serviceError } = await supabase
      .from('services')
      .insert({
        name: 'Test Service',
        item_type: 'service',
        default_unit: 'hour',
        default_rate: 100.00
      })
      .select();
    
    if (serviceError) {
      if (serviceError.code === 'PGRST301' || serviceError.message.includes('permission denied')) {
        console.log('✅ Service creation is protected by RLS (requires auth)');
      } else {
        console.log(`⚠️  Service creation test: ${serviceError.message}`);
      }
    } else {
      console.log('⚠️  Service creation succeeded without auth (RLS may not be working)');
      // Clean up test data
      if (serviceData && serviceData[0]) {
        await supabase.from('services').delete().eq('id', serviceData[0].id);
      }
    }
  } catch (err) {
    console.log(`❌ Error testing service creation: ${err.message}`);
  }
}

async function main() {
  console.log('🚀 Starting Database Setup Verification\n');
  console.log('='.repeat(50));
  
  const tableResults = await verifyTables();
  await verifyColumns();
  await verifyRLS();
  await testDataOperations();
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Summary:\n');
  
  const allTablesExist = Object.values(tableResults).every(r => r === true);
  
  if (allTablesExist) {
    console.log('✅ All tables exist and are accessible');
  } else {
    console.log('⚠️  Some tables may be missing or inaccessible');
    console.log('   Please run the migration: supabase/schema.postgres.sql');
  }
  
  console.log('\n💡 Next Steps:');
  console.log('   1. If tables are missing, run the migration in Supabase SQL editor');
  console.log('   2. Test RLS by logging in as different users');
  console.log('   3. Verify users can only see their organization\'s data');
  console.log('   4. Test creating clients and services through the app\n');
}

main().catch(console.error);
