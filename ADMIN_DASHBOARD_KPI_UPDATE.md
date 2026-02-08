# Admin Dashboard KPI Update

## Overview
Updated the Admin Dashboard to display user-centric metrics immediately at login, focusing on operational visibility rather than revenue metrics.

## Changes Made

### 1. Updated Data Calculations (Dashboard.jsx)
Added new metrics to the admin stats calculation:

- **Active Users**: Count of all users with `status === 'active'`
- **New Signups Today**: Count of users created today using `startOfDay()`

```javascript
const activeUsers = allUsers.filter(u => u.status === 'active').length;

const todayStart = startOfDay(now);
const newUsersToday = allUsers.filter(u => {
  if (!u.created_at) return false;
  const createdDate = new Date(u.created_at);
  return createdDate >= todayStart && createdDate <= now;
}).length;
```

### 2. Updated Admin Stats State
Added new fields to the `adminStats` state:
```javascript
setAdminStats({
  totalUsers: allUsers.length,
  activeUsers,              // NEW
  activeSubscribers,
  trialUsers,
  suspendedAccounts,
  newUsersToday,           // NEW
  totalInvoices: allInvoices.length,
  revenue: totalRevenue,
  // ... other fields
});
```

### 3. Replaced KPI Cards
Changed the four main KPI cards from revenue-focused to user-focused metrics:

#### Before:
1. Total Users
2. Active Subscribers (paid plans)
3. Invoices
4. Revenue

#### After:
1. **Total Users** (unchanged)
   - Shows total user count
   - Percent change vs last month
   - Blue color scheme

2. **Active Users** (changed from "Active Subscribers")
   - Shows users with active status
   - Displays as percentage of total users
   - Green color scheme with UserCheck icon

3. **Suspended Users** (changed from "Invoices")
   - Shows count of suspended accounts
   - Displays as percentage of total users
   - Red color scheme with UserX icon
   - Trend indicator shows "down" when suspended users exist

4. **New Sign-ups** (changed from "Revenue")
   - Shows format: "X today / Y month"
   - Example: "3 today / 45 month"
   - Purple color scheme with UserPlus icon
   - Growth rate trend indicator

## Visual Changes

### Color Schemes
- **Total Users**: Blue gradient (unchanged)
- **Active Users**: Green gradient (positive metric)
- **Suspended Users**: Red gradient (warning metric)
- **New Sign-ups**: Purple gradient (growth metric)

### Icons
- **Total Users**: UsersIcon (group of users)
- **Active Users**: UserCheck (user with checkmark)
- **Suspended Users**: UserX (user with X)
- **New Sign-ups**: UserPlus (user with plus sign)

## Data Sources

All metrics are calculated from the `userService.getAllUsers()` data:

- **Total Users**: `allUsers.length`
- **Active Users**: Count where `status === 'active'`
- **Suspended Users**: Count where `status === 'suspended'` (from `adminStats.suspendedAccounts`)
- **New Signups Today**: Count where `created_at` is today
- **New Signups This Month**: Count where `created_at` is this month (from `growthStats.newUsersThisMonth`)

## Technical Details

### Date Functions Used
- `startOfDay()` - Get start of current day for daily signups
- `startOfMonth()` - Get start of current month for monthly signups
- Date comparison logic for filtering users

### Import Added
```javascript
import { startOfMonth, endOfMonth, eachDayOfInterval, format as formatDate, subMonths, startOfDay } from 'date-fns';
```

## Benefits

1. **Immediate User Visibility**: Admin sees user status at a glance
2. **Security Monitoring**: Suspended users prominently displayed
3. **Growth Tracking**: Daily and monthly signups in one view
4. **Operational Focus**: Metrics relevant to user management tasks
5. **Status Clarity**: Clear distinction between active status vs paying subscribers

## Notes

- The original "Active Subscribers" (paying customers) data is still calculated and available in `adminStats.activeSubscribers`
- Revenue and invoice metrics are still displayed in charts below the KPI cards
- All existing functionality remains intact
- Only the top 4 KPI cards were modified for immediate login visibility

## Testing

To verify the changes:
1. Login as admin
2. Verify 4 KPI cards show: Total Users, Active Users, Suspended Users, New Sign-ups
3. Check that metrics update correctly
4. Verify trend indicators show appropriate direction
5. Confirm color schemes match the metric type (green for active, red for suspended, etc.)
