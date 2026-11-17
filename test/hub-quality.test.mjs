import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { catalog } from "../src/lib/catalog.js";
import { brandKey } from "../src/lib/normalize.js";
import { mapBrandPlants, brandProfiles } from "../src/lib/brand-pages.js";
import { MAKER_COUNTRY_DEFS, MAKER_COUNTRY_MIN } from "../src/lib/plant-groups.js";
import { makerCountryReport } from "../src/lib/plant-makers.js";
import { recallMeta, recallRows } from "../src/lib/recall-catalog.js";
import { buildRecallList, countRatingRecallRows, RECALLS_PATH } from "../src/lib/recall-list.js";
import { whoMakesPages } from "../src/lib/who-makes-pages.js";
import { REBADGED_TIRES_PATH } from "../src/lib/rebadged-tires.js";
import { decodeTin, indexPlants } from "../src/lib/tin.js";
import { indexablePathSet, PINNED_STATIC_INDEXABLE_PATHS, STATIC_INDEXABLE_PATHS } from "../src/lib/sitemap.js";
import { hubPaths } from "../src/lib/plant-hubs.js";
import { exampleComparisonPaths } from "../src/lib/compare-pages.js";
import { compareBrandValues } from "../src/scripts/brand-index.js";
import { sliceCount, sliceHref } from "../src/scripts/ratings-slice.js";
import {
  brandHubFaqs,
  brandHubProse,
  brandHubRows,
  buildDecoderExamples,
  decoderHubFaqs,
  decoderHubProse,
  joinHubCopy,
  plantHubFaqs,
  plantHubModel,
  plantHubProse,
  ratingsHubFacts,
  ratingsHubFaqs,
  ratingsHubProse,
  recallsHubProse,
  whoMakesHubProse,
} from "../src/lib/hub-quality.js";
import { recallSummary } from "../src/lib/recall-catalog.js";

const BANNED = /\b(best|worst|recommend(?:ed|s|ing)?|top-rated|top rated)\b/i;

function words(text) {
  return String(text)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function shingles(tokens, size = 5) {
  const found = new Set();
  for (let index = 0; index <= tokens.length - size; index += 1) {
    found.add(tokens.slice(index, index + size).join(" "));
  }
  return found;
}

function uniqueWordCoverage(text, childFiles) {
  const hub = words(text);
  const child = shingles(words(childFiles.map((file) => readFileSync(file, "utf8")).join("\n")));
  const covered = new Set();
  for (let index = 0; index <= hub.length - 5; index += 1) {
    const gram = hub.slice(index, index + 5).join(" ");
    if (!child.has(gram)) {
      for (let offset = 0; offset < 5; offset += 1) covered.add(index + offset);
    }
  }
  return { words: hub.length, unique: covered.size };
}

function localMedian(values) {
  const wears = values.filter((value) => Number.isInteger(value) && value > 0).sort((a, b) => a - b);
  if (!wears.length) return null;
  const mid = Math.floor(wears.length / 2);
  return wears.length % 2 === 1 ? wears[mid] : (wears[mid - 1] + wears[mid]) / 2;
}

function walk(dir, found = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

const recallReport = buildRecallList(recallRows, {
  brands: catalog.brands,
  lines: catalog.lines,
  whoMakes: whoMakesPages,
  retrievedAt: recallMeta.retrievedAt,
  source: recallMeta.source,
  ratingRecallRows: countRatingRecallRows(catalog),
});

test("rating hub counts match an offline recount of the committed rows", () => {
  const facts = ratingsHubFacts(catalog.lines);
  let rows = 0;
  let usable = 0;
  let excluded = 0;
  const wears = [];
  const bands = new Map();
  const traction = { AA: 0, A: 0, B: 0, C: 0, other: 0 };
  const temperature = { A: 0, B: 0, C: 0, other: 0 };
  for (const line of catalog.lines) {
    for (const row of line.rows) {
      rows += 1;
      const trac = String(row.trac ?? "").trim();
      if (traction[trac] != null) traction[trac] += 1;
      else traction.other += 1;
      const temp = String(row.temp ?? "").trim();
      if (temperature[temp] != null) temperature[temp] += 1;
      else temperature.other += 1;
      if (Number.isInteger(row.wearN) && row.wearN > 0) {
        usable += 1;
        wears.push(row.wearN);
        const start = row.wearN < 100 ? 0 : Math.floor(row.wearN / 100) * 100;
        bands.set(start, (bands.get(start) || 0) + 1);
      } else excluded += 1;
    }
  }
  assert.equal(facts.rowCount, rows);
  assert.equal(facts.rowCount, catalog.stats.rows);
  assert.equal(facts.lineCount, catalog.lines.length);
  assert.equal(facts.brandCount, catalog.brands.length);
  assert.equal(facts.usableWear, usable);
  assert.equal(facts.excludedWear, excluded);
  assert.equal(facts.median, localMedian(wears));
  assert.equal(facts.bands.reduce((sum, band) => sum + band.count, 0), usable);
  for (const band of facts.bands) assert.equal(band.count, bands.get(band.start));
  for (const item of facts.traction.items) assert.equal(item.count, traction[item.grade]);
  assert.equal(facts.traction.other?.count || 0, traction.other);
  for (const item of facts.temperature.items) assert.equal(item.count, temperature[item.grade]);
  assert.equal(facts.temperature.other?.count || 0, temperature.other);
  const sliceTotal = facts.slice.cells.reduce((sum, cell) => sum + cell.count, 0);
  assert.equal(sliceTotal, usable);
  assert.equal(sliceCount(facts.slice.cells, "", "", ""), usable);
  if (facts.bands[0]) {
    const band = facts.bands[0];
    assert.equal(sliceCount(facts.slice.cells, band.start, "AA", ""), facts.slice.cells.filter((cell) => cell.start === band.start && cell.trac === "AA").reduce((sum, cell) => sum + cell.count, 0));
    assert.match(sliceHref(String(band.start), "AA", "A"), /wearMin=/);
    assert.match(sliceHref(String(band.start), "AA", "A"), /#ratings-table$/);
  }
});

test("plant hub counts match an offline recount and the maker-country report", () => {
  const model = plantHubModel(catalog.plants, catalog.countries, MAKER_COUNTRY_DEFS, MAKER_COUNTRY_MIN);
  const counts = new Map(MAKER_COUNTRY_DEFS.map((def) => [def.id, 0]));
  const countries = new Map();
  for (const plant of catalog.plants) {
    const hits = MAKER_COUNTRY_DEFS.filter((def) => def.matches(plant.name));
    assert.ok(hits.length <= 1, plant.code);
    if (hits.length === 1) counts.set(hits[0].id, counts.get(hits[0].id) + 1);
    const key = plant.countryKey || "";
    countries.set(key, (countries.get(key) || 0) + 1);
  }
  const published = [...counts.entries()].filter(([, count]) => count >= MAKER_COUNTRY_MIN);
  assert.equal(model.makers.length, published.length);
  for (const maker of model.makers) assert.equal(maker.count, counts.get(maker.id), maker.id);
  const other = catalog.plants.length - model.makers.reduce((sum, maker) => sum + maker.count, 0);
  assert.equal(model.otherCount, other);
  assert.equal(model.countries.reduce((sum, country) => sum + country.count, 0), catalog.plants.length);
  for (const country of model.countries) assert.equal(country.count, countries.get(country.key));
  for (const group of makerCountryReport.groups) {
    const maker = model.makers.find((row) => row.id === group.id);
    assert.ok(maker, group.id);
    assert.equal(maker.count, group.count, group.id);
    assert.equal(maker.countries, group.countries.length, group.id);
  }
  assert.equal(model.makerByCode.size, catalog.plants.length);
});

test("brand hub columns match lines, medians, plant names, and recall campaigns", () => {
  const plantsByBrand = mapBrandPlants(catalog.brands, catalog.plants);
  const campaignsByKey = new Map();
  for (const row of recallReport.rows) {
    const key = brandKey(row.brand);
    if (!campaignsByKey.has(key)) campaignsByKey.set(key, new Set());
    campaignsByKey.get(key).add(row.campaign);
  }
  for (const profile of brandProfiles) {
    const lines = catalog.getBrandLines(profile.slug);
    assert.equal(profile.lineCount, lines.length, profile.slug);
    const median = localMedian(lines.flatMap((line) => line.rows.map((row) => row.wearN)));
    assert.equal(profile.median, median, profile.slug);
    assert.equal(profile.plants.length, (plantsByBrand.get(profile.slug) || []).length, profile.slug);
    const brand = catalog.brands.find((item) => item.slug === profile.slug);
    const campaigns = campaignsByKey.get(brandKey(brand.name)) || new Set();
    assert.equal(profile.campaignCount, campaigns.size, profile.slug);
  }
  const table = brandHubRows(brandProfiles);
  assert.equal(table.rows.length, catalog.brands.length);
  assert.equal(table.lines, catalog.stats.lines);
  assert.equal(table.showPlants, table.plantCodes > 0);
  assert.equal(table.plantColumn, table.showPlants ? "linked" : "omitted");
  if (!table.showPlants) assert.match(table.plantColumnReason, /omitted/);
  const page = readFileSync("src/pages/brands/index.astro", "utf8");
  assert.match(page, /model\.showPlants/);
  assert.match(page, /row\.medianText/);
  assert.match(page, /row\.recallHref/);
  assert.match(page, /plant\.url/);
});

test("decoder examples are real plant codes with a no-JS table", () => {
  const now = new Date(Date.UTC(2026, 10, 17));
  const report = buildDecoderExamples(catalog.plants, now);
  assert.ok(report.examples.length >= 3 && report.examples.length <= 4);
  assert.equal(report.asOfIso, "2026-11-17");
  const index = indexPlants(catalog.plants);
  const countries = new Set();
  for (const example of report.examples) {
    const again = decodeTin(example.tin, index, now);
    assert.equal(again.matches.length, 1, example.tin);
    assert.equal(again.matches[0].url, example.plantUrl, example.tin);
    assert.equal(again.date.week, example.week, example.tin);
    assert.equal(again.date.candidates[0].year, example.year, example.tin);
    assert.match(example.ageText, /Age today/);
    assert.equal(indexablePathSet().has(example.plantUrl), true, example.plantUrl);
    countries.add(example.countryKey);
  }
  assert.ok(countries.size >= 2);
  const page = readFileSync("src/pages/decoder.astro", "utf8");
  assert.match(page, /<noscript>/);
  assert.match(page, /buildDecoderExamples/);
  assert.match(page, /example\.plantUrl/);
  assert.match(page, /example\.week/);
  assert.match(page, /example\.year/);
  assert.match(page, /example\.ageText/);
  assert.match(page, /href="\/guides\/rebadged-tires\/"/);
  assert.doesNotMatch(page, /name="purchased"/);
  assert.match(page, /id="purchased"/);
});

test("hub copy is unique against the child templates", () => {
  const facts = ratingsHubFacts(catalog.lines);
  const plants = plantHubModel(catalog.plants, catalog.countries, MAKER_COUNTRY_DEFS, MAKER_COUNTRY_MIN);
  const brands = brandHubRows(brandProfiles);
  const decoded = buildDecoderExamples(catalog.plants, new Date(Date.UTC(2026, 10, 17)));
  const cases = [
    ["decoder", joinHubCopy(decoderHubProse(decoded), decoderHubFaqs(decoded)), ["src/pages/guides/dot-code.astro", "src/pages/guides/tire-date-code.astro", "src/pages/plants/[code].astro", "src/components/PlantMiniDecoder.astro"], "src/pages/decoder.astro", /decoderHubProse\(/],
    ["plants", joinHubCopy(plantHubProse(plants), plantHubFaqs(plants)), ["src/pages/plants/[code].astro", "src/pages/plants/country/[country].astro", "src/pages/plants/manufacturer/[group].astro"], "src/pages/plants/index.astro", /plantHubProse\(/],
    ["ratings", joinHubCopy(ratingsHubProse(facts), ratingsHubFaqs(facts)), ["src/pages/tires/[brand]/[line].astro"], "src/pages/ratings.astro", /ratingsHubProse\(/],
    ["brands", joinHubCopy(brandHubProse(brands), brandHubFaqs(brands)), ["src/pages/brands/[brand].astro"], "src/pages/brands/index.astro", /brandHubProse\(/],
    ["recalls", recallsHubProse(recallReport).join("\n"), ["src/pages/who-makes/[brand].astro"], "src/pages/recalls.astro", /recallsHubProse\(/],
    ["who-makes-it", whoMakesHubProse(recallSummary).join("\n"), ["src/pages/who-makes/[brand].astro"], "src/pages/who-makes-it.astro", /whoMakesHubProse\(/],
  ];
  for (const [name, text, children, page, call] of cases) {
    const coverage = uniqueWordCoverage(text, children);
    assert.ok(coverage.unique >= 300, `${name} unique words ${coverage.unique}`);
    assert.equal(BANNED.test(text), false, `${name} ${text.match(BANNED)?.[0] || ""}`);
    const source = readFileSync(page, "utf8");
    assert.match(source, call, name);
    assert.match(source, /<Answer /);
    assert.match(source, /<SourceLine /);
    assert.match(source, /<caption>/);
    console.log(`${name} unique words ${coverage.unique} of ${coverage.words}`);
  }
});

test("these hubs add no sitemap URLs and do not change sponsored links", () => {
  const added = STATIC_INDEXABLE_PATHS.filter((path) => !PINNED_STATIC_INDEXABLE_PATHS.includes(path));
  const removed = PINNED_STATIC_INDEXABLE_PATHS.filter((path) => !STATIC_INDEXABLE_PATHS.includes(path));
  assert.deepEqual(added, [REBADGED_TIRES_PATH]);
  assert.deepEqual(removed, []);
  const recomputed = new Set(STATIC_INDEXABLE_PATHS);
  for (const brand of catalog.brands) recomputed.add(brand.url);
  for (const line of catalog.lines) recomputed.add(line.url);
  for (const plant of catalog.plants) recomputed.add(plant.url);
  for (const path of hubPaths) recomputed.add(path);
  for (const page of whoMakesPages) recomputed.add(page.url);
  for (const path of exampleComparisonPaths) recomputed.add(path);
  const live = indexablePathSet();
  assert.equal(live.size, recomputed.size);
  for (const path of recomputed) assert.equal(live.has(path), true, path);
  for (const path of ["/decoder/", "/plants/", "/ratings/", "/brands/", RECALLS_PATH, "/who-makes-it/"]) {
    assert.equal(live.has(path), true, path);
  }

  const sponsored = walk("src")
    .filter((file) => readFileSync(file, "utf8").includes('rel="sponsored nofollow noopener"'))
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(sponsored, ["src/components/CheckPrice.astro", "src/components/GearLinks.astro"]);
  for (const file of [
    "src/pages/decoder.astro",
    "src/pages/plants/index.astro",
    "src/pages/ratings.astro",
    "src/pages/brands/index.astro",
    "src/pages/recalls.astro",
    "src/pages/who-makes-it.astro",
    "src/lib/hub-quality.js",
  ]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /rel="sponsored|awin1\.com|googletagmanager/i, file);
  }
});

test("hub links stay on pages this build can publish", () => {
  const paths = indexablePathSet();
  const facts = ratingsHubFacts(catalog.lines);
  const plants = plantHubModel(catalog.plants, catalog.countries, MAKER_COUNTRY_DEFS, MAKER_COUNTRY_MIN);
  const brands = brandHubRows(brandProfiles);
  const hrefs = [
    ...facts.bands.map((band) => band.href),
    ...facts.traction.items.map((item) => item.href),
    ...facts.temperature.items.map((item) => item.href),
    ...plants.countries.map((country) => country.url).filter(Boolean),
    ...plants.makers.flatMap((maker) => [maker.hubUrl, maker.crossUrl].filter(Boolean)),
    ...brands.rows.flatMap((row) => [row.url, row.recallHref, ...row.plants.map((plant) => plant.url)].filter(Boolean)),
  ];
  for (const href of hrefs) {
    const path = href.split("?")[0].split("#")[0];
    assert.equal(paths.has(path), true, href);
  }
  assert.match(readFileSync("src/pages/brands/[brand].astro", "utf8"), /id="recalls"/);
  assert.match(readFileSync("src/pages/ratings.astro", "utf8"), /id="ratings-table"/);
  assert.match(readFileSync("src/pages/plants/by-maker/index.astro", "utf8"), /id=\{group\.id\}/);
});

test("brand sorting keeps a missing median last", () => {
  const missing = { brand: "A", lines: "1", median: "", plants: "0", campaigns: "0" };
  const present = { brand: "B", lines: "2", median: "400", plants: "1", campaigns: "3" };
  assert.ok(compareBrandValues(missing, present, "median", "desc") > 0);
  assert.ok(compareBrandValues(present, missing, "median", "asc") < 0);
  assert.ok(compareBrandValues(present, { ...present, brand: "A", lines: "9" }, "lines", "desc") > 0);
});
