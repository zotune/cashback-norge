import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: resolve("site"),
    lib: {
      entry: resolve("src/site/shared-data.ts"),
      name: "SharedData",
      fileName: () => "shared-data.js",
      formats: ["iife"],
    },
    target: "es2022",
  },
});
