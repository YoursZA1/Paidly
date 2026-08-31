import { Download, MonitorSmartphone, CheckCircle2, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/**
 * Settings → My Account: install Paidly as an app, or confirm it is already installed.
 */
export default function InstallPaidlyCard() {
  const { canInstall, install, isInstalled, isIosInstall, needsManualInstall } = useInstallPrompt();

  const onInstall = async () => {
    await install();
  };

  return (
    <section className="bg-card border border-border rounded-2xl p-4 sm:p-7 mb-4 sm:mb-5 shadow-sm min-w-0 overflow-x-hidden">
      <div className="mb-5 pb-4 border-b border-border/60">
        <h3 className="text-base font-semibold text-foreground">Application</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Install Paidly on your computer or mobile device for a faster app-like experience.
        </p>
      </div>

      {isInstalled ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">Paidly is installed on this device.</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Launch it from your desktop, dock, or home screen.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {canInstall ? (
            <Button type="button" onClick={() => void onInstall()} className="min-h-12">
              <Download className="h-4 w-4" aria-hidden />
              Install Paidly
            </Button>
          ) : null}

          {isIosInstall ? (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
              <Share className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">Add Paidly to your Home Screen</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Tap Share → Add to Home Screen
                </p>
              </div>
            </div>
          ) : null}

          {needsManualInstall ? (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
              <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">Add Paidly to Desktop</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Open your browser menu and choose Install Paidly, or Add to Dock / home screen.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
