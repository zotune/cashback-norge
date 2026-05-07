import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build as viteBuild, defineConfig, type Plugin } from "vite";

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
const contentEntry = resolve("src/extension/content.ts");

function buildContentScriptPlugin(outDir: string): Plugin {
  return {
    name: "build-content-script",
    async closeBundle() {
      await viteBuild({
        build: {
          emptyOutDir: false,
          lib: {
            entry: contentEntry,
            fileName: () => "assets/content.js",
            formats: ["iife"],
            name: "CashbackVarslerContent",
          },
          minify: true,
          outDir,
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
          target: "es2022",
        },
        configFile: false,
        publicDir: false,
      });
    },
  };
}

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: extensionOutDir,
    rollupOptions: {
      input: {
        background: resolve("src/extension/background.ts"),
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
    buildContentScriptPlugin(extensionOutDir),
  ],
  publicDir: resolve("src/extension/public"),
});
