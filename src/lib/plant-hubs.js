import { catalog } from "./catalog.js";
import { formatNameList, companyCore } from "./recalls.js";
import { recallRows } from "./recall-catalog.js";
import { article, dataset } from "./structured.js";
import { plantAnswer } from "./answers.js";
import { BRAND_SLUG_TO_GROUP, MANUFACTURER_GROUP_DEFS } from "./plant-groups.js";

/**
 * Same registrant: companyCore equality (case, punctuation, and legal
 * suffixes such as Inc. and LLC). A shared first word is not a match.
 * Recall rows are included only when the filing company matches that way.
 */
export function registrantKey(name) {
  return companyCore(name);
}

export function recallsForRegistrant(name, rows) {
  const key = registrantKey(name);
  if (!key) return [];
  return rows.filter((row) => registrantKey(row.filer) === key);
}

export function isThinPlantRecord({ siblingCount, recallCount }) {
  return siblingCount === 0 && recallCount === 0;
}

function plantBrief(plant) {
  return {
    code: plant.code,
    name: plant.name,
    city: plant.city,
    country: plant.country,
    url: plant.url,
  };
}

function uniqueFilerNames(rows) {
  const names = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row.filer || seen.has(row.filer)) continue;
    seen.add(row.filer);
    names.push(row.filer);
  }
  return names;
}

function sortRecalls(rows) {
  return [...rows].sort(
    (a, b) =>
      a.reportDate.localeCompare(b.reportDate) ||
      a.campaign.localeCompare(b.campaign) ||
      a.brand.localeCompare(b.brand, "en") ||
      a.line.localeCompare(b.line, "en"),
  );
}

const recallsByKey = new Map();
for (const row of recallRows) {
  const key = registrantKey(row.filer);
  if (!key) continue;
  if (!recallsByKey.has(key)) recallsByKey.set(key, []);
  recallsByKey.get(key).push(row);
}
for (const [key, rows] of recallsByKey) recallsByKey.set(key, sortRecalls(rows));

const plantsByKey = new Map();
for (const plant of catalog.plants) {
  const key = registrantKey(plant.name);
  if (!key) continue;
  if (!plantsByKey.has(key)) plantsByKey.set(key, []);
  plantsByKey.get(key).push(plant);
}

function buildGroups() {
  const groups = MANUFACTURER_GROUP_DEFS.map((def) => {
    const plants = catalog.plants.filter((plant) => def.matches(plant.name));
    plants.sort((a, b) => a.code.localeCompare(b.code));
    const omitted = def.omitted ? catalog.plants.filter((plant) => def.omitted(plant.name)) : [];
    omitted.sort((a, b) => a.code.localeCompare(b.code));
    return {
      id: def.id,
      name: def.name,
      nameNote: def.nameNote,
      linkLabel: def.linkLabel,
      rule: def.rule,
      url: `/plants/manufacturer/${def.id}/`,
      count: plants.length,
      plants,
      omitted,
    };
  });
  const owner = new Map();
  for (const group of groups) {
    for (const plant of group.plants) {
      const previous = owner.get(plant.code);
      if (previous) throw new Error(`Plant ${plant.code} is in ${previous} and ${group.id}`);
      owner.set(plant.code, group.id);
    }
  }
  return { groups, owner };
}

const builtGroups = buildGroups();

export const manufacturerGroups = builtGroups.groups;
export const groupByCode = new Map();
for (const group of manufacturerGroups) {
  for (const plant of group.plants) groupByCode.set(plant.code, group);
}

export function manufacturerGroupForBrand(slug) {
  const id = BRAND_SLUG_TO_GROUP[slug];
  if (!id) return null;
  return manufacturerGroups.find((group) => group.id === id) || null;
}

function citySample(plants) {
  const cities = [];
  const seen = new Set();
  for (const plant of plants) {
    const city = plant.city;
    if (!city || seen.has(city)) continue;
    seen.add(city);
    cities.push(city);
    if (cities.length === 4) break;
  }
  return cities;
}

function groupingNote(country, members) {
  const raw = new Set(members.map((plant) => plant.countryRaw));
  if (country.label === "South Korea" && raw.has("Korea")) {
    const storedAsKorea = members.filter((plant) => plant.countryRaw === "Korea");
    const cities = citySample(storedAsKorea);
    const cityClause = cities.length ? ` City fields on those records include ${formatNameList(cities)}.` : "";
    const north = catalog.plants.some((plant) => /north korea/i.test(plant.countryStored));
    const northClause = north ? "" : " The plant list has no country string North Korea.";
    return `NHTSA stores ${storedAsKorea.length} of these records as Korea.${cityClause} This page groups that string with South Korea.${northClause}`;
  }
  if (country.label === "United Kingdom" && (raw.has("England") || raw.has("Scotland") || raw.has("N. Ireland"))) {
    return "England, Scotland, and N. Ireland are grouped with United Kingdom. Those are the strings NHTSA stored, and United Kingdom is also stored on other records.";
  }
  if (country.label === "Vietnam" && (raw.has("VN") || raw.has("South Vietnam"))) {
    const south = members.filter((plant) => plant.countryRaw === "South Vietnam");
    const southClause = south.length
      ? ` South Vietnam is the string on ${south.length === 1 ? "one record" : `${south.length} records`}${south.some((plant) => plant.city) ? ` (city ${formatNameList(citySample(south))})` : ""}.`
      : "";
    return `VN and South Vietnam are grouped with Vietnam.${southClause} This page does not keep those strings as separate countries.`;
  }
  if (country.label === "Africa") {
    return "NHTSA stored the country as Africa. This page does not replace that value with a country inferred from the city.";
  }
  return "";
}

export const countryHubs = catalog.countries.map((country) => {
  const plants = catalog.plants
    .filter((plant) => plant.countryKey === country.key)
    .sort((a, b) => a.code.localeCompare(b.code));
  return {
    ...country,
    plants,
    note: groupingNote(country, plants),
  };
});

export const countryByKey = new Map(countryHubs.map((country) => [country.key, country]));

const extras = new Map();
for (const plant of catalog.plants) {
  const key = registrantKey(plant.name);
  const siblings = (plantsByKey.get(key) || [])
    .filter((other) => other.code !== plant.code)
    .map(plantBrief)
    .sort((a, b) => a.code.localeCompare(b.code));
  const recalls = key ? recallsByKey.get(key) || [] : [];
  extras.set(plant.code, {
    siblings,
    recalls,
    filerNames: uniqueFilerNames(recalls),
    thin: isThinPlantRecord({ siblingCount: siblings.length, recallCount: recalls.length }),
    group: groupByCode.get(plant.code) || null,
    countryUrl: plant.countryKey ? `/plants/country/${plant.countryKey}/` : "",
  });
}

export const plantByCode = extras;

export const thinPlantPaths = new Set(
  catalog.plants.filter((plant) => extras.get(plant.code).thin).map((plant) => plant.url),
);

export const indexablePlantPaths = new Set(
  catalog.plants.filter((plant) => !extras.get(plant.code).thin).map((plant) => plant.url),
);

export const hubPaths = new Set([
  "/plants/manufacturer/",
  "/plants/country/",
  ...manufacturerGroups.map((group) => group.url),
  ...countryHubs.map((country) => country.url),
]);

const storedCountries = catalog.plants.map((plant) => plant.countryStored).filter(Boolean);

export const countryNormalization = {
  rawCount: new Set(storedCountries).size,
  caseInsensitiveCount: new Set(storedCountries.map((country) => country.toLowerCase())).size,
  normalizedCount: countryHubs.length,
};

export function plantJsonLd(plant, extra) {
  const answers = plantAnswer(plant);
  const basedOn = [catalog.meta.plants.source];
  if (extra.recalls.length) basedOn.push(catalog.meta.recalls.source);
  return [
    dataset({
      name: `NHTSA plant record ${plant.code}`,
      description: answers.join(" "),
      path: plant.url,
      dateModified: catalog.meta.verifiedAt,
      isBasedOn: basedOn,
      keywords: ["DOT", "plant code", "NHTSA", plant.code],
    }),
    article({
      headline: `How to find plant code ${plant.code} on a tire`,
      description: `The plant code is the first group of the tire identification number. On a current new tire, ${plant.code} is the 3-symbol plant code in 49 CFR 574.5.`,
      path: plant.url,
      dateModified: catalog.meta.verifiedAt,
    }),
  ];
}

export function hubDataset({ name, description, path, keywords }) {
  return dataset({
    name,
    description,
    path,
    dateModified: catalog.meta.verifiedAt,
    isBasedOn: catalog.meta.plants.source,
    keywords,
  });
}
