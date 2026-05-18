import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sharedDir = path.resolve(__dirname, 'shared')
const srcDir = path.resolve(__dirname, 'src')

// https://vite.dev/config/
// Environment: Vite loads .env, .env.local, .env.[mode] from project root.
// Only variables prefixed with VITE_ are exposed to the client (e.g. import.meta.env.VITE_SUPABASE_URL).
function envTruthy(v) {
  const s = String(v ?? '').trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}

export default defineConfig(async ({ mode }) => {
  const envDir = '.';
  const env = loadEnv(mode, envDir, '');
  if (
    mode === 'production' &&
    process.env.VERCEL === '1' &&
    !String(env.VITE_SERVER_URL || '').trim() &&
    !envTruthy(env.VITE_SUPABASE_ONLY)
  ) {
    console.info(
      '[vite] VITE_SERVER_URL unset — OK when /api/* is served on the same deployment (relative fetch). Set VITE_SERVER_URL only if the API is on another host (e.g. https://api.example.com). Use VITE_SUPABASE_ONLY=1 to silence this line if you intentionally have no backend features beyond Supabase.'
    );
  }
  const serverUrl = env.VITE_SERVER_URL || 'http://localhost:5179';
  const backendTarget = serverUrl.replace(/\/$/, '');

  return {
    plugins: await (async () => {
      const plugins = [react()];
      // Dynamically import the Sentry Vite plugin — only when SENTRY_AUTH_TOKEN is set.
      // Static import causes Rollup build-import-analysis failures for plain .js Sentry consumers.
      if (process.env.SENTRY_AUTH_TOKEN) {
        const { sentryVitePlugin } = await import('@sentry/vite-plugin');
        plugins.push(sentryVitePlugin({
          authToken: process.env.SENTRY_AUTH_TOKEN,
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT || 'paidly-frontend',
          telemetry: false,
        }));
      }
      return plugins;
    })(),
    resolve: {
      alias: [
        { find: '@', replacement: srcDir },
        { find: '@shared', replacement: sharedDir },
        { find: '@shared/plans.js', replacement: path.join(sharedDir, 'plans.js') },
      ],
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
            // PDF stack (jspdf/html2canvas/html2pdf.js) is imported only via dynamic await import()
            // in generatePdfFromElement.js — let Rollup create a natural lazy chunk for it.
            // NOTE: if a future change adds a static import, re-add 'vendor' assignment here to
            // avoid the "Circular chunk: pdf -> vendor -> pdf" TDZ that occurred previously.
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('html2pdf')) {
              return 'pdf';
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
      // `vendor` no longer includes the PDF stack — html2pdf/jspdf/html2canvas are in the lazy `pdf`
      // chunk. chunkSizeWarningLimit reduced accordingly (vendor is now ~1,900 kB min).
      chunkSizeWarningLimit: 2100,
      // Generate source maps only when uploading to Sentry (keeps public build clean)
      sourcemap: !!process.env.SENTRY_AUTH_TOKEN,
    },
  };
});