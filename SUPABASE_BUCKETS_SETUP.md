# Supabase Buckets Setup for Client Activities

To ensure clean data recovery and separation of concerns, create the following Supabase Storage buckets for your SaaS platform:

## Recommended Buckets

- `profile-logos` — User profile and company logos
- `invoices` — All invoice PDFs and related files
- `customers` — Customer-related documents (attachments, KYC, etc.)
- `products-services` — Product/service images, catalogs, or docs
- `quotes` — Quote PDFs and attachments
- `payroll` — Payroll documents (payslips, reports)
- `bank-details` — Bank verification docs, statements
- `activities` — General activity logs, exports, or audit files

## How to Create Buckets
1. Go to your Supabase dashboard → Storage → Create bucket
2. Enter the bucket name (e.g., `invoices`)
3. Set public/private as needed (most should be private except logos)
4. Repeat for each bucket above

## Security
- Enable Row Level Security (RLS) for all buckets
- Add policies to allow only authenticated users (or owners) to upload/download
- For public assets (like logos), allow public read

## Example Policy (Authenticated Upload)
```sql
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
```

## Example Policy (Public Read)
```sql
CREATE POLICY "Allow public read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'profile-logos');
```

## Recovery
- Each bucket stores only one type of data for easy backup and restore
- Download/export bucket contents from Supabase dashboard for recovery

---

**After creating these buckets and policies, update your app to use the correct bucket for each activity.**
