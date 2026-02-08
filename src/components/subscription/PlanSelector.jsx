import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, AlertCircle, Star } from "lucide-react";
import { PLANS, getPlanOrder } from "@/data/planLimits";

/* eslint-disable react/prop-types */
export default function PlanSelector({ currentPlan, onPlanChange, activeUsers }) {
  const handlePlanUpgrade = (planKey) => {
    if (onPlanChange) {
      onPlanChange(planKey);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Subscription Plans</h3>
        <p className="text-sm text-gray-600 mb-4">Choose a plan that fits your team size</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {getPlanOrder().map((key) => {
          const plan = PLANS[key];
          const isCurrent = currentPlan === key;
          const isUpgrade = PLANS[currentPlan]?.userLimit === null ? false : 
                           plan.userLimit === null ? true :
                           plan.userLimit > PLANS[currentPlan].userLimit;
          const canDowngrade = activeUsers > (plan.userLimit || Infinity);

          return (
            <Card 
              key={key}
              className={`relative transition-all ${
                isCurrent 
                  ? "border-indigo-600 border-2 bg-indigo-50" 
                  : "hover:border-indigo-300"
              }`}
            >
              {isCurrent && (
                <div className="absolute top-0 right-0 bg-indigo-600 text-white px-3 py-1 rounded-bl-lg text-xs font-semibold">
                  Current Plan
                </div>
              )}

              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  {plan.name}
                  {plan.recommended && <Star className="w-4 h-4 text-amber-500" />}
                </CardTitle>
                <p className="text-sm text-gray-600 mt-1">{plan.description}</p>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="py-4 border-t border-b">
                  <div className="text-3xl font-bold text-gray-900">
                    {plan.userLimit === null ? "∞" : plan.userLimit}
                  </div>
                  <div className="text-sm text-gray-600">users</div>
                </div>

                {canDowngrade && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">
                      You have {activeUsers} active user{activeUsers !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}

                {isCurrent ? (
                  <Badge className="w-full justify-center py-2 bg-indigo-600">
                    <Check className="w-4 h-4 mr-1" />
                    Current Plan
                  </Badge>
                ) : (
                  <Button
                    onClick={() => handlePlanUpgrade(key)}
                    disabled={canDowngrade}
                    variant={isUpgrade ? "default" : "outline"}
                    className={`w-full ${
                      isUpgrade 
                        ? "bg-indigo-600 hover:bg-indigo-700" 
                        : ""
                    } ${canDowngrade ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {isUpgrade ? "Upgrade" : "Downgrade"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <p className="text-sm text-blue-900">
            <strong>Need more flexibility?</strong> Enterprise plans offer unlimited users and custom features. 
            Contact sales for a personalized quote.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
