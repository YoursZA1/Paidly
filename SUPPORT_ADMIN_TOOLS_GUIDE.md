# Support & Admin Tools - Complete Guide

## 📋 Overview

The **Support & Admin Tools** system provides comprehensive backend support utilities for troubleshooting, monitoring, and managing the platform. This feature set is designed for real-world support scenarios where admins need to investigate issues, track activities, and maintain notes about users and accounts.

## ✨ Features

### 1. **User Impersonation (View-Only)** 👁️
- View the application as any user without modifying data
- Audit trail of all impersonation sessions
- Mandatory reason logging for compliance
- Automatic session tracking with timestamps
- Safe view-only mode prevents accidental changes

### 2. **Activity Logs** 📊
- Comprehensive logging of all system activities
- Real-time activity tracking across the platform
- Advanced filtering by type, severity, date range
- Activity statistics and trends
- Search functionality across all logs
- CSV export for reporting

### 3. **Error & Issue Tracking** 🐛
- Centralized error logging system
- Severity classification (critical, high, medium, low)
- Type categorization (payment, invoice, auth, api, general)
- Error resolution workflow
- Notes and comments on errors
- Automatic user and component tracking

### 4. **Admin Notes** 📝
- Per-user/account notes system
- Priority levels (urgent, high, normal, low)
- Pin important notes
- Mark notes as resolved
- Search across all notes
- Target type support (user, account, invoice)

### 5. **Data Export** 💾
- Export users, activities, errors, notes, impersonation logs
- CSV format for easy analysis
- Timestamped filenames
- Bulk export capability
- One-click individual exports

---

## 🚀 Quick Start

### Access
**URL:** `/admin/support-tools` or `/SupportAdminTools`  
**Role:** Admin only  
**Navigation:** Admin sidebar → "Support & Admin Tools" (Life Buoy icon)

### First Time Setup
1. Navigate to Support & Admin Tools
2. System auto-generates sample data if empty
3. Explore each tab to familiarize yourself

---

## 📖 Feature Details

### User Impersonation

#### Starting an Impersonation Session

```javascript
// 1. Select a user from the dropdown
// 2. Enter reason for impersonation (required)
// 3. Click "Start Impersonation (View-Only)"
```

**Example Reasons:**
- "Troubleshooting invoice generation issue reported by customer"
- "Verifying reported dashboard display bug"
- "Investigating payment gateway error"
- "Checking user-reported permission issue"

#### While Impersonating
- Purple banner displays at top showing current session
- All actions logged automatically
- View-only mode prevents modifications
- Can navigate as the user would see

#### Stopping an Impersonation Session
- Click "Stop Impersonation" button in banner
- Session automatically ends on logout
- Duration calculated and logged

#### Impersonation History
- View all past sessions
- See admin who performed impersonation
- Target user and reason displayed
- Session duration tracked
- Full audit trail maintained

**Security Notes:**
- All sessions are view-only
- Cannot modify user data while impersonating
- Every session logged with admin ID and reason
- Compliance-ready audit trail
- Session tracking for accountability

---

### Activity Logs

#### Overview
Tracks all administrative and system activities including:
- Impersonation starts/ends
- Admin note creation/updates
- Error logging
- User account changes
- System configuration updates

#### Statistics Dashboard
- **Total Activities:** All logged activities
- **Last 30 Days:** Recent activity count
- **Impersonations:** Total impersonation sessions
- **Errors Logged:** Total error tracking events

#### Filtering Options
1. **Search:** Full-text search across all activities
2. **Type Filter:** Filter by activity type
   - Impersonation Started
   - Impersonation Ended
   - Note Created
   - Error Logged
   - (More types as system grows)
3. **Severity Filter:** Low, Medium, High, Critical

#### Activity Entry Details
Each entry shows:
- Action performed
- Who performed it
- Target user (if applicable)
- Reason (for impersonation)
- Severity badge
- Timestamp

#### Export
- Export filtered activities to CSV
- Includes all displayed columns
- Timestamped filename
- Opens in Excel/Google Sheets

**Use Cases:**
- Compliance audits
- Security investigations
- Performance analysis
- User behavior tracking
- Administrative oversight

---

### Error & Issue Tracking

#### Error Statistics
Monitor system health with:
- Total errors logged
- Unresolved error count
- Critical errors count
- High priority errors count

#### Error Classification

**Severity Levels:**
- 🔴 **Critical:** System-breaking issues requiring immediate attention
- 🟠 **High:** Major functionality impaired, needs quick resolution
- 🟡 **Medium:** Non-critical issues affecting some users
- ⚪ **Low:** Minor issues or cosmetic problems

**Error Types:**
- 💰 **Payment:** Payment gateway, transaction failures
- 📄 **Invoice:** Invoice generation, PDF creation issues
- 🔐 **Auth:** Authentication, authorization problems
- 🌐 **API:** External API failures, integration issues
- ⚙️ **General:** Other system errors

#### Logging an Error (Programmatic)

```javascript
import SupportAdminService from '@/services/SupportAdminService';

SupportAdminService.logError({
  severity: 'high',
  type: 'payment',
  message: 'Payment gateway timeout',
  details: {
    gateway: 'stripe',
    amount: 99.99,
    attemptId: 'ch_123456'
  },
  userId: user.id,
  userName: user.name,
  component: 'PaymentProcessor',
  stackTrace: error.stack
});
```

#### Error Resolution Workflow
1. Error appears in unresolved list
2. Click error to view details
3. Add investigation notes
4. Identify root cause
5. Mark as resolved when fixed
6. Resolution timestamp and admin recorded

#### Error Details Panel
- Full error message
- Timestamp
- User affected (if applicable)
- Component that failed
- Technical details (JSON)
- Stack trace (if available)
- Resolution status
- Notes thread

**Best Practices:**
- Always add notes during investigation
- Include solution in final note
- Mark resolved only when verified fixed
- Use appropriate severity levels
- Include user context when relevant

---

### Admin Notes

#### Creating Notes

**Fields:**
- **Target Type:** User, Account, or Invoice
- **Target:** Select specific user/account
- **Priority:** Low, Normal, High, Urgent
- **Note:** Detailed description (required)

**Example Notes:**
```
Priority: High
Target: John Doe (User)
Note: "Customer reported recurring billing issue. 
       Investigating with payment provider. 
       Ticket #12345. Update: Fixed on 2026-02-05."
```

```
Priority: Urgent
Target: ABC Corp (Account)
Note: "Account on watch list due to 3 chargebacks 
       in past month. Require approval for new 
       subscriptions."
```

#### Note Management

**Pin Notes:**
- Click pin icon to pin important notes
- Pinned notes appear first
- Use for ongoing issues or important warnings

**Mark Resolved:**
- Click checkmark when issue resolved
- Keeps note visible but marked complete
- Maintains historical record

**Search Notes:**
- Search across all notes
- Finds matches in note text, target name, or admin name
- Real-time filtering

**Delete Notes:**
- Click X to delete
- Requires confirmation
- Permanent deletion (use resolved instead when possible)

#### Note Display
Notes sorted by:
1. Pinned notes first
2. Then by creation date (newest first)

Each note shows:
- Priority badge (color-coded)
- Target type badge
- Target name
- Note content
- Admin who created it
- Creation date
- Resolved status

**Use Cases:**
- Customer support escalations
- Account warnings/flags
- Investigation notes
- Follow-up reminders
- Compliance documentation

---

### Data Export

#### Available Exports

1. **Users Data**
   - All user accounts
   - Includes: ID, Name, Email, Company, Plan, Status, Dates
   - Use for: User analysis, reporting

2. **Activity Logs**
   - Complete activity history
   - Includes: ID, Timestamp, Type, Action, Users, Severity
   - Use for: Audit reports, compliance

3. **Error Tracking**
   - All logged errors
   - Includes: ID, Timestamp, Severity, Type, Message, Resolution
   - Use for: System health reports, bug tracking

4. **Admin Notes**
   - All admin notes
   - Includes: ID, Date, Target, Note, Priority, Admin, Status
   - Use for: Support documentation, handoffs

5. **Impersonation History**
   - All impersonation sessions
   - Includes: Timestamp, Action, Admin, Target, Reason, Duration
   - Use for: Security audits, compliance

#### Export Process
1. Navigate to "Data Export" tab
2. Click "Export" on desired data type
3. CSV file downloads automatically
4. Filename includes timestamp
5. Open in Excel, Google Sheets, or any CSV reader

#### Bulk Export
- Use "Export All Data" button in header
- Downloads all 5 data types
- 5 separate CSV files
- Convenient for comprehensive backups

**Export Format:**
- CSV (Comma-Separated Values)
- UTF-8 encoding
- Header row included
- Excel-compatible
- Proper escaping of special characters

---

## 🔧 Technical Implementation

### Service Layer: `SupportAdminService.js`

**Storage Keys:**
- `breakapi_impersonation` - Current impersonation session
- `breakapi_admin_notes` - All admin notes
- `breakapi_error_tracking` - Error log
- `breakapi_global_activity_log` - Activity feed (max 10,000 entries)

**Key Methods:**

```javascript
// Impersonation
SupportAdminService.startImpersonation(adminId, adminName, targetUserId, targetUserName, reason)
SupportAdminService.stopImpersonation()
SupportAdminService.getCurrentImpersonation()
SupportAdminService.isImpersonating()

// Admin Notes
SupportAdminService.addAdminNote(targetType, targetId, targetName, note, adminId, adminName, priority)
SupportAdminService.updateAdminNote(noteId, updates, adminId, adminName)
SupportAdminService.deleteAdminNote(noteId, adminId, adminName)
SupportAdminService.getNotesForTarget(targetType, targetId)

// Error Tracking
SupportAdminService.logError(errorData)
SupportAdminService.updateError(errorId, updates, adminId, adminName)
SupportAdminService.addErrorNote(errorId, note, adminId, adminName)
SupportAdminService.getAllErrors()
SupportAdminService.getUnresolvedErrors()

// Activity Logs
SupportAdminService.logActivity(activityData)
SupportAdminService.getAllActivities()
SupportAdminService.searchActivities(query)
SupportAdminService.getActivityStats(days)

// Data Export
SupportAdminService.exportSystemData()
SupportAdminService.downloadCSV(csvContent, filename)
SupportAdminService.downloadAllData()
```

### UI Component: `SupportAdminTools.jsx`

**Structure:**
- Main container with 5 tabs
- Each tab is a separate component
- Responsive design with Tailwind CSS
- Shadcn/ui component library
- Framer Motion animations

**Components:**
1. `ImpersonationTab` - User impersonation management
2. `ActivityLogsTab` - Activity log viewer
3. `ErrorTrackingTab` - Error tracking interface
4. `AdminNotesTab` - Note management
5. `DataExportTab` - Export interface

---

## 🎯 Use Cases & Examples

### Support Scenario 1: User Reports Bug
1. User emails: "Invoice PDF not generating"
2. Admin creates note on user account (priority: high)
3. Admin starts impersonation to reproduce issue
4. Error occurs and gets logged automatically
5. Admin investigates error details
6. Admin adds investigation notes to error
7. Admin fixes bug
8. Admin marks error as resolved
9. Admin updates note: "Fixed, deployed 2026-02-05"
10. Admin stops impersonation
11. Full audit trail maintained

### Support Scenario 2: Account Review
1. Finance flags account for review
2. Admin creates urgent note: "3 chargebacks"
3. Admin reviews activity logs for account
4. Admin impersonates to check billing setup
5. Admin adds findings to note
6. Admin exports user data for finance
7. Decision made and note updated
8. Note marked resolved

### Support Scenario 3: System Health Check
1. Admin reviews error tracking dashboard
2. Notices spike in payment errors
3. Filters errors by type: "payment"
4. Reviews error details and patterns
5. Identifies payment gateway issue
6. Creates notes on affected users
7. Exports error log for provider
8. Marks errors resolved after fix confirmed

### Support Scenario 4: Compliance Audit
1. Auditor requests access logs
2. Admin exports activity logs (CSV)
3. Admin exports impersonation history
4. Admin exports admin notes
5. Provides comprehensive audit trail
6. All actions timestamped and attributed
7. Full compliance documentation

---

## 🔐 Security & Compliance

### Data Protection
- All data stored in localStorage (client-side)
- No sensitive data transmitted unnecessarily
- Admin-only access with role verification
- View-only impersonation prevents data modification

### Audit Trail
- Every action logged with timestamp
- Admin ID and name recorded
- Reason required for sensitive actions
- Immutable log entries
- Comprehensive export capabilities

### Best Practices
1. **Always provide detailed reasons** for impersonation
2. **Stop impersonation immediately** after investigation
3. **Add notes during investigation** for future reference
4. **Mark items resolved** when completed
5. **Regular exports** for backup and compliance
6. **Review error logs** regularly for patterns
7. **Pin important notes** for team visibility
8. **Use appropriate severity levels** for triage

### Compliance Features
- ✅ Complete audit trail
- ✅ Timestamped activities
- ✅ User attribution
- ✅ Reason logging
- ✅ Data export capabilities
- ✅ Read-only impersonation
- ✅ Activity search and filtering

---

## 📊 Analytics & Reporting

### Activity Statistics (Last 30 Days)
- Total activities count
- Breakdown by type
- Breakdown by severity
- Top performing admins

### Error Statistics
- Total errors
- Unresolved count
- By severity (critical, high, medium, low)
- By type (payment, invoice, auth, api, general)

### Export Reports
Use exported CSV files to generate:
- Weekly error summaries
- Monthly activity reports
- Impersonation audit logs
- Support ticket documentation
- Compliance reports

---

## 🚨 Troubleshooting

### No Data Showing
**Solution:** Click any action to generate sample data, or use system naturally to populate logs.

### Export Not Downloading
**Solution:** Check browser popup blocker. Allow downloads from the application domain.

### Impersonation Not Working
**Solution:** Ensure user and reason are both filled in. Check admin role permissions.

### Search Not Finding Results
**Solution:** Search is case-insensitive but requires exact word matches. Try shorter keywords.

### Notes Not Saving
**Solution:** Ensure all required fields filled. Check browser console for errors.

---

## 🔄 Integration Points

### Automatic Error Logging
Integrate throughout your application:

```javascript
try {
  // Your code
  await processPayment(data);
} catch (error) {
  // Log error to support system
  SupportAdminService.logError({
    severity: 'high',
    type: 'payment',
    message: error.message,
    details: { data, error: error.toString() },
    userId: currentUser.id,
    userName: currentUser.name,
    component: 'PaymentService',
    stackTrace: error.stack
  });
  
  // Show user-friendly message
  toast.error('Payment failed. Support has been notified.');
}
```

### Activity Logging
Log important admin actions:

```javascript
SupportAdminService.logActivity({
  type: 'USER_DELETED',
  action: 'User Account Deleted',
  performedBy: admin.name,
  performedById: admin.id,
  targetUser: user.name,
  targetUserId: user.id,
  severity: 'high'
});
```

---

## 📈 Future Enhancements

Potential additions:
- Real-time error notifications
- Email alerts for critical errors
- Advanced analytics dashboard
- Error categorization ML
- Scheduled report generation
- Multi-admin collaboration features
- External system integrations
- Mobile app for on-call support

---

## 🆘 Support

For questions or issues with Support & Admin Tools:
1. Check this guide thoroughly
2. Review error messages in browser console
3. Export logs for detailed analysis
4. Contact system administrator

---

## ✅ Summary

The Support & Admin Tools system provides enterprise-grade backend support capabilities:

✅ **User Impersonation** - Safe, audited view-only access  
✅ **Activity Logs** - Comprehensive system activity tracking  
✅ **Error Tracking** - Centralized error management with resolution workflow  
✅ **Admin Notes** - Per-user/account annotation system  
✅ **Data Export** - Full CSV export capabilities for reporting  

**Built for real-world support scenarios with compliance, security, and efficiency in mind.**

Access at: `/admin/support-tools`

---

*Last Updated: February 5, 2026*  
*Version: 1.0.0*
