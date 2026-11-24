import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog } from "../src/lib/catalog.js";
import {
  BANNED_DOT_WORD,
  DOT_GUIDE_PATH,
  ECFR_TIN_URL,
  FR_PREFIX_NOTE,
  FR_PREFIX_QUOTE,
  FR_TIN_URL,
  METHODOLOGY_CAVEAT_HREF,
  OLD_TO_NEW_ID,
  OLD_TO_NEW_LEAD,
  OLD_TO_NEW_NOSCRIPT,
  oldToNewCaption,
  oldToNewData,
  oldToNewFileSentence,
  oldToNewReport,
  oldToNewRows,
  oldToNewStatus,
  oldToNewSummary,
} from "../src/lib/dot-old-to-new.js";
import { exampleComparisonPaths } from "../src/lib/compare-pages.js";
import { formatVerified } from "../src/lib/format.js";
import { hubPaths } from "../src/lib/plant-hubs.js";
import { indexablePathSet, PINNED_STATIC_INDEXABLE_PATHS, STATIC_INDEXABLE_PATHS } from "../src/lib/sitemap.js";
import { contentHashes, currentDataset } from "../src/lib/sitemap-content.js";
import { whoMakesPages } from "../src/lib/who-makes-pages.js";

const QUOTE =
  "For nearly all manufacturers, the agency will assign a \u201c1\u201d symbol in front of each existing two-symbol plant code. [2] For example, a manufacturer using two-symbol code \u201cAB\u201d will likely be assigned the three-symbol code \u201c1AB\u201d.";
const NOTE =
  "NHTSA will directly contact any manufacturer whose three-symbol plant code is something other than a \u201c1\u201d in front of its existing two-symbol code.";

function offlineMappings(rawPlants) {
  const rows = [];
  for (const raw of rawPlants) {
    const oldCode = String(raw.oldDotCode ?? "").trim().toUpperCase();
    const code = String(raw.dotCode ?? "").trim().toUpperCase();
    if (!oldCode || !code) continue;
    rows.push({ oldCode, code, url: `/plants/${code.toLowerCase()}/` });
  }
  rows.sort((a, b) => a.oldCode.localeCompare(b.oldCode, "en") || a.code.localeCompare(b.code, "en"));
  return rows;
}

function offlineStats(rows) {
  const byOld = new Map();
  let prefixed = 0;
  for (const row of rows) {
    if (row.code === `1${row.oldCode}`) prefixed += 1;
    byOld.set(row.oldCode, (byOld.get(row.oldCode) || 0) + 1);
  }
  let shared = 0;
  for (const count of byOld.values()) {
    if (count > 1) shared += 1;
  }
  return { count: rows.length, prefixed, shared };
}

function assertNoBanned(text, where) {
  const found = text.match(BANNED_DOT_WORD);
  assert.equal(found ? found[0] : "", "", where);
}

test("a fixture keeps a 1-prefix, a shared former code, and a blank former code", () => {
  const plants = [
    { oldCode: "TW", code: "2TW", url: "/plants/2tw/" },
    { oldCode: "M5", code: "1M5", url: "/plants/1m5/" },
    { oldCode: "TW", code: "1TW", url: "/plants/1tw/" },
    { oldCode: "", code: "00T", url: "/plants/00t/" },
  ];
  const report = oldToNewReport(plants);
  assert.deepEqual(
    report.rows.map((row) => [row.oldCode, row.code]),
    [
      ["M5", "1M5"],
      ["TW", "1TW"],
      ["TW", "2TW"],
    ],
  );
  assert.equal(report.count, 3);
  assert.equal(report.prefixed, 2);
  assert.equal(report.shared, 1);
  assert.match(oldToNewFileSentence(report), /2 of the 3 current codes are the character 1/);
  assert.match(oldToNewFileSentence(report), /1 former code is on more than one record/);
  assert.equal(oldToNewFileSentence(oldToNewReport([])), "The plant file has no former code on a record.");
  assert.deepEqual(oldToNewData(plants), [
    ["M5", "1M5"],
    ["TW", "1TW"],
    ["TW", "2TW"],
  ]);
});

test("mapping rows equal an offline recompute of the committed plant file", () => {
  const raw = JSON.parse(readFileSync(new URL("../data/plants.json", import.meta.url), "utf8"));
  const offline = offlineMappings(raw);
  const report = oldToNewReport(catalog.plants);
  assert.deepEqual(
    report.rows.map((row) => [row.oldCode, row.code, row.url]),
    offline.map((row) => [row.oldCode, row.code, row.url]),
  );
  assert.deepEqual(
    { count: report.count, prefixed: report.prefixed, shared: report.shared },
    offlineStats(offline),
  );
  assert.deepEqual(
    oldToNewData(catalog.plants),
    offline.map((row) => [row.oldCode, row.code]),
  );
  assert.equal(oldToNewRows(catalog.plants).length, report.count);
  const pages = indexablePathSet();
  for (const row of report.rows) {
    assert.equal(pages.has(row.url), true, row.url);
    const plant = catalog.getPlant(row.code.toLowerCase());
    assert.equal(plant?.url, row.url, row.code);
    assert.equal(plant?.oldCode, row.oldCode, row.code);
    assert.equal(plant?.code, row.code, row.code);
  }
  const m5 = report.rows.find((row) => row.oldCode === "M5");
  console.log(`old-to-new mappings ${report.count}`);
  console.log(`current codes that are 1 plus the former code ${report.prefixed}`);
  console.log(`former codes on more than one record ${report.shared}`);
  console.log(m5 ? `M5 -> ${m5.code} ${m5.url}` : "M5 is not in this plant file");
});

test("the new copy quotes the 2015 rule and skips the banned words", () => {
  assert.equal(FR_PREFIX_QUOTE, QUOTE);
  assert.equal(FR_PREFIX_NOTE, NOTE);
  assert.equal(FR_TIN_URL, "https://www.federalregister.gov/documents/2015/04/13/2015-08418/tire-identification-and-recordkeeping");
  assert.equal(ECFR_TIN_URL, "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-574/section-574.5");
  assert.equal(METHODOLOGY_CAVEAT_HREF, "/methodology/#data-quality");
  assert.match(OLD_TO_NEW_LEAD, /three symbols/);
  assert.match(OLD_TO_NEW_LEAD, /13 symbols/);
  assert.match(OLD_TO_NEW_LEAD, /7 symbols/);
  assert.doesNotMatch(OLD_TO_NEW_LEAD, /April 13, 2025/);
  const report = oldToNewReport(catalog.plants);
  const strings = [
    OLD_TO_NEW_LEAD,
    FR_PREFIX_QUOTE,
    FR_PREFIX_NOTE,
    OLD_TO_NEW_NOSCRIPT,
    oldToNewFileSentence(report),
    oldToNewCaption(catalog.meta.verifiedAt, report.count),
    oldToNewSummary(report.count),
    oldToNewStatus(report.count),
  ];
  for (const text of strings) assertNoBanned(text, text);
  assert.equal(
    oldToNewCaption(catalog.meta.verifiedAt, report.count).includes(formatVerified(catalog.meta.verifiedAt)),
    true,
  );
  assert.match(oldToNewFileSentence(report), /character 1 followed by the former code/);
  const guide = readFileSync(new URL("../src/pages/guides/dot-code.astro", import.meta.url), "utf8");
  const start = guide.indexOf("OLD_TO_NEW_ID");
  assert.ok(start > 0);
  const section = guide.slice(start, guide.indexOf("<h2>Symbols that are allowed</h2>", start));
  assertNoBanned(section, "guide section");
  assert.match(section, /id=\{OLD_TO_NEW_ID\}/);
  assert.match(section, /FR_PREFIX_QUOTE/);
  assert.match(section, /FR_PREFIX_NOTE/);
  assert.match(section, /FR_TIN_URL/);
  assert.match(section, /ECFR_TIN_URL/);
  assert.match(section, /METHODOLOGY_CAVEAT_HREF/);
  assert.match(section, /<caption>/);
  assert.match(section, /<details class="disclosure">/);
  assert.match(guide, /April 13, 2025/);
  assert.match(guide, /574\.5\(a\)\(5\)/);
  assert.doesNotMatch(section, /noindex|canonical|robots/i);
  assert.doesNotMatch(guide, /FAQPage|AggregateRating|<Product/);
});

test("the lookup is an anchor on the existing guide and the sitemap gains no URL", () => {
  const pages = indexablePathSet();
  assert.equal(pages.has(DOT_GUIDE_PATH), true);
  assert.equal(STATIC_INDEXABLE_PATHS.includes(DOT_GUIDE_PATH), true);
  assert.equal(PINNED_STATIC_INDEXABLE_PATHS.includes(DOT_GUIDE_PATH), true);
  assert.equal(STATIC_INDEXABLE_PATHS.some((path) => path.includes(OLD_TO_NEW_ID)), false);
  assert.equal([...pages].some((path) => path.includes(OLD_TO_NEW_ID)), false);
  const recomputed = new Set(STATIC_INDEXABLE_PATHS);
  for (const brand of catalog.brands) recomputed.add(brand.url);
  for (const line of catalog.lines) recomputed.add(line.url);
  for (const plant of catalog.plants) recomputed.add(plant.url);
  for (const path of hubPaths) recomputed.add(path);
  for (const page of whoMakesPages) recomputed.add(page.url);
  for (const path of exampleComparisonPaths) recomputed.add(path);
  assert.equal(pages.size, recomputed.size);
  for (const path of recomputed) assert.equal(pages.has(path), true, path);
  console.log(`indexable pages ${pages.size}`);
});

test("a former-code edit moves the DOT guide hash and leaves the date guide still", () => {
  const dataset = currentDataset();
  const before = contentHashes(dataset).hashes;
  const row = dataset.plants.find((plant) => String(plant.oldDotCode || "").trim().toUpperCase() === "M5");
  assert.ok(row, "M5 row");
  const used = new Set(dataset.plants.map((plant) => String(plant.oldDotCode || "").trim().toUpperCase()));
  const alphabet = "ABCDEFHJKLMNPRTUVWXY0123456789";
  let standIn = "";
  for (const left of alphabet) {
    for (const right of alphabet) {
      const candidate = `${left}${right}`;
      if (!used.has(candidate)) {
        standIn = candidate;
        break;
      }
    }
    if (standIn) break;
  }
  assert.ok(standIn);
  row.oldDotCode = standIn;
  const after = contentHashes(dataset).hashes;
  assert.notEqual(after.get(DOT_GUIDE_PATH), before.get(DOT_GUIDE_PATH));
  assert.equal(after.get("/guides/tire-date-code/"), before.get("/guides/tire-date-code/"));
  assert.equal(after.size, before.size);
});
