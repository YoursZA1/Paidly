// Admin Role Tiers and Descriptions
// See src/constants/adminRoles.js for ADMIN_ROLE_TIERS
import { Shield } from "lucide-react";

export default function AdminControl() {
  // Removed unused variables after UI migration

  // (No longer syncing users; UI moved to Dashboard)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 min-h-screen bg-slate-50">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-slate-900">Admin Control</h1>
        </div>
        <p className="text-slate-600 mt-4">Admin roles management has moved to the main Dashboard page.</p>
      </div>
    </div>
  );
}