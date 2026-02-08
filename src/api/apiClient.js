import { createClient } from './customClient';
// Custom API client - BreakInvoice Backend

// Create a client with authentication required
export const breakApi = createClient({
  appId: "6887a9d49af4acc63ae9062f", 
  requiresAuth: true // Ensure authentication is required for all operations
});
