import { useCallback, useEffect, useState } from "react";
import {
  getInstallPromptSnapshot,
  initInstallPromptListeners,
  promptPaidlyInstall,
  subscribeInstallPrompt,
} from "@/lib/pwa/installPrompt";

const EMPTY = {
  canInstall: false,
  isInstalled: false,
  isIosInstall: false,
  needsManualInstall: false,
};

/**
 * Shared install-state for Settings, account menus, and the native prompt.
 * Does not throw on browsers without `beforeinstallprompt`.
 */
export function useInstallPrompt() {
  const [state, setState] = useState(() => {
    if (typeof window === "undefined") return EMPTY;
    initInstallPromptListeners();
    return getInstallPromptSnapshot();
  });

  useEffect(() => {
    initInstallPromptListeners();
    setState(getInstallPromptSnapshot());
    return subscribeInstallPrompt(setState);
  }, []);

  const install = useCallback(() => promptPaidlyInstall(), []);

  return {
    ...state,
    install,
  };
}
