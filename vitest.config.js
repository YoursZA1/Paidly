import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.resolve(__dirname, "shared");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": sharedDir,
      "@shared/plans.js": path.join(sharedDir, "plans.js"),
      // Tests only: server code imports `resend`; Vitest often does not apply vi.mock there.
      resend: path.resolve(__dirname, "./tests/mocks/resend-test-double.js"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js", "tests/**/*.test.jsx", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.js", "src/**/*.jsx"],
      exclude: ["src/main.jsx", "src/App.jsx", "**/*.test.*", "**/node_modules/**"],
    },
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
