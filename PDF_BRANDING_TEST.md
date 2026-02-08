# PDF & Branding Testing Guide
## Company Details & Logo Upload

This guide provides comprehensive testing instructions for PDF branding features including company details and logo upload/positioning.

---

## Overview

Professional branding is critical for perceived value. This feature ensures:
- ✅ Company logo displays prominently on all PDFs
- ✅ Company name and address appear correctly
- ✅ Logo positioning is optimized for each template
- ✅ Branding is consistent across all invoice/quote types

---

## Feature Components

### 1. Company Profile Settings
**Location:** Settings → Company Profile tab

**Fields:**
- **Company Name** (Required)
- **Company Address** (Highly Recommended)
- **Company Logo** (Professional appearance)
- **Invoice Header Message** (Optional custom message)
- **Invoice Template** (Classic, Modern, Minimal, Bold)

### 2. Logo Positioning by Template

Each template has optimized logo sizing:

| Template | Logo Height | Positioning | Background | Company Name Display |
|----------|------------|-------------|------------|---------------------|
| **Classic** | 64px | Top-left header | Transparent | Below logo (if logo exists) |
| **Modern** | 56px | Top-left in gradient | White rounded box | Below logo (purple text) |
| **Minimal** | 48px | Top-left simple | Grayscale filter | Below logo (gray text) |
| **Bold** | 64px | Top-left bold | White rounded with shadow | Below logo (white text) |

### 3. Company Address Display

| Template | Address Location | Styling |
|----------|-----------------|---------|
| **Classic** | Below logo/company name | Gray text, pre-line format |
| **Modern** | Below logo/company name | Purple-tinted text |
| **Minimal** | Below logo/company name | Small gray text |
| **Bold** | Info bar (center) | White text on teal background |

---

## Test Cases

### PART 1: Company Profile Setup

#### Test 1.1: Initial Setup Without Branding
**Steps:**
1. Navigate to Settings → Company Profile
2. Observe branding status card at top

**Expected Results:**
- ✅ Status card shows amber/orange warning
- ✅ Message: "⚠️ Complete Your Branding"
- ✅ Three badges show incomplete status (○):
  - ○ Company Name
  - ○ Address
  - ○ Logo
- ✅ Warning prompts to add branding for professional invoices

#### Test 1.2: Add Company Name Only
**Steps:**
1. Enter company name: "Acme Corp"
2. Scroll to branding status card

**Expected Results:**
- ✅ Company Name badge turns green (✓)
- ✅ Address and Logo still gray (○)
- ✅ Status card remains amber/orange
- ✅ Company name field shows green checkmark message
- ✅ Address field shows amber warning

#### Test 1.3: Add Company Address
**Steps:**
1. Enter multi-line address:
```
123 Business Street, Suite 100
Cape Town, Western Cape 8001
South Africa
```
2. Save settings

**Expected Results:**
- ✅ Company Name badge: green (✓)
- ✅ Address badge: green (✓)
- ✅ Logo badge: still gray (○)
- ✅ Status card remains amber/orange
- ✅ Address field shows green checkmark message

#### Test 1.4: Upload Company Logo
**Steps:**
1. Click "Upload Logo" button
2. Select image file (PNG recommended)
3. Wait for upload
4. Observe preview box (left side)

**Expected Results:**
- ✅ Logo appears in 128×128px preview box
- ✅ Image scales to fit container
- ✅ Button text changes to "Change Logo" or shows filename
- ✅ Logo badge turns green (✓)
- ✅ Status card turns GREEN
- ✅ Message: "✓ Professional Branding Complete!"
- ✅ Green success message appears about logo positioning
- ✅ All three badges show green checkmarks

#### Test 1.5: Logo Guidelines Display
**Steps:**
1. Review the Logo Guidelines box

**Expected Results:**
- ✅ Guidelines box visible with blue border
- ✅ Shows recommendations:
  - Square format (400×400px or larger)
  - PNG with transparent background
  - Under 2MB file size
  - Auto-scales in templates
- ✅ Each guideline has green checkmark (✓) or blue info (ℹ) icon

#### Test 1.6: Logo Positioning Information
**Steps:**
1. After uploading logo, scroll to logo section
2. Check for green positioning info box

**Expected Results:**
- ✅ Green box appears with positioning details
- ✅ Lists all template sizes:
  - Classic (64px)
  - Modern (56px)
  - Minimal (48px)
  - Bold (64px)
- ✅ Explains logo appears in top-left corner

---

### PART 2: PDF Template Testing

#### Test 2.1: Classic Template with Full Branding
**Steps:**
1. Set invoice template to "Classic"
2. Create a new invoice
3. Complete all fields
4. Preview PDF or Download PDF

**Expected Results:**
- ✅ Logo appears top-left (64px height)
- ✅ Logo has max-width constraint (no stretching)
- ✅ Company name appears below logo (if logo exists)
- ✅ Company address appears below company name
- ✅ Address has proper line breaks
- ✅ Text is readable and properly spaced
- ✅ Header section looks professional

#### Test 2.2: Modern Template with Full Branding
**Steps:**
1. Change template to "Modern"
2. Preview same invoice

**Expected Results:**
- ✅ Logo appears in gradient header (56px height)
- ✅ Logo has white rounded background
- ✅ Logo has subtle shadow
- ✅ Company name in purple-tinted text below logo
- ✅ Address in light purple text
- ✅ Gradient background (purple to indigo)
- ✅ Professional modern appearance

#### Test 2.3: Minimal Template with Full Branding
**Steps:**
1. Change template to "Minimal"
2. Preview invoice

**Expected Results:**
- ✅ Logo appears top-left (48px height, smallest)
- ✅ Logo has grayscale filter for minimal aesthetic
- ✅ Company name in small gray text below logo
- ✅ Address in extra-small gray text
- ✅ Clean, minimalist appearance
- ✅ Border at bottom of header

#### Test 2.4: Bold Template with Full Branding
**Steps:**
1. Change template to "Bold"
2. Preview invoice

**Expected Results:**
- ✅ Logo appears in teal header (64px height)
- ✅ Logo has white rounded background with shadow
- ✅ Logo has extra padding (p-3)
- ✅ Company name in white bold text below logo
- ✅ Address appears in INFO BAR (teal background)
- ✅ Address shows in center of info bar
- ✅ Bold, impactful appearance

---

### PART 3: Edge Cases & Validation

#### Test 3.1: No Logo, Only Company Name
**Steps:**
1. Remove logo (if uploaded)
2. Keep company name
3. Preview invoice in any template

**Expected Results:**
- ✅ Company name appears as large text heading (no logo)
- ✅ Classic: 2xl bold text
- ✅ Modern: 2xl bold white text
- ✅ Minimal: xl normal text
- ✅ Bold: 3xl font-black text
- ✅ No broken image or placeholder

#### Test 3.2: No Company Name, Only Logo
**Steps:**
1. Clear company name field
2. Keep logo uploaded
3. Preview invoice

**Expected Results:**
- ✅ Logo displays normally
- ✅ No company name text below logo
- ✅ Address still displays (if present)
- ✅ Fallback text ("Your Company") does NOT appear if logo exists

#### Test 3.3: Logo Upload Size Validation
**Steps:**
1. Try uploading very large image (>2MB)
2. Try uploading very small image (50×50px)
3. Try uploading non-square image (landscape/portrait)

**Expected Results:**
- ✅ Large files upload successfully (or show size warning)
- ✅ Small images upload but may appear pixelated
- ✅ Non-square images scale proportionally
- ✅ Max-width constraint prevents overflow
- ✅ Object-contain maintains aspect ratio

#### Test 3.4: Logo File Format Testing
**Steps:**
1. Upload PNG with transparent background
2. Upload JPG with white background
3. Upload SVG (if supported)

**Expected Results:**
- ✅ PNG renders cleanly (BEST OPTION)
- ✅ Transparency preserved in PNG
- ✅ JPG works but white background visible
- ✅ SVG works if supported by upload API

#### Test 3.5: Very Long Company Address
**Steps:**
1. Enter long multi-line address (10+ lines)
2. Preview invoice

**Expected Results:**
- ✅ Address displays completely
- ✅ Text wraps properly (whitespace-pre-line)
- ✅ Doesn't overflow container
- ✅ Remains readable
- ✅ Classic/Modern/Minimal: max-w-md constraint prevents overflow
- ✅ Bold: fits in info bar or wraps gracefully

#### Test 3.6: Special Characters in Company Name
**Steps:**
1. Enter company name with special chars: "Acme & Co. (Pty) Ltd™"
2. Save and preview

**Expected Results:**
- ✅ All characters display correctly
- ✅ No encoding issues
- ✅ Ampersands, parentheses, trademark symbols render

---

### PART 4: Consistency Across Document Types

#### Test 4.1: Invoice vs Quote Branding
**Steps:**
1. Create invoice with full branding
2. Preview/download PDF
3. Create quote with same settings
4. Preview/download PDF
5. Compare both documents

**Expected Results:**
- ✅ Logo appears identically in both
- ✅ Company name identical
- ✅ Address identical
- ✅ Only difference: "INVOICE" vs "QUOTE" label
- ✅ Same template styling

#### Test 4.2: Public Invoice Branding
**Steps:**
1. Generate shareable link for invoice
2. Open public invoice page
3. Check branding display

**Expected Results:**
- ✅ Logo displays on public view
- ✅ Company details show correctly
- ✅ No user-specific data exposed
- ✅ Branding matches PDF preview

---

### PART 5: Settings Page UX

#### Test 5.1: Logo Preview Box
**Steps:**
1. Before upload: observe preview box
2. After upload: observe preview box
3. Upload different logo: observe change

**Expected Results:**
- ✅ Before: Shows placeholder icon + "No logo" text
- ✅ After: Shows uploaded logo
- ✅ Logo fits within 128×128px box
- ✅ Change: New logo replaces old immediately
- ✅ Preview accurate to what appears on invoices

#### Test 5.2: Branding Status Card Interactivity
**Steps:**
1. Start with no branding
2. Add company name → observe card
3. Add address → observe card
4. Add logo → observe card
5. Remove logo → observe card

**Expected Results:**
- ✅ Card color changes: amber → amber → GREEN
- ✅ Badge states update in real-time
- ✅ Message changes from warning to success
- ✅ Removing logo reverts to amber warning

#### Test 5.3: Help Tooltips
**Steps:**
1. Hover over (?) icons next to field labels
2. Read tooltip content

**Expected Results:**
- ✅ Tooltips appear on hover
- ✅ Company Name: explains official business name
- ✅ Company Address: mentions legal compliance
- ✅ Logo: mentions transparent background recommendation
- ✅ Invoice Header: explains custom message placement

#### Test 5.4: Field Validation Messages
**Steps:**
1. Leave company name empty → observe warning
2. Fill company name → observe success message
3. Leave address empty → observe warning
4. Fill address → observe success message

**Expected Results:**
- ✅ Empty company name: amber warning about requirement
- ✅ Filled company name: green message about PDF placement
- ✅ Empty address: amber warning about credibility
- ✅ Filled address: green message about professional presentation

---

### PART 6: Multi-Device & Print Testing

#### Test 6.1: Mobile Preview (Settings Page)
**Steps:**
1. Open Settings on mobile device (or resize browser to <640px)
2. Navigate to Company Profile
3. Try uploading logo
4. Review layout

**Expected Results:**
- ✅ Branding status card stacks vertically
- ✅ Logo preview and upload button stack on mobile
- ✅ Guidelines box remains readable
- ✅ Upload button full-width on mobile
- ✅ All text readable

#### Test 6.2: PDF Print Quality
**Steps:**
1. Preview PDF with full branding
2. Click "Download PDF" (triggers print dialog)
3. Preview print output
4. Check logo quality

**Expected Results:**
- ✅ Logo renders at high quality
- ✅ No pixelation (unless source image was low-res)
- ✅ Company name and address crisp
- ✅ Layout fits A4 page (0.5in margins)
- ✅ No content cut off

---

## Visual Verification Checklist

### Settings Page
- [ ] Branding status card displays at top
- [ ] Status card changes color (amber → green)
- [ ] Three badges show completion status
- [ ] Logo preview box shows uploaded image
- [ ] Logo guidelines box visible with recommendations
- [ ] Logo positioning info appears after upload
- [ ] Company name has validation messages
- [ ] Address has validation messages
- [ ] Upload button changes text after upload
- [ ] All help tooltips functional

### PDF Templates - All Templates
- [ ] Logo appears in correct position
- [ ] Logo size appropriate for template
- [ ] Company name visible (especially with logo)
- [ ] Address visible and formatted correctly
- [ ] No layout issues or overlapping
- [ ] Professional appearance maintained

### PDF Templates - Specific
**Classic:**
- [ ] Logo: 64px height, transparent background
- [ ] Company name below logo in gray
- [ ] Address below name with line breaks

**Modern:**
- [ ] Logo: 56px, white rounded background, shadow
- [ ] Purple gradient header
- [ ] Company name in purple text
- [ ] Address in light purple

**Minimal:**
- [ ] Logo: 48px, grayscale filter
- [ ] Minimalist aesthetic maintained
- [ ] Small text sizes
- [ ] Clean border separator

**Bold:**
- [ ] Logo: 64px, white background with shadow
- [ ] Teal header background
- [ ] Company name in white bold text
- [ ] Address in teal info bar

---

## Code Verification

### Settings Page Enhancements
```bash
# Verify enhanced logo upload section
grep -A 20 "Company Logo (Branding)" src/pages/Settings.jsx

# Verify branding status card
grep -A 15 "Branding Status Card" src/pages/Settings.jsx

# Verify company name/address validation
grep -A 10 "Company Name (Required" src/pages/Settings.jsx
```

### Template Improvements
```bash
# Classic template logo
grep -A 10 "user?.logo_url" src/components/invoice/templates/ClassicTemplate.jsx

# Modern template logo
grep -A 10 "user?.logo_url" src/components/invoice/templates/ModernTemplate.jsx

# Minimal template logo
grep -A 10 "user?.logo_url" src/components/invoice/templates/MinimalTemplate.jsx

# Bold template logo
grep -A 10 "user?.logo_url" src/components/invoice/templates/BoldTemplate.jsx
```

---

## Common Issues & Solutions

### Issue 1: Logo Not Appearing
**Symptoms:** Logo uploaded but doesn't show on PDF
**Causes:**
- Upload failed silently
- Image URL broken
- Template not refreshed

**Solutions:**
1. Check browser console for errors
2. Verify logo_url in User data (breakApi)
3. Hard refresh PDF preview (Ctrl+Shift+R)
4. Re-upload logo

### Issue 2: Logo Too Large/Small
**Symptoms:** Logo appears pixelated or cropped
**Causes:**
- Source image too small
- Source image too large
- Aspect ratio issues

**Solutions:**
1. Use high-res image (400×400px minimum)
2. Ensure square or near-square aspect ratio
3. Export from design tool at 2x resolution
4. Use PNG for best quality

### Issue 3: Company Name Not Showing
**Symptoms:** Only logo visible, no company name
**Causes:**
- Expected behavior when logo exists
- Company name field empty

**Solutions:**
1. This is correct behavior – templates now show both
2. Verify company_name field has value
3. Check template code for conditional rendering

### Issue 4: Address Not Formatting
**Symptoms:** Address on single line or weird spacing
**Causes:**
- Missing line breaks in input
- CSS whitespace issue

**Solutions:**
1. Use Enter/Return key to add line breaks in textarea
2. Verify whitespace-pre-line CSS class
3. Check template address section

### Issue 5: Branding Status Card Not Updating
**Symptoms:** Status remains amber after adding all fields
**Causes:**
- Form data not saved
- Page needs refresh
- Validation logic issue

**Solutions:**
1. Click "Save Changes" button
2. Wait for success toast
3. Refresh page to verify persistence
4. Check isBrandingComplete logic

---

## Testing Workflow

### Quick Test (5 minutes)
1. ✅ Upload logo in Settings
2. ✅ Add company name
3. ✅ Add address
4. ✅ Verify branding status card turns green
5. ✅ Preview invoice PDF
6. ✅ Verify logo appears correctly

### Full Test (15 minutes)
1. ✅ Test all 4 template styles
2. ✅ Test with/without logo
3. ✅ Test with/without company name
4. ✅ Test edge cases (long address, special chars)
5. ✅ Test print quality
6. ✅ Test public invoice view

### Comprehensive Test (30 minutes)
1. ✅ Complete all test cases in this document
2. ✅ Test on mobile device
3. ✅ Test all PDF download/print scenarios
4. ✅ Verify consistency across invoice/quote
5. ✅ Test with different logo formats
6. ✅ Validate all UI feedback messages

---

## Acceptance Criteria

### Must Have ✅
- [x] Logo uploads successfully
- [x] Logo appears on all PDF templates
- [x] Company name displays correctly
- [x] Address displays with proper formatting
- [x] Branding status card shows completion
- [x] Guidelines and help tooltips present
- [x] All 4 templates optimized

### Should Have ✅
- [x] Logo positioning info displayed
- [x] Validation messages for fields
- [x] Preview box shows logo
- [x] Max-width constraints prevent overflow
- [x] Company name shows even with logo

### Nice to Have ⏭️
- [ ] Live preview of invoice with current settings
- [ ] Logo cropping tool
- [ ] Multiple logo upload (light/dark versions)
- [ ] Brand color customization

---

## Performance Metrics

### Logo Upload
- **Upload time:** < 3 seconds for 1MB file
- **Preview update:** Instant
- **Save time:** < 2 seconds

### PDF Generation
- **With logo:** < 1 second additional time
- **Logo render quality:** No visible degradation
- **File size impact:** +50-200KB depending on logo

---

## Status

✅ **Company Profile Settings** - Enhanced with guidelines and validation  
✅ **Logo Upload** - Optimized with preview and positioning info  
✅ **PDF Templates** - All 4 templates optimized for branding  
✅ **Logo Positioning** - Documented and optimized per template  
✅ **Company Details** - Validation and help messages added  
✅ **Branding Status** - Visual card shows completion progress

---

## Next Steps for Users

1. **Complete Branding:**
   - Upload company logo (PNG with transparent background)
   - Add official company name
   - Add complete business address

2. **Choose Template:**
   - Preview all 4 templates
   - Select one that matches brand aesthetic
   - Classic (traditional), Modern (gradient), Minimal (clean), Bold (impactful)

3. **Test Invoice:**
   - Create sample invoice
   - Preview PDF
   - Verify branding appears correctly
   - Download and check print quality

4. **Customize (Optional):**
   - Add invoice header message
   - Update currency default
   - Configure payment methods

---

## Documentation Links

- **Settings Guide:** See [Settings.jsx](src/pages/Settings.jsx) for UI implementation
- **Template Code:** See [templates/](src/components/invoice/templates/) for PDF layouts
- **User Entity:** Check User model for branding fields
- **Upload API:** See `UploadFile` integration for logo upload

---

**Last Updated:** February 2, 2026  
**Version:** 1.0  
**Tested:** All major browsers, mobile responsive
