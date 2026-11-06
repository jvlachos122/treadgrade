import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog } from "../src/lib/catalog.js";
import { cleanSpace } from "../src/lib/format.js";
import { rowQuality } from "../src/lib/grade-quality.js";
import {
  BANNED_LIST_WORD,
  HIGH_TREADWEAR_MIN,
  HIGHEST_TREADWEAR_EXAMPLES,
  HIGHEST_TREADWEAR_PATH,
  MILES_CLAIM,
  exampleParagraph,
  gradeVariesHref,
  highestTreadwearAnswer,
  highestTreadwearFaqs,
  highestTreadwearJsonLd,
  highestTreadwearReport,
  highestTreadwearText,
} from "../src/lib/highest-treadwear.js";
import { nameKey } from "../src/lib/normalize.js";
import { includeInSitemap } from "../src/lib/sitemap.js";
import { GRADE_VARIES_ID } from "../src/lib/size-variance.js";

const ratings = JSON.parse(readFileSync(new URL("../data/ratings.json", import.meta.url), "utf8"));

function gradeRow(raw) {
  const wear = raw.wear == null || String(raw.wear).trim() === "" ? null : String(raw.wear).trim();
  const wearN = wear != null && /^\d+$/.test(wear) ? Number(wear) : null;
  return {
    wear,
    wearN,
    trac: cleanSpace(raw.trac).toUpperCase(),
    temp: cleanSpace(raw.temp).toUpperCase(),
    size: String(raw.size ?? "").trim(),
  };
}

function assertNoBannedWords(text, where) {
  assert.equal(BANNED_LIST_WORD.test(text) ? text.match(BANNED_LIST_WORD)[0] : "", "", where);
  assert.equal(MILES_CLAIM.test(text) ? text.match(MILES_CLAIM)[0] : "", "", where);
}

function assertAnswerShape(sentences) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3);
  for (const sentence of sentences) {
    assert.match(sentence, /[.!?]$/, sentence);
    assert.doesNotMatch(sentence, /\bthe best\b/i, sentence);
    if (/\bhighest\b/i.test(sentence)) assert.match(sentence, /in NHTSA's published UTQG list/, sentence);
  }
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
    sameName: [],
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
      line("Hankook", "iON HT", [{ wear: "900", wearN: 900, trac: "A", temp: "A", size: "All sizes" }]),
      line("Bridgestone", "ECOPIA EP150", [
        { wear: "880", wearN: 880, trac: "A", temp: "A", size: "195/55R16 87V" },
        { wear: "200", wearN: 200, trac: "B", temp: "B", size: "All Sizes Except" },
        { wear: "900", wearN: 900, trac: "W", temp: "W", size: "bad row" },
      ]),
      line("Hankook", "KInERGy PT", [
        { wear: "860", wearN: 860, trac: "A", temp: "A", size: "215/60R16" },
        { wear: "860", wearN: 860, trac: "A", temp: "A", size: "All Size" },
        { wear: "800", wearN: 800, trac: "A", temp: "A", size: "215/55RV" },
      ]),
      line("Michelin", "Defender 2", [{ wear: "840", wearN: 840, trac: "B", temp: "B", size: "All" }]),
      line("Michelin", "X Tour A/S 2", [{ wear: "840", wearN: 840, trac: "B", temp: "B", size: "All" }]),
      line("Other", "Low only", [{ wear: "780", wearN: 780, trac: "A", temp: "A", size: "All sizes" }]),
      line("Zero", "Nope", [{ wear: "0", wearN: 0, trac: "A", temp: "A", size: "All" }]),
    ],
  };
}

test("a fixture keeps only usable rows at the threshold and notes size", () => {
  const report = highestTreadwearReport(fixtureCatalog());
  assert.equal(report.minGrade, HIGH_TREADWEAR_MIN);
  assert.equal(report.rowCount, 7);
  assert.equal(report.lineCount, 5);
  assert.equal(report.excludedCount, 1);
  assert.equal(report.max, 900);
  assert.equal(report.catalogMax, 900);
  assert.equal(report.sizeSpecificRows + report.allSizesRows, report.rowCount);
  assert.deepEqual(
    report.entries.map((entry) => entry.line.line),
    ["iON HT", "ECOPIA EP150", "KInERGy PT", "Defender 2", "X Tour A/S 2"],
  );
  assert.deepEqual(
    report.rows.map((row) => row.wearN),
    [900, 880, 860, 860, 800, 840, 840],
  );
  const ecopia = report.entries.find((entry) => entry.line.line === "ECOPIA EP150");
  assert.deepEqual(ecopia.sizeScopes, ["specific"]);
  assert.equal(ecopia.belowMin, 200);
  assert.equal(ecopia.belowMax, 200);
  assert.equal(ecopia.variance.wearVaries, true);
  assert.equal(gradeVariesHref(ecopia.line), `${ecopia.line.url}#${GRADE_VARIES_ID}`);
  const kinergy = report.entries.find((entry) => entry.line.line === "KInERGy PT");
  assert.deepEqual(
    kinergy.wears.map((item) => [item.value, item.count]),
    [
      [860, 2],
      [800, 1],
    ],
  );
  assert.deepEqual(kinergy.sizeScopes, ["specific", "all"]);
  assert.equal(report.examples.length, HIGHEST_TREADWEAR_EXAMPLES.length);
  const text = exampleParagraph(report);
  assert.match(text, /ECOPIA EP150 at 880 \(1 size-specific row\)/);
  assert.match(text, /iON HT at 900 \(1 row listed as all sizes\)/);
  assert.match(text, /left out/);
  assert.doesNotMatch(text, /Low only/);
  assertNoBannedWords(highestTreadwearText(report), "fixture copy");
  assertAnswerShape(highestTreadwearAnswer(report));
  const faqs = highestTreadwearFaqs(report);
  assert.match(faqs[0].text, /The highest treadwear in NHTSA's published UTQG list is 900, on Hankook iON HT/);
  const types = highestTreadwearJsonLd(report).map((node) => node["@type"]);
  assert.deepEqual(types, ["Dataset", "Article", "FAQPage"]);
});

test("an empty pull states that no row qualifies", () => {
  const report = highestTreadwearReport({
    meta: { verifiedAt: "2024-01-02T03:04:05.000Z", ratings: { source: "https://example.com/ratings" } },
    lines: [line("Other", "Low only", [{ wear: "400", wearN: 400, trac: "A", temp: "A", size: "All" }])],
  });
  assert.equal(report.rowCount, 0);
  assert.equal(report.catalogMax, 400);
  assert.equal(report.examples.length, 0);
  const answers = highestTreadwearAnswer(report);
  assertAnswerShape(answers);
  assert.match(answers[0], /no usable grade row/);
  assert.match(answers[1], /The highest treadwear in NHTSA's published UTQG list is 400/);
  assert.match(exampleParagraph(report), /None of the watched line names/);
  assert.equal(highestTreadwearFaqs(report).some((item) => item.name.startsWith("What is the highest")), false);
  assertNoBannedWords(highestTreadwearText(report), "empty copy");
});

test("the live list matches usable source rows and sample lines", () => {
  const report = highestTreadwearReport(catalog);
  const expected = [];
  for (const line of catalog.lines) {
    const rows = line.rows.filter((row) => rowQuality(row).kind === "ok" && row.wearN >= HIGH_TREADWEAR_MIN);
    if (!rows.length) continue;
    expected.push({
      url: line.url,
      wears: [...rows.reduce((counts, row) => counts.set(row.wearN, (counts.get(row.wearN) || 0) + 1), new Map()).entries()].sort(
        (a, b) => b[0] - a[0],
      ),
    });
  }
  const byUrl = new Map(catalog.lines.map((item) => [item.url, item]));
  expected.sort((a, b) => {
    const aLine = byUrl.get(a.url);
    const bLine = byUrl.get(b.url);
    return (
      b.wears[0][0] - a.wears[0][0] ||
      aLine.brand.localeCompare(bLine.brand, "en") ||
      aLine.line.localeCompare(bLine.line, "en")
    );
  });
  assert.deepEqual(
    report.entries.map((entry) => ({
      url: entry.line.url,
      wears: entry.wears.map((item) => [item.value, item.count]),
    })),
    expected,
  );
  assert.equal(report.rowCount, expected.reduce((sum, entry) => sum + entry.wears.reduce((rows, item) => rows + item[1], 0), 0));
  assert.equal(report.sizeSpecificRows + report.allSizesRows, report.rowCount);
  assert.ok(report.rowCount > 0);
  assert.equal(report.max, report.catalogMax);

  let matched = 0;
  for (const wanted of HIGHEST_TREADWEAR_EXAMPLES) {
    const line = catalog.lines.find((item) => wanted.brand.test(item.brand) && wanted.line.test(item.line));
    const entry = report.examples.find((item) => wanted.brand.test(item.line.brand) && wanted.line.test(item.line.line));
    if (!line) {
      assert.equal(entry, undefined);
      continue;
    }
    const wears = new Map();
    for (const raw of ratings) {
      if (nameKey(raw.brand) !== nameKey(line.brand) || nameKey(raw.tireline) !== nameKey(line.line)) continue;
      const row = gradeRow(raw);
      if (rowQuality(row).kind !== "ok" || row.wearN == null || row.wearN < HIGH_TREADWEAR_MIN) continue;
      wears.set(row.wearN, (wears.get(row.wearN) || 0) + 1);
    }
    if (!wears.size) {
      assert.equal(entry, undefined);
      continue;
    }
    matched += 1;
    assert.ok(entry, `${line.brand} ${line.line}`);
    assert.deepEqual(
      entry.wears.map((item) => [item.value, item.count]),
      [...wears.entries()].sort((a, b) => b[0] - a[0]),
      `${line.brand} ${line.line}`,
    );
    if (entry.sizeScopes.includes("specific")) assert.match(exampleParagraph(report), /size-specific/);
  }
  assert.ok(matched >= 1);

  const text = highestTreadwearText(report);
  assert.match(text, /NHTSA lists/);
  assert.match(text, /not exhaustive/);
  assert.match(text, /not miles/);
  assert.match(text, /not a grade/);
  assertNoBannedWords(text, "live copy");
  assertAnswerShape(highestTreadwearAnswer(report));
  for (const sentence of highestTreadwearAnswer(report)) assert.match(sentence, /[.!?]$/);
  const nodes = highestTreadwearJsonLd(report);
  assert.equal(nodes[0].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[1].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[0]["@type"], "Dataset");
  assert.doesNotMatch(nodes.map((node) => node["@type"]).join(" "), /Product|Review|AggregateRating/);
  const faqs = highestTreadwearFaqs(report);
  assert.deepEqual(
    nodes[2].mainEntity.map((item) => item.name),
    faqs.map((item) => item.name),
  );
  assert.deepEqual(
    nodes[2].mainEntity.map((item) => item.acceptedAnswer.text),
    faqs.map((item) => item.text),
  );
});

test("the page is indexable and links the list, the size note, and compare", () => {
  const retired = new Set(["/brands/multimile/"]);
  assert.equal(HIGHEST_TREADWEAR_PATH, "/lists/highest-treadwear/");
  assert.equal(includeInSitemap(`https://treadgrade.com${HIGHEST_TREADWEAR_PATH}`, retired), true);
  assert.equal(includeInSitemap(HIGHEST_TREADWEAR_PATH, retired), true);
  const page = readFileSync(new URL("../src/pages/lists/highest-treadwear.astro", import.meta.url), "utf8");
  assert.match(page, /HIGHEST_TREADWEAR_PATH/);
  assert.match(page, /highestTreadwearJsonLd/);
  assert.match(page, /<Answer /);
  assert.match(page, /<SourceLine /);
  assert.match(page, /\/compare\//);
  assert.match(page, /\/guides\/utqg-grades\//);
  assert.match(page, /SIZE_VARIANCE_PATH/);
  assert.match(page, /gradeVariesHref/);
  assert.match(page, /ratingsTableHref/);
  assert.match(page, /not exhaustive/);
  assert.match(page, /does not invent a grade/);
  assertNoBannedWords(page, "page source");
  assert.doesNotMatch(page, /CheckPrice|affiliate|googletagmanager|fonts\.googleapis/i);
});
