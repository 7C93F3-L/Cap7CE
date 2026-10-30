import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resourceCatalogAliases } from "./scripts/resource-catalog-vite";

export default defineConfig({
  base: "./",
  plugins: [resourceCatalogAliases(), react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
