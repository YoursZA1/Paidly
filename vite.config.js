import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
// Environment: Vite loads .env, .env.local, .env.[mode] from project root.
// Only variables prefixed with VITE_ are exposed to the client (e.g. import.meta.env.VITE_SUPABASE_URL).
function envTruthy(v) {
  const s = String(v ?? '').trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}

export default defineConfig(({ mode }) => {
  const envDir = '.';
  const env = loadEnv(mode, envDir, '');
  if (
    mode === 'production' &&
    process.env.VERCEL === '1' &&
    !String(env.VITE_SERVER_URL || '').trim() &&
    !envTruthy(env.VITE_SUPABASE_ONLY)
  ) {
    console.warn(
      '[vite] VITE_SERVER_URL is unset for this Vercel production build. Email/password auth will use Supabase directly; set VITE_SERVER_URL for API rate limits, waitlist, and currency — or VITE_SUPABASE_ONLY=1 if you omit the Node API.'
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
        /** Same Node server as /api — affiliate dashboard: GET /api/affiliate/dashboard (see server/src/index.js) */
        '/affiliate': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            // PDF stack must stay in `vendor` (not a dedicated `pdf` chunk): a separate pdf chunk
            // caused "Circular chunk: pdf -> vendor -> pdf" and TDZ runtime errors.
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('html2pdf')) {
              return 'vendor';
            }
            if (id.includes('@supabase/supabase-js')) return 'supabase';
            if (id.includes('recharts')) return 'recharts';
            if (id.includes('framer-motion')) return 'framer-motion';
            if (id.includes('lucide-react')) return 'lucide';
            if (id.includes('xlsx')) return 'xlsx';
            // Safe leaf splits (used widely but rarely pull pdf stack); avoids vendor↔react/radix cycles.
            if (id.includes('date-fns')) return 'date-fns';
            if (id.includes('/axios/') || id.includes('node_modules/axios')) return 'axios';
            return 'vendor';
          },
        },
      },
      // Main `vendor` includes html2pdf/jspdf/html2canvas (~760kb min) — splitting them out caused
      // Rollup circular chunks + TDZ; splitting React/Radix caused vendor↔chunk cycles too.
      chunkSizeWarningLimit: 2800,
    },
  };
});