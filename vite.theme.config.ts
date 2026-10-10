import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: resolve("site"),
    lib: { entry: resolve("src/site/theme.ts"), name: "CashbackTheme", fileName: () => "theme.js", formats: ["iife"] },
    target: "es2022",
  },
});
