# Email to Client & Get Shareable Link - End-to-End Test Guide

## Test Objective
Verify that the "Email to Client" and "Get Share Link" actions work correctly from the InvoiceActions dropdown and ViewInvoice page.

---

## 🎯 Test 1: Get Shareable Link

### Setup
1. Navigate to Dashboard: http://localhost:5173/
2. Ensure there's at least one invoice in "Recent Invoices"

### Test Steps - Get Share Link from Dashboard

1. **Open Actions Menu**
   - [ ] Locate any invoice in Recent Invoices
   - [ ] Click the three-dot menu (⋮)
   - [ ] Verify dropdown opens

2. **Click "Get Share Link"**
   - [ ] Click on "Get Share Link" option
   - [ ] Toast notification: "Share link generated"
   - [ ] ManualShareModal opens

3. **Verify Share Modal**
   - [ ] Modal title: "Share Invoice"
   - [ ] Public link displays in read-only input field
   - [ ] Link format: `http://localhost:5173/PublicInvoice?token={token}`
   - [ ] "Copy" button visible
   - [ ] "Or Send via Email" section visible

4. **Test Copy Link**
   - [ ] Click "Copy" button
   - [ ] Button text changes to "Copied!"
   - [ ] Link copied to clipboard
   - [ ] Paste link in new tab - verify it works
   - [ ] Public invoice page opens
   - [ ] Invoice displays correctly without login

5. **Test Email from Share Modal**
   - [ ] Fill in "Recipient Email" field
   - [ ] Fill in "Subject" field
   - [ ] Add optional personal message
   - [ ] Click "Send Email" button
   - [ ] Button shows "Sending..." state
   - [ ] Alert: "Email sent successfully!"
   - [ ] Modal closes
   - [ ] Invoice status updates to "sent" (if was draft)

6. **Close Modal**
   - [ ] Click "Cancel" button
   - [ ] Modal closes without changes

---

## 🎯 Test 2: Email to Client (with Preview)

### Test Steps - Email from Dashboard

1. **Open Actions Menu**
   - [ ] Click three-dot menu on an invoice
   - [ ] Locate "Email to Client" option

2. **Click "Email to Client"**
   - [ ] Click "Email to Client" option
   - [ ] EmailPreviewModal opens
   - [ ] Modal loads data (shows spinner if slow)

3. **Verify Email Preview Modal**
   - [ ] Modal title: "Email & PDF Preview"
   - [ ] Shows recipient: "To: {client.email}"
   - [ ] Shows subject: "Subject: Invoice {number} from {company}"
   - [ ] Badge shows: "🔗 Download Link Included"
   - [ ] Two tabs visible: "Email Preview" and "PDF Preview"

4. **Test Email Preview Tab**
   - [ ] "Email Preview" tab is active by default
   - [ ] Email content displays in preview pane
   - [ ] Shows company name and invoice number
   - [ ] Shows invoice summary with:
     - Invoice number
     - Project title
     - Amount due (formatted currency)
     - Due date
   - [ ] Shows "View & Download Invoice" button (purple gradient)
   - [ ] Proper HTML formatting
   - [ ] Professional appearance

5. **Test PDF Preview Tab**
   - [ ] Click "PDF Preview" tab
   - [ ] PDF content displays
   - [ ] Shows invoice layout with:
     - Company header
     - Invoice number
     - Bill To section (client details)
     - Invoice details section
     - Project description (if any)
     - Line items table with proper formatting
     - Subtotal, tax, total calculations
     - Banking information (if configured)
     - Notes section (if any)
     - Footer message
   - [ ] All data properly formatted
   - [ ] Currency displays correctly

6. **Send Email**
   - [ ] Click "Send Email with Download Link" button
   - [ ] Button shows "Sending..." state
   - [ ] Toast notification appears
   - [ ] Modal closes on success
   - [ ] Invoice status updates to "sent" (if was draft)

7. **Cancel Email**
   - [ ] Click "Cancel" button
   - [ ] Modal closes without sending

---

## 🎯 Test 3: Email from View Invoice Page

### Test Steps

1. **Navigate to View Invoice**
   - [ ] Open any invoice in View mode
   - [ ] Action bar visible at top

2. **Click "Email Client" Button**
   - [ ] Click "Email Client" button in action bar
   - [ ] EmailPreviewModal opens (same as Test 2)
   - [ ] All preview functionality works

3. **Verify Email Sending**
   - [ ] Send email
   - [ ] Toast: "Email sent successfully"
   - [ ] Message: "Invoice sent to {email}"
   - [ ] Status updates if draft

---

## 🎯 Test 4: Public Invoice View (from Share Link)

### Test Steps

1. **Get Public Link**
   - [ ] Use "Get Share Link" to get public URL
   - [ ] Copy the link

2. **Open in New Browser/Incognito**
   - [ ] Open link in incognito/private window
   - [ ] PublicInvoice page loads
   - [ ] No login required

3. **Verify Public Invoice Display**
   - [ ] Company logo/name displays
   - [ ] Invoice number visible
   - [ ] Client information shown
   - [ ] All line items display
   - [ ] Totals calculate correctly
   - [ ] Banking details visible (if configured)
   - [ ] Notes display (if any)

4. **Test Download from Public Page**
   - [ ] "Download PDF" button visible
   - [ ] Click download button
   - [ ] PDF downloads successfully
   - [ ] PDF contains all invoice data

---

## 🎯 Test 5: Share Token Generation

### Test Steps

1. **First Share (No Token)**
   - [ ] Select invoice without public_share_token
   - [ ] Click "Get Share Link"
   - [ ] System generates new UUID token
   - [ ] Token saved to invoice
   - [ ] Share URL includes token

2. **Subsequent Shares (Existing Token)**
   - [ ] Click "Get Share Link" again on same invoice
   - [ ] Uses existing token
   - [ ] Same share URL as before
   - [ ] No new token generated

---

## 🎯 Test 6: Email Content Verification

### Verify Email HTML Contains:

**Header Section:**
- [ ] Purple gradient banner
- [ ] Company name
- [ ] Invoice number

**Invoice Summary Box:**
- [ ] Invoice number
- [ ] Project title
- [ ] Amount due (formatted)
- [ ] Due date

**Call to Action:**
- [ ] "View & Download Invoice" button
- [ ] Button links to public URL
- [ ] Button has proper styling

**Additional Info:**
- [ ] Professional messaging
- [ ] Company name in footer
- [ ] "Automated message" disclaimer

---

## 🎯 Test 7: Different Invoice Scenarios

### Test with Different Invoice Types:

**Draft Invoice:**
- [ ] Share link works
- [ ] Email sends
- [ ] Status changes to "sent" after email
- [ ] Share modal offers to mark as sent

**Sent Invoice:**
- [ ] Share link works
- [ ] Email sends
- [ ] Status remains "sent"
- [ ] No status change

**Paid Invoice:**
- [ ] Share link works
- [ ] Email sends
- [ ] Status remains "paid"
- [ ] All features functional

**Invoice with Tax:**
- [ ] Email preview shows tax
- [ ] PDF preview shows tax calculation
- [ ] Public view shows tax

**Invoice with Discount:**
- [ ] Shows in email preview
- [ ] Shows in PDF preview
- [ ] Public view displays correctly

**Invoice with Notes:**
- [ ] Notes appear in email preview
- [ ] Notes in PDF preview
- [ ] Notes on public page

**Invoice with Banking Details:**
- [ ] Banking info in email preview
- [ ] Banking info in PDF preview
- [ ] Banking info on public page

---

## 🎯 Test 8: Error Handling

### Missing Data Scenarios:

**No Client Email:**
- [ ] Shows warning or uses placeholder
- [ ] Can still generate share link
- [ ] Email to client option handles gracefully

**No Company Info:**
- [ ] Uses defaults: "Your Company"
- [ ] Email preview still renders
- [ ] Share link still works

**No Banking Details:**
- [ ] Email preview loads without error
- [ ] Banking section hidden
- [ ] Other content displays normally

**Network Error:**
- [ ] Email send failure shows error
- [ ] Alert: "Failed to send email"
- [ ] Modal stays open
- [ ] Can retry

---

## 🎯 Test 9: Mark as Sent Feature

### Test Steps

1. **Share Draft Invoice**
   - [ ] Open share modal for draft invoice
   - [ ] Fill in email recipient
   - [ ] Send email from share modal
   - [ ] Prompt to mark as sent appears
   - [ ] Click to mark as sent
   - [ ] Invoice status updates to "sent"
   - [ ] sent_to_email field populated

2. **Verify History**
   - [ ] View invoice history
   - [ ] Entry for "marked as sent"
   - [ ] Shows email address
   - [ ] Timestamp recorded

---

## 🎯 Test 10: Browser & Device Testing

### Desktop Browsers:

**Chrome/Edge:**
- [ ] Email preview renders correctly
- [ ] Share modal works
- [ ] Copy to clipboard works
- [ ] Email sends successfully

**Firefox:**
- [ ] All features work
- [ ] No rendering issues
- [ ] Clipboard access works

**Safari:**
- [ ] Email preview displays
- [ ] Share functionality works
- [ ] No compatibility issues

### Mobile Devices:

**Responsive Design:**
- [ ] Share modal adapts to small screens
- [ ] Email preview readable on mobile
- [ ] Copy button accessible
- [ ] Email form usable

---

## 🎯 Test 11: Performance

### Loading Times:

**Share Modal:**
- [ ] Opens instantly (< 500ms)
- [ ] Link generates quickly
- [ ] No lag

**Email Preview:**
- [ ] Loads within 2 seconds
- [ ] Shows spinner if slow
- [ ] No freezing

**Email Sending:**
- [ ] Sends within 5 seconds
- [ ] Shows progress indicator
- [ ] Success feedback quick

---

## Expected Results

✅ **All tests should pass successfully**

### Key Success Criteria:

**Share Link Functionality:**
1. ✓ Generates unique token for each invoice
2. ✓ Reuses existing token if present
3. ✓ Copy to clipboard works
4. ✓ Public link accessible without login
5. ✓ Public page displays invoice correctly

**Email to Client:**
1. ✓ Email preview loads with all data
2. ✓ PDF preview shows invoice layout
3. ✓ Email sends successfully
4. ✓ Client receives email with link
5. ✓ Download link works in email
6. ✓ Status updates appropriately

**Mark as Sent:**
1. ✓ Updates invoice status
2. ✓ Records email address
3. ✓ Adds to version history

**Error Handling:**
1. ✓ Missing data handled gracefully
2. ✓ Network errors show appropriate messages
3. ✓ Validation prevents incomplete sends

**User Experience:**
1. ✓ Clear feedback (toasts, alerts)
2. ✓ Professional email design
3. ✓ Easy to use modals
4. ✓ Responsive design

---

## Testing Checklist Summary

- [ ] Get share link from Dashboard
- [ ] Get share link from View Invoice
- [ ] Copy link to clipboard
- [ ] Open public link (verify works)
- [ ] Email from share modal
- [ ] Email to client (with preview)
- [ ] Email preview tab displays correctly
- [ ] PDF preview tab displays correctly
- [ ] Send email successfully
- [ ] Mark as sent functionality
- [ ] Version history updates
- [ ] Test with different invoice statuses
- [ ] Test with various invoice data
- [ ] Error handling works
- [ ] Browser compatibility verified
- [ ] Mobile responsive design works
- [ ] Performance is acceptable

---

## Issues Found

_Document any issues discovered during testing:_

1. ___________________________________________________
2. ___________________________________________________
3. ___________________________________________________

---

## Test Result: ⬜ PASS / ⬜ FAIL

**Tested By:** _________________  
**Date:** _________________  
**Browser(s):** _________________  
**Email Service:** _________________  
**Notes:** _________________________________________________

---

## Implementation Details

### Files Verified
- ✅ `/src/components/invoice/InvoiceActions.jsx` - Action handlers
- ✅ `/src/components/invoice/EmailPreviewModal.jsx` - Email preview (fixed imports)
- ✅ `/src/components/shared/ManualShareModal.jsx` - Share link modal (fixed imports)
- ✅ `/src/pages/PublicInvoice.jsx` - Public invoice view
- ✅ `/src/api/InvoiceService.js` - Email generation

### Fixes Applied
- ✅ Fixed `formatCurrency` import in EmailPreviewModal
- ✅ Fixed `SendEmail` import in ManualShareModal
- ✅ Updated to use `breakApi.integrations.Core.SendEmail`
- ✅ Verified token generation logic
- ✅ Verified mark as sent functionality

---

## Quick Test Commands

### Get Invoice ID
```javascript
// In browser console on Dashboard
document.querySelectorAll('[data-invoice-id]')[0]?.dataset.invoiceId
```

### Test Share URL Format
```
http://localhost:5173/PublicInvoice?token={generated-token}
```

### Verify Token in Database
Check invoice record for `public_share_token` field

---

## Common Issues & Solutions

### Issue: Copy button doesn't work
**Solution:** Check browser clipboard permissions

### Issue: Email preview not loading
**Solution:** Verify company/user data exists

### Issue: Public link shows 404
**Solution:** Verify token is saved to invoice

### Issue: Email not sending
**Solution:** Check email integration configuration

### Issue: Status not updating
**Solution:** Verify version_history and onActionSuccess callback
