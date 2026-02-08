import React, { useState, useEffect } from 'react';
import { Package, User } from '@/api/entities';
import SubscriptionPlanCard from './SubscriptionPlanCard';
import PlanSelector from './PlanSelector';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ExternalLink, Crown, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/components/auth/AuthContext';
import { getActiveUserCount } from '@/data/planLimits';

export default function SubscriptionSettings() {
    const { user: currentUser } = useAuth();
    const [packages, setPackages] = useState([]);
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSelecting, setIsSelecting] = useState(false);
    const [users, setUsers] = useState([]);
    const [currentPlan, setCurrentPlan] = useState('free');

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [packagesData, userDataResult] = await Promise.all([
                    Package.list(),
                    User.me(),
                ]);
                setPackages(packagesData);
                setUserData(userDataResult);
                
                // Load users to count active ones
                const storedUsers = localStorage.getItem("breakapi_users");
                if (storedUsers) {
                  setUsers(JSON.parse(storedUsers));
                }
                
                // Get current plan from currentUser (from auth)
                if (currentUser?.plan) {
                  setCurrentPlan(currentUser.plan);
                }
            } catch (error) {
                console.error("Error loading subscription data:", error);
            }
            setIsLoading(false);
        };
        loadData();
    }, [currentUser]);

    const handleSelectPlan = async (plan) => {
        setIsSelecting(true);
        try {
            // Save selected plan to user profile
            await User.updateMyUserData({
                subscription_plan: plan.name,
                subscription_plan_id: plan.id
            });
            setUserData(prev => ({
                ...prev,
                subscription_plan: plan.name,
                subscription_plan_id: plan.id
            }));
            
            // If there's a website link, navigate to it for payment
            if (plan.website_link) {
                window.location.href = plan.website_link;
            }
        } catch (error) {
            console.error("Error selecting plan:", error);
        }
        setIsSelecting(false);
    };

    const handlePlanChange = (newPlan) => {
        setCurrentPlan(newPlan);
        if (currentUser) {
            // Update user in localStorage
            const stored = localStorage.getItem('breakapi_user');
            if (stored) {
              const userObj = JSON.parse(stored);
              userObj.plan = newPlan;
              localStorage.setItem('breakapi_user', JSON.stringify(userObj));
            }
        }
    };

    const handleManageSubscription = () => {
        window.location.href = 'https://invoicebreeksite.app';
    };

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8">
                <Skeleton className="h-96 rounded-xl" />
                <Skeleton className="h-96 rounded-xl" />
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }
    
    const currentPlanName = userData?.subscription_plan || 'Individual';

    return (
        <div className="py-8 space-y-12">
          {/* New Plan Selector */}
          <div className="border-b pb-8">
            <PlanSelector 
              currentPlan={currentPlan} 
              onPlanChange={handlePlanChange}
              activeUsers={getActiveUserCount(users)}
            />
          </div>

          {/* Current Plan Banner */}
          {currentPlanName && (
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-6 mb-8 max-w-2xl mx-auto">
                  <div className="flex items-center justify-center gap-3">
                      <CheckCircle className="w-6 h-6 text-emerald-600" />
                      <div className="text-center">
                          <p className="text-sm text-emerald-700">Your Current Plan</p>
                          <p className="text-2xl font-bold text-emerald-800">{currentPlanName}</p>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
                  </div>
              </div>
          )}

          {/* Header with Manage Subscription Button */}
          <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Find the Perfect Plan</h2>
              <p className="text-slate-600 mb-6 max-w-2xl mx-auto">
                  Whether you're just starting out or running a large business, we have a plan that fits your needs.
              </p>
              
              {/* Manage Subscription Button */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6 mb-8 max-w-md mx-auto">
                  <div className="flex items-center justify-center mb-3">
                      <Crown className="w-6 h-6 text-indigo-600 mr-2" />
                      <h3 className="text-lg font-semibold text-slate-900">Manage Your Subscription</h3>
                  </div>
                  <p className="text-sm text-slate-600 mb-4">
                      Update your billing, change plans, or manage your account on our website.
                  </p>
                  <Button 
                      onClick={handleManageSubscription}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                  >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Manage Subscription on Website
                  </Button>
              </div>
          </div>

          {/* Subscription Plans */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {packages.map(plan => (
                  <SubscriptionPlanCard
                      key={plan.id}
                      plan={plan}
                      isCurrent={userData?.subscription_plan === plan.name || userData?.subscription_plan_id === plan.id}
                      onSelect={handleSelectPlan}
                      isSelecting={isSelecting}
                  />
              ))}
          </div>

          {/* Additional Info */}
          <div className="text-center mt-12 p-6 bg-slate-50 rounded-xl max-w-2xl mx-auto">
              <h4 className="text-lg font-semibold text-slate-900 mb-2">Need Help Choosing?</h4>
              <p className="text-slate-600 mb-4">
                  Our team is here to help you find the perfect plan for your business needs.
              </p>
              <Button 
                  variant="outline" 
                  onClick={() => window.location.href = 'https://invoicebreek.com/contact'}
                  className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
              >
                  Contact Our Sales Team
              </Button>
          </div>
        </div>
    );
}