import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./normalize.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

export const catalog = buildCatalog(readJson("ratings.json"), readJson("plants.json"), readJson("meta.json"));
