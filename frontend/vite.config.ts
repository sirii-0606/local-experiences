import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api/* -> FastAPI on :8000 (no CORS needed). See docs/api.md.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
