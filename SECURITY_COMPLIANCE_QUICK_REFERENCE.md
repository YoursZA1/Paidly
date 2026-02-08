# 🔐 Security & Compliance - Quick Reference

**Navigate to**: Admin Control Dashboard → Admin Roles Tab → Click "Security & Compliance" button  
**Or**: Sidebar → Admin Section → "Security & Compliance"  
**Or Direct**: `http://localhost:5174/admin/security-compliance`

---

## 🎯 Quick Tasks

### Assign Someone as Admin
1. Go to **Admin Roles** tab
2. Click **Assign Role**
3. Enter their ID and Name
4. Pick their role (Super Admin, Admin, etc.)
5. Add reason (optional)
6. Click **Assign Role** ✅

### Check Who Did What
1. Go to **Audit Logs** tab
2. Use **Search** to find specific events
3. Filter by **Type** or **Severity**
4. Click **Export CSV** to save for records

### Protect Sensitive Data
1. Go to **Data Access** tab
2. Click **New Policy**
3. Enter data type (e.g., "payments")
4. Pick sensitivity level
5. Choose which roles can access
6. Click **Create Policy** ✅

### Make a Backup
1. Go to **Backup Recovery** tab
2. Click **Create Backup**
3. Give it a name
4. It appears in the list ✅

---

## 👥 6 Admin Roles

| Role | Best For | Key Powers |
|------|----------|-----------|
| 🔴 Super Admin | System owners | Everything |
| 🟠 Admin | Daily admin work | Most features |
| 🟡 Security Officer | Security team | Policies, audits |
| 🟡 Compliance Officer | Compliance team | Audit, reporting |
| 🟢 Audit Officer | Auditors | View only |
| 🟠 Support Admin | Support team | Impersonation, logs |

---

## 📊 Key Numbers

- **Max Audit Logs**: 10,000 entries
- **Max Backups**: 100 backups
- **Max Compliance Events**: 5,000 events
- **Audit Retention**: Unlimited
- **Backup Retention**: 90 days (default)

---

## 🔍 Data Classifications

- 🟢 **Public** - Anyone can see
- 🔵 **Internal** - Team access only
- 🟡 **Confidential** - Limited access
- 🔴 **Restricted** - Admin only

---

## 📱 Tab Guide

### Admin Roles
- View all 6 role types and their permissions
- See who has what role
- Add new admins
- Remove admin access

### Audit Logs
- Search all logged events
- Filter by type/severity/user
- See who did what when
- Export for compliance

### Data Access
- Create access policies
- Decide who can see what data
- Protect sensitive information
- Review access report

### Backup Recovery
- Create backup snapshots
- View backup history
- Set retention dates
- Delete old backups

---

## ⚡ Common Workflows

**Grant someone access to payments data**:
1. Data Access tab
2. New Policy
3. Name: "Payment Access"
4. Type: "payments"
5. Class: "Restricted"
6. Roles: Admin, Super Admin
7. Create ✅

**Find out what John did last week**:
1. Audit Logs tab
2. Search: "John"
3. Use date filter ← or → dates
4. View all his actions ✅

**Need to prove compliance?**:
1. Audit Logs tab
2. Click "Export CSV"
3. Send to auditor ✅

---

## 🛡️ Security Tips

- ✅ Assign roles with care
- ✅ Review who's an admin monthly
- ✅ Check audit logs regularly
- ✅ Protect sensitive data types
- ✅ Keep backups current
- ✅ Export logs for records
- ✅ Test backup recovery

---

## 🔗 Related Pages

- **Admin Control** - User and plan management
- **Support & Admin Tools** - User impersonation, error tracking
- **Platform Settings** - System configuration
- **Access Control** - Feature-based access (plans)

---

*Last Updated: February 5, 2026*
