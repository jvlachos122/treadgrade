import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { noUtqgAnswer } from "../src/lib/answers.js";
import { buildCatalog } from "../src/lib/normalize.js";
import { readSizeMark, sizeMarkSentences } from "../src/lib/size-mark.js";
import { includeInSitemap } from "../src/lib/sitemap.js";
import { ECFR_CHECKED, NO_UTQG_PATH, isBfGoodrichBrand, utqgExemptReport } from "../src/lib/utqg-exempt.js";

function meta() {
  return {
    verifiedAt: "2026-10-26T19:47:41.050Z",
    ratings: { source: "https://api.nhtsa.gov/tires?dataSet=ratings", fields: ["brand", "tireline"] },
    plants: { source: "https://example.com/plants", yearRequested: 2026, fields: [] },
    recalls: { retrievedAt: "2026-10-26T19:47:41.050Z", source: "https://example.com/recalls" },
  };
}

function row(id, brand, tireline, size = "All sizes") {
  return { id, brand, tireline, size, const: "Radial", wear: "400", trac: "A", temp: "A", active: false };
}

function assertSentences(sentences) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3, `${sentences.length} sentences`);
  for (const sentence of sentences) {
    assert.match(sentence, /[.!?]$/, sentence);
    assert.doesNotMatch(sentence, /\bthe best\b/i, sentence);
  }
}

test("KO2 and BFGoodrich counts follow the rows that were passed in", () => {
  const ratings = [
    row(1, "BF Goodrich", "Advantage Control", "All sizes"),
    row(2, "BF GOODRICH", "Trail-Terrain T/A", "LT265/70R17"),
    row(3, "BF Goodrich", "Advantage T/A Sport LT", "V rated"),
    row(4, "Other", "All-Terrain T/A KO2", "LT265/70R17"),
    row(5, "Other", "All-Terrain T/A K02", "P215/65R16"),
  ];
  const report = utqgExemptReport(buildCatalog(ratings, [], meta()), ratings);
  assert.equal(report.ko2SourceRows, 1);
  assert.equal(report.ko2GradeRows, 1);
  assert.equal(report.k02SourceRows, 1);
  assert.equal(report.bfSourceRows, 3);
  assert.equal(report.bfGradeRows, 3);
  assert.equal(report.bfLineCount, 3);
  assert.equal(report.brand, "BF Goodrich");
  assert.deepEqual(
    report.lines.map((line) => line.line),
    ["Advantage Control", "Advantage T/A Sport LT", "Trail-Terrain T/A"],
  );
  assert.equal(report.ltNamedLines.length, 1);
  assert.equal(report.ltNamedLines[0].sizesStartingLt, 0);
  assert.equal(report.sizesStartingLt, 2);
  assert.deepEqual(
    report.brandSpellings.map((item) => `${item.brand}:${item.rows}`),
    ["BF Goodrich:2", "BF GOODRICH:1"],
  );
});

test("a duplicate KO2 grade row collapses in the grade count and stays in the source count", () => {
  const ratings = [
    row(1, "Example", "All-Terrain T/A KO2", "LT265/70R17"),
    row(2, "Example", "All-Terrain T/A KO2", "LT265/70R17"),
  ];
  const report = utqgExemptReport(buildCatalog(ratings, [], meta()), ratings);
  assert.equal(report.ko2SourceRows, 2);
  assert.equal(report.ko2GradeRows, 1);
  const sentences = noUtqgAnswer({
    verifiedAt: "2026-10-26T19:47:41.050Z",
    checkedOn: ECFR_CHECKED,
    ko2SourceRows: report.ko2SourceRows,
    ko2GradeRows: report.ko2GradeRows,
  });
  assertSentences(sentences);
  assert.match(sentences[2], /2 source rows/);
  assert.match(sentences[2], /which is 1 grade row/);
  assert.match(sentences[0], /November 2, 2026/);
  assert.match(sentences[0], /12 inches or less/);
});

test("the committed ratings file has no KO2 line and lists the BFGoodrich lines it does contain", () => {
  const ratings = JSON.parse(readFileSync("data/ratings.json", "utf8"));
  const plants = JSON.parse(readFileSync("data/plants.json", "utf8"));
  const saved = JSON.parse(readFileSync("data/meta.json", "utf8"));
  const catalog = buildCatalog(ratings, plants, saved);
  const report = utqgExemptReport(catalog, ratings);
  const directKo2 = ratings.filter((row) => /ko2/i.test(String(row.tireline ?? ""))).length;
  const directK02 = ratings.filter((row) => /k02/i.test(String(row.tireline ?? ""))).length;
  const directBf = ratings.filter((row) => isBfGoodrichBrand(row.brand));
  assert.equal(report.ko2SourceRows, directKo2);
  assert.equal(report.ko2SourceRows, 0);
  assert.equal(report.ko2GradeRows, 0);
  assert.equal(report.k02SourceRows, directK02);
  assert.equal(report.bfSourceRows, directBf.length);
  assert.ok(report.bfLineCount > 0);
  assert.equal(
    report.bfGradeRows,
    report.lines.reduce((sum, line) => sum + line.rows, 0),
  );
  const names = report.lines.map((line) => line.line);
  assert.ok(names.some((name) => /advantage/i.test(name)));
  assert.ok(names.some((name) => /g-force/i.test(name)));
  assert.ok(names.some((name) => /trail-terrain/i.test(name)));
  assert.equal(names.some((name) => /ko2/i.test(name)), false);
  const sentences = noUtqgAnswer({
    verifiedAt: saved.verifiedAt,
    checkedOn: ECFR_CHECKED,
    ko2SourceRows: report.ko2SourceRows,
    ko2GradeRows: report.ko2GradeRows,
  });
  assertSentences(sentences);
  assert.match(sentences.join(" "), /0 source rows whose line name contains KO2, which remains 0 grade rows/);
  assert.match(sentences[1], /does not name light-truck tires/);
});

test("the no-UTQG guide is a page the sitemap keeps", () => {
  assert.equal(existsSync("src/pages/guides/no-utqg-rating.astro"), true);
  const retired = new Set(["/brands/multimile/"]);
  assert.equal(includeInSitemap(`https://treadgrade.com${NO_UTQG_PATH}`, retired), true);
  assert.equal(includeInSitemap(NO_UTQG_PATH, retired), true);
  assert.equal(includeInSitemap("https://treadgrade.com/404.html", retired), false);
  assert.equal(includeInSitemap("https://treadgrade.com/brands/multimile/", retired), false);
  const page = readFileSync("src/pages/guides/no-utqg-rating.astro", "utf8");
  assert.match(page, /NO_UTQG_PATH/);
  assert.doesNotMatch(page, /Product|Review|AggregateRating|GovernmentOrganization/);
  for (const file of ["src/scripts/home-search.js", "src/scripts/ratings.js", "src/pages/guides/index.astro"]) {
    assert.match(readFileSync(file, "utf8"), /\/guides\/no-utqg-rating\//, file);
  }
});

test("size text reports an LT prefix, a load-range letter, and a rim of 12 inches or less", () => {
  const lt = readSizeMark("LT245/75R16 Load Range E");
  assert.equal(lt.ltPrefix, true);
  assert.equal(lt.pPrefix, false);
  assert.equal(lt.loadRange, "E");
  assert.equal(lt.rimInches, 16);
  assert.equal(lt.rimAtMost12, false);
  assert.match(sizeMarkSentences(lt).join(" "), /starts with the LT prefix/);
  assert.match(sizeMarkSentences(lt).join(" "), /load range E/);

  const passenger = readSizeMark("P215/65R16");
  assert.equal(passenger.pPrefix, true);
  assert.equal(passenger.rimInches, 16);

  const small = readSizeMark("145/70R12");
  assert.equal(small.rimInches, 12);
  assert.equal(small.rimAtMost12, true);
  assert.match(sizeMarkSentences(small).join(" "), /12 inches or less/);

  const flotation = readSizeMark("31x10.50R15LT");
  assert.equal(flotation.ltPrefix, false);
  assert.equal(flotation.ltSuffix, true);
  assert.equal(flotation.rimInches, 15);

  const half = readSizeMark("LT235/85R12.5");
  assert.equal(half.rimInches, 12.5);
  assert.equal(half.rimAtMost12, false);

  const plain = sizeMarkSentences(readSizeMark("all sizes"));
  assert.match(plain.join(" "), /does not start with LT or P/);
  assert.equal(sizeMarkSentences(readSizeMark("  ")).length, 0);
  for (const sentence of [...sizeMarkSentences(lt), ...sizeMarkSentences(small), ...plain]) {
    assert.doesNotMatch(sentence, /\bthe best\b/i);
  }
});
