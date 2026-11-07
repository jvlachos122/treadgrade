import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog } from "../src/lib/catalog.js";
import { formatNumber } from "../src/lib/format.js";
import { nameKey } from "../src/lib/normalize.js";
import { recallMeta, recallRows, recallSummary } from "../src/lib/recall-catalog.js";
import {
  BANNED_RECALL_ADVICE,
  MISSING_VALUE,
  NHTSA_RECALLS_URL,
  RECALL_EXAMPLES,
  RECALLS_PATH,
  TIN_LIMIT,
  USTMA_RECALL_LOOKUP_URL,
  buildRecallList,
  countRatingRecallRows,
  exampleParagraph,
  recallListAnswer,
  recallListFaqs,
  recallListJsonLd,
  recallListText,
  recallsTitle,
  sizesFromDefect,
} from "../src/lib/recall-list.js";
import { phraseKey } from "../src/lib/recalls.js";
import { includeInSitemap } from "../src/lib/sitemap.js";
import { compareRecallValues } from "../src/scripts/recall-table.js";
import { whoMakesPages } from "../src/lib/who-makes-pages.js";

function keyOf(row) {
  return `${row.campaign}\n${nameKey(row.brand)}\n${nameKey(row.line)}`;
}

function assertNoAdvice(text, where) {
  assert.equal(BANNED_RECALL_ADVICE.test(text) ? text.match(BANNED_RECALL_ADVICE)[0] : "", "", where);
  assert.match(text, new RegExp(TIN_LIMIT));
  assert.doesNotMatch(text, /this list is authoritative/i);
}

function assertAnswerShape(sentences) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3);
  for (const sentence of sentences) {
    assert.match(sentence, /[.!?]$/, sentence);
    assert.doesNotMatch(sentence, /\bthe best\b/i, sentence);
    assert.doesNotMatch(sentence, /\bhighest\b/i, sentence);
  }
}

test("sizes come from a defect summary and not from the line name", () => {
  assert.deepEqual(sizesFromDefect({ line: "S698 157/154 L PR20" }), []);
  assert.deepEqual(sizesFromDefect({ line: "OPEN COUNTRY A/T III" }), []);
  assert.deepEqual(
    sizesFromDefect({ defect: "The campaign names P265/70R17 and LT275/65R18, plus 35x12.50R17." }),
    ["P265/70R17", "LT275/65R18", "35X12.50R17"],
  );
  assert.deepEqual(sizesFromDefect({ sizes: ["P265/70R17", " P265/70R17 "] }), ["P265/70R17"]);
  assert.deepEqual(sizesFromDefect({}), []);
});

test("a fixture keeps source fields, links a known line, and leaves sizes off the line name", () => {
  const rows = [
    {
      brand: "Toyo",
      line: "Open Country A/T III",
      filer: "Toyo Tire Holdings of Americas, Inc.",
      campaign: "26T005000",
      reportDate: "2026-02-06",
      units: 567,
      lineNameLooksLikeSize: "S698 157/154 L PR20",
    },
    {
      brand: "Toyo",
      line: "Sized",
      filer: "Toyo Tire Holdings of Americas, Inc.",
      campaign: "26T005000",
      reportDate: "2026-02-06",
      units: 567,
      defect: "Includes P265/70R17 only.",
    },
    {
      brand: "Other",
      line: "Plain",
      filer: "Other Tire Co.",
      campaign: "10T009000",
      reportDate: "2010-01-02",
    },
  ];
  const report = buildRecallList(rows, {
    retrievedAt: "2024-05-06T07:08:09.000Z",
    source: "https://example.com/FLAT_RCL_POST_2010.zip",
    brands: [{ name: "Toyo", url: "/brands/toyo/" }],
    lines: [{ brand: "Toyo", line: "Open Country A/T III", lineKey: nameKey("Open Country A/T III"), url: "/tires/toyo/open-country-a-t-iii/" }],
    whoMakes: [{ key: nameKey("Toyo"), url: "/who-makes/toyo/" }],
    ratingRecallRows: 0,
  });
  assert.equal(report.rowCount, 3);
  assert.equal(report.campaignCount, 2);
  assert.equal(report.brandCount, 2);
  assert.equal(report.filerCount, 2);
  assert.equal(report.rowsMissingUnits, 1);
  assert.equal(report.showSizes, true);
  assert.equal(report.rowsWithSizes, 1);
  assert.equal(report.linkedLineRows, 1);
  assert.equal(report.linkedBrandRows, 2);
  assert.equal(report.whoMakesRows, 2);
  assert.deepEqual(
    report.rows.map((row) => row.campaign + " " + row.line),
    ["26T005000 Open Country A/T III", "26T005000 Sized", "10T009000 Plain"],
  );
  const sized = report.rows.find((row) => row.line === "Sized");
  assert.deepEqual(sized.sizes, ["P265/70R17"]);
  const plain = report.rows.find((row) => row.line === "Plain");
  assert.equal(plain.unitsPresent, false);
  assert.equal(plain.units, null);
  assert.equal(plain.brandUrl, "");
  assert.equal(plain.filingsHref, "/who-makes-it/#brand-other");
  const watched = report.examples.find((row) => row.campaign === "26T005000" && row.line === "Open Country A/T III");
  assert.equal(watched.lineUrl, "/tires/toyo/open-country-a-t-iii/");
  assert.equal(watched.whoMakesUrl, "/who-makes/toyo/");
  assert.equal(watched.units, 567);
  assert.match(exampleParagraph(report), /26T005000/);
  assert.match(exampleParagraph(report), /campaign total 567/);
  assert.doesNotMatch(exampleParagraph(report), /10T009000/);
  assertNoAdvice(recallListText(report), "fixture copy");
  assertAnswerShape(recallListAnswer(report));
  assert.match(recallListAnswer(report).join(" "), /1 row has no units figure/);
  const types = recallListJsonLd(report).map((node) => node["@type"]);
  assert.deepEqual(types, ["Dataset", "Article", "FAQPage"]);
  assert.equal(JSON.stringify(recallListJsonLd(report)).includes("Product"), false);
  assert.equal(recallListFaqs(report).some((item) => item.text.includes(MISSING_VALUE)), false);
});

test("an empty pull states that no campaign is listed", () => {
  const report = buildRecallList([], {
    retrievedAt: "2024-01-02T03:04:05.000Z",
    source: "https://example.com/FLAT_RCL.zip",
  });
  assert.equal(report.rowCount, 0);
  assert.equal(report.examples.length, 0);
  const answers = recallListAnswer(report);
  assertAnswerShape(answers);
  assert.match(answers[0], /no tire campaign/);
  assert.match(answers[2], new RegExp(TIN_LIMIT));
  assert.match(exampleParagraph(report), /None of the watched campaigns/);
  assertNoAdvice(recallListText(report), "empty copy");
  assert.equal(recallsTitle(report.source).includes("since 2010"), false);
});

test("sort keeps a missing units figure last and orders dates newest first", () => {
  const older = { brand: "A", line: "One", filer: "F", date: "2010-01-01", units: "5", campaign: "10T001000", sizes: "" };
  const newer = { brand: "B", line: "Two", filer: "F", date: "2020-01-01", units: "", campaign: "20T001000", sizes: "" };
  assert.ok(compareRecallValues(newer, older, "date", "desc") < 0);
  assert.ok(compareRecallValues(newer, older, "units", "desc") > 0);
  assert.equal(compareRecallValues(older, { ...older, line: "Zed" }, "date", "desc") < 0, true);
});

test("the recalls path stays in the sitemap", () => {
  assert.equal(includeInSitemap(RECALLS_PATH, new Set()), true);
  assert.equal(includeInSitemap(`https://treadgrade.com${RECALLS_PATH}`, new Set()), true);
  assert.equal(includeInSitemap(RECALLS_PATH, new Set([RECALLS_PATH])), false);
});

test("committed campaigns match the source file, including watched rows only when present", () => {
  const report = buildRecallList(recallRows, {
    brands: catalog.brands,
    lines: catalog.lines,
    whoMakes: whoMakesPages,
    retrievedAt: recallMeta.retrievedAt,
    source: recallMeta.source,
    ratingRecallRows: countRatingRecallRows(catalog),
  });
  assert.equal(report.rowCount, recallRows.length);
  assert.equal(report.campaignCount, recallSummary.campaigns);
  assert.equal(report.brandCount, recallSummary.brands);
  assert.equal(report.rowCount, recallSummary.lines);
  assert.equal(report.rowsMissingUnits, 0);
  assert.equal(report.showSizes, false);
  assert.equal(report.rowsWithSizes, 0);
  const byKey = new Map(recallRows.map((row) => [keyOf(row), row]));
  assert.equal(byKey.size, recallRows.length);
  for (const listed of report.rows) {
    const source = byKey.get(keyOf(listed));
    assert.ok(source, listed.campaign);
    assert.equal(listed.brand, source.brand);
    assert.equal(listed.line, source.line);
    assert.equal(listed.filer, source.filer);
    assert.equal(listed.reportDate, source.reportDate);
    assert.equal(listed.units, source.units);
    assert.deepEqual(listed.sizes, sizesFromDefect(source));
    assert.equal(listed.campaignHref.includes(encodeURIComponent(source.campaign)), true);
  }
  assert.equal(new Set(report.rows.map((row) => row.id)).size, report.rows.length);
  const filers = new Set(recallRows.map((row) => phraseKey(row.filer)));
  assert.equal(report.filerCount, filers.size);

  for (const check of RECALL_EXAMPLES) {
    const sources = recallRows.filter(
      (row) => row.campaign === check.campaign && check.brand.test(row.brand) && check.line.test(row.line),
    );
    const listed = report.rows.filter(
      (row) => row.campaign === check.campaign && check.brand.test(row.brand) && check.line.test(row.line),
    );
    assert.equal(listed.length, sources.length);
    for (const source of sources) {
      const match = listed.find((row) => keyOf(row) === keyOf(source));
      assert.equal(match.filer, source.filer);
      assert.equal(match.reportDate, source.reportDate);
      assert.equal(match.units, source.units);
    }
  }
  const presentExamples = RECALL_EXAMPLES.filter((check) =>
    recallRows.some((row) => row.campaign === check.campaign && check.brand.test(row.brand) && check.line.test(row.line)),
  );
  assert.equal(report.examples.length, presentExamples.length);
  for (const example of report.examples) {
    assert.match(exampleParagraph(report), new RegExp(example.campaign));
    assert.match(exampleParagraph(report), new RegExp(formatNumber(example.units).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const text = recallListText(report).replace(exampleParagraph(report), " ");
  assertNoAdvice(text, "live copy");
  assertAnswerShape(recallListAnswer(report));
  assert.match(text, /does not include defect-summary text/);
  const serialized = JSON.stringify(recallListJsonLd(report));
  assert.doesNotMatch(serialized, /"(Product|Review|AggregateRating)"/);
  assert.equal(recallListJsonLd(report)[0].dateModified, recallMeta.retrievedAt);
  assert.equal(recallListJsonLd(report)[0].isBasedOn, recallMeta.source);
  assert.equal(countRatingRecallRows(catalog), report.ratingRecallRows);
});

test("the recalls page points at USTMA, NHTSA, and the decoder", () => {
  const page = readFileSync(new URL("../src/pages/recalls.astro", import.meta.url), "utf8");
  assert.match(page, /USTMA_RECALL_LOOKUP_URL/);
  assert.match(page, /NHTSA_RECALLS_URL/);
  assert.equal(USTMA_RECALL_LOOKUP_URL, "https://www.ustires.org/newsroom/ustma-launches-tire-recall-search-tool-consumers");
  assert.equal(NHTSA_RECALLS_URL, "https://www.nhtsa.gov/recalls");
  assert.match(page, /href="\/decoder\/"/);
  assert.match(page, /href="\/who-makes-it\/"/);
  assert.match(page, /href="\/methodology\/"/);
  assert.doesNotMatch(page, /amazon|tirerack|simpletire|affiliate|googletagmanager|doubleclick|fonts\.googleapis/i);
  assert.doesNotMatch(page, /Product|Review|AggregateRating/);
  assert.equal(BANNED_RECALL_ADVICE.test(page) ? page.match(BANNED_RECALL_ADVICE)[0] : "", "", "page source");
  assert.doesNotMatch(page, /this list is authoritative/i);
});
