/**
 * Related plant-code links.
 *
 * Neighbouring codes are the previous and next code in NHTSA code order,
 * wrapping at the ends of the group. A manufacturer is the registrant name
 * after the same company-core match the plant page already uses. It is not
 * a parent company inferred from a brand. When the tire-recall file already
 * links this registrant to a filer, the filer's other plants are the other
 * records with that same registrant, and the list is capped.
 */

import { registrantKey } from "./plant-hubs.js";

export const RELATED_PLANT_CAP = 8;

const STATIC_LABELS = [
  "Neighbouring codes",
  "Other plants for this filer",
  "Tire age",
  "What a plant code can prove about who made a tire",
];

function byCode(a, b) {
  return a.code.localeCompare(b.code);
}

function adjacent(sorted, code) {
  const count = sorted.length;
  if (count < 2) return [];
  const index = sorted.findIndex((item) => item.code === code);
  if (index < 0) return [];
  const next = sorted[(index + 1) % count];
  const prev = sorted[(index - 1 + count) % count];
  if (next.code === prev.code) return [next];
  return [next, prev];
}

function brief(plant) {
  return {
    code: plant.code,
    url: plant.url,
    city: plant.city || "",
    country: plant.country || "",
  };
}

export function buildRelatedPlantIndex(plants) {
  const byCountry = new Map();
  const byRegistrant = new Map();
  for (const plant of plants) {
    const country = plant.countryKey || "";
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country).push(plant);
    const key = registrantKey(plant.name);
    if (!byRegistrant.has(key)) byRegistrant.set(key, []);
    byRegistrant.get(key).push(plant);
  }
  for (const list of byCountry.values()) list.sort(byCode);
  for (const list of byRegistrant.values()) list.sort(byCode);
  return { byCountry, byRegistrant };
}

export function relatedPlantsFromIndex(plant, index, { recallLinked = false } = {}) {
  const seen = new Set([plant.code]);
  const take = (items) => {
    const out = [];
    for (const item of items) {
      if (seen.has(item.code)) continue;
      if (seen.size - 1 >= RELATED_PLANT_CAP) break;
      seen.add(item.code);
      out.push(brief(item));
    }
    return out;
  };
  const country = take(adjacent(index.byCountry.get(plant.countryKey || "") || [], plant.code));
  const key = registrantKey(plant.name);
  const mates = index.byRegistrant.get(key) || [];
  const registrant = take(adjacent(mates, plant.code));
  const filer = recallLinked ? take(mates.filter((item) => item.code !== plant.code)) : [];
  return { country, registrant, filer };
}

let cachedPlants = null;
let cachedIndex = null;

export function relatedPlants(plant, plants, recallLinked = false) {
  if (cachedPlants !== plants) {
    cachedPlants = plants;
    cachedIndex = buildRelatedPlantIndex(plants);
  }
  return relatedPlantsFromIndex(plant, cachedIndex, { recallLinked });
}

export function relatedPlantStaticText() {
  return STATIC_LABELS.join(" ");
}
