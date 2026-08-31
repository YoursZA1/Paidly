import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plug, Copy, Plus, Trash2, RefreshCw, Loader2, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  POS_PROVIDERS,
  listPosConnections,
  createPosConnection,
  updatePosConnection,
  deletePosConnection,
  buildGenericWebhookExample,
  getPosOAuthStatus,
  startSquareOAuthConnect,
  connectYocoPos,
} from "@/services/PosIntegrationService";

function CopyField({ label, value, description }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Copied", description: `${label} copied to clipboard.` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <div className="flex gap-2">
        <Input readOnly value={value || ""} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" onClick={onCopy} title={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function PosIntegrationSettings() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [connectingSquare, setConnectingSquare] = useState(false);
  const [connectingYoco, setConnectingYoco] = useState(false);
  const [oauthStatus, setOauthStatus] = useState(null);
  const [newProvider, setNewProvider] = useState("square");
  const [newLabel, setNewLabel] = useState("");
  const [yocoApiKey, setYocoApiKey] = useState("");
  const [revealedSecrets, setRevealedSecrets] = useState({});

  const selectedProvider = useMemo(
    () => POS_PROVIDERS.find((p) => p.id === newProvider) || POS_PROVIDERS[0],
    [newProvider]
  );

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, status] = await Promise.all([listPosConnections(), getPosOAuthStatus().catch(() => null)]);
      setConnections(rows);
      setOauthStatus(status);
    } catch (err) {
      const msg = err?.message || "Please try again.";
      const isMissingTable = /pos_connections|schema cache|could not find the table/i.test(msg);
      toast({
        title: "Could not load POS connections",
        description: isMissingTable
          ? "POS tables are not in your database yet. Run scripts/apply-pos-integrations.sql in Supabase → SQL Editor, then refresh this page."
          : msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    const connected = searchParams.get("pos_connected");
    const error = searchParams.get("pos_error");
    if (connected) {
      toast({
        title: connected === "square" ? "Square connected" : "POS connected",
        description: "Sales will sync automatically.",
      });
      const next = new URLSearchParams(searchParams);
      next.delete("pos_connected");
      next.delete("pos_error");
      setSearchParams(next, { replace: true });
      void loadConnections();
    } else if (error) {
      toast({
        title: "Connection failed",
        description: error.replace(/_/g, " "),
        variant: "destructive",
      });
      const next = new URLSearchParams(searchParams);
      next.delete("pos_error");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, toast, loadConnections]);

  const examplePayload = useMemo(() => JSON.stringify(buildGenericWebhookExample(), null, 2), []);

  const handleCreateManual = async () => {
    setCreating(true);
    try {
      const result = await createPosConnection({
        provider: newProvider,
        label: newLabel.trim() || undefined,
      });
      const created = result?.connection;
      if (created?.id && created?.webhook_secret) {
        setRevealedSecrets((prev) => ({ ...prev, [created.id]: created.webhook_secret }));
      }
      setNewLabel("");
      await loadConnections();
      toast({
        title: "POS connection created",
        description: "Copy the webhook URL and secret into your POS provider.",
      });
    } catch (err) {
      toast({
        title: "Could not create connection",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleConnectSquare = async () => {
    setConnectingSquare(true);
    try {
      const result = await startSquareOAuthConnect();
      const url = result?.authorize_url;
      if (!url) throw new Error("Missing Square authorization URL");
      window.location.assign(url);
    } catch (err) {
      toast({
        title: "Could not start Square connect",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
      setConnectingSquare(false);
    }
  };

  const handleConnectYoco = async () => {
    if (!yocoApiKey.trim()) {
      toast({ title: "API key required", description: "Paste your Yoco secret key (sk_test_ or sk_live_).", variant: "destructive" });
      return;
    }
    setConnectingYoco(true);
    try {
      await connectYocoPos({
        api_secret_key: yocoApiKey.trim(),
        label: newLabel.trim() || undefined,
      });
      setYocoApiKey("");
      setNewLabel("");
      await loadConnections();
      toast({
        title: "Yoco connected",
        description: "Webhook registered automatically. Sales will sync to Paidly.",
      });
    } catch (err) {
      toast({
        title: "Could not connect Yoco",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setConnectingYoco(false);
    }
  };

  const handleToggleStatus = async (connection) => {
    const next = connection.status === "active" ? "disabled" : "active";
    try {
      await updatePosConnection(connection.id, { status: next });
      await loadConnections();
      toast({ title: next === "active" ? "Connection enabled" : "Connection disabled" });
    } catch (err) {
      toast({
        title: "Update failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRotateSecret = async (connectionId) => {
    try {
      const result = await updatePosConnection(connectionId, { rotate_secret: true });
      const secret = result?.connection?.webhook_secret;
      if (secret) {
        setRevealedSecrets((prev) => ({ ...prev, [connectionId]: secret }));
      }
      toast({
        title: "Webhook secret rotated",
        description: "Update the secret in your POS provider.",
      });
    } catch (err) {
      toast({
        title: "Rotate failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (connectionId) => {
    try {
      await deletePosConnection(connectionId);
      await loadConnections();
      toast({ title: "POS connection removed" });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const squareConfigured = oauthStatus?.square?.configured !== false;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/30 p-4">
        <Plug className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Connect your point of sale</p>
          <p className="text-sm text-muted-foreground">
            Paidly POS is a till inside the app (sidebar → POS). These connections are for external
            hardware — Square, Yoco, or a generic webhook. All of them write the same sales events
            and decrement catalog stock when SKU or barcode matches.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4 space-y-4">
        <h3 className="text-sm font-semibold">Add connection</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={newProvider} onValueChange={setNewProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Choose provider" />
              </SelectTrigger>
              <SelectContent>
                {POS_PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{selectedProvider?.description}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Label (optional)</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Main store terminal"
            />
          </div>
        </div>

        {selectedProvider?.connectType === "square_oauth" ? (
          <div className="space-y-3">
            <Button onClick={handleConnectSquare} disabled={connectingSquare || !squareConfigured}>
              {connectingSquare ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              Connect with Square
            </Button>
            {!squareConfigured ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Square OAuth is not configured on this deployment yet (SQUARE_APPLICATION_ID / SQUARE_APPLICATION_SECRET).
              </p>
            ) : null}
          </div>
        ) : null}

        {selectedProvider?.connectType === "yoco_key" ? (
          <div className="space-y-3 max-w-xl">
            <div className="space-y-1.5">
              <Label>Yoco secret API key</Label>
              <Input
                type="password"
                value={yocoApiKey}
                onChange={(e) => setYocoApiKey(e.target.value)}
                placeholder="sk_live_… or sk_test_…"
                className="font-mono text-xs"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                From Yoco Developer Hub → API keys. Paidly registers the webhook for you — no manual URL copy.
              </p>
            </div>
            <Button onClick={handleConnectYoco} disabled={connectingYoco}>
              {connectingYoco ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              Connect Yoco
            </Button>
          </div>
        ) : null}

        {selectedProvider?.connectType === "manual" ? (
          <Button onClick={handleCreateManual} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Create webhook connection
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Active connections</h3>
          <Button variant="ghost" size="sm" onClick={() => void loadConnections()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading connections…</p>
        ) : connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No POS connections yet. Connect a provider above.</p>
        ) : (
          <div className="space-y-4">
            {connections.map((connection) => {
              const isOAuth = connection.oauth_connected;
              const isManual = !isOAuth;

              return (
                <div key={connection.id} className="rounded-xl border border-border p-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div>
                      <p className="font-medium">{connection.label}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {connection.provider} · {connection.id.slice(0, 8)}
                        {connection.config?.square_merchant_id
                          ? ` · merchant ${String(connection.config.square_merchant_id).slice(0, 8)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {isOAuth ? <Badge variant="outline">Connected</Badge> : null}
                      <Badge variant={connection.status === "active" ? "default" : "secondary"}>
                        {connection.status}
                      </Badge>
                      <Button variant="outline" size="sm" onClick={() => void handleToggleStatus(connection)}>
                        {connection.status === "active" ? "Disable" : "Enable"}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove this POS connection?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Sales will stop syncing from this provider.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void handleDelete(connection.id)}>
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {isManual ? (
                    <>
                      <CopyField
                        label="Webhook URL"
                        value={connection.webhook_url}
                        description="Paste this into your POS provider webhook settings."
                      />
                      {revealedSecrets[connection.id] ? (
                        <CopyField
                          label="Webhook secret"
                          value={revealedSecrets[connection.id]}
                          description="Send as Authorization: Bearer &lt;secret&gt; or X-Paidly-Webhook-Secret header."
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">Webhook secret is hidden after creation.</p>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0"
                            onClick={() => void handleRotateSecret(connection.id)}
                          >
                            Rotate to reveal new secret
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Connected via secure authorization. Webhook is managed automatically
                      {connection.config?.connected_at
                        ? ` · since ${new Date(connection.config.connected_at).toLocaleString()}`
                        : ""}
                      .
                    </p>
                  )}

                  {connection.last_event_at ? (
                    <p className="text-xs text-muted-foreground">
                      Last sale received: {new Date(connection.last_event_at).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No sales received yet.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-border p-4 space-y-2">
        <h3 className="text-sm font-semibold">Generic webhook payload example</h3>
        <p className="text-xs text-muted-foreground">
          For non-OAuth providers, POST JSON to your webhook URL. Match products by{" "}
          <code className="text-xs">sku</code> or <code className="text-xs">barcode</code>.
        </p>
        <pre className="text-xs overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono">{examplePayload}</pre>
      </div>
    </div>
  );
}
