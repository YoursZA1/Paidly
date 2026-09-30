import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, FileText, LayoutDashboard, ShoppingCart, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUserId } from "@/lib/authUserId";
import { DEMO_BUSINESS_NAME, demoWelcomeKey } from "@/lib/demo/demoModeState";

const QUICK_LINKS = [
  { to: "/Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pos", label: "POS & tables", icon: ShoppingCart },
  { to: "/Invoices", label: "Invoices", icon: FileText },
  { to: "/Clients", label: "Customers", icon: Users },
  { to: "/Reports", label: "Reports", icon: BarChart3 },
];

/** Short welcome, once per demo session. No tour — the prospect explores immediately. */
export default function DemoWelcomeDialog({ businessName = DEMO_BUSINESS_NAME }) {
  const { user } = useAuth();
  const userId = getAuthUserId(user);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    try {
      const key = demoWelcomeKey(userId);
      if (window.sessionStorage.getItem(key) === "1") return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: still show once for this mount */
    }
    setOpen(true);
  }, [userId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md sm:rounded-2xl" data-testid="demo-welcome">
        <DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Demo mode</p>
          <DialogTitle className="text-2xl">Welcome to {businessName}</DialogTitle>
          <DialogDescription>
            You&apos;re exploring Paidly in Demo Mode. Everything is sample data — payments are simulated and no emails or messages are sent.
          </DialogDescription>
        </DialogHeader>
        <nav aria-label="Jump to" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUICK_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <Icon className="size-4 text-primary" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <Button type="button" className="w-full" onClick={() => setOpen(false)}>
          Start exploring
        </Button>
      </DialogContent>
    </Dialog>
  );
}
