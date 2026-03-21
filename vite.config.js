import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
// Environment: Vite loads .env, .env.local, .env.[mode] from project root.
// Only variables prefixed with VITE_ are exposed to the client (e.g. import.meta.env.VITE_SUPABASE_URL).
export default defineConfig(({ mode }) => {
  const envDir = '.';
  const env = loadEnv(mode, envDir, '');
  // Shipments from Vercel without this embed localhost in the bundle → login hits the user's machine and fails CORS.
  if (
    mode === 'production' &&
    process.env.VERCEL === '1' &&
    !String(env.VITE_SERVER_URL || '').trim()
  ) {
    throw new Error(
      'Production build on Vercel requires VITE_SERVER_URL (your Node API base URL, no trailing slash). ' +
        'Vercel → Project → Settings → Environment Variables → add VITE_SERVER_URL for Production (and Preview if you use it), then redeploy.'
    );
  }
  const serverUrl = env.VITE_SERVER_URL || 'http://localhost:5179';
  const backendTarget = serverUrl.replace(/\/$/, '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    envDir: '.',
    server: {
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@supabase/supabase-js')) return 'supabase';
              if (id.includes('recharts')) return 'recharts';
              if (id.includes('framer-motion')) return 'framer-motion';
              if (id.includes('lucide-react')) return 'lucide';
              if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf';
              if (id.includes('xlsx')) return 'xlsx';
              return 'vendor';
            }
          },
        },
      },
      chunkSizeWarningLimit: 1500,
    },
  };
});