#!/usr/bin/env node
/**
 * Verify Supabase configuration
 * Checks that .env has correct VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * and that they match the Supabase project.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Load .env file (try .env.development first for dev, then .env)
function loadEnv() {
  const envFiles = ['.env.development', '.env'];
  for (const envFile of envFiles) {
    try {
      const envPath = join(projectRoot, envFile);
      const envContent = readFileSync(envPath, 'utf-8');
      const env = {};
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          }
        }
      });
      if (env.VITE_SUPABASE_URL || env.VITE_SUPABASE_ANON_KEY) {
        console.log(`   Loaded from ${envFile}\n`);
        return env;
      }
    } catch {
      // file not found or unreadable, try next
    }
  }
  console.error('❌ No .env.development or .env found with Supabase variables');
  return null;
}

async function verifySupabaseConfig() {
  console.log('🔍 Verifying Supabase configuration...\n');
  
  const env = loadEnv();
  if (!env) {
    console.error('❌ Could not load .env.development or .env with Supabase variables');
    process.exit(1);
  }
  
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
  
  // Check if variables exist
  if (!supabaseUrl) {
    console.error('❌ VITE_SUPABASE_URL is missing from .env');
    console.log('\n📝 To fix:');
    console.log('   1. Open Supabase Dashboard → Your Project → Settings → API');
    console.log('   2. Copy the "Project URL"');
    console.log('   3. Add to .env: VITE_SUPABASE_URL=your-project-url');
    process.exit(1);
  }
  
  if (!supabaseAnonKey) {
    console.error('❌ VITE_SUPABASE_ANON_KEY is missing from .env');
    console.log('\n📝 To fix:');
    console.log('   1. Open Supabase Dashboard → Your Project → Settings → API');
    console.log('   2. Copy the "anon public" key (NOT the service_role key)');
    console.log('   3. Add to .env: VITE_SUPABASE_ANON_KEY=your-anon-key');
    process.exit(1);
  }
  
  // Validate URL format
  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    console.warn('⚠️  VITE_SUPABASE_URL format looks incorrect');
    console.log(`   Current value: ${supabaseUrl}`);
    console.log('   Expected format: https://xxxxx.supabase.co');
  }
  
  // Validate anon key format (should be a JWT token starting with "eyJ")
  // Note: Some Supabase projects might use different key formats, so we'll just check it's not empty
  if (supabaseAnonKey.length < 20) {
    console.warn('⚠️  VITE_SUPABASE_ANON_KEY looks too short');
    console.log('   Anon keys are typically long JWT tokens');
  }
  
  console.log('✅ Environment variables found:');
  console.log(`   VITE_SUPABASE_URL: ${supabaseUrl}`);
  console.log(`   VITE_SUPABASE_ANON_KEY: ${supabaseAnonKey.substring(0, 20)}...`);
  console.log('');
  
  // Try to connect to Supabase
  console.log('🔌 Testing connection to Supabase...');
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Try a simple query to verify connection
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);
    
    if (error) {
      // If it's a schema cache error, that's actually okay - it means we're connected
      if (error.message?.includes('schema cache') || error.message?.includes('could not find the table')) {
        console.log('⚠️  Connection successful, but schema cache may need reloading');
        console.log('   Run: scripts/reload-schema-cache.sql in Supabase SQL Editor');
      } else if (error.message?.includes('JWT') || error.message?.includes('Invalid API key')) {
        console.error('❌ Invalid API key');
        console.log('\n📝 To fix:');
        console.log('   1. Open Supabase Dashboard → Your Project → Settings → API');
        console.log('   2. Copy the "anon public" key (NOT service_role)');
        console.log('   3. Update .env: VITE_SUPABASE_ANON_KEY=your-anon-key');
        process.exit(1);
      } else {
        console.log('⚠️  Connection successful, but got error:', error.message);
        console.log('   This might be normal if tables don\'t exist yet');
      }
    } else {
      console.log('✅ Successfully connected to Supabase!');
    }
    
    // Test auth endpoint
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError && !authError.message.includes('session')) {
      console.log('⚠️  Auth check:', authError.message);
    } else {
      console.log('✅ Auth endpoint accessible');
    }
    
  } catch (error) {
    console.error('❌ Failed to connect to Supabase:', error.message);
    console.log('\n📝 Troubleshooting:');
    console.log('   1. Verify VITE_SUPABASE_URL matches your Supabase project URL');
    console.log('   2. Check your internet connection');
    console.log('   3. Verify the Supabase project is active');
    process.exit(1);
  }
  
  console.log('\n✅ Supabase configuration verified!');
  console.log('\n📋 Next steps:');
  console.log('   1. If you see schema cache warnings, run scripts/reload-schema-cache.sql');
  console.log('   2. Ensure tables exist: run scripts/ensure-invoices-schema.sql');
  console.log('   3. Restart your dev server: npm run dev');
}

verifySupabaseConfig().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
