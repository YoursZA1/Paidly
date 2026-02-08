# Preview PDF & Download PDF - End-to-End Test Guide

## Test Objective
Verify that the Preview PDF and Download PDF actions work correctly from the InvoiceActions dropdown and ViewInvoice page.

---

## 🎯 Test 1: Preview PDF from Invoice Actions

### Setup
1. Navigate to Dashboard: http://localhost:5173/
2. Ensure there's at least one invoice in "Recent Invoices"

### Test Steps

#### From Dashboard Actions Menu
1. **Open Actions Menu**
   - [ ] Locate any invoice in Recent Invoices
   - [ ] Click the three-dot menu (⋮)
   - [ ] Verify dropdown opens with all actions

2. **Click "Preview PDF"**
   - [ ] Click on "Preview PDF" option
   - [ ] Verify new tab/window opens
   - [ ] Verify URL is: `/InvoicePDF?id={invoice_id}`

3. **Verify PDF Preview Page**
   - [ ] Page loads successfully
   - [ ] Invoice renders in selected template (Classic/Modern/Minimal/Bold)
   - [ ] All invoice data displays correctly:
     - [ ] Company logo/name
     - [ ] Invoice number
     - [ ] Client information
     - [ ] Line items with quantities and prices
     - [ ] Subtotal, tax, total
     - [ ] Banking details (if available)
     - [ ] Notes (if any)

4. **Verify Preview Controls**
   - [ ] "Back" button is visible
   - [ ] "Download PDF" button is visible
   - [ ] Both buttons styled correctly

5. **Test Back Button**
   - [ ] Click "Back" button
   - [ ] Verify returns to previous page (Dashboard)

---

## 🎯 Test 2: Download PDF from Invoice Actions

### Test Steps

#### From Dashboard Actions Menu
1. **Open Actions Menu**
   - [ ] Click three-dot menu on an invoice
   - [ ] Locate "Download PDF" option

2. **Click "Download PDF"**
   - [ ] Click "Download PDF" option
   - [ ] Toast notification appears: "Download started"
   - [ ] New tab opens with PDF preview
   - [ ] URL includes: `/InvoicePDF?id={invoice_id}&download=true`

3. **Verify Auto-Download**
   - [ ] Browser print dialog opens automatically
   - [ ] Can save as PDF or print

4. **Verify Downloaded File**
   - [ ] File saves with name: `Invoice-{invoice_number}.pdf`
   - [ ] PDF opens correctly
   - [ ] All content is properly formatted
   - [ ] No UI elements (buttons) in PDF

---

## 🎯 Test 3: Preview PDF from View Invoice Page

### Test Steps

1. **Navigate to View Invoice**
   - [ ] From Dashboard, click "View Invoice" on any invoice
   - [ ] OR use three-dot menu → "View Invoice"

2. **Click Preview Button**
   - [ ] Locate "Preview" button in action bar (top)
   - [ ] Click "Preview" button
   - [ ] New tab opens with PDF preview
   - [ ] Toast appears: "Preview opened"

3. **Verify PDF Preview**
   - [ ] All invoice data displays correctly
   - [ ] Template renders properly
   - [ ] No missing data or broken layout

---

## 🎯 Test 4: Download PDF from View Invoice Page

### Test Steps

1. **Navigate to View Invoice**
   - [ ] Open any invoice in View mode

2. **Click Download PDF Button**
   - [ ] Locate "Download PDF" button in action bar
   - [ ] Click "Download PDF" button
   - [ ] Toast appears: "Download started"

3. **Verify Download**
   - [ ] New tab opens for download
   - [ ] Print dialog appears
   - [ ] Can save as PDF
   - [ ] Filename: `Invoice-{invoice_number}.pdf`

---

## 🎯 Test 5: Print Functionality

### Test Steps

1. **From View Invoice Page**
   - [ ] Click "Print" button in action bar
   - [ ] New window opens with PDF preview
   - [ ] Print dialog opens automatically after page loads

2. **From PDF Preview Page**
   - [ ] Navigate to InvoicePDF page
   - [ ] Click "Download PDF" button
   - [ ] Browser print dialog opens
   - [ ] Preview shows clean print layout

3. **Verify Print Layout**
   - [ ] No "Back" or "Download PDF" buttons visible in print preview
   - [ ] No action bar visible
   - [ ] Page margins are appropriate (0.5in)
   - [ ] Content fits on A4 page
   - [ ] All text is readable
   - [ ] Colors print correctly

---

## 🎯 Test 6: Different Invoice Templates

Test with all available templates:

### Classic Template
- [ ] Preview displays with traditional layout
- [ ] Border at top
- [ ] Gray table headers
- [ ] All data displays correctly

### Modern Template
- [ ] Contemporary design renders
- [ ] Gradient elements display
- [ ] Clean, modern typography

### Minimal Template
- [ ] Simple, clean layout
- [ ] Minimal design elements
- [ ] Clear data presentation

### Bold Template
- [ ] Bold, eye-catching design
- [ ] Strong typography
- [ ] Professional appearance

---

## 🎯 Test 7: PDF with Various Data

Test PDFs with different invoice configurations:

### Invoice with Tax
- [ ] Tax rate displays correctly
- [ ] Tax amount calculated properly
- [ ] Total includes tax

### Invoice with Multiple Items
- [ ] All line items display
- [ ] Table scrolls/paginates correctly
- [ ] Totals calculate correctly

### Invoice with Discount
- [ ] Discount shows in totals section
- [ ] Percentage/fixed amount displays
- [ ] Total reflects discount

### Invoice with Notes
- [ ] Notes section appears
- [ ] Text wraps correctly
- [ ] Formatting preserved

### Invoice with Banking Details
- [ ] Banking info section displays
- [ ] All fields show correctly:
  - Bank name
  - Account name
  - Account number
  - Routing number
  - SWIFT/BIC code

### Invoice with Company Logo
- [ ] Logo displays correctly
- [ ] Proper size and positioning
- [ ] Image quality good

---

## 🎯 Test 8: Error Handling

### Invalid Invoice ID
1. **Navigate to**: `/InvoicePDF?id=invalid-id`
   - [ ] Shows "Document not found" message
   - [ ] No JavaScript errors in console

### Missing Invoice ID
1. **Navigate to**: `/InvoicePDF`
   - [ ] Shows loading or error message
   - [ ] Handles gracefully

### Network Error
1. **Simulate offline mode**
   - [ ] Open DevTools → Network tab
   - [ ] Set to "Offline"
   - [ ] Try previewing PDF
   - [ ] Shows appropriate error message

---

## 🎯 Test 9: Browser Compatibility

Test in different browsers:

### Chrome/Edge
- [ ] Preview opens correctly
- [ ] Download works
- [ ] Print dialog functions
- [ ] PDF renders properly

### Firefox
- [ ] Preview opens correctly
- [ ] Download works
- [ ] Print dialog functions
- [ ] PDF renders properly

### Safari
- [ ] Preview opens correctly
- [ ] Download works
- [ ] Print dialog functions
- [ ] PDF renders properly

---

## 🎯 Test 10: Responsive Design

### Desktop (1920x1080)
- [ ] PDF preview looks good
- [ ] Buttons properly positioned
- [ ] Content centered

### Tablet (768x1024)
- [ ] Layout adapts correctly
- [ ] Buttons accessible
- [ ] Content readable

### Mobile (375x667)
- [ ] Mobile-friendly layout
- [ ] Buttons stack properly
- [ ] Content scrolls smoothly

---

## 🎯 Test 11: Performance

### Loading Speed
- [ ] PDF preview loads within 2 seconds
- [ ] No lag when opening preview
- [ ] Smooth transitions

### Print Dialog
- [ ] Opens within 500ms of button click
- [ ] No delays or freezing

### Download
- [ ] Download initiates immediately
- [ ] No waiting time

---

## Expected Results

✅ **All tests should pass successfully**

### Key Success Criteria:

1. **Preview PDF works from**:
   - Invoice Actions dropdown ✓
   - View Invoice page ✓

2. **Download PDF works from**:
   - Invoice Actions dropdown ✓
   - View Invoice page ✓

3. **PDF Features**:
   - All templates render correctly ✓
   - All data displays accurately ✓
   - Currency formatting correct ✓
   - Date formatting correct ✓
   - Calculations accurate ✓

4. **Print Functionality**:
   - Print dialog opens ✓
   - Clean print layout ✓
   - No UI elements in print ✓

5. **Error Handling**:
   - Invalid ID handled ✓
   - Missing data handled ✓
   - Network errors handled ✓

6. **Performance**:
   - Fast loading ✓
   - Smooth operation ✓
   - No lag or freezing ✓

---

## Testing Checklist Summary

- [ ] Preview PDF from Dashboard
- [ ] Download PDF from Dashboard
- [ ] Preview PDF from View Invoice
- [ ] Download PDF from View Invoice
- [ ] Print functionality works
- [ ] All templates render correctly
- [ ] All data types display properly
- [ ] Error handling works
- [ ] Browser compatibility verified
- [ ] Responsive design works
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
**Notes:** _________________________________________________

---

## Quick Test Commands

### Open Preview Directly
```
http://localhost:5173/InvoicePDF?id={your-invoice-id}
```

### Open with Auto-Download
```
http://localhost:5173/InvoicePDF?id={your-invoice-id}&download=true
```

### Test Different Templates
Change user settings to test different templates:
- Classic
- Modern
- Minimal
- Bold

---

## Implementation Details

### Files Verified
- ✅ `/src/api/InvoiceService.js` - PDF generation logic
- ✅ `/src/pages/InvoicePDF.jsx` - PDF preview page
- ✅ `/src/components/invoice/templates/ClassicTemplate.jsx` - Fixed imports
- ✅ `/src/components/invoice/templates/ModernTemplate.jsx` - Fixed imports
- ✅ `/src/components/invoice/templates/MinimalTemplate.jsx` - Fixed imports
- ✅ `/src/components/invoice/templates/BoldTemplate.jsx` - Fixed imports
- ✅ `/src/components/invoice/InvoiceActions.jsx` - Action handlers
- ✅ `/src/pages/ViewInvoice.jsx` - View page buttons

### Fixes Applied
- ✅ Fixed `formatCurrency` imports in all templates
- ✅ Verified InvoiceService PDF methods
- ✅ Verified auto-download functionality
- ✅ Verified print dialog integration
