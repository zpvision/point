import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig(({ mode }) => ({
  root: "web",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./web/src", import.meta.url)) },
  },
  define: {
    "import.meta.env.VITE_LANDING_URL": JSON.stringify(
      loadEnv(mode, process.cwd(), "").NEXT_PUBLIC_LANDING_URL ||
        "http://localhost:5173",
    ),
  },
  build: { outDir: "dist" },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/legal": "http://127.0.0.1:8080",
    },
  },
}));
