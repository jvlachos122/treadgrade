import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { treadwearMedian } from "../src/lib/answers.js";
import { catalog, ratingRows } from "../src/lib/catalog.js";
import { formatNumber, formatVerified } from "../src/lib/format.js";
import { USUAL_TEMPERATURE, USUAL_TRACTION } from "../src/lib/grade-quality.js";
import { LONG_TREADWEAR_MIN } from "../src/lib/long-treadwear.js";
import { flattenGradeRows, ratingsTableHref } from "../src/lib/ratings-table.js";
import { includeInSitemap, PINNED_STATIC_INDEXABLE_PATHS, STATIC_INDEXABLE_PATHS } from "../src/lib/sitemap.js";
import { bandLabel, bandStart } from "../src/lib/treadwear-numbers.js";
import {
  BANNED_VERDICT,
  LINE_WEAR_CUTOFF,
  TREADWEAR_VS_TRACTION_PATH,
  figure2StillSupportsScope,
  formatSpread,
  heatPercent,
  hingeSummary,
  movementSentence,
  spreadOfWear,
  stepSentence,
  studyAnswer,
  studyFaqs,
  studyJsonLd,
  studyText,
  treadwearTractionReport,
} from "../src/lib/treadwear-vs-traction.js";

const ratings = JSON.parse(readFileSync(new URL("../data/ratings.json", import.meta.url), "utf8"));

function assertNoVerdict(text, where) {
  assert.equal(BANNED_VERDICT.test(text) ? text.match(BANNED_VERDICT)[0] : "", "", where);
}

function assertAnswerShape(sentences, where) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3, `${where}: ${sentences.length} sentences`);
  for (const sentence of sentences) assert.match(sentence, /[.!?]$/, `${where}: ${sentence}`);
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function hinges(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mid = Math.floor(count / 2);
  const lower = count % 2 === 1 ? sorted.slice(0, mid + 1) : sorted.slice(0, mid);
  const upper = count % 2 === 1 ? sorted.slice(mid) : sorted.slice(mid);
  return {
    count,
    min: sorted[0],
    q1: medianOf(lower),
    median: medianOf(sorted),
    q3: medianOf(upper),
    max: sorted[count - 1],
  };
}

function gradeId(value, usual) {
  const text = value == null ? "" : String(value).trim();
  return usual.includes(text) ? text : "outside";
}

function parseWear(row) {
  const raw = row?.wear;
  if (raw == null || String(raw).trim() === "") return null;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

function assertMatrixSums(matrix, expectedTotal, where) {
  let cells = 0;
  for (const row of matrix.rows) {
    const rowSum = row.cells.reduce((sum, cell) => sum + cell.count, 0);
    assert.equal(rowSum, row.total, `${where} ${row.id}`);
    cells += rowSum;
    for (const cell of row.cells) {
      if (!cell.count) assert.equal(cell.heat, 0, `${where} zero heat`);
      else assert.ok(cell.heat >= 1 && cell.heat <= 100, `${where} heat ${cell.heat}`);
    }
  }
  assert.equal(cells, matrix.total, where);
  assert.equal(matrix.total, expectedTotal, where);
  for (const column of matrix.columnTotals) {
    const sum = matrix.rows.reduce((total, row) => total + row.cells.find((cell) => cell.id === column.id).count, 0);
    assert.equal(column.count, sum, `${where} column ${column.id}`);
  }
  const columnSum = matrix.columnTotals.reduce((total, column) => total + column.count, 0);
  assert.equal(columnSum, matrix.total, where);
  if (matrix.max > 0) {
    const heats = matrix.rows.flatMap((row) => row.cells.map((cell) => cell.heat));
    assert.equal(Math.max(...heats), 100, where);
  }
}

function fakeSpread(id, median) {
  return {
    id,
    spread: {
      median,
      medianText: formatSpread(median),
      count: median == null ? 0 : 3,
    },
  };
}

function fixtureCatalog(lines) {
  return {
    meta: {
      verifiedAt: "2024-05-06T07:08:09.000Z",
      ratings: { source: "https://example.com/ratings", fields: ["id", "brand", "trac", "temp", "wear"] },
    },
    lines,
  };
}

function kept(trac, temp, wear, size = "All") {
  return { trac, temp, wear: wear == null ? null : String(wear), size };
}

test("hinges match the odd-count and even-count middle-value rule", () => {
  assert.deepEqual(
    ((summary) => ({ q1: summary.q1, median: summary.median, q3: summary.q3 }))(hingeSummary([1, 2, 3, 4, 5])),
    { q1: 2, median: 3, q3: 4 },
  );
  const even = hingeSummary([1, 2, 3, 4]);
  assert.equal(even.q1, 1.5);
  assert.equal(even.median, 2.5);
  assert.equal(even.q3, 3.5);
  assert.equal(even.medianText, "2.5");
  const single = hingeSummary([10]);
  assert.equal(single.min, 10);
  assert.equal(single.q1, 10);
  assert.equal(single.median, 10);
  assert.equal(single.q3, 10);
  assert.equal(single.max, 10);
  const halves = hingeSummary([400, 600.5]);
  assert.equal(halves.median, 500.25);
  assert.equal(halves.q1, 400);
  assert.equal(halves.q3, 600.5);
  assert.equal(formatSpread(halves.median), "500.25");
  assert.equal(formatSpread(2.5), "2.5");
  assert.equal(formatSpread(3), "3");
  assert.equal(formatSpread(null), "Not reported");
  assert.equal(hingeSummary([]).count, 0);
  assert.equal(spreadOfWear([0, -4, 12]).count, 1);
  assert.equal(spreadOfWear([0, -4, 12]).median, 12);
  assert.equal(heatPercent(0, 10), 0);
  assert.equal(heatPercent(10, 10), 100);
  assert.equal(heatPercent(1, 1000), 1);
  assert.equal(figure2StillSupportsScope(), true);
});

test("movement sentences follow the letter order that was passed in", () => {
  const reversal = [fakeSpread("A", 10), fakeSpread("B", 30), fakeSpread("C", 20)];
  assert.match(movementSentence("temperature", reversal), /does not move in one direction from temperature A to C/);
  assert.match(stepSentence("temperature", reversal), /B is higher than A \(30 against 10\)/);
  assert.match(stepSentence("temperature", reversal), /C is lower than B \(20 against 30\)/);
  assert.match(movementSentence("temperature", [fakeSpread("A", 30), fakeSpread("B", 20), fakeSpread("C", 10)]), /does not rise/);
  assert.match(movementSentence("temperature", [fakeSpread("A", 10), fakeSpread("B", 20), fakeSpread("C", 30)]), /does not fall/);
  assert.match(movementSentence("temperature", [fakeSpread("A", 10), fakeSpread("B", 10)]), /the same at each letter/);
  assert.match(movementSentence("temperature", [fakeSpread("A", 10)]), /Fewer than two/);
  assert.equal(stepSentence("temperature", [fakeSpread("A", 10), fakeSpread("B", 20)]), "");
  assertNoVerdict(movementSentence("traction", reversal), "movement");
});

test("a fixture counts rows, lines, quartiles, and an unmapped outside value", () => {
  const source = [
    { id: 1, trac: "AA", temp: "A", wear: "100", brand: "Example", tireline: "One", size: "S1" },
    { id: 2, trac: "AA", temp: "A", wear: "300", brand: "Example", tireline: "One", size: "S2" },
    { id: 3, trac: "A", temp: "B", wear: "0", brand: "Example", tireline: "Two", size: "S3" },
    { id: 4, trac: "A", temp: "500", wear: null, brand: "Example", tireline: "Two", size: "S4" },
    { id: 5, trac: "B", temp: "C", wear: "500", brand: "Example", tireline: "Three", size: "S5" },
    { id: 6, trac: "B", temp: "A", wear: "700", brand: "Example", tireline: "Three", size: "S6" },
    { id: 7, trac: "W", temp: "W", wear: "380", brand: "Other", tireline: "Loose", size: "S7" },
    { id: 8, trac: "C", temp: "A", wear: "40", brand: "Example", tireline: "Four", size: "S8" },
  ];
  const report = treadwearTractionReport(
    source,
    fixtureCatalog([
      {
        brand: "Example",
        line: "One",
        url: "/tires/example/one/",
        sourceIds: [1, 2],
        rows: [kept("AA", "A", "100", "S1"), kept("AA", "A", "300", "S2")],
      },
      {
        brand: "Example",
        line: "Two",
        url: "/tires/example/two/",
        sourceIds: [3, 4],
        rows: [kept("A", "B", "0", "S3"), kept("A", "500", null, "S4")],
      },
      {
        brand: "Example",
        line: "Three",
        url: "/tires/example/three/",
        sourceIds: [5, 6],
        rows: [kept("B", "C", "500", "S5"), kept("B", "A", "700", "S6")],
      },
      {
        brand: "Example",
        line: "Four",
        url: "/tires/example/four/",
        sourceIds: [8],
        rows: [kept("C", "A", "40", "S8")],
      },
    ]),
  );
  assert.equal(report.sourceRows, 8);
  assert.equal(report.unmapped, 1);
  assert.equal(report.lineCount, 4);
  assert.equal(report.shownRows, 7);
  assert.equal(report.duplicateDropped, 0);
  assert.equal(report.excluded.zero, 1);
  assert.equal(report.excluded.missing, 1);
  const cell = (matrix, rowId, colId) => matrix.rows.find((row) => row.id === rowId).cells.find((item) => item.id === colId).count;
  assert.equal(cell(report.row.cross, "AA", "A"), 2);
  assert.equal(cell(report.row.cross, "A", "B"), 1);
  assert.equal(cell(report.row.cross, "A", "outside"), 1);
  assert.equal(cell(report.row.cross, "outside", "outside"), 1);
  assertMatrixSums(report.row.cross, 8, "fixture cross");
  assert.equal(cell(report.row.heatmap, 0, "A"), 1);
  assert.equal(cell(report.row.heatmap, 0, "C"), 1);
  assert.equal(cell(report.row.heatmap, 100, "AA"), 1);
  assert.equal(cell(report.row.heatmap, 300, "outside"), 1);
  assert.equal(cell(report.row.heatmap, "unplaced", "A"), 1);
  assert.equal(report.row.heatmap.rows.find((row) => row.id === 100).label, bandLabel(100));
  assert.equal(
    report.row.heatmap.rows.find((row) => row.id === 100).cells.find((item) => item.id === "AA").href,
    ratingsTableHref({ wearMin: "100", wearMax: "199", traction: ["AA"] }),
  );
  assert.equal(report.row.cross.rows.find((row) => row.id === "AA").cells.find((item) => item.id === "A").href, ratingsTableHref({ traction: ["AA"], temp: ["A"] }));
  assert.equal(cell(report.row.heatmap, 200, "AA"), 0);
  assert.equal(report.row.heatmap.rows.find((row) => row.id === 200).cells.find((item) => item.id === "AA").href, "");
  assertMatrixSums(report.row.heatmap, 8, "fixture heatmap");
  const tempA = report.row.temperature.find((item) => item.id === "A").spread;
  assert.equal(tempA.median, 200);
  assert.equal(tempA.q1, 70);
  assert.equal(tempA.q3, 500);
  assert.equal(tempA.count, 4);
  assert.equal(report.row.temperature.find((item) => item.id === "B").spread.median, null);
  assert.equal(report.row.traction.find((item) => item.id === "AA").spread.median, 200);
  assert.equal(report.row.traction.find((item) => item.id === "A").spread.median, null);
  assert.equal(report.aa.aaRows, 2);
  assert.equal(report.aa.fromLinesAtOrUnder, 2);
  assert.equal(report.aa.aaPositiveAtOrUnder, 2);
  assert.equal(report.aa.aaAtOrAboveLong, 0);
  assert.match(studyText(report), /2 of the 2 traction AA source rows that have a positive whole-number treadwear are at or under 300/);
  assert.doesNotMatch(studyText(report), /No traction AA source row has a positive whole-number treadwear/);
  assert.equal(report.aa.linesAtOrUnder, 2);
  assert.equal(report.aa.aaLines, 1);
  assert.equal(report.line.withoutPositive, 1);
  assert.equal(report.line.mixedTemperature, 2);
  assert.equal(report.line.mixedTraction, 0);
  assert.equal(cell(report.line.cross, "AA", "A"), 1);
  assert.equal(cell(report.line.cross, "A", "mixed"), 1);
  assert.equal(cell(report.line.cross, "B", "mixed"), 1);
  assert.equal(cell(report.line.cross, "C", "A"), 1);
  assertMatrixSums(report.line.cross, 4, "fixture line cross");
  assert.equal(cell(report.line.heatmap, 200, "AA"), 1);
  assert.equal(cell(report.line.heatmap, 0, "C"), 1);
  assert.equal(cell(report.line.heatmap, 600, "B"), 1);
  assert.equal(cell(report.line.heatmap, "unplaced", "A"), 1);
  assert.equal(report.line.heatmap.rows.find((row) => row.id === 200).cells[0].href, "");
  assertMatrixSums(report.line.heatmap, 4, "fixture line heatmap");
  assert.equal(report.line.temperature.find((item) => item.id === "A").spread.median, 120);
  assert.equal(report.outsideRows.length, 2);
  assert.equal(report.outsideRows.find((row) => row.id === 7).url, "");
  assert.equal(report.outsideRows.find((row) => row.id === 4).url, "/tires/example/two/");
  assert.equal(report.outsideRows.find((row) => row.id === 4).temp.text, "500");
  assert.equal(report.outsideRows.find((row) => row.id === 4).temp.usual, false);
  const text = studyText(report);
  assert.match(text, /assigned by the manufacturer/);
  assert.match(text, /lab-audited/);
  assert.match(text, /not a threshold named in 49 CFR 575\.104/);
  assertNoVerdict(text, "fixture copy");
  const answers = studyAnswer(report);
  assertAnswerShape(answers, "fixture");
  assert.equal(studyFaqs(report).length, 4);
  const types = studyJsonLd(report).map((node) => node["@type"]);
  assert.deepEqual(types, ["Dataset", "Article", "FAQPage"]);
});

test("an empty pull states that no source row is listed", () => {
  const report = treadwearTractionReport([], fixtureCatalog([]));
  assert.equal(report.sourceRows, 0);
  assert.equal(report.lineCount, 0);
  assert.equal(report.row.heatmap.rows.length, 0);
  assert.equal(report.line.heatmap.rows.length, 0);
  const answers = studyAnswer(report);
  assertAnswerShape(answers, "empty");
  assert.match(answers[1], /no source rows/);
  assertNoVerdict(studyText(report), "empty copy");
  assert.equal(studyFaqs(report).length, 4);
  assert.doesNotMatch(studyJsonLd(report).map((node) => node["@type"]).join(" "), /Product|Review|AggregateRating/);
});

test("the live counts match a recompute of the committed ratings file", () => {
  const report = treadwearTractionReport(ratingRows, catalog);
  assert.equal(ratingRows.length, ratings.length);
  assert.equal(report.sourceRows, ratings.length);
  assert.equal(report.lineCount, catalog.lines.length);
  assert.equal(report.aa.cutoff, LINE_WEAR_CUTOFF);
  assert.equal(report.aa.longMin, LONG_TREADWEAR_MIN);
  const byId = new Map();
  for (const line of catalog.lines) {
    for (const id of line.sourceIds) byId.set(id, line);
  }
  const cross = new Map();
  const heat = new Map();
  const wears = { traction: new Map(), temperature: new Map() };
  for (const id of [...USUAL_TRACTION, "outside"]) wears.traction.set(id, []);
  for (const id of [...USUAL_TEMPERATURE, "outside"]) wears.temperature.set(id, []);
  let unmapped = 0;
  let zero = 0;
  let missing = 0;
  let nonnumeric = 0;
  let aaRows = 0;
  let aaPositive = 0;
  let aaPositiveAtOrUnder = 0;
  let aaAtOrAboveLong = 0;
  const aaByLine = new Map();
  for (const row of ratings) {
    const trac = gradeId(row.trac, USUAL_TRACTION);
    const temp = gradeId(row.temp, USUAL_TEMPERATURE);
    const key = `${trac}|${temp}`;
    cross.set(key, (cross.get(key) || 0) + 1);
    const wear = parseWear(row);
    if (wear == null) {
      if (row.wear == null || String(row.wear).trim() === "") missing += 1;
      else nonnumeric += 1;
      heat.set(`unplaced|${trac}`, (heat.get(`unplaced|${trac}`) || 0) + 1);
    } else if (wear === 0) {
      zero += 1;
      const start = bandStart(0);
      heat.set(`${start}|${trac}`, (heat.get(`${start}|${trac}`) || 0) + 1);
    } else {
      wears.traction.get(trac).push(wear);
      wears.temperature.get(temp).push(wear);
      const start = bandStart(wear);
      heat.set(`${start}|${trac}`, (heat.get(`${start}|${trac}`) || 0) + 1);
    }
    const line = byId.get(row.id);
    if (!line) unmapped += 1;
    if (trac === "AA") {
      aaRows += 1;
      const url = line?.url || "";
      aaByLine.set(url, (aaByLine.get(url) || 0) + 1);
      if (wear != null && wear > 0) {
        aaPositive += 1;
        if (wear <= LINE_WEAR_CUTOFF) aaPositiveAtOrUnder += 1;
        if (wear >= LONG_TREADWEAR_MIN) aaAtOrAboveLong += 1;
      }
    }
  }
  assertMatrixSums(report.row.cross, ratings.length, "live cross");
  assertMatrixSums(report.row.heatmap, ratings.length, "live heatmap");
  for (const row of report.row.cross.rows) {
    for (const item of row.cells) assert.equal(item.count, cross.get(`${row.id}|${item.id}`) || 0, `${row.id} ${item.id}`);
  }
  for (const row of report.row.heatmap.rows) {
    for (const item of row.cells) {
      const key = row.id === "unplaced" ? `unplaced|${item.id}` : `${row.id}|${item.id}`;
      assert.equal(item.count, heat.get(key) || 0, key);
      if (typeof row.id === "number") assert.equal(row.label, bandLabel(row.id));
    }
  }
  for (const item of report.row.temperature) {
    const values = wears.temperature.get(item.id).filter((value) => value > 0);
    const summary = values.length ? hinges(values) : null;
    assert.equal(item.spread.median, summary ? summary.median : null, item.id);
    assert.equal(item.spread.q1, summary ? summary.q1 : null, item.id);
    assert.equal(item.spread.q3, summary ? summary.q3 : null, item.id);
    assert.equal(item.spread.count, values.length, item.id);
    assert.equal(item.spread.median, treadwearMedian(values), item.id);
    assert.equal(item.spread.min, summary ? summary.min : null, item.id);
    assert.equal(item.spread.max, summary ? summary.max : null, item.id);
  }
  for (const item of report.row.traction) {
    const values = wears.traction.get(item.id).filter((value) => value > 0);
    assert.equal(item.spread.median, treadwearMedian(values), item.id);
    assert.equal(item.spread.median, values.length ? medianOf(values) : null, item.id);
  }
  assert.equal(report.excluded.zero, zero);
  assert.equal(report.excluded.missing, missing);
  assert.equal(report.excluded.nonnumeric, nonnumeric);
  assert.equal(report.unmapped, unmapped);
  assert.equal(report.shownRows, flattenGradeRows(catalog).length);
  assert.equal(report.duplicateDropped, Math.max(0, ratings.length - unmapped - report.shownRows));
  assert.equal(report.aa.aaRows, aaRows);
  assert.equal(report.aa.aaPositive, aaPositive);
  assert.equal(report.aa.aaPositiveAtOrUnder, aaPositiveAtOrUnder);
  assert.equal(report.aa.aaAtOrAboveLong, aaAtOrAboveLong);
  if (aaPositive) {
    assert.match(
      studyText(report),
      new RegExp(`${formatNumber(aaPositiveAtOrUnder)} of the ${formatNumber(aaPositive)} traction AA source rows`),
    );
    assert.doesNotMatch(studyText(report), /No traction AA source row has a positive whole-number treadwear/);
  }

  let fromLines = 0;
  let linesUnder = 0;
  let aaLines = 0;
  let aaLinesUnder = 0;
  let mixedTraction = 0;
  let mixedTemperature = 0;
  let withoutPositive = 0;
  const lineCross = new Map();
  const lineMedians = new Map();
  for (const id of [...USUAL_TEMPERATURE, "mixed", "outside"]) lineMedians.set(id, []);
  for (const line of catalog.lines) {
    const tracSeen = [];
    const tempSeen = [];
    const positive = [];
    for (const row of line.rows) {
      const trac = gradeId(row.trac, USUAL_TRACTION);
      const temp = gradeId(row.temp, USUAL_TEMPERATURE);
      if (!tracSeen.includes(trac)) tracSeen.push(trac);
      if (!tempSeen.includes(temp)) tempSeen.push(temp);
      const wear = parseWear(row);
      if (wear != null && wear > 0) positive.push(wear);
    }
    const trac = tracSeen.length === 1 ? tracSeen[0] : tracSeen.length ? "mixed" : "outside";
    const temp = tempSeen.length === 1 ? tempSeen[0] : tempSeen.length ? "mixed" : "outside";
    if (trac === "mixed") mixedTraction += 1;
    if (temp === "mixed") mixedTemperature += 1;
    lineCross.set(`${trac}|${temp}`, (lineCross.get(`${trac}|${temp}`) || 0) + 1);
    const median = positive.length ? medianOf(positive) : null;
    if (median == null) withoutPositive += 1;
    else lineMedians.get(temp).push(median);
    const aa = aaByLine.get(line.url) || 0;
    const under = positive.length > 0 && positive.every((value) => value <= LINE_WEAR_CUTOFF);
    if (aa) aaLines += 1;
    if (under) {
      linesUnder += 1;
      if (aa) {
        aaLinesUnder += 1;
        fromLines += aa;
      }
    }
  }
  assert.equal(report.aa.fromLinesAtOrUnder, fromLines);
  assert.equal(report.aa.linesAtOrUnder, linesUnder);
  assert.equal(report.aa.aaLines, aaLines);
  assert.equal(report.aa.aaLinesAtOrUnder, aaLinesUnder);
  assert.equal(report.line.mixedTraction, mixedTraction);
  assert.equal(report.line.mixedTemperature, mixedTemperature);
  assert.equal(report.line.withoutPositive, withoutPositive);
  assertMatrixSums(report.line.cross, catalog.lines.length, "live line cross");
  assertMatrixSums(report.line.heatmap, catalog.lines.length, "live line heatmap");
  for (const row of report.line.cross.rows) {
    for (const item of row.cells) assert.equal(item.count, lineCross.get(`${row.id}|${item.id}`) || 0, `line ${row.id} ${item.id}`);
    for (const item of row.cells) assert.equal(item.href, "");
  }
  for (const item of report.line.temperature) {
    const values = lineMedians.get(item.id);
    const summary = values.length ? hinges(values) : null;
    assert.equal(item.spread.count, values.length, item.id);
    assert.equal(item.spread.median, summary ? summary.median : null, item.id);
    assert.equal(item.spread.q1, summary ? summary.q1 : null, item.id);
    assert.equal(item.spread.q3, summary ? summary.q3 : null, item.id);
  }
  for (const row of report.outsideRows) {
    if (!row.url) continue;
    assert.ok(catalog.lines.some((line) => line.url === row.url), row.url);
  }
  const answers = studyAnswer(report);
  assertAnswerShape(answers, "live");
  assert.match(answers.join(" "), /assigned by the manufacturer/);
  assert.match(answers.join(" "), /lab-audited/);
  assert.match(answers.join(" "), new RegExp(formatNumber(report.sourceRows)));
  assert.match(answers.join(" "), new RegExp(formatVerified(catalog.meta.verifiedAt)));
  const text = studyText(report);
  assertNoVerdict(text, "live copy");
  assert.doesNotMatch(text, /rubber compound|compound of|silica/i);
  const nodes = studyJsonLd(report);
  assert.deepEqual(nodes.map((node) => node["@type"]), ["Dataset", "Article", "FAQPage"]);
  assert.equal(nodes[0].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[1].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[0].isBasedOn, catalog.meta.ratings.source);
  assert.doesNotMatch(nodes.map((node) => node["@type"]).join(" "), /Product|Review|AggregateRating/);
  const faqs = studyFaqs(report);
  assert.ok(faqs.length >= 2 && faqs.length <= 4);
  assert.deepEqual(
    nodes[2].mainEntity.map((item) => item.acceptedAnswer.text),
    faqs.map((item) => item.text),
  );
  for (const item of faqs) assertNoVerdict(`${item.name} ${item.text}`, item.name);
  const tempLog = report.row.temperature
    .map((item) => `${item.id}=${item.spread.medianText} n=${item.spread.count} q1=${item.spread.q1Text} q3=${item.spread.q3Text}`)
    .join("; ");
  const lineLog = report.line.temperature
    .map((item) => `${item.id}=${item.spread.medianText} n=${item.spread.count}`)
    .join("; ");
  console.log(
    `study source ${report.sourceRows}; lines ${report.lineCount}; cross ${report.row.cross.total}; heatmap ${report.row.heatmap.total}; duplicates ${report.duplicateDropped}; unmapped ${report.unmapped}; AA rows ${report.aa.aaRows}; AA on lines at or under ${report.aa.cutoff}: ${report.aa.fromLinesAtOrUnder}; AA wear at or under: ${report.aa.aaPositiveAtOrUnder} of ${report.aa.aaPositive}; AA at or above ${report.aa.longMin}: ${report.aa.aaAtOrAboveLong}; temp ${tempLog}; line temp ${lineLog}`,
  );
});

test("the study page is the one new static path and does not hard-code totals", () => {
  assert.equal(TREADWEAR_VS_TRACTION_PATH, "/guides/treadwear-vs-traction/");
  assert.equal(STATIC_INDEXABLE_PATHS.filter((path) => path === TREADWEAR_VS_TRACTION_PATH).length, 1);
  assert.equal(PINNED_STATIC_INDEXABLE_PATHS.includes(TREADWEAR_VS_TRACTION_PATH), false);
  assert.equal(includeInSitemap(TREADWEAR_VS_TRACTION_PATH, new Set()), true);
  assert.equal(includeInSitemap(`https://treadgrade.com${TREADWEAR_VS_TRACTION_PATH}`, new Set()), true);
  const added = STATIC_INDEXABLE_PATHS.filter((path) => !PINNED_STATIC_INDEXABLE_PATHS.includes(path));
  const removed = PINNED_STATIC_INDEXABLE_PATHS.filter((path) => !STATIC_INDEXABLE_PATHS.includes(path));
  assert.deepEqual(added, [TREADWEAR_VS_TRACTION_PATH]);
  assert.deepEqual(removed, []);
  const page = readFileSync(new URL("../src/pages/guides/treadwear-vs-traction.astro", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../src/lib/treadwear-vs-traction.js", import.meta.url), "utf8");
  assert.match(page, /<Answer /);
  assert.match(page, /<SourceLine /);
  assert.match(page, /ratingRows/);
  assert.match(page, /<caption>/);
  assert.match(page, /shade/);
  assertNoVerdict(page, "page source");
  assert.doesNotMatch(page, /awin|sponsored|affiliate/i);
  assert.doesNotMatch(`${lib}\n${page}`, /7,628|\b7628\b|\b1337\b|5,609|\b5609\b/);
  assert.doesNotMatch(lib, /\b400\b|\b460\b|\b240\b/);
  assert.doesNotMatch(page, /\b400\b|\b460\b|\b240\b/);
  for (const file of [
    "src/pages/guides/index.astro",
    "src/pages/guides/traction-grades.astro",
    "src/pages/guides/treadwear-numbers.astro",
    "src/pages/lists/long-treadwear-high-traction.astro",
    "src/components/Footer.astro",
  ]) {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /\/guides\/treadwear-vs-traction\//, file);
  }
  const links = readFileSync(new URL("../scripts/check-links.mjs", import.meta.url), "utf8");
  const structured = readFileSync(new URL("../scripts/check-structured.mjs", import.meta.url), "utf8");
  assert.match(links, /TREADWEAR_VS_TRACTION_PATH/);
  assert.match(structured, /TREADWEAR_VS_TRACTION_PATH/);
});
