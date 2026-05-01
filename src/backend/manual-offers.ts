import {
  type CashbackOffer,
  isCashbackOffer,
} from "../shared/cashback.js";
import { readJsonFile } from "./json-file.js";

export async function readManualOffers(filePath: string): Promise<CashbackOffer[]> {
  const value = await readJsonFile(filePath);

  if (!Array.isArray(value) || !value.every(isCashbackOffer)) {
    throw new Error(`Invalid manual offers JSON: ${filePath}`);
  }

  return value;
}
