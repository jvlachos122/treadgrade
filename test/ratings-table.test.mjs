import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { rowQuality } from "../src/lib/grade-quality.js";
import { buildCatalog } from "../src/lib/normalize.js";
import {
  compactPublicRow,
  emptyRatingsQuery,
  expandPublicRow,
  filterGradeRows,
  flattenGradeRows,
  gradeTableSummary,
  parseRatingsQuery,
  ratingsCsv,
  ratingsTableHref,
  serializeRatingsQuery,
  sizeScope,
  sortGradeRows,
  tireLineCount,
} from "../src/lib/ratings-table.js";

const ratings = JSON.parse(readFileSync("data/ratings.json", "utf8"));
const plants = JSON.parse(readFileSync("data/plants.json", "utf8"));
const meta = JSON.parse(readFileSync("data/meta.json", "utf8"));
const catalog = buildCatalog(ratings, plants, meta);
const rows = flattenGradeRows(catalog);

function offlineHighWear() {
  let count = 0;
  const lines = new Set();
  for (const line of catalog.lines) {
    for (const row of line.rows) {
      if (row.wearN != null && row.wearN >= 700 && (row.trac === "A" || row.trac === "AA") && row.temp === "A") {
        count += 1;
        lines.add(line.url);
      }
    }
  }
  return { count, lines: lines.size };
}

test("size text is all sizes only for the three published phrases", () => {
  for (const size of ["All sizes", "ALL", "All", "All Size", "All size", "ALL SIZES", "all sizes", "All  sizes"]) {
    assert.equal(sizeScope(size), "all", size);
  }
  for (const size of [
    "All sizes except",
    "All except",
    "All others",
    "55 series  all sizes",
    "All metric sizes",
    "All Sizea",
    "195/65R15",
    "14 & 15",
    "13",
    "",
  ]) {
    assert.equal(sizeScope(size), "specific", size);
  }
});

test("filter counts match an offline pass of the committed file", () => {
  const state = { wearMin: "700", traction: ["AA", "A"], temp: ["A"] };
  const filtered = filterGradeRows(rows, state);
  const offline = offlineHighWear();
  assert.equal(filtered.length, offline.count);
  assert.equal(tireLineCount(filtered), offline.lines);
  assert.ok(filtered.length > 0);
  assert.equal(filtered.every((row) => row.wearN >= 700 && (row.trac === "A" || row.trac === "AA") && row.temp === "A"), true);

  const summary = gradeTableSummary(rows);
  assert.equal(summary.rows, catalog.stats.rows);
  assert.equal(summary.rows, rows.length);
  assert.equal(summary.sizeSpecific + summary.allSizes, summary.rows);
  let specific = 0;
  let invalid = 0;
  let suspect = 0;
  for (const row of rows) {
    if (sizeScope(row.size) === "specific") specific += 1;
    const kind = rowQuality(row).kind;
    if (kind === "invalid") invalid += 1;
    else if (kind === "suspect") suspect += 1;
  }
  assert.equal(summary.sizeSpecific, specific);
  assert.equal(summary.allSizes, rows.length - specific);
  assert.equal(summary.invalid, invalid);
  assert.equal(summary.suspect, suspect);
  assert.ok(summary.invalid > 0);
  assert.ok(summary.suspect > 0);
  assert.equal(filterGradeRows(rows, { quality: "invalid" }).length, summary.invalid);
  assert.equal(filterGradeRows(rows, { quality: "suspect" }).length, summary.suspect);
  assert.equal(filterGradeRows(rows, { quality: "hide" }).length, summary.rows - summary.invalid - summary.suspect);
  assert.equal(filterGradeRows(rows, { size: "specific" }).length, summary.sizeSpecific);
  assert.equal(filterGradeRows(rows, { size: "all" }).length, summary.allSizes);
});

test("invalid wins over a missing treadwear number, and treadwear 0 is suspect", () => {
  const turanza = rows.filter((row) => row.brand === "Bridgestone" && row.line === "Turanza EV");
  const broken = turanza.filter((row) => rowQuality(row).reasons.includes('temperature "500"'));
  assert.ok(broken.length >= 1);
  for (const row of broken) {
    assert.equal(rowQuality(row).kind, "invalid");
    assert.deepEqual(rowQuality(row).reasons, ['no treadwear number', 'temperature "500"']);
  }

  const suspect = rows.filter((row) => row.wearN === 0);
  assert.ok(suspect.length > 0);
  assert.equal(suspect.every((row) => rowQuality(row).kind === "suspect"), true);
  assert.deepEqual(rowQuality({ wear: "12A", wearN: null, trac: "A", temp: "A" }), {
    kind: "invalid",
    reasons: ['treadwear "12A"'],
  });
  assert.deepEqual(rowQuality({ wear: "400", wearN: 400, trac: "A", temp: "A" }), { kind: "ok", reasons: [] });
});

test("query state round-trips and keeps the older single-value links", () => {
  assert.deepEqual(parseRatingsQuery("traction=AA").traction, ["AA"]);
  assert.deepEqual(parseRatingsQuery("temp=A").temp, ["A"]);
  assert.equal(parseRatingsQuery("wearMin=600").wearMin, "600");
  assert.deepEqual(parseRatingsQuery("traction=AA,A").traction, ["AA", "A"]);
  assert.deepEqual(parseRatingsQuery("traction=A&traction=AA").traction, ["AA", "A"]);

  const samples = [
    "",
    "q=Michelin+Pilot",
    "traction=AA&temp=A&wearMin=600",
    "traction=A&traction=AA&temp=B&temp=A&wearMin=700&wearMax=0800&size=specific&quality=hide&sort=wear-desc&page=3",
    "size=nope&quality=nope&sort=nope&page=0&wearMin=abc",
    "q=BF+Goodrich&size=all&quality=suspect",
  ];
  for (const sample of samples) {
    const once = parseRatingsQuery(sample);
    const twice = parseRatingsQuery(serializeRatingsQuery(once));
    assert.deepEqual(twice, once, sample);
    assert.equal(serializeRatingsQuery(twice), serializeRatingsQuery(once), sample);
  }

  const dropped = parseRatingsQuery("size=nope&quality=nope&sort=nope&page=0&wearMin=abc");
  assert.deepEqual(dropped, emptyRatingsQuery());
  assert.equal(ratingsTableHref(), "/ratings/");
  assert.equal(
    ratingsTableHref({ wearMin: "700", traction: ["A", "AA"], temp: ["A"] }),
    "/ratings/?traction=AA&traction=A&temp=A&wearMin=700",
  );
  assert.equal(ratingsTableHref({ q: "Michelin" }).startsWith("/ratings/?"), true);
});

test("treadwear bounds are inclusive and a missing number stays out of a range", () => {
  const sample = [
    { brand: "A", line: "One", url: "/tires/a/one/", size: "15", wear: "700", wearN: 700, trac: "A", temp: "A" },
    { brand: "A", line: "Two", url: "/tires/a/two/", size: "All sizes", wear: "800", wearN: 800, trac: "AA", temp: "A" },
    { brand: "A", line: "Three", url: "/tires/a/three/", size: "16", wear: null, wearN: null, trac: "A", temp: "A" },
  ];
  const bounded = filterGradeRows(sample, { wearMin: "700", wearMax: "700" });
  assert.deepEqual(bounded.map((row) => row.line), ["One"]);
  const sorted = sortGradeRows(sample, { sort: "wear-desc" });
  assert.deepEqual(sorted.map((row) => row.line), ["Two", "One", "Three"]);
});

test("the public row keeps a non-numeric treadwear for the quality check", () => {
  const publicLines = catalog.lines.map((line) => ({ b: line.brand, l: line.line, u: line.url }));
  catalog.lines.forEach((line, index) => {
    for (const row of line.rows) {
      const expanded = expandPublicRow(compactPublicRow(index, row), publicLines);
      assert.equal(rowQuality(expanded).kind, rowQuality(row).kind);
      assert.deepEqual(rowQuality(expanded).reasons, rowQuality(row).reasons);
      assert.equal(sizeScope(expanded.size), sizeScope(row.size));
    }
  });
  const odd = expandPublicRow(compactPublicRow(0, { size: "15", wear: "12A", wearN: null, trac: "A", temp: "A" }), [
    { b: "A", l: "B", u: "/tires/a/b/" },
  ]);
  assert.equal(rowQuality(odd).kind, "invalid");
});

test("CSV export names the NHTSA file and stays on this site", () => {
  const csv = ratingsCsv(rows.slice(0, 3), { source: meta.ratings.source, verifiedAt: meta.verifiedAt });
  assert.equal(meta.ratings.source, "https://api.nhtsa.gov/tires?dataSet=ratings");
  assert.equal(Number.isNaN(Date.parse(meta.verifiedAt)), false);
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    csv,
    new RegExp(
      `^# Source: NHTSA UTQG file ${escapeRegExp(meta.ratings.source)}\\. Verified ${escapeRegExp(meta.verifiedAt)} \\(UTC\\)\\. Published by TreadGrade\\.`,
    ),
  );
  assert.match(csv, /These grades are copied from that file\. They are not a ranking, and a row does not mean a tire is on sale\./);
  assert.match(csv, /Brand,Tire line,Size series,Size flag,Treadwear,Traction,Temperature,Data quality,Line page/);
  assert.match(csv, /\/tires\//);
  assert.doesNotMatch(csv, /tirerack|amazon|walmart|ebay|discounttire|goodyear\.com|michelin\.com/i);
  const injected = ratingsCsv(
    [
      {
        brand: "=HYPERLINK()",
        line: 'Road, "Plus"',
        url: "/tires/example/road/",
        size: "All sizes",
        wear: "400",
        wearN: 400,
        trac: "A",
        temp: "A",
      },
    ],
    { source: meta.ratings.source, verifiedAt: meta.verifiedAt },
  );
  assert.match(injected, /'=HYPERLINK\(\)/);
  assert.match(injected, /"Road, ""Plus"""/);
  assert.match(injected, /All sizes/);
});
