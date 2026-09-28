import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import useCompanyContext from "@/hooks/useCompanyContext";
import { exitWorkforcePortal } from "@/lib/workforcePortal/switchPortal.js";

/**
 * Shown while this tab is inside an employee portal (/employee/<slug>), so it is always clear which
 * workforce the person is acting in — and how to get back to their own business, if they have one.
 */
export default function PortalContextBanner() {
  const { portalSlug } = useCompanyContext();
  const [companyName, setCompanyName] = useState("");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCompanyName("");
    if (!portalSlug) return undefined;
    supabase.rpc("get_workforce_portal", { p_slug: portalSlug }).then(({ data }) => {
      if (!cancelled && data?.found) setCompanyName(data.company_name || "");
    });
    return () => {
      cancelled = true;
    };
  }, [portalSlug]);

  if (!portalSlug) return null;

  const leave = async () => {
    setLeaving(true);
    await exitWorkforcePortal();
    window.location.assign("/Dashboard");
  };

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3"
    >
      <p className="flex min-w-0 items-center gap-2 text-sm">
        <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">
          Employee portal{companyName ? <> · <strong className="font-semibold">{companyName}</strong></> : null}
        </span>
      </p>
      <Button size="sm" variant="outline" className="shrink-0 rounded-xl" onClick={leave} disabled={leaving}>
        Leave portal
      </Button>
    </div>
  );
}
