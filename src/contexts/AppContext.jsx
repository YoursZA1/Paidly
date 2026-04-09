import { createContext, useContext, useState } from "react";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  return (
    <AppContext.Provider
      value={{
        loading,
        setLoading,
        notifications,
        setNotifications,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// Alias to avoid breaking interim imports while migrating to useApp.
export const useAppContext = useApp;
