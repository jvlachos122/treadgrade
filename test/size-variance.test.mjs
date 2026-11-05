import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog } from "../src/lib/catalog.js";
import { cleanSpace } from "../src/lib/format.js";
import { USUAL_TRACTION, rowQuality } from "../src/lib/grade-quality.js";
import { nameKey } from "../src/lib/normalize.js";
import {
  BANNED_GRADE_WORD,
  GRADE_VARIES_ID,
  SIZE_VARIANCE_EXAMPLES,
  SIZE_VARIANCE_FAQS,
  lineSizeVariance,
  sizeVarianceGuideAnswer,
  sizeVarianceParagraphs,
  sizeVarianceReport,
} from "../src/lib/size-variance.js";

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

function sourceGrades(brand, lineName) {
  const wears = new Map();
  const tractions = new Map();
  let rows = 0;
  for (const raw of ratings) {
    if (nameKey(raw.brand) !== brand || nameKey(raw.tireline) !== lineName) continue;
    const row = gradeRow(raw);
    if (rowQuality(row).kind !== "ok") continue;
    rows += 1;
    if (row.wearN != null && row.wearN > 0) wears.set(row.wearN, (wears.get(row.wearN) || 0) + 1);
    if (USUAL_TRACTION.includes(row.trac)) tractions.set(row.trac, (tractions.get(row.trac) || 0) + 1);
  }
  return { wears, tractions, rows };
}

function assertNoBannedWords(text, where) {
  assert.equal(BANNED_GRADE_WORD.test(text) ? text.match(BANNED_GRADE_WORD)[0] : "", "", where);
  assert.doesNotMatch(text, /\b\d[\d,]*\s+miles\b/i, where);
  assert.doesNotMatch(text, /\bhighest\b/i, where);
}

test("known multi-size lines match the committed ratings rows", () => {
  const found = [];
  for (const wanted of SIZE_VARIANCE_EXAMPLES) {
    const line = catalog.lines.find((item) => wanted.brand.test(item.brand) && wanted.line.test(item.line));
    assert.ok(line, `${wanted.line} is in this pull`);
    const variance = lineSizeVariance(line);
    assert.equal(variance.show, true, `${line.brand} ${line.line}`);
    const source = sourceGrades(nameKey(line.brand), nameKey(line.line));
    assert.equal(variance.rowCount, source.rows, line.line);
    assert.deepEqual(
      variance.wears.map((item) => [item.value, item.count]),
      [...source.wears.entries()].sort((a, b) => a[0] - b[0]),
      line.line,
    );
    assert.deepEqual(
      variance.tractions.map((item) => [item.value, item.count]),
      USUAL_TRACTION.filter((grade) => source.tractions.has(grade)).map((grade) => [grade, source.tractions.get(grade)]),
      line.line,
    );
    const text = sizeVarianceParagraphs(line, variance).join(" ");
    assert.match(text, /NHTSA lists/);
    assert.match(text, /representative size/);
    assert.match(text, /sidewall/);
    assert.match(text, /not miles/);
    assertNoBannedWords(text, line.line);
    found.push(line);
  }
  assert.ok(found.length >= 2);
});

test("a line without treadwear or traction variance does not show the note", () => {
  const uniform = catalog.lines.find((line) => {
    const variance = lineSizeVariance(line);
    return line.rows.length > 1 && !variance.wearVaries && !variance.tractionVaries && variance.excludedCount === 0;
  });
  assert.ok(uniform);
  assert.equal(lineSizeVariance(uniform).show, false);

  const temperatureOnly = lineSizeVariance({
    brand: "Example",
    line: "One wear",
    sameName: [],
    rows: [
      { wear: "400", wearN: 400, trac: "A", temp: "A", size: "15" },
      { wear: "400", wearN: 400, trac: "A", temp: "B", size: "16" },
    ],
  });
  assert.equal(temperatureOnly.show, false);
  assert.equal(temperatureOnly.temperatureVaries, true);

  const flaggedOnly = lineSizeVariance({
    brand: "Example",
    line: "Flagged extra",
    sameName: [],
    rows: [
      { wear: "400", wearN: 400, trac: "A", temp: "A", size: "15" },
      { wear: "400", wearN: 400, trac: "A", temp: "A", size: "16" },
      { wear: "200", wearN: 200, trac: "W", temp: "W", size: "bad" },
    ],
  });
  assert.equal(flaggedOnly.show, false);
  assert.equal(flaggedOnly.excludedCount, 1);
  assert.equal(flaggedOnly.rowCount, 2);
});

test("the guide count recomputes from the catalog and the copy stays inside the rules", () => {
  const report = sizeVarianceReport(catalog);
  let wear = 0;
  let traction = 0;
  let noted = 0;
  for (const line of catalog.lines) {
    const variance = lineSizeVariance(line);
    if (variance.wearVaries) wear += 1;
    if (variance.tractionVaries) traction += 1;
    if (variance.show) noted += 1;
  }
  assert.equal(report.multiWearLines, wear);
  assert.equal(report.multiTractionLines, traction);
  assert.equal(report.notedLines, noted);
  assert.ok(report.notedLines >= report.multiWearLines);
  assert.ok(report.examples.length >= 2);

  const sentences = sizeVarianceGuideAnswer(report);
  assert.ok(sentences.length >= 1 && sentences.length <= 3);
  const text = sentences.join(" ");
  assert.match(text, /NHTSA lists/);
  assert.match(text, /representative size/);
  assert.match(text, /sidewall/);
  assert.match(text, /not miles/);
  for (const sentence of sentences) assert.match(sentence, /[.!?]$/);
  assertNoBannedWords(text, "guide answer");
  for (const item of SIZE_VARIANCE_FAQS) assertNoBannedWords(`${item.name} ${item.text}`, item.name);
});

test("the tire-line template shows the note only when the line varies", () => {
  const page = readFileSync(new URL("../src/pages/tires/[brand]/[line].astro", import.meta.url), "utf8");
  const component = readFileSync(new URL("../src/components/SizeVariance.astro", import.meta.url), "utf8");
  const guide = readFileSync(new URL("../src/pages/guides/treadwear-varies-by-size.astro", import.meta.url), "utf8");
  assert.match(page, /variance\.show \?/);
  assert.match(page, /<SizeVariance/);
  assert.match(component, new RegExp(`id=\\{${"GRADE_VARIES_ID"}\\}|id="${GRADE_VARIES_ID}"`));
  assertNoBannedWords(component, "component");
  assertNoBannedWords(guide, "guide page");
  assert.match(guide, /\/compare\//);
  assert.match(guide, /\/ratings\//);
});
