import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/www/",
  plugins: [react()],
  build: {
    // Maptalks is intentionally lazy-loaded only when the map tool is opened.
    // Keep the warning above that isolated map chunk so normal builds stay quiet.
    chunkSizeWarningLimit: 700,
  },
});
