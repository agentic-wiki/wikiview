import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: {
    // The Go binary embeds this directory, so it lands where the server expects.
    outDir: "dist",
    // Cleared on every build so stale hashed assets do not accumulate. That also
    // deletes the placeholder //go:embed needs, which is why public/.gitkeep
    // exists: Vite copies publicDir into outDir, so the build puts it back.
    emptyOutDir: true,
  },
  server: {
    // In development the app runs on Vite and the API on the Go server, so
    // every /api call is proxied rather than the app learning a second origin.
    // SSE passes through untouched: Vite does not buffer proxied responses.
    proxy: { "/api": "http://localhost:8080" },
  },
});
