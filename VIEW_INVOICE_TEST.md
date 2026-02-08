# View Invoice (Internal) - End-to-End Test

## Test Objective
Verify that clicking "View Invoice" from the InvoiceActions dropdown correctly navigates to the ViewInvoice page and displays all invoice details properly.

## Test Steps

### 1. Navigate to Dashboard
- [ ] Open application at http://localhost:5173/
- [ ] Verify Dashboard loads successfully
- [ ] Check that invoices are displayed in the "Recent Invoices" section

### 2. Access Invoice Actions Menu
- [ ] Locate any invoice in the Recent Invoices list
- [ ] Click the three-dot menu (MoreHorizontal icon) for that invoice
- [ ] Verify the dropdown menu opens with all available actions

### 3. Click "View Invoice" Action
- [ ] Click on "View Invoice" option in the dropdown
- [ ] Verify navigation to `/ViewInvoice?id={invoice_id}`
- [ ] Verify URL contains correct invoice ID parameter

### 4. Verify Invoice Display
#### Header Section
- [ ] Company logo displays (if available)
- [ ] Company name appears correctly
- [ ] Company address is shown
- [ ] "INVOICE" heading is visible
- [ ] Invoice number displays correctly (e.g., #INV-001)

#### Billing Information
- [ ] "Billed To" section shows client name
- [ ] Client address is displayed
- [ ] Client email is shown
- [ ] "Date of Issue" shows correct creation date
- [ ] "Due Date" shows correct delivery/due date

#### Invoice Items Table
- [ ] Table headers: Service, Qty, Rate, Amount
- [ ] All line items are displayed
- [ ] Service names are shown
- [ ] Service descriptions appear (if any)
- [ ] Quantities are correct
- [ ] Unit prices are formatted with currency
- [ ] Total amounts per line are calculated correctly

#### Totals Section
- [ ] Subtotal displays correctly
- [ ] Tax amount shows (if applicable)
- [ ] Tax rate percentage displays
- [ ] Total amount is calculated correctly
- [ ] All amounts are formatted with proper currency

#### Additional Information
- [ ] Notes section appears (if notes exist)
- [ ] Banking details section shows (if banking info exists)
  - [ ] Bank name
  - [ ] Account name
  - [ ] Account number
  - [ ] Routing number (if applicable)
  - [ ] SWIFT/BIC code (if applicable)

### 5. Verify Action Bar
- [ ] "Back" button is visible and functional
- [ ] "Preview" button is available
- [ ] "Print" button is available
- [ ] "Download PDF" button is available
- [ ] "Email Client" button is available
- [ ] "Edit" button shows correct state (disabled for paid/cancelled invoices)

### 6. Verify Version History Sidebar
- [ ] Version History card displays on the right side
- [ ] Shows "No changes recorded yet" if no history
- [ ] OR displays list of history entries with:
  - [ ] Summary of each change
  - [ ] Timestamp (formatted: MMM d, yyyy h:mm a)
  - [ ] Number of changes per entry

### 7. Test Action Bar Buttons

#### Back Button
- [ ] Click "Back" button
- [ ] Verify navigation back to previous page

#### Preview Button (Re-navigate to invoice)
- [ ] Click "Preview" button
- [ ] Verify PDF preview opens in new window/tab
- [ ] Verify preview shows same invoice content

#### Print Button
- [ ] Click "Print" button
- [ ] Verify browser print dialog opens
- [ ] Verify print layout is clean (no action bar in print view)

#### Download PDF Button
- [ ] Click "Download PDF" button
- [ ] Verify PDF download initiates
- [ ] Verify downloaded PDF contains correct invoice data
- [ ] Verify filename includes invoice number

#### Email Client Button
- [ ] Click "Email Client" button
- [ ] Verify email sending process initiates
- [ ] For draft invoices: verify status changes to "sent"
- [ ] Verify toast notification appears on success/failure

#### Edit Button
- [ ] For non-locked invoices: Click "Edit" button
- [ ] Verify navigation to EditInvoice page with correct ID
- [ ] For locked invoices (paid/cancelled): verify button is disabled

### 8. Test Different Invoice Statuses
Test viewing invoices with different statuses:
- [ ] Draft invoice displays correctly
- [ ] Sent invoice displays correctly
- [ ] Viewed invoice displays correctly
- [ ] Partial Paid invoice displays correctly
- [ ] Paid invoice displays correctly (Edit button should be disabled)
- [ ] Overdue invoice displays correctly
- [ ] Cancelled invoice displays correctly (Edit button should be disabled)

### 9. Test Error Handling
- [ ] Navigate to `/ViewInvoice` without ID parameter
- [ ] Verify error message: "Invoice ID not found"
- [ ] Navigate with invalid ID: `/ViewInvoice?id=invalid-id`
- [ ] Verify error handling message appears

### 10. Test Responsive Design
- [ ] View invoice on desktop (full width)
- [ ] View invoice on tablet (medium width)
- [ ] View invoice on mobile (small width)
- [ ] Verify layout adapts properly on all screen sizes
- [ ] Verify version history sidebar stacks properly on mobile

## Expected Results

✅ **All test steps should pass successfully**

### Key Success Criteria:
1. Navigation from Dashboard → View Invoice works seamlessly
2. All invoice data displays correctly and accurately
3. All action buttons are functional
4. Currency formatting is consistent throughout
5. Date formatting is correct
6. Version history displays properly
7. Edit restrictions are enforced for locked invoices
8. Error handling works for missing/invalid invoices
9. Responsive design works on all screen sizes
10. No console errors appear during navigation and viewing

## Testing Notes

### Data Requirements:
- At least one invoice must exist in the system
- Test with invoices that have:
  - Multiple line items
  - Tax applied
  - Notes
  - Banking details
  - Version history
  - Different statuses

### Browser Compatibility:
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari

### Performance:
- [ ] Page loads within 2 seconds
- [ ] Navigation is smooth with no lag
- [ ] PDF preview/download works without delays

## Issues Found
_Document any issues discovered during testing:_

---

## Test Result: ⬜ PASS / ⬜ FAIL

**Tested By:** _________________  
**Date:** _________________  
**Browser:** _________________  
**Notes:** _________________________________________________
