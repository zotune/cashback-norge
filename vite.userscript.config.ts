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
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      native-backend.cloud.pji.nu
// @connect      browser-extension-backend.cloud.pji.nu
// @connect      godpris.no
// @connect      www.klarna.com
// @connect      gql.prisradar.no
// @connect      prisradar.no
// @run-at       document-idle
// @updateURL    ${PAGES_URL}/cashback-varsler.user.js
// @downloadURL  ${PAGES_URL}/cashback-varsler.user.js
// ==/UserScript==`;

const CHROME_SHIM = `\
function readLocalStorageValue(key) {
  const value = localStorage.getItem(key);
  if (value === null) return undefined;
  try { return JSON.parse(value); } catch(_e) { return undefined; }
}
function writeLocalStorageValue(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(_e) {}
}
async function readUserscriptStorageValue(key) {
  if (typeof GM_getValue === "function") {
    const value = GM_getValue(key, undefined);
    return value === undefined ? readLocalStorageValue(key) : value;
  }
  if (typeof GM !== "undefined" && typeof GM.getValue === "function") {
    const value = await GM.getValue(key, undefined);
    return value === undefined ? readLocalStorageValue(key) : value;
  }
  return readLocalStorageValue(key);
}
async function writeUserscriptStorageValue(key, value) {
  if (typeof GM_setValue === "function") {
    await GM_setValue(key, value);
    writeLocalStorageValue(key, value);
    return;
  }
  if (typeof GM !== "undefined" && typeof GM.setValue === "function") {
    await GM.setValue(key, value);
    writeLocalStorageValue(key, value);
    return;
  }
  writeLocalStorageValue(key, value);
}
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
        void (async () => {
          const r = {};
          const keyList = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys ?? {});
          for (const k of keyList) {
            const v = await readUserscriptStorageValue(k);
            if (v !== undefined) r[k] = v;
          }
          cb(r);
        })();
      },
      set(items, cb) {
        void (async () => {
          for (const [k, v] of Object.entries(items)) {
            await writeUserscriptStorageValue(k, v);
          }
          cb?.();
        })();
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
