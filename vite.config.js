import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
// Environment: Vite loads .env, .env.local, .env.[mode] from project root.
// Only variables prefixed with VITE_ are exposed to the client (e.g. import.meta.env.VITE_SUPABASE_URL).
export default defineConfig(({ mode }) => {
  const envDir = '.';
  const serverUrl = loadEnv(mode, envDir, '').VITE_SERVER_URL || 'http://localhost:5179';
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