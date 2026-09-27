import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Link2, Loader2, Plug, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  archiveCustomPosProvider,
  connectYocoPos,
  deletePosConnection,
  getPosOAuthStatus,
  listPosConnections,
  listPosProviders,
  requestCustomPosProvider,
  startSquareOAuthConnect,
  updatePosConnection,
} from "@/services/PosIntegrationService";
import { CUSTOM_PROVIDER_METHODS, POS_PROVIDER_KIND_LABEL, POS_PROVIDER_NOT_SUPPORTED } from "@shared/pos/posProviderCatalog.js";

const STATUS_BADGE = {
  connected: { label: "Connected", variant: "default" },
  available: { label: "Available", variant: "secondary" },
  disabled: { label: "Disabled", variant: "outline" },
};

const EMPTY_CUSTOM = { provider_name: "", display_name: "", method: "other", website: "", contact: "", notes: "" };

/**
 * POS → Payment provider. One section for every till payment provider:
 *   - providers Paidly actually supports (Yoco, Square, Ozow, Paidly Pay when live) with real status
 *   - custom providers the business asked for (recorded as requests — never "connected")
 * None is the default. Secrets (Yoco key, Square tokens) are sent once to the server and never shown again.
 */
export default function PosIntegrationSettings() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [connections, setConnections] = useState([]);
  const [oauthStatus, setOauthStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState(EMPTY_CUSTOM);
  const [yocoKey, setYocoKey] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [providers, rows, status] = await Promise.all([
        listPosProviders(),
        listPosConnections().catch(() => []),
        getPosOAuthStatus().catch(() => null),
      ]);
      setCatalog(providers);
      setConnections(rows);
      setOauthStatus(status);
    } catch (err) {
      toast({ title: "Could not load payment providers", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Square OAuth returns here with ?pos_connected= / ?pos_error=.
  useEffect(() => {
    const connected = searchParams.get("pos_connected");
    const error = searchParams.get("pos_error");
    if (!connected && !error) return;
    toast(
      connected
        ? { title: connected === "square" ? "Square connected" : "Provider connected", description: "Sales will sync automatically." }
        : { title: "Connection failed", description: error.replace(/_/g, " "), variant: "destructive" }
    );
    const next = new URLSearchParams(searchParams);
    next.delete("pos_connected");
    next.delete("pos_error");
    setSearchParams(next, { replace: true });
    if (connected) void load();
  }, [searchParams, setSearchParams, toast, load]);

  const options = catalog?.providers || [];
  const selected = options.find((p) => p.id === choice) || null;
  const shown = options.filter((p) => STATUS_BADGE[p.status]);
  const customRows = catalog?.custom || [];
  const squareConfigured = oauthStatus?.square?.configured !== false;

  const connectYoco = async () => {
    if (!yocoKey.trim()) return;
    setBusy("yoco");
    try {
      await connectYocoPos({ api_secret_key: yocoKey.trim() });
      setYocoKey("");
      setConnectOpen(false);
      toast({ title: "Yoco connected", description: "Webhook registered automatically. Sales will sync to Paidly." });
      await load();
    } catch (err) {
      toast({ title: "Could not connect Yoco", description: err?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const connectSquare = async () => {
    setBusy("square");
    try {
      const result = await startSquareOAuthConnect();
      if (!result?.authorize_url) throw new Error("Missing Square authorization URL");
      window.location.assign(result.authorize_url);
    } catch (err) {
      toast({ title: "Could not start Square connect", description: err?.message, variant: "destructive" });
      setBusy("");
    }
  };

  const saveCustom = async () => {
    setBusy("custom");
    try {
      await requestCustomPosProvider(custom);
      setCustomOpen(false);
      setCustom(EMPTY_CUSTOM);
      toast({ title: "Provider request saved", description: "It isn't connected — Paidly needs an integration for it first." });
      await load();
    } catch (err) {
      toast({ title: "Not saved", description: err?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const toggleConnection = async (connection) => {
    const next = connection.status === "active" ? "disabled" : "active";
    try {
      await updatePosConnection(connection.id, { status: next });
      toast({ title: next === "active" ? "Provider enabled" : "Provider disabled" });
      await load();
    } catch (err) {
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    }
  };

  const removeConnection = async (id) => {
    try {
      await deletePosConnection(id);
      toast({ title: "Provider disconnected" });
      await load();
    } catch (err) {
      toast({ title: "Could not disconnect", description: err?.message, variant: "destructive" });
    }
  };

  const legacyWebhook = connections.filter((c) => c.provider === "generic");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Connect the payment provider your till uses. Cash always works. Paidly never treats a sale as paid until the provider confirms it.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh providers">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button type="button" size="sm" onClick={() => { setChoice(""); setConnectOpen(true); }}>
            <Plug className="size-4" /> Connect provider
          </Button>
        </div>
      </div>

      {loading && !catalog ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : shown.length === 0 && customRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No payment provider connected yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {shown.map((provider) => {
            const connection = connections.find((c) => c.id === provider.connection_id);
            const badge = STATUS_BADGE[provider.status];
            return (
              <li key={provider.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium">{provider.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {POS_PROVIDER_KIND_LABEL[provider.kind]}
                    {provider.connect === "platform" ? " · managed by Paidly" : ""}
                    {provider.last_event_at ? ` · last sale ${new Date(provider.last_event_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {connection ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => void toggleConnection(connection)}>
                        {connection.status === "active" ? "Disable" : "Enable"}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label={`Disconnect ${provider.label}`}>
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Disconnect {provider.label}?</AlertDialogTitle>
                            <AlertDialogDescription>Sales stop syncing from {provider.label}. Past sales stay in Paidly.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void removeConnection(connection.id)}>Disconnect</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
          {customRows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">{row.display_name || row.provider_name}</p>
                <p className="text-xs text-muted-foreground">
                  Your provider · {CUSTOM_PROVIDER_METHODS.find((m) => m.id === row.method)?.label || "Other"} · needs a Paidly integration before it can take payments
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Requested — not connected</Badge>
                <Button variant="ghost" size="sm" aria-label={`Remove ${row.provider_name}`} onClick={() => void archiveCustomPosProvider(row.id).then(load)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {legacyWebhook.length ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {legacyWebhook.length} manual webhook connection{legacyWebhook.length === 1 ? "" : "s"} no longer import sales (their signing secret was shared, so a
          sale sent through them is not proof of payment). Remove {legacyWebhook.length === 1 ? "it" : "them"} and connect Yoco or Square instead.
          {legacyWebhook.map((c) => (
            <Button key={c.id} variant="link" size="sm" className="h-auto px-1 text-xs" onClick={() => void removeConnection(c.id)}>
              Remove {c.label || "connection"}
            </Button>
          ))}
        </p>
      ) : null}

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect payment provider</DialogTitle>
            <DialogDescription>Choose your provider. Only providers Paidly has built an integration for are listed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="pos-provider-choice">Provider</Label>
            <Select value={choice} onValueChange={setChoice}>
              <SelectTrigger id="pos-provider-choice" className="h-11">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {options.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label} · {POS_PROVIDER_KIND_LABEL[p.kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selected ? <p className="text-sm text-muted-foreground">{selected.description}</p> : null}

            {selected?.connect === "yoco_key" ? (
              selected.status === "connected" ? (
                <p className="text-sm">Yoco is already connected.</p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="pos-yoco-key">Yoco secret API key</Label>
                  <Input id="pos-yoco-key" type="password" autoComplete="off" className="font-mono text-xs" placeholder="sk_live_… or sk_test_…" value={yocoKey} onChange={(e) => setYocoKey(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Yoco Developer Hub → API keys. Stored encrypted on Paidly&apos;s server and never shown again.</p>
                  <Button className="w-full" disabled={busy === "yoco" || !yocoKey.trim()} onClick={() => void connectYoco()}>
                    {busy === "yoco" ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} Connect Yoco
                  </Button>
                </div>
              )
            ) : null}
            {selected?.connect === "square_oauth" ? (
              selected.status === "connected" ? (
                <p className="text-sm">Square is already connected.</p>
              ) : (
                <div className="space-y-2">
                  <Button className="w-full" disabled={busy === "square" || !squareConfigured} onClick={() => void connectSquare()}>
                    {busy === "square" ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} Connect with Square
                  </Button>
                  {!squareConfigured ? <p className="text-xs text-amber-700 dark:text-amber-400">Square isn&apos;t set up on this Paidly deployment yet.</p> : null}
                </div>
              )
            ) : null}
            {selected?.connect === "platform" ? (
              <p className="rounded-lg bg-muted p-3 text-sm">
                {selected.status === "available"
                  ? `${selected.label} is available on this deployment — the till's EFT / Digital button uses it. There's nothing to connect.`
                  : `${selected.label} isn't available on this deployment yet. You don't need your own ${selected.label} account for it.`}
              </p>
            ) : null}
            {selected?.connect === "coming_soon" ? (
              <p className="rounded-lg bg-muted p-3 text-sm">{selected.status === "available" ? `${selected.label} is enabled.` : `${selected.label} isn't live for businesses yet.`}</p>
            ) : null}

            <div className="border-t border-border pt-3">
              <p className="text-sm font-medium">Don&apos;t see your provider?</p>
              <p className="mb-2 text-xs text-muted-foreground">{POS_PROVIDER_NOT_SUPPORTED.payfast}</p>
              <Button variant="outline" className="w-full" onClick={() => { setConnectOpen(false); setCustomOpen(true); }}>
                <Plus className="size-4" /> Add your own provider
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add your own provider</DialogTitle>
            <DialogDescription>
              Tell us which provider you use. It&apos;s saved as a request — it won&apos;t take payments or show as connected until Paidly builds an
              integration for it. Don&apos;t enter passwords or API keys here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-name">Provider name *</Label>
              <Input id="cp-name" maxLength={80} value={custom.provider_name} onChange={(e) => setCustom({ ...custom, provider_name: e.target.value })} placeholder="e.g. PayFast, iKhokha, SnapScan" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-display">Display name</Label>
              <Input id="cp-display" maxLength={80} value={custom.display_name} onChange={(e) => setCustom({ ...custom, display_name: e.target.value })} placeholder="What your staff call it" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-method">Payment type</Label>
              <Select value={custom.method} onValueChange={(v) => setCustom({ ...custom, method: v })}>
                <SelectTrigger id="cp-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_PROVIDER_METHODS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-web">Provider website</Label>
              <Input id="cp-web" maxLength={200} value={custom.website} onChange={(e) => setCustom({ ...custom, website: e.target.value })} placeholder="https://" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-notes">Notes</Label>
              <Textarea id="cp-notes" rows={2} maxLength={1000} value={custom.notes} onChange={(e) => setCustom({ ...custom, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={busy === "custom" || !custom.provider_name.trim()} onClick={() => void saveCustom()}>
              {busy === "custom" ? <Loader2 className="size-4 animate-spin" /> : null} Save request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
