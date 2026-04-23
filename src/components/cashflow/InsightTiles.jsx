import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function InsightTiles({ insights }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className={cn(
              "rounded-lg border p-3 text-sm",
              insight.tone === "green" && "bg-emerald-500/8 border-emerald-500/20",
              insight.tone === "red" && "bg-red-500/8 border-red-500/20",
              insight.tone === "orange" && "bg-orange-500/8 border-orange-500/20"
            )}
          >
            {insight.text}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
