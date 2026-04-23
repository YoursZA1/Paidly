import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/components/CurrencySelector";

export default function CashFlowOverTimeChart({
  chartData,
  userCurrency = "ZAR",
  timeRange,
  onTimeRangeChange,
  quickFilter,
  onQuickFilterChange,
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <CardTitle>Cash Flow Over Time</CardTitle>
        <div className="flex flex-wrap gap-2">
          {["7D", "30D", "6M", "12M"].map((range) => (
            <Button
              key={range}
              size="sm"
              variant={timeRange === range ? "default" : "outline"}
              onClick={() => onTimeRangeChange(range)}
            >
              {range}
            </Button>
          ))}
          <div className="h-8 border-l border-border mx-1" />
          <Button
            size="sm"
            variant={quickFilter === "thisMonth" ? "default" : "outline"}
            onClick={() => onQuickFilterChange("thisMonth")}
          >
            This Month
          </Button>
          <Button
            size="sm"
            variant={quickFilter === "lastMonth" ? "default" : "outline"}
            onClick={() => onQuickFilterChange("lastMonth")}
          >
            Last Month
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[680px]">
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value, name) => [formatCurrency(Number(value) || 0, userCurrency), name]} />
              <Legend />
              <Area type="monotone" dataKey="income" stroke="#10b981" fill="#10b98122" name="Income" />
              <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="#ef444422" name="Expenses" />
              <Line type="monotone" dataKey="net" stroke="#f24e00" strokeWidth={2.5} name="Net" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
