import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from "@/utils";
import { useUpgradeModalStore } from "@/stores/useUpgradeModalStore";

/**
 * Shown when `hasFeature(user.plan, …)` is false — primary action opens PayFast tier picker; Settings link for full pricing page.
 */
export default function UpgradePrompt({
  title = "Upgrade your plan",
  description = "This feature isn’t included on your current plan. Choose a paid tier to unlock it.",
  featureKey = null,
}) {
  const openUpgradeModal = useUpgradeModalStore((s) => s.openUpgradeModal);

  return (
    <Card className="max-w-lg w-full rounded-2xl border-border shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-display">
          <Sparkles className="w-5 h-5 text-primary shrink-0" aria-hidden />
          {title}
        </CardTitle>
        {description ? <CardDescription className="text-base">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          className="rounded-xl"
          onClick={() => openUpgradeModal(featureKey ? { featureKey } : {})}
        >
          Choose plan &amp; pay
        </Button>
        <Button variant="ghost" asChild className="rounded-xl text-muted-foreground">
          <Link to={`${createPageUrl("Settings")}?tab=subscription`}>View full plans in Settings</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
