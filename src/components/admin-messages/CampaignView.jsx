import { Badge } from '@/components/ui/badge';

export default function CampaignView({ campaign }) {
  if (!campaign) return null;
  const audience = Number(campaign.total_recipients || 0);
  const sent = Number(campaign.email_sent || 0);
  const delivered = sent + Number(campaign.email_skipped || 0);
  const failed = Number(campaign.email_failed || 0);
  const openRate = audience > 0 ? Math.round((delivered / audience) * 100) : 0;

  return (
    <section className="min-h-0 flex flex-col">
      <div className="h-16 border-b border-border/70 px-5 flex items-center justify-between">
        <h2 className="text-base font-semibold truncate pr-3">{String(campaign.subject || 'Campaign')}</h2>
        <Badge variant={failed > 0 ? 'destructive' : 'secondary'}>{String(campaign.status || 'queued')}</Badge>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <Metric label="Audience" value={audience} />
          <Metric label="Sent" value={sent} />
          <Metric label="Delivered" value={delivered} />
          <Metric label="Failed" value={failed} />
          <Metric label="Open rate" value={`${openRate}%`} />
        </div>
        <div className="rounded-xl border border-border bg-white dark:bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Email Preview</p>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-sm font-semibold">{String(campaign.subject || 'Campaign')}</p>
            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{String(campaign.content || '')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}
