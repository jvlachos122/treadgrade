// Data each sitemap URL renders, separate from shared chrome.
// A page hash changes only when its own source closure or this record changes.
// verifiedAt and other refresh timestamps are not part of the record: a pull
// that changes no rows for a page must not move that page.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mapBrandPlants } from "./brand-pages.js";
import { buildLineRecord, recallRowsForLine, selectExampleComparisons, toPublicSummary } from "./compare.js";
import { packPlantCodes } from "./decoder-plants.js";
import { ratingsHubFacts } from "./hub-quality.js";
import { buildKnownErrors } from "./known-errors.js";
import { buildCatalog, brandKey } from "./normalize.js";
import { MAKER_COUNTRY_PATH, buildMakerCountry } from "./plant-makers.js";
import { MANUFACTURER_GROUP_DEFS } from "./plant-groups.js";
import { buildRecallList } from "./recall-list.js";
import { companyCore, summarizeRecallRows } from "./recalls.js";
import { highestTreadwearReport } from "./highest-treadwear.js";
import { longTreadwearReport } from "./long-treadwear.js";
import { rebadgedReport } from "./rebadged-tires.js";
import { sizeVarianceReport } from "./size-variance.js";
import { STATIC_INDEXABLE_PATHS } from "./sitemap.js";
import { pageHash, sourceHash, templateForPath } from "./sitemap-lastmod.js";
import { treadwearMedian } from "./answers.js";
import { tractionGradesReport } from "./traction-grades.js";
import { acrossBrandsData } from "./utqg-across-brands.js";
import { treadwearNumbersReport } from "./treadwear-numbers.js";
import { treadwearTractionReport } from "./treadwear-vs-traction.js";
import { utqgExemptReport } from "./utqg-exempt.js";
import { WHO_MAKES_CANDIDATES, buildWhoMakesPages } from "./who-makes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const VOLATILE_KEY = /verified|retrieved|asOf|dateModified|generated|today/i;
const VOLATILE_TEXT = /verified|retrieved|last updated|\d{4}-\d{2}-\d{2}T/i;

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

export function cloneData(value, seen = new WeakSet(), depth = 0) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return VOLATILE_TEXT.test(value) || value.length > 240 ? undefined : value;
  if (typeof value !== "object" || depth > 8) return undefined;
  if (value instanceof Map || value instanceof Set || typeof value === "function") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => cloneData(item, seen, depth + 1)).filter((item) => item !== undefined);
  }
  const out = {};
  for (const key of Object.keys(value)) {
    if (VOLATILE_KEY.test(key) || typeof value[key] === "function") continue;
    const child = cloneData(value[key], seen, depth + 1);
    if (child !== undefined) out[key] = child;
  }
  return out;
}

export function lineData(line) {
  const rows = [...line.rows].sort((a, b) => a.id - b.id || a.size.localeCompare(b.size, "en"));
  return {
    brand: line.brand,
    line: line.line,
    url: line.url,
    rows: rows.map((row) => [
      row.id,
      row.size,
      row.wear ?? "",
      row.trac,
      row.temp,
      row.construction,
      row.active ? 1 : 0,
      row.complaintsCount,
      row.recallsCount,
      row.investigationsCount,
      row.manufacturerCommunicationsCount,
    ]),
    sameName: [...(line.sameName || [])].map((other) => other.url).sort(),
  };
}

export function lineSummary(line) {
  return [
    line.line,
    line.url,
    line.rows.length,
    line.wearMin,
    line.wearMax,
    [...line.traction].join(","),
    [...line.temperature].join(","),
  ];
}

export function brandData(brand, lines, plants = [], recalls = []) {
  return {
    name: brand.name,
    url: brand.url,
    aliases: (brand.aliases || []).map((alias) => [alias.name, alias.count]),
    lineCount: brand.lineCount,
    rowCount: brand.rowCount,
    wearMin: brand.wearMin,
    wearMax: brand.wearMax,
    traction: brand.traction,
    temperature: brand.temperature,
    lines: [...lines].sort((a, b) => a.url.localeCompare(b.url)).map(lineSummary),
    plants: plants.map((plant) => [plant.code, plant.name, plant.city || "", plant.country || "", plant.status || ""]),
    recalls: [...recalls]
      .sort((a, b) => a.campaign.localeCompare(b.campaign) || a.line.localeCompare(b.line, "en") || a.brand.localeCompare(b.brand, "en"))
      .map((row) => [row.campaign, row.brand, row.line, row.reportDate || "", row.units ?? null]),
  };
}

export function ratingsData(lines) {
  const rows = [];
  for (const line of lines) {
    for (const row of line.rows) rows.push([line.url, row.id, row.size, row.wear ?? "", row.trac, row.temp, row.construction]);
  }
  rows.sort((a, b) => a[1] - b[1]);
  return { facts: ratingsHubFacts(lines), rows };
}

export function plantTableRow(plant, { address = false } = {}) {
  const row = [plant.code, plant.oldCode || "", plant.name, plant.city || "", plant.country || "", plant.status || ""];
  if (address) row.push(plant.address || "", plant.state || "", plant.postal || "");
  return row;
}

export function plantData(plant, recalls = []) {
  return {
    row: plantTableRow(plant, { address: true }),
    sameName: (plant.sameName || []).map((other) => other.code).sort(),
    oldCodeSharedWith: [...(plant.oldCodeSharedWith || [])].sort(),
    recalls: [...recalls]
      .sort((a, b) => a.campaign.localeCompare(b.campaign) || a.line.localeCompare(b.line, "en") || a.brand.localeCompare(b.brand, "en"))
      .map((row) => [row.campaign, row.brand, row.line, row.reportDate || "", row.units ?? null, row.filer]),
  };
}

export function countryData(plants) {
  return [...plants]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((plant) => plantTableRow(plant));
}

function listFingerprint(entries, pick) {
  return entries.map(pick);
}

function guideRecord(path, ctx) {
  const { catalog, ratings, recalls, summary, whoMakes } = ctx;
  switch (path) {
    case "/":
      return {
        brands: catalog.stats.brands,
        lines: catalog.stats.lines,
        rows: catalog.stats.rows,
        plants: catalog.stats.plants,
        biggest: [...catalog.brands]
          .sort((a, b) => b.rowCount - a.rowCount || a.name.localeCompare(b.name, "en"))
          .slice(0, 8)
          .map((brand) => [brand.name, brand.url, brand.rowCount]),
      };
    case "/brands/":
      return ctx.brandIndex;
    case "/ratings/":
      return ratingsData(catalog.lines);
    case "/plants/":
      return {
        plants: catalog.plants.map((plant) => plantTableRow(plant)),
        countries: catalog.countries.map((country) => [country.key, country.label, country.count]),
      };
    case "/plants/country/":
      return catalog.countries.map((country) => [country.key, country.label, country.count, country.rawLabels]);
    case "/plants/manufacturer/":
      return ctx.groups.map((group) => [group.id, group.plants.length]);
    case "/plants/by-maker/":
      return cloneData(ctx.makerCountry);
    case "/recalls/":
      return {
        rows: ctx.recallList.rows.map((row) => [row.campaign, row.brand, row.line, row.reportDate, row.units, row.lineUrl, row.filer, row.sizes]),
        counts: [ctx.recallList.rowCount, ctx.recallList.campaignCount, ctx.recallList.brandCount],
      };
    case "/who-makes-it/":
      return {
        campaigns: summary.campaigns,
        brands: summary.brands,
        lines: summary.lines,
        pages: whoMakes.map((page) => [page.url, page.name, page.rows.length]),
      };
    case "/compare/":
      return ctx.comparisons.map((pair) => [pair.path, pair.left.brand, pair.left.line, pair.right.brand, pair.right.line]);
    case "/decoder/":
      return {
        packed: packPlantCodes(catalog.plants),
        former: catalog.plants.filter((plant) => plant.oldCode).length,
        example: catalog.getPlant("1u2")
          ? plantTableRow(catalog.getPlant("1u2"), { address: true })
          : null,
      };
    case "/guides/":
      return {
        rows: catalog.stats.rows,
        plants: catalog.stats.plants,
        campaigns: summary.campaigns,
        brands: summary.brands,
      };
    case "/guides/utqg-grades/":
      return {
        rows: catalog.stats.rows,
        traction: catalog.stats.traction,
        temperature: catalog.stats.temperature,
        wearBuckets: catalog.stats.wearBuckets,
        acrossBrands: acrossBrandsData(catalog),
      };
    case "/guides/dot-code/":
    case "/guides/tire-date-code/":
      return { plants: catalog.stats.plants, former: catalog.plants.filter((plant) => plant.oldCode).length };
    case "/guides/traction-grades/":
      return cloneData(tractionGradesReport(ratings, catalog));
    case "/guides/treadwear-numbers/":
      return cloneData(treadwearNumbersReport(ratings, catalog));
    case "/guides/treadwear-vs-traction/":
      return cloneData(treadwearTractionReport(ratings, catalog));
    case "/guides/treadwear-varies-by-size/":
      return cloneData(sizeVarianceReport(catalog));
    case "/guides/no-utqg-rating/":
      return cloneData(utqgExemptReport(catalog, ratings));
    case "/guides/rebadged-tires/":
      return cloneData(
        rebadgedReport({
          ratings,
          rawPlants: ctx.rawPlants,
          plants: catalog.plants,
          recalls,
          meta: catalog.meta,
          recallSummary: summary,
          whoMakesPages: whoMakes,
        }),
      );
    case "/lists/highest-treadwear/":
      return listFingerprint(ctx.highest.entries, (entry) => ({
        url: entry.line.url,
        max: entry.max,
        rows: entry.rows.map((row) => [row.size, row.wearN, row.trac, row.temp]),
      }));
    case "/lists/long-treadwear-high-traction/":
      return listFingerprint(ctx.longWear.lines, (entry) => ({
        url: entry.line.url,
        maxWear: entry.maxWear,
        matchingCount: entry.matchingCount,
        tractions: entry.tractions,
        wears: entry.wears,
      }));
    case "/methodology/":
      return {
        rows: catalog.stats.rows,
        sourceRows: catalog.stats.sourceRows,
        activeRows: catalog.stats.activeRows,
        safetyRows: catalog.stats.safetyRows,
        brands: catalog.stats.brands,
        lines: catalog.stats.lines,
        plants: catalog.stats.plants,
        aliasBrands: catalog.brands.filter((brand) => brand.aliases.length).map((brand) => [brand.url, brand.aliases.length]),
        plantStatus: [
          catalog.plants.filter((plant) => plant.status === "Active").length,
          catalog.plants.filter((plant) => plant.status === "Closed").length,
          catalog.plants.filter((plant) => !plant.status).length,
        ],
        campaigns: summary.campaigns,
        recallLines: summary.lines,
      };
    case "/methodology/known-errors/":
      return cloneData(buildKnownErrors({ catalog, ratings, recalls }));
    default:
      return null;
  }
}

function entityRecord(path, ctx) {
  if (path.startsWith("/tires/")) {
    const line = ctx.lineByUrl.get(path);
    return line ? lineData(line) : null;
  }
  if (path.startsWith("/brands/") && path !== "/brands/") {
    const brand = ctx.brandByUrl.get(path);
    if (!brand) return null;
    return brandData(brand, ctx.linesByBrand.get(brand.slug) || [], ctx.plantsByBrand.get(brand.slug) || [], ctx.brandRecalls.get(brand.slug) || []);
  }
  if (path.startsWith("/plants/country/") && path !== "/plants/country/") {
    const plants = ctx.plantsByCountry.get(path) || [];
    return countryData(plants);
  }
  if (path.startsWith("/plants/manufacturer/") && path !== "/plants/manufacturer/") {
    const group = ctx.groupByUrl.get(path);
    return group ? { id: group.id, plants: countryData(group.plants), omitted: countryData(group.omitted) } : null;
  }
  if (ctx.plantByUrl.has(path)) {
    const plant = ctx.plantByUrl.get(path);
    return plantData(plant, ctx.plantRecalls.get(plant.code) || []);
  }
  if (path.startsWith("/who-makes/") && path !== "/who-makes-it/") {
    const page = ctx.whoByUrl.get(path);
    return page ? cloneData(page) : null;
  }
  if (path.startsWith("/compare/") && path !== "/compare/") {
    const pair = ctx.compareByPath.get(path);
    if (!pair) return null;
    return {
      left: toPublicSummary(pair.left),
      right: toPublicSummary(pair.right),
    };
  }
  return guideRecord(path, ctx);
}

export function buildContentModel(dataset) {
  const ratings = dataset.ratings;
  const rawPlants = dataset.plants;
  const recalls = dataset.recalls || [];
  const catalog = buildCatalog(ratings, rawPlants, dataset.meta);
  const summary = summarizeRecallRows(recalls);
  const plantsByBrand = mapBrandPlants(catalog.brands, catalog.plants);
  const linesByBrand = new Map();
  for (const line of catalog.lines) {
    if (!linesByBrand.has(line.brandSlug)) linesByBrand.set(line.brandSlug, []);
    linesByBrand.get(line.brandSlug).push(line);
  }
  const brandRecalls = new Map();
  for (const brand of catalog.brands) {
    const match = [...summary.byBrand.values()].find((item) => brandKey(item.brand) === brandKey(brand.name));
    brandRecalls.set(brand.slug, match ? match.rows : []);
  }
  const plantRecalls = new Map();
  const recallsByCore = new Map();
  for (const row of recalls) {
    const key = companyCore(row.filer);
    if (!key) continue;
    if (!recallsByCore.has(key)) recallsByCore.set(key, []);
    recallsByCore.get(key).push(row);
  }
  for (const plant of catalog.plants) {
    plantRecalls.set(plant.code, recallsByCore.get(companyCore(plant.name)) || []);
  }
  const groups = MANUFACTURER_GROUP_DEFS.map((def) => {
    const plants = catalog.plants.filter((plant) => def.matches(plant.name)).sort((a, b) => a.code.localeCompare(b.code));
    const omitted = def.omitted ? catalog.plants.filter((plant) => def.omitted(plant.name)).sort((a, b) => a.code.localeCompare(b.code)) : [];
    return { id: def.id, url: `/plants/manufacturer/${def.id}/`, plants, omitted };
  });
  const plantsByCountry = new Map();
  for (const country of catalog.countries) {
    plantsByCountry.set(
      country.url,
      catalog.plants.filter((plant) => plant.countryKey === country.key),
    );
  }
  const whoMakes = buildWhoMakesPages(WHO_MAKES_CANDIDATES, {
    summary,
    brands: catalog.brands,
    lines: catalog.lines,
    plants: catalog.plants,
  }).pages;
  const comparisons = selectExampleComparisons(catalog).map((pair) => ({
    path: pair.path,
    left: buildLineRecord(pair.left, { recallRows: recallRowsForLine(pair.left, summary), plants: catalog.plants }),
    right: buildLineRecord(pair.right, { recallRows: recallRowsForLine(pair.right, summary), plants: catalog.plants }),
  }));
  const makerCountry = buildMakerCountry({
    plants: catalog.plants,
    brands: catalog.brands,
    countries: catalog.countries,
    verifiedAt: "",
  });
  const highest = highestTreadwearReport(catalog);
  const longWear = longTreadwearReport(catalog);
  const recallList = buildRecallList(recalls, { brands: catalog.brands, lines: catalog.lines, whoMakes });
  const brandIndex = [...catalog.brands]
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map((brand) => {
      const lines = linesByBrand.get(brand.slug) || [];
      const wears = lines.flatMap((line) => line.rows.map((row) => row.wearN));
      const plants = plantsByBrand.get(brand.slug) || [];
      const matched = brandRecalls.get(brand.slug) || [];
      return [
        brand.url,
        brand.name,
        brand.lineCount,
        brand.rowCount,
        treadwearMedian(wears),
        plants.map((plant) => plant.code).join(","),
        new Set(matched.map((row) => row.campaign)).size,
        lines.length === 1 ? lines[0].line : "",
      ];
    });
  const ctx = {
    catalog,
    ratings,
    rawPlants,
    recalls,
    summary,
    plantsByBrand,
    linesByBrand,
    brandRecalls,
    plantRecalls,
    groups,
    plantsByCountry,
    whoMakes,
    comparisons,
    makerCountry,
    highest,
    longWear,
    recallList,
    brandIndex,
    lineByUrl: new Map(catalog.lines.map((line) => [line.url, line])),
    brandByUrl: new Map(catalog.brands.map((brand) => [brand.url, brand])),
    plantByUrl: new Map(catalog.plants.map((plant) => [plant.url, plant])),
    groupByUrl: new Map(groups.map((group) => [group.url, group])),
    whoByUrl: new Map(whoMakes.map((page) => [page.url, page])),
    compareByPath: new Map(comparisons.map((pair) => [pair.path, pair])),
  };
  const paths = new Set(STATIC_INDEXABLE_PATHS);
  for (const brand of catalog.brands) paths.add(brand.url);
  for (const line of catalog.lines) paths.add(line.url);
  for (const plant of catalog.plants) paths.add(plant.url);
  paths.add("/plants/manufacturer/");
  paths.add("/plants/country/");
  paths.add(MAKER_COUNTRY_PATH);
  for (const group of groups) paths.add(group.url);
  for (const country of catalog.countries) paths.add(country.url);
  for (const page of whoMakes) paths.add(page.url);
  for (const pair of comparisons) paths.add(pair.path);
  ctx.paths = paths;
  return ctx;
}

export function dataRecord(path, ctx) {
  return entityRecord(path, ctx);
}

let cachedModel = null;

export function currentDataset() {
  return {
    ratings: readJson("ratings.json"),
    plants: readJson("plants.json"),
    recalls: readJson("recalls.json"),
    meta: readJson("meta.json"),
  };
}

export function currentModel() {
  cachedModel ||= buildContentModel(currentDataset());
  return cachedModel;
}

/**
 * Hash of every indexable URL. Pass dataset to hash a historical pull with
 * the same rules. Source hashes follow the working tree, not that pull.
 */
export function contentHashes(dataset = null, env = {}) {
  const ctx = dataset ? buildContentModel(dataset) : currentModel();
  const sourceEnv = { ...env, cache: env.cache || new Map() };
  const sourceByTemplate = new Map();
  const hashes = new Map();
  for (const path of ctx.paths) {
    const template = templateForPath(path);
    let source = sourceByTemplate.get(template);
    if (!source) {
      source = sourceHash(template, sourceEnv);
      sourceByTemplate.set(template, source);
    }
    hashes.set(path, pageHash(source.hash, dataRecord(path, ctx)));
  }
  return { hashes, ctx, sourceByTemplate };
}

export function contentHashMap() {
  return contentHashes().hashes;
}
