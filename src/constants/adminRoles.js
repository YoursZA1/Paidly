// Admin Role Tiers and Descriptions
export const ADMIN_ROLE_TIERS = [
  {
    key: "super_admin",
    label: "👑 Super Administrator (Tier 1)",
    description: "Full system access - manages entire platform, users, security, compliance",
    criticality: "CRITICAL"
  },
  {
    key: "admin",
    label: "⚙️ Administrator (Tier 2)",
    description: "Full administrative access with most management capabilities",
    criticality: "HIGH"
  },
  {
    key: "security_officer",
    label: "🔒 Security Officer (Tier 3)",
    description: "Manages security policies, access control, and compliance",
    criticality: "HIGH"
  },
  {
    key: "compliance_officer",
    label: "✅ Compliance Officer (Tier 4)",
    description: "Manages compliance, audit trails, and regulatory requirements",
    criticality: "MEDIUM"
  },
  {
    key: "support_admin",
    label: "🤝 Support Administrator (Tier 5)",
    description: "Limited admin access for support team - impersonation and user assistance",
    criticality: "MEDIUM"
  },
  {
    key: "audit_officer",
    label: "📋 Audit Officer (Tier 6)",
    description: "Read-only access to audit logs and compliance data",
    criticality: "LOW"
  },
  {
    key: "read_only_viewer",
    label: "👁️ Read-Only Viewer (Tier 7)",
    description: "Minimal read-only access for viewing reports and data",
    criticality: "LOW"
  }
];
