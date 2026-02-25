# Verify Supabase Environment Configuration

## Current Configuration

Your `.env` file contains:
- **VITE_SUPABASE_URL**: `https://fvxtsbnzadvuttoqcipo.supabase.co` ✅ (format looks correct)
- **VITE_SUPABASE_ANON_KEY**: `sb_publishable_eklrq...` ⚠️ (unusual format)

## How to Verify Your Supabase Credentials

### Step 1: Open Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project (the one with URL: `fvxtsbnzadvuttoqcipo.supabase.co`)

### Step 2: Get the Correct Project URL

1. Navigate to: **Settings** → **API**
2. Under **Project URL**, you should see: `https://fvxtsbnzadvuttoqcipo.supabase.co`
3. ✅ Verify this matches your `.env` file

### Step 3: Get the Correct Anon Key

1. Still in **Settings** → **API**
2. Under **Project API keys**, find the **`anon` `public`** key
3. **Important**: This should be a long JWT token starting with `eyJ...`
4. **DO NOT** use:
   - `service_role` key (this is secret and should never be in frontend)
   - Any key starting with `sb_publishable_` (this might be from a different service)

### Step 4: Update Your .env File

If your anon key doesn't start with `eyJ`, update it:

```bash
# Open .env file
# Replace VITE_SUPABASE_ANON_KEY with the correct anon public key from Supabase Dashboard
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # (full JWT token)
```

### Step 5: Verify the Configuration

Run the verification script:

```bash
node scripts/verify-supabase-config.js
```

Expected output:
```
✅ Environment variables found
✅ Successfully connected to Supabase!
✅ Auth endpoint accessible
```

## Common Issues

### Issue 1: Wrong Key Type

**Symptom**: Key starts with `sb_publishable_` or similar

**Fix**: 
- Make sure you're copying the **`anon` `public`** key from Supabase Dashboard
- It should be a JWT token (starts with `eyJ`)

### Issue 2: Schema Cache Error

**Symptom**: "Could not find the table 'public.invoices' in the schema cache"

**Fix**:
1. Run `scripts/ensure-invoices-schema.sql` in Supabase SQL Editor
2. Run `scripts/reload-schema-cache.sql` in Supabase SQL Editor
3. Wait 30-60 seconds
4. Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)

### Issue 3: URL Mismatch

**Symptom**: Connection fails or wrong project

**Fix**:
- Verify `VITE_SUPABASE_URL` exactly matches the Project URL from Supabase Dashboard
- Check for typos or extra spaces
- Ensure it starts with `https://` and ends with `.supabase.co`

## Quick Checklist

- [ ] `.env` file exists in project root
- [ ] `VITE_SUPABASE_URL` matches Supabase Dashboard → Settings → API → Project URL
- [ ] `VITE_SUPABASE_ANON_KEY` is the `anon` `public` key (starts with `eyJ`)
- [ ] `VITE_SUPABASE_ANON_KEY` is NOT the `service_role` key
- [ ] Dev server restarted after updating `.env`
- [ ] Verification script passes: `node scripts/verify-supabase-config.js`

## After Fixing

1. **Restart your dev server**:
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

2. **Test invoice creation** - The app should now connect properly

3. **If still getting errors**, check browser console (F12) for specific error messages
