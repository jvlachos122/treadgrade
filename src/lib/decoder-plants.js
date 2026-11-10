/**
 * Compact plant-code index for the in-browser decoder.
 * The packed string is the code and any former code. URLs are /plants/{code}/.
 */

import { indexPlants } from "./tin.js";

const CODE = /^[A-Z0-9]+$/;

export function packPlantCodes(plants) {
  const lines = [];
  for (const plant of plants) {
    const code = String(plant.code || "").trim().toUpperCase();
    const oldCode = String(plant.oldCode || "").trim().toUpperCase();
    if (!code) continue;
    if (!CODE.test(code) || (oldCode && !CODE.test(oldCode))) throw new Error(`Plant code ${code} cannot be packed`);
    lines.push(oldCode ? `${code}|${oldCode}` : code);
  }
  lines.sort((a, b) => a.localeCompare(b));
  return lines.join("\n");
}

export function unpackPlantCodes(packed) {
  const records = [];
  for (const line of String(packed ?? "").split("\n")) {
    if (!line) continue;
    const parts = line.split("|");
    if (parts.length > 2) continue;
    const [code, oldCode = ""] = parts;
    if (!CODE.test(code) || (oldCode && !CODE.test(oldCode))) continue;
    records.push({ code, oldCode, url: `/plants/${code.toLowerCase()}/` });
  }
  return records;
}

export function plantsIndexFromPacked(packed) {
  return indexPlants(unpackPlantCodes(packed));
}
