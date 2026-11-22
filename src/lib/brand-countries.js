import { formatNumber } from "./format.js";

/**
 * Countries on the plant codes already linked to a brand.
 *
 * The link is the brand-page registrant rule: the registrant name, ignoring
 * capitalization, punctuation, and a legal suffix, begins with that one
 * brand. The plant file has no brand field, and the recall file has no
 * plant-code field, so a row is not a recall report and is not a claim
 * that the plant makes the brand.
 *
 * The country is the country label on that plant record, the same label
 * the plant page shows. A brand with fewer than two countries has no section.
 */

export const PLANT_COUNTRY_MIN = 2;
export const PLANT_COUNTRY_EXAMPLES = 3;

export const PLANT_COUNTRY_BASIS = "Registrant name begins with the brand";

export const PLANT_IDENTIFIES = "A plant code identifies the registered plant, not the brand owner.";

export const PLANT_COUNTRY_READ = {
  before: "Read the plant code, the first group of the DOT code on the sidewall, in the ",
  linkLabel: "decoder",
  href: "/decoder/",
  after: ` to see which registered plant made that tire. ${PLANT_IDENTIFIES} See `,
  caveatLabel: "data-quality limits",
  caveatHref: "/methodology/#data-quality",
};

export const BANNED_COUNTRY_WORD =
  /\b(best|worst|better|worse|superior|inferior|top-rated|top rated|recommend(?:ed|s|ing)?|made by)\b/i;

export function plantCountryCaption(name) {
  return `Plant countries linked to ${name} in NHTSA data`;
}

export function plantCountryAnswer(name, table) {
  const plants = table.plantCount === 1 ? "plant code" : "plant codes";
  const countries = table.countryCount === 1 ? "country" : "countries";
  return `NHTSA data links ${name} to ${formatNumber(table.plantCount)} ${plants} in ${formatNumber(table.countryCount)} ${countries}.`;
}

export function plantCountryReadText() {
  const read = PLANT_COUNTRY_READ;
  return `${read.before}${read.linkLabel}${read.after}${read.caveatLabel}.`;
}

/**
 * @param {string} name
 * @param {{ code: string, country?: string, countryKey?: string, url: string }[]} plants
 * @returns {object | null}
 */
export function plantCountryTable(name, plants) {
  const buckets = new Map();
  let omitted = 0;
  for (const plant of plants) {
    const label = plant.country || "";
    const key = plant.countryKey || "";
    if (!label || !key) {
      omitted += 1;
      continue;
    }
    if (!buckets.has(key)) buckets.set(key, { key, label, plants: [] });
    const bucket = buckets.get(key);
    if (bucket.label !== label) throw new Error(`Country label mismatch for ${key} on ${name}`);
    bucket.plants.push(plant);
  }
  if (buckets.size < PLANT_COUNTRY_MIN) return null;
  const countries = [...buckets.values()].map((bucket) => {
    const sorted = [...bucket.plants].sort((a, b) => a.code.localeCompare(b.code));
    return {
      key: bucket.key,
      label: bucket.label,
      url: `/plants/country/${bucket.key}/`,
      count: sorted.length,
      examples: sorted.slice(0, PLANT_COUNTRY_EXAMPLES).map((plant) => ({
        code: plant.code,
        url: plant.url,
      })),
      basis: PLANT_COUNTRY_BASIS,
    };
  });
  countries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en") || a.key.localeCompare(b.key));
  const plantCount = countries.reduce((sum, row) => sum + row.count, 0);
  const table = {
    countries,
    plantCount,
    countryCount: countries.length,
    omitted,
  };
  table.answer = plantCountryAnswer(name, table);
  table.caption = plantCountryCaption(name);
  return table;
}

export function plantCountryCopy(table) {
  if (!table) return [];
  return [
    table.answer,
    plantCountryReadText(),
    table.caption,
    ...table.countries.flatMap((row) => [row.label, String(row.count), row.basis, ...row.examples.map((item) => item.code)]),
  ];
}
