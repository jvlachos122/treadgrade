import { mapBrandPlants } from "./brand-pages.js";

/**
 * Extra rows for a plant-group page, taken from records already on the site.
 * A brand link is the registrant-name rule. It does not say the plant built
 * that brand. A recall row is a filing-company match to the registrant.
 * Nearby codes are the previous and next codes in NHTSA code order.
 */

export const THIN_GROUP_MAX = 2;
export const GROUP_LINE_CAP = 12;
export const GROUP_RECALL_CAP = 8;
export const GROUP_SIBLING_CAP = 8;

function byCode(a, b) {
  return String(a.code).localeCompare(String(b.code));
}

function recallKey(row) {
  return `${row.campaign}|${row.brand}|${row.line}`;
}

function recallSort(a, b) {
  return (
    String(a.reportDate || "").localeCompare(String(b.reportDate || "")) ||
    String(a.campaign).localeCompare(String(b.campaign)) ||
    String(a.brand || "").localeCompare(String(b.brand || ""), "en") ||
    String(a.line || "").localeCompare(String(b.line || ""), "en")
  );
}

export function buildGroupIndex({ brands, plants, lines, extrasByCode }) {
  const plantsByBrand = mapBrandPlants(brands, plants);
  const brandBySlug = new Map(brands.map((brand) => [brand.slug, brand]));
  const brandsByCode = new Map();
  for (const [slug, list] of plantsByBrand) {
    const brand = brandBySlug.get(slug);
    if (!brand) continue;
    for (const plant of list) {
      if (!brandsByCode.has(plant.code)) brandsByCode.set(plant.code, []);
      brandsByCode.get(plant.code).push(brand);
    }
  }
  for (const list of brandsByCode.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug));
  }
  const linesBySlug = new Map();
  for (const line of lines) {
    if (!linesBySlug.has(line.brandSlug)) linesBySlug.set(line.brandSlug, []);
    linesBySlug.get(line.brandSlug).push(line);
  }
  for (const list of linesBySlug.values()) {
    list.sort((a, b) => a.line.localeCompare(b.line, "en") || a.url.localeCompare(b.url));
  }
  const sorted = [...plants].sort(byCode);
  const position = new Map(sorted.map((plant, index) => [plant.code, index]));
  return { brandsByCode, linesBySlug, sorted, position, extrasByCode: extrasByCode || new Map() };
}

function recallBrief(row) {
  return {
    campaign: row.campaign,
    brand: row.brand,
    line: row.line,
    reportDate: row.reportDate || "",
    filer: row.filer || "",
    units: typeof row.units === "number" ? row.units : null,
  };
}

function nearbyOf(plant, index) {
  const at = index.position.get(plant.code);
  if (!Number.isInteger(at)) return [];
  const picks = [];
  if (at > 0) picks.push(index.sorted[at - 1]);
  if (at < index.sorted.length - 1) picks.push(index.sorted[at + 1]);
  return picks.map((item) => ({
    code: item.code,
    url: item.url,
    name: item.name || "",
    country: item.country || "",
  }));
}

/**
 * @param {object[]} plants plants already on this group page
 * @param {ReturnType<typeof buildGroupIndex>} index
 */
export function describeGroup(plants, index) {
  const members = [...plants].sort(byCode);
  const brandMap = new Map();
  const recallMap = new Map();
  for (const plant of members) {
    for (const brand of index.brandsByCode.get(plant.code) || []) brandMap.set(brand.slug, brand);
    const extra = index.extrasByCode.get(plant.code);
    for (const row of extra?.recalls || []) {
      if (!recallMap.has(recallKey(row))) recallMap.set(recallKey(row), row);
    }
  }
  const brands = [...brandMap.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug),
  );
  const lineMap = new Map();
  for (const brand of brands) {
    for (const line of index.linesBySlug.get(brand.slug) || []) lineMap.set(line.url, line);
  }
  const allLines = [...lineMap.values()].sort(
    (a, b) => a.brand.localeCompare(b.brand, "en") || a.line.localeCompare(b.line, "en") || a.url.localeCompare(b.url),
  );
  const described = members.map((plant) => {
    const extra = index.extrasByCode.get(plant.code);
    const siblings = [...(extra?.siblings || [])].sort(byCode);
    const plantRecalls = [...(extra?.recalls || [])].sort(recallSort);
    return {
      code: plant.code,
      url: plant.url,
      name: plant.name,
      address: plant.address || "",
      city: plant.city || "",
      state: plant.state || "",
      postal: plant.postal || "",
      country: plant.country || "",
      oldCode: plant.oldCode || "",
      linkedBrands: (index.brandsByCode.get(plant.code) || []).map((brand) => ({
        name: brand.name,
        url: brand.url,
        lineCount: brand.lineCount,
      })),
      siblings: siblings.map((item) => ({
        code: item.code,
        url: item.url,
        name: item.name || "",
        city: item.city || "",
        country: item.country || "",
      })),
      nearby: nearbyOf(plant, index),
      recalls: plantRecalls.map(recallBrief),
    };
  });
  return {
    plantCount: members.length,
    thin: members.length <= THIN_GROUP_MAX,
    brands: brands.map((brand) => ({ name: brand.name, url: brand.url, lineCount: brand.lineCount })),
    brandCount: brands.length,
    lines: allLines.map((line) => ({
      brand: line.brand,
      line: line.line,
      url: line.url,
      rows: line.rows.length,
    })),
    lineCount: allLines.length,
    recallRows: recallMap.size,
    members: described,
  };
}

/** Stable fingerprint of what a group page renders from this detail. */
export function groupDetailRecord(detail) {
  const summary = {
    plants: detail.plantCount,
    thin: detail.thin ? 1 : 0,
    brands: detail.brands.map((brand) => brand.url),
    recalls: detail.recallRows,
    lines: detail.lineCount,
  };
  if (!detail.thin) return summary;
  return {
    ...summary,
    shownLines: detail.lines.slice(0, GROUP_LINE_CAP).map((line) => line.url),
    members: detail.members.map((member) => ({
      code: member.code,
      address: member.address,
      state: member.state,
      postal: member.postal,
      brands: member.linkedBrands.map((brand) => brand.url),
      siblings: member.siblings.map((item) => item.code),
      nearby: member.nearby.map((item) => item.code),
      recalls: member.recalls.map((row) => [row.campaign, row.brand, row.line]),
    })),
  };
}
