const MANUAL_OVERRIDES_STORAGE_KEY = "manual_overrides_log";

export const logManualOverride = (override) => {
  try {
    const log = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...override
    };

    const stored = localStorage.getItem(MANUAL_OVERRIDES_STORAGE_KEY);
    const logs = stored ? JSON.parse(stored) : [];
    const updatedLogs = [log, ...logs];
    localStorage.setItem(MANUAL_OVERRIDES_STORAGE_KEY, JSON.stringify(updatedLogs));
    
    // Dispatch event for real-time updates
    window.dispatchEvent(new CustomEvent("manualOverrideLogged", { detail: log }));
    return log;
  } catch (error) {
    console.error("Failed to log manual override:", error);
  }
};

export { MANUAL_OVERRIDES_STORAGE_KEY };
