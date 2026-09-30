import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemoMode } from "@/hooks/useDemoMode";
import { useDemoActions } from "@/components/demo/useDemoActions";

/**
 * Shown in place of a page (or a settings section) that needs a real account in Demo Mode —
 * billing, team & users, integrations, API credentials, security. The server refuses these too.
 */
export function DemoRestrictedPanel({ feature = "This feature", description = null, className = "" }) {
  const { leaving, createAccount } = useDemoActions();
  return (
    <section
      data-testid="demo-restricted"
      className={`mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center ${className}`}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Lock className="size-6" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold">{feature} needs a real Paidly account</h2>
      <p className="text-sm text-muted-foreground">
        {description ||
          "You're in Demo Mode, where this part of Paidly is switched off so nothing real can be changed. Create your own account to use it."}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button type="button" disabled={leaving} onClick={() => void createAccount()}>
          Create your Paidly account
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to="/Dashboard">Back to the demo</Link>
        </Button>
      </div>
    </section>
  );
}

/** Route wrapper: renders the page normally, or the restricted panel inside a demo. */
export default function DemoRestricted({ feature, description, children }) {
  const demo = useDemoMode();
  if (demo.isDemo) return <DemoRestrictedPanel feature={feature} description={description} className="my-8" />;
  return children;
}
