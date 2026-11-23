import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { formatTreadwearMedian } from "../src/lib/answers.js";
import { catalog } from "../src/lib/catalog.js";
import { exampleComparisonPaths } from "../src/lib/compare-pages.js";
import { percent } from "../src/lib/format.js";
import { hubPaths } from "../src/lib/plant-hubs.js";
import { REBADGED_TIRES_PATH } from "../src/lib/rebadged-tires.js";
import { indexablePathSet, PINNED_STATIC_INDEXABLE_PATHS, STATIC_INDEXABLE_PATHS } from "../src/lib/sitemap.js";
import { whoMakesPages } from "../src/lib/who-makes-pages.js";
import {
  ACROSS_BRAND_LIMIT,
  ACROSS_BRANDS_HREF,
  ACROSS_BRANDS_ID,
  BANNED_ACROSS_WORD,
  CROSS_CHECK,
  ECFR_UTQG_URL,
  METHODOLOGY_PATH,
  RATINGS_PATH,
  SIZE_VARIANCE_PATH,
  TIRE_REVIEW_URL,
  UTQG_GRADES_PATH,
  acrossBrandsAnswer,
  acrossBrandsCaption,
  acrossBrandsData,
  acrossBrandsIntro,
  acrossBrandsReport,
  acrossBrandsText,
  ecfrRetrievedLabel,
  tireReviewPublishedLabel,
  treadwearPercentile,
} from "../src/lib/utqg-across-brands.js";

function usable(value) {
  return Number.isInteger(value) && value > 0;
}

/** Independent of treadwearPercentile. Same rule, written here for the file check. */
function offlinePercentile(values, p) {
  const wears = values.filter(usable).sort((a, b) => a - b);
  if (!wears.length) return null;
  const rank = (wears.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const value = wears[lo] + (wears[hi] - wears[lo]) * (rank - lo);
  return Math.round(value * 10) / 10;
}

function offlineMedian(values) {
  const wears = values.filter(usable).sort((a, b) => a - b);
  if (!wears.length) return null;
  const mid = Math.floor(wears.length / 2);
  return wears.length % 2 === 1 ? wears[mid] : (wears[mid - 1] + wears[mid]) / 2;
}

function offlineRows(lines, brands, limit) {
  const bySlug = new Map();
  for (const line of lines) {
    if (!bySlug.has(line.brandSlug)) bySlug.set(line.brandSlug, []);
    bySlug.get(line.brandSlug).push(line);
  }
  const brandBySlug = new Map(brands.map((brand) => [brand.slug, brand]));
  const ranked = [];
  for (const [slug, group] of bySlug) {
    const brand = brandBySlug.get(slug);
    if (!brand?.url || !brand.name) continue;
    const rows = group.flatMap((line) => line.rows || []);
    const wears = rows.map((row) => row.wearN);
    const aaCount = rows.filter((row) => row.trac === "AA" || row.trac === "A").length;
    ranked.push({
      slug,
      lineCount: group.length,
      rowCount: rows.length,
      median: offlineMedian(wears),
      p10: offlinePercentile(wears, 0.1),
      p90: offlinePercentile(wears, 0.9),
      aaCount,
      shareText: percent(aaCount, rows.length),
    });
  }
  ranked.sort((a, b) => b.lineCount - a.lineCount || b.rowCount - a.rowCount || a.slug.localeCompare(b.slug, "en"));
  return ranked.slice(0, limit);
}

function row(wear, trac) {
  return { wearN: wear, trac };
}

function line(slug, rows) {
  return { brandSlug: slug, rows };
}

function brand(slug, name = slug) {
  return { slug, name, url: `/brands/${slug}/` };
}

function assertNoBanned(text, where) {
  assert.equal(BANNED_ACROSS_WORD.test(text) ? text.match(BANNED_ACROSS_WORD)[0] : "", "", where);
}

test("a fixture matches hand-checked percentiles and leaves a missing brand page out", () => {
  const source = {
    brands: [brand("alpha", "Alpha"), brand("beta", "Beta"), brand("gamma", "Gamma")],
    lines: [
      line("alpha", [row(100, "AA"), row(300, "A")]),
      line("alpha", [row(500, "B")]),
      line("alpha", [row(0, "AA")]),
      line("beta", [row(200, "A"), row(400, "A")]),
      line("beta", [row(600, "C")]),
      line("gamma", [row(800, "B")]),
      line("ghost", [row(100, "AA"), row(120, "AA"), row(140, "AA")]),
    ],
  };
  const report = acrossBrandsReport(source, 2);
  assert.deepEqual(
    report.brands.map((item) => item.slug),
    ["alpha", "beta"],
  );
  const alpha = report.brands[0];
  assert.equal(alpha.lineCount, 3);
  assert.equal(alpha.rowCount, 4);
  assert.equal(alpha.aaCount, 3);
  assert.equal(alpha.median, 300);
  assert.equal(alpha.p10, 140);
  assert.equal(alpha.p90, 460);
  assert.equal(alpha.shareText, "75.0%");
  const beta = report.brands[1];
  assert.equal(beta.lineCount, 2);
  assert.equal(beta.rowCount, 3);
  assert.equal(beta.median, 400);
  assert.equal(beta.p10, 240);
  assert.equal(beta.p90, 560);
  assert.equal(beta.shareText, "66.7%");
  assert.equal(report.brandCount, 3);
  assert.equal(treadwearPercentile([100, 200], 0.1), 110);
  assert.equal(treadwearPercentile([100, 200], 0.9), 190);
  assert.equal(treadwearPercentile([], 0.1), null);
});

test("equal line counts break on grade rows, then slug", () => {
  const source = {
    brands: [brand("zee", "Zee"), brand("aye", "Aye"), brand("bee", "Bee")],
    lines: [
      line("zee", [row(100, "A")]),
      line("aye", [row(100, "A")]),
      line("bee", [row(100, "A"), row(200, "B")]),
      line("bee", [row(300, "A")]),
    ],
  };
  const report = acrossBrandsReport(source, 2);
  assert.deepEqual(
    report.brands.map((item) => item.slug),
    ["bee", "aye"],
  );
  assert.equal(acrossBrandsReport(source, 0).brands.length, 0);
  assert.match(acrossBrandsIntro({ brands: [], brandCount: 0 }), /no graded line/);
});

test("the committed table matches an offline recompute and stays inside the line-count band", () => {
  const report = acrossBrandsReport(catalog);
  const offline = offlineRows(catalog.lines, catalog.brands, ACROSS_BRAND_LIMIT);
  assert.equal(report.limit, ACROSS_BRAND_LIMIT);
  assert.ok(report.brands.length >= 10 && report.brands.length <= 15);
  assert.equal(report.brands.length, Math.min(ACROSS_BRAND_LIMIT, report.brandCount));
  assert.equal(report.brands.length, offline.length);
  report.brands.forEach((brandRow, index) => {
    const expected = offline[index];
    assert.equal(brandRow.slug, expected.slug);
    assert.equal(brandRow.lineCount, expected.lineCount);
    assert.equal(brandRow.rowCount, expected.rowCount);
    assert.equal(brandRow.median, expected.median);
    assert.equal(brandRow.p10, expected.p10);
    assert.equal(brandRow.p90, expected.p90);
    assert.equal(brandRow.aaCount, expected.aaCount);
    assert.equal(brandRow.shareText, expected.shareText);
    assert.equal(brandRow.medianText, formatTreadwearMedian(expected.median));
    assert.equal(brandRow.url, `/brands/${brandRow.slug}/`);
  });
  const packed = acrossBrandsData(catalog);
  assert.deepEqual(
    packed,
    report.brands.map((brandRow) => [
      brandRow.slug,
      brandRow.lineCount,
      brandRow.rowCount,
      brandRow.median,
      brandRow.p10,
      brandRow.p90,
      brandRow.aaCount,
    ]),
  );
  assert.equal(JSON.stringify(packed).includes(catalog.meta.verifiedAt), false);
  const live = indexablePathSet();
  for (const brandRow of report.brands) assert.equal(live.has(brandRow.url), true, brandRow.url);
  console.log(
    `across-brands ${report.brands
      .map((brandRow) => `${brandRow.name} ${brandRow.lineCount} lines, ${brandRow.rowCount} rows, median ${brandRow.medianText}, ${brandRow.spanText}, AA/A ${brandRow.shareText}`)
      .join(" | ")}`,
  );
});

test("the answer cites the rule and Tire Review, and the copy has no verdict", () => {
  const answers = acrossBrandsAnswer();
  assert.ok(answers.length >= 1 && answers.length <= 3);
  for (const sentence of answers) assert.match(sentence, /[.!?]$/);
  const text = answers.join(" ");
  assert.match(text, /49 CFR 575\.104/);
  assert.match(text, /brand name owner/);
  assert.match(text, /compliance testing/);
  assert.match(text, /hires an independent testing company/);
  assert.match(text, /no routine audits/);
  assert.match(text, /within a single brand/);
  assert.match(text, /between different brands is questionable/);
  assert.doesNotMatch(text, /7,200|7200|control tire|drift/i);
  const report = acrossBrandsReport(catalog);
  const copy = acrossBrandsText(report);
  assert.match(copy, /not a quality ranking/);
  assert.match(copy, /positive whole-number treadwear/);
  assert.match(acrossBrandsCaption(catalog.meta.verifiedAt), /not a quality ranking/);
  assert.match(acrossBrandsIntro(report), /most graded lines/);
  assert.equal(CROSS_CHECK.map((item) => item.id).join(","), "warranty,tests,size");
  assert.match(CROSS_CHECK[0].text, /mileage warranty/);
  assert.match(CROSS_CHECK[1].text, /Independent test results/);
  assert.match(CROSS_CHECK[2].text, /same line can list more than one grade/);
  assertNoBanned(copy, "section copy");
  assert.equal(ecfrRetrievedLabel(), "November 22, 2026");
  assert.equal(tireReviewPublishedLabel(), "December 1, 2015");
  assert.equal(ECFR_UTQG_URL.startsWith("https://www.ecfr.gov/"), true);
  assert.equal(TIRE_REVIEW_URL, "https://www.tirereview.com/utqg-ratings-unfurled/");
});

test("the section is an anchor on the existing guide, and the sitemap gains no URL", () => {
  const utqg = readFileSync(new URL("../src/pages/guides/utqg-grades.astro", import.meta.url), "utf8");
  const treadwear = readFileSync(new URL("../src/pages/guides/treadwear-numbers.astro", import.meta.url), "utf8");
  const traction = readFileSync(new URL("../src/pages/guides/traction-grades.astro", import.meta.url), "utf8");
  assert.equal(ACROSS_BRANDS_HREF, `${UTQG_GRADES_PATH}#${ACROSS_BRANDS_ID}`);
  assert.match(utqg, /<h2 id=\{ACROSS_BRANDS_ID\}>/);
  assert.equal(utqg.split(ACROSS_BRANDS_HREF).length - 1, 0);
  assert.equal(treadwear.split(ACROSS_BRANDS_HREF).length - 1, 1);
  assert.equal(traction.split(ACROSS_BRANDS_HREF).length - 1, 1);
  for (const source of [treadwear, traction]) {
    const line = source.split("\n").find((item) => item.includes(ACROSS_BRANDS_HREF));
    assertNoBanned(line, line);
  }
  const start = utqg.indexOf("id={ACROSS_BRANDS_ID}");
  assert.ok(start > 0);
  const end = utqg.indexOf("<h2", start + 1);
  const section = utqg.slice(start, end);
  assertNoBanned(section, "utqg section source");
  assert.match(section, /What to cross-check/);
  assert.match(section, /SIZE_VARIANCE_PATH/);
  assert.match(section, /RATINGS_PATH/);
  assert.match(section, /METHODOLOGY_PATH/);
  assert.equal(SIZE_VARIANCE_PATH, "/guides/treadwear-varies-by-size/");
  assert.equal(RATINGS_PATH, "/ratings/");
  assert.equal(METHODOLOGY_PATH, "/methodology/");

  const added = STATIC_INDEXABLE_PATHS.filter((path) => !PINNED_STATIC_INDEXABLE_PATHS.includes(path));
  const removed = PINNED_STATIC_INDEXABLE_PATHS.filter((path) => !STATIC_INDEXABLE_PATHS.includes(path));
  assert.deepEqual(added, [REBADGED_TIRES_PATH]);
  assert.deepEqual(removed, []);
  assert.equal(STATIC_INDEXABLE_PATHS.filter((path) => path === UTQG_GRADES_PATH).length, 1);
  assert.equal(
    STATIC_INDEXABLE_PATHS.some((path) => path.includes(ACROSS_BRANDS_ID)),
    false,
  );
  const recomputed = new Set(STATIC_INDEXABLE_PATHS);
  for (const brandRow of catalog.brands) recomputed.add(brandRow.url);
  for (const line of catalog.lines) recomputed.add(line.url);
  for (const plant of catalog.plants) recomputed.add(plant.url);
  for (const path of hubPaths) recomputed.add(path);
  for (const page of whoMakesPages) recomputed.add(page.url);
  for (const path of exampleComparisonPaths) recomputed.add(path);
  const live = indexablePathSet();
  assert.equal(live.size, recomputed.size);
  for (const path of recomputed) assert.equal(live.has(path), true, path);
  assert.equal(live.has(UTQG_GRADES_PATH), true);
  assert.equal(live.has(SIZE_VARIANCE_PATH), true);
  assert.equal(live.has(RATINGS_PATH), true);
  assert.equal(live.has(METHODOLOGY_PATH), true);
  assert.equal([...live].some((path) => path.includes(ACROSS_BRANDS_ID)), false);
  console.log(`indexable pages ${live.size}`);
});
