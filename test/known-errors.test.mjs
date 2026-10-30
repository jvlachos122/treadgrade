import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { formatNumber, formatVerified } from "../src/lib/format.js";
import { cleanSpace } from "../src/lib/format.js";
import {
  buildKnownErrors,
  knownErrorsDescription,
  knownErrorsJsonLd,
  KNOWN_ERRORS_PATH,
  loadRefreshSchedule,
  refreshSchedule,
} from "../src/lib/known-errors.js";
import { brandKey, buildCatalog, nameKey } from "../src/lib/normalize.js";
import { isImporterOrBrandOwnerExample } from "../src/lib/recalls.js";
import { summarizeRecallRows } from "../src/lib/recalls.js";

const TRACTION = new Set(["AA", "A", "B", "C"]);
const TEMPERATURE = new Set(["A", "B", "C"]);
const FORBIDDEN = new Set(["Product", "Review", "AggregateRating", "GovernmentOrganization"]);

function meta(extra = {}) {
  return {
    verifiedAt: "2026-10-26T19:47:41.050Z",
    ratings: {
      source: "https://api.nhtsa.gov/tires?dataSet=ratings",
      rows: 0,
      fields: ["id", "brand", "tireline", "size", "wear", "trac", "temp", "active"],
      ...extra.ratings,
    },
    plants: {
      source: "https://vpic.nhtsa.dot.gov/api/vehicles/GetEquipmentPlantCodes?year=2026&equipmentType=1&reportType=All&format=json",
      yearRequested: 2026,
      fields: ["dotCode", "name", "status"],
      searchCriteria: "Year:2026",
      ...extra.plants,
    },
    recalls: {
      retrievedAt: "2026-10-26T19:47:41.050Z",
      source: "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip",
      ...extra.recalls,
    },
  };
}

function row(id, brand, tireline, size, wear, trac, temp) {
  return { id, brand, tireline, size, const: "Radial", wear, trac, temp, active: false };
}

function typesOf(value, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) typesOf(item, found);
    return found;
  }
  const type = value["@type"];
  if (typeof type === "string") found.push(type);
  else if (Array.isArray(type)) found.push(...type);
  for (const item of Object.values(value)) typesOf(item, found);
  return found;
}

test("refresh schedule is read from the weekly workflow", () => {
  assert.deepEqual(refreshSchedule("0 14 * * 1"), { day: "Monday", time: "14:00", cron: "0 14 * * 1" });
  assert.equal(refreshSchedule("not a cron"), null);
  const schedule = loadRefreshSchedule();
  assert.equal(schedule.day, "Monday");
  assert.equal(schedule.time, "14:00");
});

test("known-error counts follow the rows that were passed in", () => {
  const ratings = [
    row(1, "Vercelli", "ADVAN A048", "15", "60", "A", "A"),
    row(2, "Visa", "ADVAN A048", "16", "60", "A", "A"),
    row(3, "Bridgestone", "Turanza QuietTrack", "17", "700", "A", "A"),
    row(4, "Multi-Mile", "Grand", "15", "400", "A", "A"),
    row(5, "Multimile", "Grand", "16", "0", "W", "500"),
  ];
  const catalog = buildCatalog(ratings, [], meta());
  const report = buildKnownErrors({ catalog, ratings, recalls: [] });
  assert.equal(report.rawBrandStrings, 5);
  assert.equal(report.brandsAfterCase, 5);
  assert.equal(report.brands, 4);
  assert.equal(report.sharedLineNames, 1);
  assert.equal(report.wearZeroRows, 1);
  assert.equal(report.invalidLetterRows, 1);
  assert.equal(report.repeatedLines.map((group) => group.id).join(","), "advan-a048");
  assert.deepEqual(
    report.repeatedLines[0].brands.map((brand) => brand.name).sort(),
    ["Vercelli", "Visa"],
  );
  assert.equal(report.coverage.find((item) => item.id === "quiettrack").rows, 1);
  assert.equal(report.coverage.find((item) => item.id === "ko2").rows, 0);

  const kept = ratings.filter((item) => item.tireline !== "ADVAN A048" && item.tireline !== "Turanza QuietTrack");
  const smaller = buildKnownErrors({ catalog: buildCatalog(kept, [], meta()), ratings: kept, recalls: [] });
  assert.equal(smaller.repeatedLines.length, 0);
  assert.equal(smaller.sharedLineNames, 0);
  assert.equal(smaller.coverage.find((item) => item.id === "quiettrack").rows, 0);
  assert.notEqual(smaller.rawBrandStrings, report.rawBrandStrings);
});

test("committed files produce the known-error counts", () => {
  const ratings = JSON.parse(readFileSync("data/ratings.json", "utf8"));
  const plants = JSON.parse(readFileSync("data/plants.json", "utf8"));
  const savedMeta = JSON.parse(readFileSync("data/meta.json", "utf8"));
  const recalls = JSON.parse(readFileSync("data/recalls.json", "utf8"));
  const catalog = buildCatalog(ratings, plants, savedMeta);
  const report = buildKnownErrors({ catalog, ratings, recalls });

  const raw = new Set();
  const caseKeys = new Set();
  const punctuationKeys = new Set();
  let skipped = 0;
  for (const row of ratings) {
    const brand = cleanSpace(row.brand);
    const line = cleanSpace(row.tireline);
    if (!brand || !line) {
      skipped += 1;
      continue;
    }
    raw.add(brand);
    caseKeys.add(nameKey(brand));
    punctuationKeys.add(brandKey(brand));
  }
  assert.equal(report.rawBrandStrings, raw.size);
  assert.equal(report.brandsAfterCase, caseKeys.size);
  assert.equal(report.brandKeys, punctuationKeys.size);
  assert.equal(report.brands, catalog.stats.brands);
  assert.equal(report.brandKeys, catalog.stats.brands);
  assert.equal(report.gradeRows, catalog.stats.rows);
  assert.equal(report.sourceRows, ratings.length);
  assert.equal(report.skippedRows, skipped);
  assert.equal(report.duplicateRows, ratings.length - skipped - catalog.stats.rows);
  assert.equal(report.plants, plants.length);

  let shared = 0;
  let wearZero = 0;
  let wearMissing = 0;
  let invalidLetters = 0;
  let active = 0;
  let multiWear = 0;
  const byLine = new Map();
  for (const line of catalog.lines) {
    if (!byLine.has(line.lineKey)) byLine.set(line.lineKey, new Set());
    byLine.get(line.lineKey).add(line.brandSlug);
    const wears = new Set(line.rows.map((item) => item.wearN).filter((value) => value != null && value > 0));
    if (wears.size > 1) multiWear += 1;
    for (const item of line.rows) {
      if (item.active) active += 1;
      if (item.wearN === 0) wearZero += 1;
      if (item.wear == null || item.wear === "") wearMissing += 1;
      if (!TRACTION.has(item.trac) || !TEMPERATURE.has(item.temp)) invalidLetters += 1;
    }
  }
  for (const brands of byLine.values()) if (brands.size > 1) shared += 1;
  assert.equal(report.sharedLineNames, shared);
  assert.equal(report.wearZeroRows, wearZero);
  assert.equal(report.wearMissingRows, wearMissing);
  assert.equal(report.invalidLetterRows, invalidLetters);
  assert.equal(report.activeRows, active);
  assert.equal(report.multiWearLines, multiWear);
  assert.ok(report.sharedLineNames > 50);
  assert.equal(report.counts.find((row) => row.label === "Line names under more than one brand").value, shared);

  const advan = report.repeatedLines.find((group) => group.id === "advan-a048");
  const advanLines = catalog.lines.filter((line) => line.lineKey === nameKey("ADVAN A048"));
  assert.ok(advanLines.length > 1);
  assert.deepEqual(
    advan.brands.map((brand) => brand.name).sort(),
    advanLines.map((line) => line.brand).sort(),
  );
  const yokohama = catalog.brands.find((brand) => brandKey(brand.name) === brandKey("Yokohama"));
  if (yokohama && !advanLines.some((line) => line.brandSlug === yokohama.slug)) {
    assert.ok(advan.absent.includes(yokohama.name));
    assert.match(advan.detail, new RegExp(`Not stored under ${yokohama.name}`));
  }

  for (const id of ["quiettrack", "westlake", "linglong", "lexani", "ko2"]) {
    assert.equal(report.coverage.find((item) => item.id === id).rows, 0);
  }
  const defender = report.coverage.find((item) => item.id === "defender-2");
  const defenderRows = catalog.lines
    .filter((line) => /michelin/i.test(line.brand) && /^defender\s*2$/i.test(line.line))
    .reduce((sum, line) => sum + line.rows.length, 0);
  assert.equal(defender.rows, defenderRows);
  assert.ok(defender.rows > 0);

  const summary = summarizeRecallRows(recalls);
  assert.equal(report.recallCampaigns, summary.campaigns);
  assert.equal(report.recallLines, summary.lines);
  const filers = new Set();
  for (const row of recalls) {
    const name = cleanSpace(row.filer);
    if (isImporterOrBrandOwnerExample(name)) filers.add(name);
  }
  assert.deepEqual(
    report.importerFilers.map((filer) => filer.name),
    [...filers].sort((a, b) => a.localeCompare(b, "en")),
  );

  const when = formatVerified(savedMeta.verifiedAt);
  for (const sentence of report.answers) {
    assert.match(sentence, /[.!?]$/);
    assert.match(sentence, /NHTSA/);
    assert.ok(sentence.includes(when));
    assert.ok(sentence.includes("(UTC)"));
    assert.doesNotMatch(sentence, /\bthe best\b/i);
    assert.doesNotMatch(sentence, /\bhighest\b/i);
  }
  assert.equal(report.answers.length, 3);
  assert.ok(report.answers[0].includes(formatNumber(report.rawBrandStrings)));
  assert.ok(report.answers[0].includes(formatNumber(report.brands)));
  assert.ok(report.answers[0].includes(formatNumber(report.gradeRows)));
  assert.ok(report.answers[1].includes(formatNumber(report.sharedLineNames)));
  assert.ok(report.answers[2].includes(formatNumber(report.wearZeroRows)));
  assert.ok(report.answers[2].includes(formatNumber(report.invalidLetterRows)));

  const description = knownErrorsDescription(report);
  assert.ok(description.length >= 40);
  assert.ok(description.length <= 180, description);
  assert.ok(description.includes(when));

  const graph = knownErrorsJsonLd(report);
  const types = typesOf(graph);
  assert.ok(types.includes("Dataset"));
  assert.ok(types.includes("Article"));
  assert.ok(types.includes("Organization"));
  for (const type of types) assert.equal(FORBIDDEN.has(type), false, type);
  assert.equal(graph[0].creator["@type"], "Organization");
  assert.equal(graph[0].publisher["@type"], "Organization");
  assert.equal(graph[1].author["@type"], "Organization");
  assert.equal(graph[1].publisher["@type"], "Organization");
  assert.equal(graph[0].url, `https://treadgrade.com${KNOWN_ERRORS_PATH}`);
  assert.equal(graph[1].mainEntityOfPage, `https://treadgrade.com${KNOWN_ERRORS_PATH}`);
  assert.equal(graph[0].dateModified, savedMeta.verifiedAt);
  assert.equal(graph[0].creator.name, "National Highway Traffic Safety Administration");
  assert.equal(report.examples.length > 0, true);
  for (const example of report.examples) {
    assert.equal(typeof example.rows, "number");
    assert.match(example.detail, /\S/);
    assert.match(example.handling, /\S/);
  }
});

test("the known-errors page has one h1 and publishes the computed blocks", () => {
  const page = readFileSync("src/pages/methodology/known-errors.astro", "utf8");
  assert.equal((page.match(/<h1\b/g) || []).length, 1);
  assert.match(page, /knownErrorsJsonLd/);
  assert.match(page, /buildKnownErrors/);
  assert.doesNotMatch(page, /Product|Review|AggregateRating|GovernmentOrganization/);
  assert.equal(KNOWN_ERRORS_PATH, "/methodology/known-errors/");
});
