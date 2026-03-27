# Paidly production domain and emails

## Production

- **Website:** https://www.paidly.co.za  
- **Sales / general:** support@paidly.co.za
- **Accounts / billing:** support@paidly.co.za
- **Support:** support@paidly.co.za  

## Where these are used

- **Default “from” for transactional emails (Resend — invoices, quotes, PDFs):** `Paidly <invoices@paidly.co.za>`
  Override with env `RESEND_FROM` if needed.
- **System settings defaults:**  
  - Admin email: support@paidly.co.za
  - Support email: support@paidly.co.za  
- **Supabase Auth:**  
  Set **Site URL** to `https://www.paidly.co.za` and add **Redirect URLs** (e.g. `https://www.paidly.co.za/**`) in Authentication → URL Configuration.
- **Vercel:**  
  Add custom domain `www.paidly.co.za` (and optionally `paidly.co.za` with redirect) in Project → Settings → Domains.
- **Resend:**  
  Verify domain `paidly.co.za` so sending from `invoices@paidly.co.za` (and other addresses you use) is allowed.
