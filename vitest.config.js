import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.resolve(__dirname, "shared");
const srcDir = path.resolve(__dirname, "./src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Keep in lockstep with vite.config.js app aliases (+ resend test double).
    alias: {
      "@": srcDir,
      "@shared": sharedDir,
      "@shared/plans.js": path.join(sharedDir, "plans.js"),
      resend: path.resolve(__dirname, "./tests/mocks/resend-test-double.js"),
      "virtual:pwa-register/react": path.resolve(__dirname, "./tests/mocks/pwa-register-react.js"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup/vitest.setup.js"],
    // External / exFAT volumes make cold transforms slow; default 5s flakes on first dynamic imports.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: ["tests/**/*.test.js", "tests/**/*.test.jsx", "tests/**/*.test.ts"],
    // exFAT volumes recreate AppleDouble sidecars that Vite cannot parse
    exclude: ["**/node_modules/**", "**/._*", "**/.__*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.js", "src/**/*.jsx", "src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/main.jsx", "src/App.jsx", "**/*.test.*", "**/node_modules/**"],
    },
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
