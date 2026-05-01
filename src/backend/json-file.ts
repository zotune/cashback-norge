import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonFile(filePath: string): Promise<unknown> {
  const fileContents = await readFile(filePath, "utf8");
  const parsedJson: unknown = JSON.parse(fileContents);
  return parsedJson;
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
