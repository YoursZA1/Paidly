import { UserPlus, UserCheck, AlertCircle } from 'lucide-react';

/**
 * @param {{ users: object[], affiliates: object[], pendingAffiliateCount?: number }} props
 */
export default function RecentActivity({ users, affiliates, pendingAffiliateCount }) {
  const recentUsers = users.slice(0, 4);
  const pendingList = affiliates.filter((a) => a.status === 'pending');
  const pendingAffiliates = pendingList.slice(0, 3);
  const pendingCount =
    typeof pendingAffiliateCount === 'number' ? pendingAffiliateCount : pendingList.length;

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <h2 className="font-semibold mb-1">Recent Activity</h2>
      <p className="text-xs text-muted-foreground mb-5">{pendingCount} pending affiliate reviews</p>

      <div className="space-y-4">
        {recentUsers.map((user) => (
          <div key={user.id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-medium">{user.full_name || user.email}</p>
              <p className="text-xs text-muted-foreground">Joined recently</p>
            </div>
          </div>
        ))}

        {pendingAffiliates.map((aff) => (
          <div key={aff.id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium">{aff.applicant_name}</p>
              <p className="text-xs text-muted-foreground">Affiliate application pending</p>
            </div>
          </div>
        ))}

        {recentUsers.length === 0 && pendingAffiliates.length === 0 && (
          <div className="text-center py-6">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        )}
      </div>
    </div>
  );
}
