import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: { env: Record<string, string | undefined> };

// /api/* -> FastAPI (no CORS needed). See docs/api.md.
// API_TARGET points the UI at another backend (a teammate's, or a test one); PORT moves the dev server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": { target: process.env.API_TARGET ?? "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
