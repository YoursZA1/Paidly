# Subscriptions & Packages Management System

## Overview

The Subscriptions & Packages Management System provides comprehensive tracking and analytics for user subscription plans, status changes, and business metrics related to subscription management.

## Features

### 1. **Users per Plan**
Track how many users are on each subscription tier:
- **Individual**: Free, Starter, Basic plans
- **SME**: Professional, Business, SME plans  
- **Corporate**: Enterprise, Corporate plans

#### Metrics Displayed
- Total count per category
- Percentage of total user base
- Visual distribution chart (pie chart)
- Breakdown of plans within each category

### 2. **Active vs Cancelled Subscriptions**
Monitor subscription status at a glance:

#### Subscription Status Types
- **Active**: Paid plans with active subscriptions
- **Cancelled**: Users who have cancelled their subscription
- **Paused**: Subscriptions temporarily paused
- **Trial**: Users in trial period

#### Metrics
- Count and percentage for each status
- Visual status distribution
- Detailed status breakdown with color-coded indicators

### 3. **Upgrade / Downgrade Activity**
Track all subscription changes and movements:

#### Activity Types
- **Upgrade**: User moves to a higher-tier plan
- **Downgrade**: User moves to a lower-tier plan
- **Cancellation**: User cancels their subscription
- **Reactivation**: Previously cancelled user reactivates
- **Extension**: Subscription period extended

#### Metrics Captured
- Date and time of activity
- User information
- From/To plan
- Reason (for downgrades/cancellations)
- MRR (Monthly Recurring Revenue) impact

### 4. **Dashboard Views**

#### Overview Tab
- **Users by Plan**: Pie chart showing distribution across Individual/SME/Corporate
- **Plan Distribution**: Detailed breakdown with percentages
- **Subscription Status**: Status distribution pie chart and detailed cards
- **MRR Trend**: 12-month historical trend of recurring revenue

#### Activity Log Tab
- Timeline view of all subscription changes
- Chronological list with newest first
- Activity icons and color coding
- User information and plan changes
- Timestamps

#### Analysis Tab
- **30-Day Movement**: 
  - Upgrades count and MRR increase
  - Downgrades count
  - Cancellations count
  - Reactivations count
  - Net movement (total change)
- **MRR Movement**:
  - Revenue increase from upgrades
  - Revenue loss from downgrades
  - Net MRR change
  - Churn rate percentage

#### Churn Analysis Tab
- **Cancellation Reasons**: Breakdown of why subscriptions were cancelled
- **Cancellations by Plan**: Which plans have highest churn
- **Recent Cancellations**: List of latest cancellations with details

## Key Metrics

### Monthly Recurring Revenue (MRR)
Total predictable monthly revenue from active subscriptions (excludes free plans).
- **Calculation**: Sum of all active paid plans
- **Tracked**: Monthly trend over 12 months
- **Movement**: Changes from upgrades/downgrades

### Churn Rate
Percentage of subscriptions cancelled in a period.
- **Formula**: (Cancelled Users / Active Users at start of period) × 100
- **Indicator**: Health of subscription business
- **Target**: <5% monthly churn is typically healthy

### Net Movement
Overall growth/decline in subscriber count per month.
- **Calculation**: Upgrades - Downgrades - Cancellations + Reactivations
- **Positive**: Growing subscriber base
- **Negative**: Shrinking subscriber base

### Plan Distribution
How many users are in each subscription category.
- **Individual**: Single user or small team plans
- **SME**: Small-to-medium enterprise plans
- **Corporate**: Large enterprise plans

## Recording Subscription Activity

### Manual Activity Recording
When admins change a user's plan, they can record the activity:

1. Click "Record Activity" when changing a user's plan
2. Select the activity type:
   - **Upgrade** (auto-selected if moving to higher tier)
   - **Downgrade** (auto-selected if moving to lower tier)
   - **Cancellation**
   - **Reactivation**
   - **Extension**
3. Optionally provide a reason (especially for downgrades/cancellations)
4. Review the MRR impact summary
5. Click "Record Activity" to save

### How Activity is Tracked
- **Timestamp**: Exact date and time of change
- **User Data**: User ID, name, and email
- **Plan Change**: What plan they moved from/to
- **MRR Impact**: Dollar amount ($) affected
- **Reason**: Optional context for the change

## Reports & Export

### Available Reports
- Full subscription metrics report
- Plan distribution analysis
- Activity timeline
- Churn analysis
- MRR trend data

### Exporting Data
- Click "Export Report" to download JSON report
- Includes all current metrics, timelines, and analysis
- Useful for external reporting or archiving

### Refreshing Data
- Click "Refresh" to reload all metrics from latest user data
- Updates all charts and statistics immediately

## Integration Points

### Dashboard Integration
The main Dashboard includes a "Subscriptions & Packages" section showing:
- Users per plan (Individual/SME/Corporate)
- Active vs cancelled subscriptions  
- Subscription status breakdown
- Recent subscription activity

### User Management
When changing a user's plan, you can:
- Automatically record the activity
- Track reason for downgrade/cancellation
- See MRR impact in real-time

### Admin Control
Plan changes made through Admin Control are logged as subscription activities:
- All plan changes tracked
- User information captured
- Timestamp recorded
- Audit trail maintained

## Data Storage

### Storage Location
- User subscription data: `localStorage` (breakapi_users)
- Activity log: `localStorage` (subscription_activity_log)

### Data Retention
- Activity logs stored indefinitely
- Can be exported and archived externally
- No automatic data pruning

## Plan Pricing Reference

Default plan pricing (used for MRR calculations):
```
Free: $0/month
Starter/Basic: $20/month
Professional/SME/Business: $50-75/month
Enterprise/Corporate: $200/month
```

*Note: Actual pricing may differ based on regional rates and custom agreements.*

## Business Insights

### Health Indicators

**Excellent**
- Churn rate: ≤ 5%
- Net movement: Positive (more upgrades than downgrades/cancellations)
- MRR trend: Increasing

**Good**
- Churn rate: ≤ 10%
- Net movement: Non-negative
- MRR trend: Stable or increasing

**Fair**
- Churn rate: ≤ 15%
- Mixed net movement
- MRR trend: Stable

**Poor**
- Churn rate: > 15%
- Net negative movement
- MRR trend: Decreasing

### Key Questions to Answer

1. **Are we growing?** - Check net movement and MRR trend
2. **Who's upgrading?** - View Activity Log, filter for upgrades
3. **Why are people cancelling?** - Check Churn Analysis tab for reasons
4. **Which plans are most popular?** - View Users per Plan breakdown
5. **Are we losing revenue?** - Check MRR movement and churn rate

## Best Practices

### Regular Monitoring
- Check dashboard weekly for subscription health
- Monitor churn rate for early warning signs
- Review activity logs for patterns in cancellations

### Recording Activities
- Always record plan changes for audit trail
- Include reasons for downgrades/cancellations
- Review MRR impact before major plan changes

### Data Quality
- Ensure user emails are accurate (for communications)
- Keep cancellation reasons documented (for analysis)
- Update plan changes promptly (for revenue accuracy)

## API/Service Reference

### SubscriptionService Methods

```javascript
// Get all users with subscription info
SubscriptionService.getAllUsersWithSubscriptions()

// Get users grouped by plan category
SubscriptionService.getUsersByPlanCategory()

// Get subscription status breakdown
SubscriptionService.getSubscriptionStatus()

// Record subscription activity
SubscriptionService.recordActivity({
  type: 'upgrade|downgrade|cancel|reactivate|extend',
  userId: string,
  userName: string,
  userEmail: string,
  fromPlan: string,
  toPlan?: string,
  reason?: string,
  metadata?: object
})

// Get all subscription activities
SubscriptionService.getSubscriptionActivity()

// Get comprehensive metrics
SubscriptionService.getMetrics()

// Get MRR trend over time
SubscriptionService.getMRRTrend(months)

// Get churn analysis
SubscriptionService.getChurnAnalysis()
```

## Troubleshooting

### Missing Activity Records
- Check that users have `created_at` timestamp field
- Verify localStorage is not full/disabled
- Refresh page and try recording again

### Incorrect MRR Calculations
- Confirm plan pricing matches expected values
- Check that user status is correctly set to 'active'
- Verify plan names match the system (lowercase)

### Charts Not Updating
- Click "Refresh" button to reload data
- Check browser console for errors
- Verify JavaScript is enabled

## Future Enhancements

Potential features for future versions:
- Email notifications for subscription changes
- Automated churn prediction
- Retention cohort analysis
- Dunning management for failed payments
- Subscription forecasting
- Custom pricing tier support
- Multi-currency support
- Subscription reminder emails

---

**Last Updated**: February 2026
**Version**: 1.0
