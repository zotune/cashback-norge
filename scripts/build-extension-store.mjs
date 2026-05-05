import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const extensionDir = resolve("dist/extension");
const manifestPath = resolve(extensionDir, "manifest.json");

if (!existsSync(manifestPath)) {
  throw new Error("dist/extension/manifest.json does not exist. Run build:extension first.");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const version = manifest.version;

if (typeof version !== "string" || version.length === 0) {
  throw new Error("Extension manifest is missing a valid version.");
}

const iconPaths = new Set();
for (const iconMap of [manifest.icons, manifest.action?.default_icon]) {
  if (iconMap && typeof iconMap === "object") {
    for (const iconPath of Object.values(iconMap)) {
      if (typeof iconPath === "string") iconPaths.add(iconPath);
    }
  }
}

const entries = [
  "manifest.json",
  "popup.html",
  "cashback-index.json",
  "assets",
  ...iconPaths,
];

for (const entry of entries) {
  if (!existsSync(resolve(extensionDir, entry))) {
    throw new Error(`Missing extension store package entry: ${entry}`);
  }
}

const outputName = `cashback-norge-extension-v${version}-store.zip`;
const outputPath = resolve("dist", outputName);
rmSync(outputPath, { force: true });

const result = spawnSync(
  "zip",
  ["-r", "-X", `../${outputName}`, ...entries, "-x", "*.DS_Store", "*/.DS_Store"],
  {
    cwd: extensionDir,
    encoding: "utf8",
    stdio: "pipe",
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stdout.write(result.stdout);
  throw new Error("Failed to create extension store zip.");
}

process.stdout.write(result.stdout);
console.log(`Created ${outputPath}`);
