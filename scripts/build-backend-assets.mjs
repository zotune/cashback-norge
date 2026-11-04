import { copyFile, mkdir } from "node:fs/promises";

// TypeScript preserves the shared module's ../../data import in the backend.
const target = new URL("../dist/data/", import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(new URL("../data/electricity-suppliers.json", import.meta.url), new URL("electricity-suppliers.json", target));
