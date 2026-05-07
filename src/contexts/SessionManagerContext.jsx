import { createContext, useContext } from "react";

export const SessionManagerContext = createContext(null);

export function useSessionManager() {
  return useContext(SessionManagerContext);
}
