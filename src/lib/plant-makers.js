import { catalog } from "./catalog.js";
import { MAKER_COUNTRY_DEFS, MAKER_COUNTRY_MIN } from "./plant-groups.js";

/**
 * Maker-by-country counts of registered plant codes.
 *
 * /plants/manufacturer/ already lists individual codes for five name groups.
 * /plants/country/ lists every registrant in one country. This view is the
 * cross-tab: one row per maker and country, not a second code list.
 * The address is /plants/by-maker/ so it sits beside those hubs.
 *
 * Grouping reuses the manufacturer name matches. Extra groups use the same
 * kind of registrant-name match. A group is published only when the match
 * has at least MAKER_COUNTRY_MIN codes. Toyo does not include Toyomoto.
 * Kenda Rubber does not include Kab. Kendal.
 */

export const MAKER_COUNTRY_PATH = "/plants/by-maker/";

function byCountThenLabel(a, b) {
  return b.count - a.count || a.label.localeCompare(b.label, "en");
}

function countryRows(plants, countriesByKey) {
  const buckets = new Map();
  for (const plant of plants) {
    const key = plant.countryKey || "";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(plant.code);
  }
  const rows = [];
  for (const [key, codes] of buckets) {
    codes.sort((a, b) => a.localeCompare(b));
    if (!key) {
      rows.push({ key: "", label: "Not stored", url: "", count: codes.length, codes });
      continue;
    }
    const country = countriesByKey.get(key);
    if (!country) throw new Error(`No country page for ${key}`);
    rows.push({
      key,
      label: country.label,
      url: country.url,
      count: codes.length,
      codes,
    });
  }
  rows.sort(byCountThenLabel);
  return rows;
}

function assertDisjoint(defs, plants) {
  const owner = new Map();
  for (const def of defs) {
    for (const plant of plants) {
      const matched = def.matches(plant.name);
      const omitted = def.omitted ? def.omitted(plant.name) : false;
      if (matched && omitted) throw new Error(`Plant ${plant.code} is both matched and omitted for ${def.id}`);
      if (!matched) continue;
      const previous = owner.get(plant.code);
      if (previous) throw new Error(`Plant ${plant.code} is in ${previous} and ${def.id}`);
      owner.set(plant.code, def.id);
    }
  }
}

/**
 * @param {{ plants: object[], brands: object[], countries: object[], verifiedAt: string, defs?: object[], min?: number }} input
 */
export function buildMakerCountry(input) {
  const defs = input.defs || MAKER_COUNTRY_DEFS;
  const min = input.min ?? MAKER_COUNTRY_MIN;
  const plants = input.plants;
  const countriesByKey = new Map(input.countries.map((country) => [country.key, country]));
  const brandBySlug = new Map(input.brands.map((brand) => [brand.slug, brand]));
  assertDisjoint(defs, plants);

  function linkedBrands(def) {
    return def.brandSlugs.map((slug) => {
      const brand = brandBySlug.get(slug);
      if (!brand) throw new Error(`Maker group ${def.id} is missing brand ${slug}`);
      return { slug, name: brand.name, url: brand.url };
    });
  }

  const published = [];
  const belowMin = [];
  for (const def of defs) {
    const matched = plants.filter((plant) => def.matches(plant.name));
    const omitted = def.omitted ? plants.filter((plant) => def.omitted(plant.name)) : [];
    if (!matched.length) continue;
    const group = {
      id: def.id,
      name: def.name,
      nameNote: def.nameNote,
      linkLabel: def.linkLabel,
      rule: def.rule,
      omissionReason: def.omissionReason || "",
      hubUrl: def.hub ? `/plants/manufacturer/${def.id}/` : "",
      count: matched.length,
      countries: countryRows(matched, countriesByKey),
      codes: matched.map((plant) => plant.code).sort((a, b) => a.localeCompare(b)),
      omitted: omitted
        .map((plant) => ({ code: plant.code, name: plant.name, url: plant.url }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      brands: linkedBrands(def),
      headlineCountries: def.headlineCountries || [],
    };
    const countryTotal = group.countries.reduce((sum, country) => sum + country.count, 0);
    if (countryTotal !== group.count) throw new Error(`Country counts for ${def.id} sum to ${countryTotal}`);
    if (group.count < min) belowMin.push(group);
    else published.push(group);
  }

  published.sort((a, b) => b.count - a.count || a.linkLabel.localeCompare(b.linkLabel, "en"));
  belowMin.sort((a, b) => b.count - a.count || a.linkLabel.localeCompare(b.linkLabel, "en"));

  const byId = new Map(published.map((group) => [group.id, group]));
  const spotlight = [];
  for (const def of defs) {
    if (!def.headlineCountries?.length) continue;
    const group = byId.get(def.id);
    if (group) spotlight.push(group);
  }

  const totals = new Map();
  for (const plant of plants) {
    const key = plant.countryKey || "";
    if (!totals.has(key)) totals.set(key, { key, label: plant.country || "Not stored", count: 0, url: "" });
    totals.get(key).count += 1;
  }
  for (const entry of totals.values()) {
    if (!entry.key) continue;
    const country = countriesByKey.get(entry.key);
    if (!country) throw new Error(`No country page for ${entry.key}`);
    entry.label = country.label;
    entry.url = country.url;
  }
  const ranked = [...totals.values()].sort(byCountThenLabel);
  const topCountry = ranked[0];
  if (!topCountry) throw new Error("Maker-country report has no plants");

  return {
    path: MAKER_COUNTRY_PATH,
    min,
    verifiedAt: input.verifiedAt,
    plantCount: plants.length,
    topCountry,
    topCountryIsStrict: ranked.length < 2 || topCountry.count > ranked[1].count,
    groups: published,
    belowMin,
    spotlight,
  };
}

export const makerCountryReport = buildMakerCountry({
  plants: catalog.plants,
  brands: catalog.brands,
  countries: catalog.countries,
  verifiedAt: catalog.meta.verifiedAt,
});

const brandToGroup = new Map();
for (const group of makerCountryReport.groups) {
  for (const brand of group.brands) {
    if (brandToGroup.has(brand.slug)) throw new Error(`Brand ${brand.slug} is in two maker groups`);
    brandToGroup.set(brand.slug, group);
  }
}

export function makerCountryBrandLine(slug) {
  const group = brandToGroup.get(slug);
  if (!group) return null;
  const verb = group.linkLabel.includes(" and ") ? "have" : "has";
  return {
    href: `${MAKER_COUNTRY_PATH}#${group.id}`,
    text: `Where ${group.linkLabel} ${verb} registered plant codes`,
  };
}
