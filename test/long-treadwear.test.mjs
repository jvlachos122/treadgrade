import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog, ratingRows } from "../src/lib/catalog.js";
import { cleanSpace, formatNumber, formatVerified } from "../src/lib/format.js";
import {
  BANNED_LONG_WORD,
  LONG_TREADWEAR_MIN,
  LONG_TREADWEAR_PATH,
  LONG_TREADWEAR_TEMPERATURE,
  LONG_TREADWEAR_TITLE,
  LONG_TREADWEAR_TRACTION,
  caveatText,
  longTreadwearAnswer,
  longTreadwearFaqs,
  longTreadwearJsonLd,
  longTreadwearReport,
  longTreadwearText,
  rowsCaption,
  sizeFlag,
} from "../src/lib/long-treadwear.js";
import { brandKey } from "../src/lib/normalize.js";
import { includeInSitemap } from "../src/lib/sitemap.js";
import { slugify } from "../src/lib/slug.js";

function assertNoBannedWords(text, where) {
  assert.equal(BANNED_LONG_WORD.test(text) ? text.match(BANNED_LONG_WORD)[0] : "", "", where);
}

function assertAnswerShape(sentences) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3);
  for (const sentence of sentences) {
    assert.match(sentence, /[.!?]$/, sentence);
    assert.doesNotMatch(sentence, /\b(best|top-rated|top rated|recommend(?:ed|s|ing)?)\b/i, sentence);
    if (/\bhighest\b/i.test(sentence)) assert.match(sentence, /in NHTSA's published UTQG list/, sentence);
  }
}

function meets(row) {
  return row.wearN != null && row.wearN >= 700 && (row.trac === "AA" || row.trac === "A") && row.temp === "A";
}

function line(brand, name, rows) {
  const brandSlug = brand.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const lineSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    brand,
    line: name,
    brandSlug,
    lineSlug,
    url: `/tires/${brandSlug}/${lineSlug}/`,
    rows,
  };
}

function fixtureCatalog() {
  return {
    meta: {
      verifiedAt: "2024-05-06T07:08:09.000Z",
      ratings: { source: "https://example.com/ratings" },
    },
    lines: [
      line("Alpha", "Solo", [{ wearN: 900, trac: "AA", temp: "A", size: "All sizes" }]),
      line("Beta", "Mixed", [
        { wearN: 800, trac: "A", temp: "A", size: "215/60R16" },
        { wearN: 700, trac: "AA", temp: "A", size: "225/60R16" },
        { wearN: 900, trac: "A", temp: "B", size: "235/60R16" },
        { wearN: 600, trac: "AA", temp: "A", size: "245/60R16" },
      ]),
      line("Echo", "Both", [
        { wearN: 820, trac: "A", temp: "A", size: "All" },
        { wearN: 700, trac: "A", temp: "A", size: "P195/65R15" },
      ]),
      line("Gamma", "HighAA", [{ wearN: 800, trac: "AA", temp: "A", size: "205/55R16" }]),
      line("Gamma", "HighA", [{ wearN: 800, trac: "A", temp: "A", size: "205/55R16" }]),
      line("Alpha", "All plus", [
        { wearN: 740, trac: "A", temp: "A", size: "All sizes" },
        { wearN: 500, trac: "A", temp: "A", size: "P215/60R16" },
      ]),
      line("Zeta", "Low", [{ wearN: 690, trac: "AA", temp: "A", size: "All" }]),
      line("Zeta", "Weird", [{ wearN: 900, trac: "W", temp: "W", size: "All" }]),
      line("Zeta", "Zero", [{ wearN: 0, trac: "A", temp: "A", size: "All" }]),
    ],
  };
}

function tractionRank(value) {
  if (value === "AA") return 2;
  if (value === "A") return 1;
  return 0;
}

test("the filter constants stay at treadwear 700, traction A or AA, and temperature A", () => {
  assert.equal(LONG_TREADWEAR_MIN, 700);
  assert.deepEqual(LONG_TREADWEAR_TRACTION, ["AA", "A"]);
  assert.equal(LONG_TREADWEAR_TEMPERATURE, "A");
  assert.equal(LONG_TREADWEAR_PATH, "/lists/long-treadwear-high-traction/");
});

test("a fixture keeps lines that meet the filter and flags some sizes", () => {
  const report = longTreadwearReport(fixtureCatalog());
  assert.equal(report.lineCount, 6);
  assert.equal(report.brandCount, 4);
  assert.equal(report.matchingRowCount, 8);
  assert.equal(report.someSizesCount, 2);
  assert.equal(report.aaLineCount, 3);
  assert.equal(report.aOnlyCount, 3);
  assert.equal(report.bothCount, 1);
  assert.equal(report.maxWear, 900);
  assert.deepEqual(
    report.lines.map((entry) => entry.line.line),
    ["Solo", "Both", "HighAA", "Mixed", "HighA", "All plus"],
  );
  assert.deepEqual(
    report.lines.map((entry) => [entry.maxWear, entry.tractionAtMax]),
    [
      [900, "AA"],
      [820, "A"],
      [800, "AA"],
      [800, "A"],
      [800, "A"],
      [740, "A"],
    ],
  );
  const mixed = report.lines.find((entry) => entry.line.line === "Mixed");
  assert.equal(mixed.someSizes, true);
  assert.equal(sizeFlag(mixed), "some sizes, 2 of 4");
  assert.equal(mixed.wearLabel, "800, 700");
  assert.deepEqual(mixed.tractions, ["AA", "A"]);
  assert.deepEqual(mixed.temps, ["A"]);
  assert.ok(mixed.matchingCount >= 1);
  for (const row of mixed.line.rows.filter(meets)) {
    assert.ok(row.wearN >= 700);
    assert.ok(row.trac === "A" || row.trac === "AA");
    assert.equal(row.temp, "A");
  }
  const solo = report.lines.find((entry) => entry.line.line === "Solo");
  assert.equal(solo.someSizes, false);
  assert.equal(sizeFlag(solo), "1 of 1");
  assert.doesNotMatch(sizeFlag(solo), /some sizes/);
  const both = report.lines.find((entry) => entry.line.line === "Both");
  assert.equal(sizeFlag(both), "2 of 2");
  assert.equal(both.wearLabel, "820, 700");
  const allPlus = report.lines.find((entry) => entry.line.line === "All plus");
  assert.equal(sizeFlag(allPlus), "some sizes, 1 of 2");
  assert.equal(report.lines.some((entry) => entry.line.brand === "Zeta"), false);

  const answers = longTreadwearAnswer(report);
  assertAnswerShape(answers);
  assert.match(answers[0], /6 tire lines from 4 brands/);
  assert.match(answers[0], new RegExp(formatVerified(report.verifiedAt)));
  assert.match(answers[1], /The highest treadwear in NHTSA's published UTQG list among those lines is 900, on Alpha Solo/);
  assert.match(
    answers[2],
    /3 lines include traction AA on a matching size row, 1 of them also lists traction A on another matching size row, and 3 lines match only at traction A/,
  );
  assert.match(caveatText(), /assigned by the manufacturer/);
  assert.match(rowsCaption(report), /some sizes/);
  const faqs = longTreadwearFaqs(report);
  assert.ok(faqs.length >= 2 && faqs.length <= 4);
  assertNoBannedWords(longTreadwearText(report), "fixture copy");
  const types = longTreadwearJsonLd(report).map((node) => node["@type"]);
  assert.deepEqual(types, ["Dataset", "Article", "FAQPage"]);
  assert.equal(longTreadwearJsonLd(report)[2].mainEntity.length, faqs.length);
});

test("an empty pull states that no line qualifies", () => {
  const report = longTreadwearReport({
    meta: { verifiedAt: "2024-01-02T03:04:05.000Z", ratings: { source: "https://example.com/ratings" } },
    lines: [line("Zeta", "Low", [{ wearN: 690, trac: "AA", temp: "A", size: "All" }])],
  });
  assert.equal(report.lineCount, 0);
  assert.equal(report.brandCount, 0);
  assert.equal(report.someSizesCount, 0);
  assert.equal(report.maxWear, null);
  const answers = longTreadwearAnswer(report);
  assertAnswerShape(answers);
  assert.match(answers[0], /no tire line/);
  assert.match(answers[1], /verified January 2, 2024/);
  assert.match(answers[2], /assigned by the manufacturer/);
  assert.equal(longTreadwearFaqs(report).length, 4);
  assertNoBannedWords(longTreadwearText(report), "empty copy");
});

test("the live list matches an offline recompute of the committed ratings", () => {
  const report = longTreadwearReport(catalog);
  const expected = [];
  for (const line of catalog.lines) {
    const matching = line.rows.filter(meets);
    if (!matching.length) continue;
    const wears = [...new Set(matching.map((row) => row.wearN))].sort((a, b) => b - a);
    const maxWear = wears[0];
    const atMax = matching.filter((row) => row.wearN === maxWear);
    const tractionAtMax = atMax.map((row) => row.trac).sort((a, b) => tractionRank(b) - tractionRank(a))[0];
    const tractions = [...new Set(matching.map((row) => row.trac))].sort(
      (a, b) => tractionRank(b) - tractionRank(a) || a.localeCompare(b, "en"),
    );
    expected.push({
      url: line.url,
      brand: line.brand,
      line: line.line,
      maxWear,
      tractionAtMax,
      wearLabel: wears.join(", "),
      tractions,
      temps: [...new Set(matching.map((row) => row.temp))].sort(),
      matchingCount: matching.length,
      totalCount: line.rows.length,
      someSizes: matching.length < line.rows.length,
    });
  }
  expected.sort(
    (a, b) =>
      b.maxWear - a.maxWear ||
      tractionRank(b.tractionAtMax) - tractionRank(a.tractionAtMax) ||
      a.brand.localeCompare(b.brand, "en") ||
      a.line.localeCompare(b.line, "en"),
  );
  assert.deepEqual(
    report.lines.map((entry) => ({
      url: entry.line.url,
      brand: entry.line.brand,
      line: entry.line.line,
      maxWear: entry.maxWear,
      tractionAtMax: entry.tractionAtMax,
      wearLabel: entry.wearLabel,
      tractions: entry.tractions,
      temps: entry.temps,
      matchingCount: entry.matchingCount,
      totalCount: entry.totalCount,
      someSizes: entry.someSizes,
    })),
    expected,
  );
  assert.equal(report.lineCount, expected.length);
  assert.equal(
    report.brandCount,
    new Set(expected.map((entry) => entry.brand)).size,
  );
  assert.equal(
    report.someSizesCount,
    expected.filter((entry) => entry.someSizes).length,
  );
  assert.equal(
    report.matchingRowCount,
    expected.reduce((sum, entry) => sum + entry.matchingCount, 0),
  );
  assert.equal(report.aaLineCount + report.aOnlyCount, report.lineCount);
  assert.ok(report.lineCount > 0);
  for (const entry of report.lines) {
    assert.ok(entry.matchingCount >= 1);
    assert.ok(entry.maxWear >= 700);
    assert.ok(entry.tractions.every((grade) => grade === "A" || grade === "AA"));
    assert.deepEqual(entry.temps, ["A"]);
    const flag = sizeFlag(entry);
    assert.match(flag, new RegExp(`${formatNumber(entry.matchingCount)} of ${formatNumber(entry.totalCount)}`));
    if (entry.someSizes) assert.match(flag, /^some sizes, /);
    else assert.doesNotMatch(flag, /some sizes/);
  }

  const rawGroups = new Set();
  let rawRows = 0;
  for (const raw of ratingRows) {
    const wear = raw.wear == null || String(raw.wear).trim() === "" ? null : String(raw.wear).trim();
    const wearN = wear != null && /^\d+$/.test(wear) ? Number(wear) : null;
    const row = { wearN, trac: cleanSpace(raw.trac).toUpperCase(), temp: cleanSpace(raw.temp).toUpperCase() };
    if (!meets(row)) continue;
    rawRows += 1;
    rawGroups.add(`${brandKey(raw.brand)}\n${slugify(raw.tireline)}`);
  }
  assert.equal(rawGroups.size, report.lineCount);
  assert.equal(rawRows, report.matchingRowCount);

  const answers = longTreadwearAnswer(report);
  assertAnswerShape(answers);
  assert.match(answers[0], new RegExp(`${formatNumber(report.lineCount)} tire lines?`));
  assert.match(answers[0], new RegExp(`${formatNumber(report.brandCount)} brands?`));
  assert.match(answers[0], new RegExp(formatVerified(catalog.meta.verifiedAt).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(answers[1], new RegExp(`is ${report.maxWear}, on `));
  if (report.aaLineCount === 0) {
    assert.match(answers[2], /None of those lines includes traction AA/);
    assert.match(answers[2], new RegExp(`all ${formatNumber(report.lineCount)} lines match only at traction A`));
  }
  const text = longTreadwearText(report);
  assert.match(text, /assigned by the manufacturer/);
  assert.match(text, /not exhaustive/);
  assert.match(text, /not miles/);
  assertNoBannedWords(text, "live copy");
  for (const entry of report.lines) assertNoBannedWords(`${entry.line.brand} ${entry.line.line}`, entry.line.url);
  const nodes = longTreadwearJsonLd(report);
  assert.equal(nodes[0].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[1].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[1].headline, LONG_TREADWEAR_TITLE);
  assert.doesNotMatch(nodes.map((node) => node["@type"]).join(" "), /Product|Review|AggregateRating/);
  const faqs = longTreadwearFaqs(report);
  assert.ok(faqs.length >= 2 && faqs.length <= 4);
  assert.deepEqual(
    nodes[2].mainEntity.map((item) => item.name),
    faqs.map((item) => item.name),
  );
  assert.deepEqual(
    nodes[2].mainEntity.map((item) => item.acceptedAnswer.text),
    faqs.map((item) => item.text),
  );
});

test("the page is indexable and the existing list links point at it", () => {
  assert.equal(includeInSitemap(`https://treadgrade.com${LONG_TREADWEAR_PATH}`, new Set()), true);
  assert.equal(includeInSitemap(LONG_TREADWEAR_PATH, new Set()), true);
  const page = readFileSync(new URL("../src/pages/lists/long-treadwear-high-traction.astro", import.meta.url), "utf8");
  assert.match(page, /LONG_TREADWEAR_PATH/);
  assert.match(page, /longTreadwearJsonLd/);
  assert.match(page, /<Answer /);
  assert.match(page, /<SourceLine /);
  assert.match(page, /<caption>/);
  assert.match(page, /sizeFlag/);
  assert.match(page, /\/guides\/treadwear-numbers\//);
  assert.match(page, /\/guides\/utqg-grades\//);
  assert.match(page, /HIGHEST_TREADWEAR_PATH/);
  assert.match(page, /ratingsTableHref/);
  assert.match(page, /href="\/guides\/"/);
  assert.match(page, /report\.lines\.map/);
  assertNoBannedWords(page, "page source");
  assert.doesNotMatch(page, /CheckPrice|affiliate|googletagmanager|fonts\.googleapis/i);
  for (const file of [
    "src/pages/lists/highest-treadwear.astro",
    "src/components/Footer.astro",
    "src/pages/index.astro",
    "src/pages/guides/index.astro",
    "src/pages/ratings.astro",
    "src/pages/guides/utqg-grades.astro",
    "src/pages/guides/treadwear-numbers.astro",
  ]) {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /\/lists\/long-treadwear-high-traction\//, file);
  }
  const links = readFileSync(new URL("../scripts/check-links.mjs", import.meta.url), "utf8");
  assert.match(links, /LONG_TREADWEAR_PATH/);
  const structured = readFileSync(new URL("../scripts/check-structured.mjs", import.meta.url), "utf8");
  assert.match(structured, /LONG_TREADWEAR_PATH/);
});
