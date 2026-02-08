# Account Creation & Excel Data Persistence

## Overview

You can now create user accounts directly in the application, and all account data is automatically saved to Excel format for easy backup, sharing, and data management.

## Features

### 1. **Create Account Dialog**
- Access via the **"Create Account"** button in the Quick Actions panel (Admin Dashboard)
- Fill in user details:
  - **Email** (required) - Must be unique and valid
  - **Full Name** (required) - User's complete name
  - **Display Name** (optional) - Short name for UI display
  - **Phone** (optional) - Contact number
  - **Company Name** (optional) - User's company
  - **Company Address** (optional) - Company location
  - **Role** - Select between "user" or "admin"
  - **Plan** - Choose from "free", "basic", "premium", or "enterprise"
  - **Currency** - Default is ZAR, also supports USD, EUR, GBP
  - **Timezone** - Set user's timezone (UTC, EST, PST, SAST, etc.)

### 2. **Excel Data Persistence**
All created accounts are automatically saved to browser localStorage in a format that can be exported to Excel.

**Exported Fields:**
- `id` - Unique user identifier
- `email` - User email address
- `full_name` - Full name
- `display_name` - Display name
- `company_name` - Company name
- `company_address` - Company address
- `role` - User role (admin/user)
- `status` - Account status (active/suspended/trial/cancelled)
- `plan` - Subscription plan
- `currency` - Preferred currency
- `timezone` - Timezone setting
- `phone` - Phone number
- `created_at` - Account creation timestamp (ISO 8601)
- `updated_at` - Last update timestamp (ISO 8601)
- `subscription_amount` - Monthly subscription cost
- `plan_history` - Array of plan changes
- `previously_trial` - Whether user was on trial
- `suspension_reason` - Reason for suspension (if applicable)

### 3. **Export Users to Excel**
- Click **"Export Users"** button in Quick Actions panel
- Downloads a `.xlsx` file with all user accounts
- File contains complete user data with proper formatting
- Column widths are optimized for readability

### 4. **Import Users from Excel** (Built-in capability)
- Users can be imported from properly formatted Excel files
- API available in `ExcelUserService.importFromExcel(file)`
- Prevents duplicate emails (skips existing accounts)

## How to Use

### Creating an Account

1. **Navigate to Dashboard** (Admin only)
2. **Locate Quick Actions Panel** on the right side
3. **Click "Create Account"** button (blue button with "+" icon)
4. **Fill in the form:**
   ```
   Email:           user@example.com
   Full Name:       John Doe
   Display Name:    John
   Company:         Acme Corp
   Role:            user
   Plan:            basic
   Currency:        ZAR
   ```
5. **Click "Create Account"** to save
6. **Success message** appears, account is instantly created

### Exporting User Data

1. **In Dashboard**, find Quick Actions panel
2. **Click "Export Users"** button (green button with download icon)
3. **Browser downloads** `users.xlsx` file
4. **Open in Excel** to view all user data
5. **Share with team** or **backup** the file

## Technical Details

### ExcelUserService API

```javascript
import { userService } from '@/services/ExcelUserService';

// Create user
const user = userService.createUser({
  email: 'user@example.com',
  full_name: 'John Doe',
  company_name: 'Acme Corp',
  role: 'user',
  plan: 'basic'
});

// Get all users
const allUsers = userService.getAllUsers();

// Get user by ID
const user = userService.getUserById('user_1234567890');

// Get user by email
const user = userService.getUserByEmail('user@example.com');

// Update user
userService.updateUser(userId, {
  plan: 'premium',
  status: 'active'
});

// Delete user
userService.deleteUser(userId);

// Export to Excel (downloads file)
userService.downloadExcel();

// Get statistics
const stats = userService.getStats();
// Returns: {
//   totalUsers: 10,
//   activeUsers: 8,
//   suspendedUsers: 1,
//   trialUsers: 3,
//   paidUsers: 5,
//   newUsersThisMonth: 2,
//   usersByPlan: { free: 3, basic: 4, premium: 2, enterprise: 1 }
// }
```

### Data Storage

- **Location**: Browser localStorage
- **Key**: `breakapi_users_data`
- **Format**: JSON array of user objects
- **Persistence**: Survives browser sessions (until localStorage is cleared)

## Integration Points

### Dashboard Component
- Displays total users count
- Shows new users this month
- Tracks user growth rate
- Includes user-based metrics

**Files Updated:**
- `/src/pages/Dashboard.jsx` - Uses ExcelUserService for admin data
- `/src/components/CreateAccountDialog.jsx` - Account creation form
- `/src/services/ExcelUserService.js` - User data management

### No External Backend Required
The entire system works client-side using:
- Browser localStorage for persistence
- xlsx library for Excel export
- No API calls needed for user management

## Limitations & Notes

1. **localStorage Limit**: Browser localStorage has a ~5-10MB limit per domain. For 1000+ users, consider moving to backend.

2. **No Real-time Sync**: User data is stored locally. Multiple browser tabs/devices will not automatically sync.

3. **Email Uniqueness**: Duplicate email prevention is enforced at creation time.

4. **Data Loss**: Clearing browser cache/localStorage will delete user data. Always maintain Excel backups.

5. **Admin Only**: Account creation is restricted to admin users via role checking.

## Examples

### Example 1: Create Multiple Test Users

```javascript
const users = [
  {
    email: 'alice@company.com',
    full_name: 'Alice Johnson',
    company_name: 'Tech Corp',
    plan: 'premium'
  },
  {
    email: 'bob@company.com',
    full_name: 'Bob Smith',
    company_name: 'Tech Corp',
    plan: 'basic'
  }
];

users.forEach(userData => {
  try {
    userService.createUser(userData);
  } catch (error) {
    console.error(`Failed to create ${userData.email}:`, error);
  }
});
```

### Example 2: Get User Statistics

```javascript
const stats = userService.getStats();
console.log(`Total Users: ${stats.totalUsers}`);
console.log(`Active Users: ${stats.activeUsers}`);
console.log(`New This Month: ${stats.newUsersThisMonth}`);
console.log(`Users by Plan:`, stats.usersByPlan);
```

### Example 3: Export and Download

```javascript
// Programmatically trigger download
userService.downloadExcel();

// Or get raw Excel data
const excelData = userService.exportToExcel();
// excelData is a Blob-compatible array
```

## Troubleshooting

### "User with this email already exists"
- Check that the email is unique
- Delete the old user if it's a duplicate
- Verify email spelling

### Excel file shows strange characters
- Ensure Excel is set to UTF-8 encoding
- Re-open the file or export again
- Try opening in Google Sheets

### Users not appearing in admin dashboard
- Ensure you're logged in as admin
- Check browser console for errors
- Verify localStorage isn't full
- Try refreshing the page

### Export button not working
- Check browser console for errors
- Ensure file download permissions are enabled
- Try a different browser
- Check available disk space

## Future Enhancements

- [ ] Backend API integration for scalability
- [ ] Real-time sync across devices
- [ ] User import from CSV/Excel files (UI)
- [ ] Bulk user operations
- [ ] User suspension/deactivation
- [ ] Plan upgrade/downgrade tracking
- [ ] Activity audit logs
- [ ] User segmentation and filters

## Support

For issues or questions about account creation and Excel export:
1. Check browser console for error messages
2. Verify user has admin role
3. Clear browser cache and retry
4. Export current data before troubleshooting
