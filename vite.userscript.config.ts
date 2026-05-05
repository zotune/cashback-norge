import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function userscriptBannerPlugin(banner: string, fileName: string): Plugin {
  return {
    name: "userscript-banner",
    closeBundle() {
      const filePath = resolve("site", fileName);
      const existing = readFileSync(filePath, "utf-8");
      writeFileSync(filePath, `${banner}\n${existing}`);
    },
  };
}

const PAGES_URL = "https://cashbacknorge.no";

const VERSION = `${Math.floor(Date.now() / 1000)}`;

const USERSCRIPT_BANNER = `\
// ==UserScript==
// @name         cashbacknorge.no
// @namespace    ${PAGES_URL}/
// @version      ${VERSION}
// @description  Vis cashback-tilbud automatisk på norske nettbutikker
// @author       zotune
// @icon         ${PAGES_URL}/favicon.png
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @updateURL    ${PAGES_URL}/cashback-varsler.user.js
// @downloadURL  ${PAGES_URL}/cashback-varsler.user.js
// ==/UserScript==`;

const CHROME_SHIM = `\
const chrome = {
  runtime: {
    onMessage: { addListener() {} },
    sendMessage(_m, cb) { cb?.({ ok: false, reason: "userscript" }); },
    get lastError() { return undefined; },
    getURL() { return "${PAGES_URL}/cashback-index.json"; },
  },
  storage: {
    local: {
      get(keys, cb) {
        const r = {};
        for (const k of keys) {
          const v = localStorage.getItem(k);
          if (v !== null) try { r[k] = JSON.parse(v); } catch(_e) {}
        }
        cb(r);
      },
      set(items) {
        for (const [k, v] of Object.entries(items)) {
          try { localStorage.setItem(k, JSON.stringify(v)); } catch(_e) {}
        }
      },
    },
  },
};`;

export default defineConfig({
  build: {
    outDir: resolve("site"),
    emptyOutDir: false,
    lib: {
      entry: resolve("src/extension/content.ts"),
      formats: ["iife"],
      name: "CashbackVarsler",
      fileName: () => "cashback-varsler.user.js",
    },
    rollupOptions: {
      output: {
        intro: CHROME_SHIM,
      },
    },
    target: "es2022",
    minify: false,
  },
  plugins: [userscriptBannerPlugin(USERSCRIPT_BANNER, "cashback-varsler.user.js")],
});
