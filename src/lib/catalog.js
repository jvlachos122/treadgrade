import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./normalize.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

const ratings = readJson("ratings.json");

/** Committed UTQG rows, before exact duplicate grade rows are dropped. */
export const ratingRows = ratings;

export const catalog = buildCatalog(ratings, readJson("plants.json"), readJson("meta.json"));
