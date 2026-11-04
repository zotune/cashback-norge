import { copyFile, mkdir } from "node:fs/promises";

// TypeScript preserves the shared module's ../../data import in the backend.
const target = new URL("../dist/data/", import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ["electricity-suppliers.json", "mobile-suppliers.json"]) {
  await copyFile(new URL(`../data/${file}`, import.meta.url), new URL(file, target));
}
