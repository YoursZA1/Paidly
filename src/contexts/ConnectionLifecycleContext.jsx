/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from "react";

export const ConnectionLifecycleContext = createContext(null);

export function useConnectionLifecycle() {
  return useContext(ConnectionLifecycleContext);
}
