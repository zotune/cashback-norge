import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function copyCashbackIndexPlugin(sourcePath: string, targetPath: string): Plugin {
  return {
    name: "copy-cashback-index",
    closeBundle() {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    },
  };
}

const extensionOutDir = resolve("dist/extension");

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: extensionOutDir,
    rollupOptions: {
      input: {
        background: resolve("src/extension/background.ts"),
        content: resolve("src/extension/content.ts"),
        popup: resolve("popup.html"),
      },
      output: {
        entryFileNames: "assets/[name].js",
      },
    },
    target: "es2022",
  },
  plugins: [
    react(),
    copyCashbackIndexPlugin(
      resolve("data/cashback-index.json"),
      resolve(extensionOutDir, "cashback-index.json"),
    ),
  ],
  publicDir: resolve("src/extension/public"),
});
