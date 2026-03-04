import { User } from '@/api/entities';
import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import FeatureGate from '@/components/subscription/FeatureGate';
import AccountingDashboard from '@/components/accounting/AccountingDashboard';

export default function Accounting() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
      } catch (error) {
        console.error("Error fetching user:", error);
      }
      setIsLoading(false);
    };
    fetchUser();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary/10 to-primary/5 p-8">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-12 w-48 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <FeatureGate 
      feature="accounting" 
      userPlan={user?.subscription_plan || 'Individual'}
    >
      <AccountingDashboard user={user} />
    </FeatureGate>
  );
}
