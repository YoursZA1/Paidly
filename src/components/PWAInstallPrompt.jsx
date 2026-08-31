import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, X, Smartphone, Monitor } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/**
 * Optional overlay. Uses the shared install listener in `installPrompt.js`
 * — do not attach a second `beforeinstallprompt` handler here.
 */
export default function PWAInstallPrompt() {
  const { canInstall, isInstalled, isIosInstall, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("pwa-prompt-dismissed") === "true";
    } catch {
      return false;
    }
  });

  const handleInstall = async () => {
    const { outcome } = await install();
    if (outcome === "accepted") setDismissed(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("pwa-prompt-dismissed", "true");
    } catch {
      /* ignore */
    }
  };

  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const Icon = isIOS ? Smartphone : Monitor;
  const title = "Install Paidly";
  const instructions = isIOS
    ? "Tap the Share button, then 'Add to Home Screen'"
    : "Use Install Paidly in Settings or your account menu";

  if (isInstalled || dismissed || (!canInstall && !isIosInstall)) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 right-4 z-50 max-w-sm"
      >
        <Card className="bg-white border border-primary/20 shadow-xl">
          <CardContent>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/15 rounded-lg flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
                  <p className="text-xs text-slate-600 mt-1">{instructions}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDismiss}
                className="h-6 w-6 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {canInstall && (
              <Button
                onClick={() => void handleInstall()}
                className="w-full bg-primary hover:bg-primary/90 text-white text-sm py-2"
              >
                <Download className="w-4 h-4 mr-2" />
                Install App
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
