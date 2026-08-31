import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, X, Smartphone, Monitor } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import {
  PWA_INSTALL_DISMISSED_KEY,
  isPosRelatedPath,
  setCustomInstallUiDismissed,
} from "@/lib/pwa/installPrompt";

/**
 * iOS install hint. Chromium uses the native install banner (we do not intercept
 * `beforeinstallprompt`). The Chromium Install Paidly button is hidden unless a
 * deferred prompt exists (tests only).
 */
export default function PWAInstallPrompt() {
  const { pathname } = useLocation();
  const { canInstall, isInstalled, isIosInstall, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const handleInstall = async () => {
    const { outcome } = await install();
    if (outcome === "accepted" || outcome === "dismissed") setDismissed(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setCustomInstallUiDismissed(true);
  };

  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const Icon = isIOS ? Smartphone : Monitor;
  const title = "Install Paidly";
  const instructions = isIOS
    ? "Tap the Share button, then 'Add to Home Screen'"
    : "Install Paidly on this device for a faster, app-like experience.";

  if (isPosRelatedPath(pathname)) return null;
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
                Install Paidly
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
