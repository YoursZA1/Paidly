import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart2, TrendingDown, TrendingUp, AlertTriangle, PieChart, RefreshCw } from "lucide-react";
import { getBillingStats } from "../services/billingService";

export default function AdminBilling() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBillingStats();
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !stats) return <div className="p-8">Loading billing data...</div>;

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Billing & Subscription Revenue</h1>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Total MRR</CardTitle>
            <BarChart2 className="w-6 h-6 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">${stats.mrr}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Churn Rate</CardTitle>
            <TrendingDown className="w-6 h-6 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.churnRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active vs Cancelled</CardTitle>
            <TrendingUp className="w-6 h-6 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <span className="text-lg">Active: <b>{stats.active}</b></span>
              <span className="text-lg">Cancelled: <b>{stats.cancelled}</b></span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Failed Recurring Payments</CardTitle>
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.failedPayments}</div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Plan Breakdown</CardTitle>
            <PieChart className="w-6 h-6 text-purple-500" />
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {stats.planBreakdown.map(plan => (
                <li key={plan.name} className="flex justify-between">
                  <span>{plan.name}</span>
                  <span>{plan.count} users</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <div className="text-gray-500 text-sm mt-8">
        <b>Note:</b> This dashboard tracks recurring subscription revenue (MRR), not one-time or transactional payments.
      </div>
    </div>
  );
}
