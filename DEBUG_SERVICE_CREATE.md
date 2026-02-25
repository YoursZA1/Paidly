# Debug Service/Product Creation Error

## Steps to Debug

1. **Open Browser Console** (F12)
2. **Try to create a service/product**
3. **Check console for:**
   - "Submitting service data:" - Shows what's being sent
   - "Creating Service:" - Shows what EntityManager receives
   - Error messages with details

## Common Issues

### Issue 1: Missing Required Fields

**Error:** "null value in column X violates not-null constraint"

**Fix:** Ensure these fields are filled:
- ✅ Name (required)
- ✅ Item Type (required - select from dropdown)
- ✅ Default Unit (required - select from dropdown)
- ✅ Default Rate (required - enter number, can be 0)

### Issue 2: Empty default_unit

**Error:** "null value in column default_unit"

**Fix:** The form now defaults to 'unit' if empty, but make sure:
- Select a unit from the dropdown
- Or it will default to 'unit'

### Issue 3: Invalid default_rate

**Error:** "invalid input syntax for type numeric"

**Fix:** 
- Enter a valid number (e.g., 0, 10, 99.99)
- Can be 0 or greater
- No text or special characters

### Issue 4: No Organization

**Error:** "No organization found for user"

**Fix:** Run this SQL in Supabase:

```sql
-- Check membership
SELECT m.*, o.name as org_name
FROM public.memberships m
JOIN public.organizations o ON o.id = m.org_id
WHERE m.user_id = auth.uid();

-- If missing, create:
INSERT INTO public.memberships (org_id, user_id, role)
SELECT o.id, auth.uid(), 'owner'
FROM public.organizations o
WHERE o.owner_id = auth.uid()
LIMIT 1
ON CONFLICT (org_id, user_id) DO NOTHING;
```

### Issue 5: Database Schema Mismatch

**Error:** "column X does not exist"

**Fix:** Run the migration SQL:
- Open `supabase/schema.postgres.sql`
- Copy entire file
- Run in Supabase SQL Editor

## What to Check

1. **Form Validation:**
   - Name field has text
   - Item Type is selected
   - Default Unit is selected
   - Default Rate is a number >= 0

2. **Browser Console:**
   - Look for "Submitting service data:" log
   - Check the data object
   - Look for error messages

3. **Network Tab:**
   - Check the actual API request
   - See the response error

4. **Supabase Logs:**
   - Check Supabase dashboard → Logs
   - See database errors

## Quick Test

Try creating a minimal service:

1. Name: "Test Service"
2. Item Type: "Service"
3. Default Unit: "hour"
4. Default Rate: "100"
5. Click "Create Item"

If this works, the issue is with specific field values.
If this fails, check the console error message.
