import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeRecallRows } from "./recalls.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

const meta = readJson("meta.json");
export const recallRows = readJson("recalls.json");
export const recallMeta = meta.recalls;
export const recallSummary = summarizeRecallRows(recallRows);
