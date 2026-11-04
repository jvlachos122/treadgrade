import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCatalog, nameKey } from "../src/lib/normalize.js";
import { summarizeRecallRows } from "../src/lib/recalls.js";
import { plantsMatchingFilings } from "../src/lib/who-makes.js";
import { includeInSitemap, sitemapPathname } from "../src/lib/sitemap.js";
import {
  COMPARE_MAX_LINES,
  COMPARE_PATH,
  EXAMPLE_BRAND_LIMIT,
  EXAMPLE_COMPARISON_LIMIT,
  EXAMPLE_FAQS,
  EXAMPLE_NEIGHBOR_DISTANCE,
  MIN_EXAMPLE_SIZE_ROWS,
  TOOL_FAQS,
  bannedCompareWord,
  buildLineRecord,
  compareAnswers,
  compareIndexing,
  compareSearch,
  compareToolHref,
  exampleRuleParagraphs,
  familyForLineName,
  filterCompareIndex,
  formatMedian,
  fromPublicSummary,
  parseCompareLines,
  recallRowsForLine,
  selectExampleComparisons,
  toPublicSummary,
  toolAnswers,
  treadwearStats,
} from "../src/lib/compare.js";
import { exampleComparisons } from "../src/lib/compare-pages.js";

const ratings = JSON.parse(readFileSync("data/ratings.json", "utf8"));
const plants = JSON.parse(readFileSync("data/plants.json", "utf8"));
const recalls = JSON.parse(readFileSync("data/recalls.json", "utf8"));
const meta = JSON.parse(readFileSync("data/meta.json", "utf8"));
const catalog = buildCatalog(ratings, plants, meta);
const recallSummary = summarizeRecallRows(recalls);
const retired = new Set(catalog.redirects.map((item) => item.from));
const sourceById = new Map(ratings.map((row) => [Number(row.id), row]));

function row(index, wear = 400, trac = "A", temp = "A") {
  return { size: `size-${index}`, wear: String(wear), wearN: wear, trac, temp };
}

function makeLine({ brand, slug, line, lineSlug, rows, sameName = [], wearStart = 200 }) {
  return {
    brand,
    brandSlug: slug,
    line,
    lineSlug,
    lineKey: nameKey(line),
    sameName,
    url: `/tires/${slug}/${lineSlug}/`,
    rows: rows.map((item, index) => (typeof item === "number" ? row(index, wearStart + index * 20) : item)),
  };
}

function brand(name, slug, rowCount) {
  return { name, slug, rowCount };
}

test("treadwear median uses the middle grade, or the mean of the two middle grades", () => {
  assert.deepEqual(treadwearStats([]), { min: null, max: null, median: null });
  assert.deepEqual(treadwearStats([0, null, 400]), { min: 400, max: 400, median: 400 });
  assert.deepEqual(treadwearStats([500, 100, 300]), { min: 100, max: 500, median: 300 });
  assert.deepEqual(treadwearStats([100, 300]), { min: 100, max: 300, median: 200 });
  assert.deepEqual(treadwearStats([100, 200, 300, 500]), { min: 100, max: 500, median: 250 });
  assert.equal(formatMedian(null), "Not reported");
  assert.equal(formatMedian(250), "250");
  assert.equal(formatMedian(250.5), "250.5");
});

test("name tokens put performance and touring lines on different lists", () => {
  assert.equal(familyForLineName("POTENZA S001"), "performance");
  assert.equal(familyForLineName("Pilot Sport 4"), "performance");
  assert.equal(familyForLineName("EAGLE F1 ASYMMETRIC 6"), "performance");
  assert.equal(familyForLineName("ContiSportContact 5"), "performance");
  assert.equal(familyForLineName("Ventus S1 evo Z"), "performance");
  assert.equal(familyForLineName("veNtus evo3 SUV"), "");
  assert.equal(familyForLineName("Pilot Sport All Season 4"), "");
  assert.equal(familyForLineName("Potenza RE97AS"), "");
  assert.equal(familyForLineName("EAGLE TOURING"), "touring");
  assert.equal(familyForLineName("Defender 2"), "touring");
  assert.equal(familyForLineName("TURANZA 6"), "touring");
  assert.equal(familyForLineName("ContiProContact"), "touring");
  assert.equal(familyForLineName("DUELER H/P SPORT"), "");
  assert.equal(familyForLineName("Assurance MaxLife"), "touring");
});

test("example selection pairs neighbors, skips splits and mispairs, and stops at the page cap", () => {
  const fillers = Array.from({ length: EXAMPLE_BRAND_LIMIT }, (_, index) => brand(`Filler ${index}`, `filler-${index}`, 5000 - index));
  const excluded = makeLine({
    brand: "Small",
    slug: "small",
    line: "Potenza Small",
    lineSlug: "potenza-small",
    rows: [4, 4, 4, 4],
  });
  const cutoff = selectExampleComparisons({
    brands: [...fillers, brand("Small", "small", 1)],
    lines: [excluded],
  });
  assert.equal(cutoff.length, 0);

  const slugs = ["aaa", "bbb", "ccc", "ddd", "eee", "fff", "ggg", "hhh"];
  const brands = [
    ...slugs.map((slug, index) => brand(slug.toUpperCase(), slug, 1000 - index)),
    brand("Nokian", "nokian", 1),
  ];
  const lines = [];
  for (const slug of slugs) {
    lines.push(
      makeLine({
        brand: slug.toUpperCase(),
        slug,
        line: `Potenza ${slug}`,
        lineSlug: `potenza-${slug}`,
        rows: [4, 4, 4, 4],
      }),
      makeLine({
        brand: slug.toUpperCase(),
        slug,
        line: `Turanza ${slug}`,
        lineSlug: `turanza-${slug}`,
        rows: [4, 4, 4, 4],
      }),
    );
  }
  lines.push(
    makeLine({
      brand: "AAA",
      slug: "aaa",
      line: "Potenza Aaa (OE)",
      lineSlug: "potenza-aaa-oe",
      rows: Array.from({ length: 12 }, () => 1),
    }),
    makeLine({
      brand: "AAA",
      slug: "aaa",
      line: "Potenza Shared",
      lineSlug: "potenza-shared",
      rows: Array.from({ length: 12 }, () => 1),
      sameName: [{ brand: "Other" }],
    }),
    makeLine({
      brand: "AAA",
      slug: "aaa",
      line: "Nokian Potenza Extra",
      lineSlug: "nokian-potenza-extra",
      rows: Array.from({ length: 12 }, () => 1),
    }),
    makeLine({
      brand: "BBB",
      slug: "bbb",
      line: "Potenza Short",
      lineSlug: "potenza-short",
      rows: [3, 3, 3],
    }),
  );
  const pairs = selectExampleComparisons({ brands, lines });
  assert.equal(pairs.length, EXAMPLE_COMPARISON_LIMIT);
  assert.deepEqual(
    pairs.slice(0, 3).map((pair) => [pair.familyId, pair.distance, pair.left.brandSlug, pair.right.brandSlug]),
    [
      ["performance", 1, "aaa", "bbb"],
      ["performance", 1, "bbb", "ccc"],
      ["performance", 1, "ccc", "ddd"],
    ],
  );
  assert.equal(pairs.filter((pair) => pair.familyId === "touring" && pair.distance === 1).length, slugs.length - 1);
  assert.equal(pairs.some((pair) => pair.familyId === "touring" && pair.distance === 2), false);
  assert.equal(pairs.at(-1).familyId, "performance");
  assert.equal(pairs.at(-1).distance, EXAMPLE_NEIGHBOR_DISTANCE);
  for (const pair of pairs) {
    assert.notEqual(pair.left.brandSlug, pair.right.brandSlug);
    assert.equal(pair.left.line.includes("(OE)"), false);
    assert.equal(pair.left.line.startsWith("Nokian"), false);
    assert.ok(pair.left.rows.length >= MIN_EXAMPLE_SIZE_ROWS);
    assert.equal(pair.path, `/compare/${pair.left.brandSlug}/${pair.left.lineSlug}/vs/${pair.right.brandSlug}/${pair.right.lineSlug}/`);
  }
});

test("two committed sample pairs repeat the source grades, recalls, and plants", () => {
  const pairs = selectExampleComparisons(catalog);
  assert.ok(pairs.length >= 2);
  assert.ok(pairs.length <= EXAMPLE_COMPARISON_LIMIT);
  assert.equal(new Set(pairs.map((pair) => pair.path)).size, pairs.length);
  for (const pair of pairs) {
    assert.notEqual(pair.left.brandSlug, pair.right.brandSlug);
    assert.equal(familyForLineName(pair.left.line), pair.familyId);
    assert.equal(familyForLineName(pair.right.line), pair.familyId);
    assert.ok(pair.distance >= 1 && pair.distance <= EXAMPLE_NEIGHBOR_DISTANCE);
    assert.equal(includeInSitemap(`https://treadgrade.com${pair.path}`, retired), true);
  }

  for (const pair of pairs.slice(0, 2)) {
    for (const line of [pair.left, pair.right]) {
      const recallRows = recallRowsForLine(line, recallSummary);
      const record = buildLineRecord(line, { recallRows, plants: catalog.plants });
      const stats = treadwearStats(line.rows.map((item) => item.wearN));
      assert.equal(record.sizeCount, line.rows.length);
      assert.equal(record.wearMin, stats.min);
      assert.equal(record.wearMedian, stats.median);
      assert.equal(record.wearMax, stats.max);
      assert.equal(record.sizes.length, line.rows.length);
      for (const [index, item] of line.rows.entries()) {
        const source = sourceById.get(item.id);
        assert.ok(source, `missing source row ${item.id}`);
        assert.equal(String(source.size ?? "").trim(), item.size);
        assert.equal(String(source.wear).trim(), item.wear);
        assert.equal(String(source.trac).trim().toUpperCase(), item.trac);
        assert.equal(String(source.temp).trim().toUpperCase(), item.temp);
        assert.equal(record.sizes[index].size, item.size);
        assert.equal(record.sizes[index].wear, item.wear);
        assert.equal(record.sizes[index].trac, item.trac);
        assert.equal(record.sizes[index].temp, item.temp);
      }
      const rawRecalls = recalls.filter(
        (item) => nameKey(item.brand) === nameKey(line.brand) && nameKey(item.line) === line.lineKey,
      );
      assert.deepEqual(
        record.recalls.map((item) => item.campaign).sort(),
        rawRecalls.map((item) => item.campaign).sort(),
      );
      assert.deepEqual(
        record.plants.map((item) => item.code),
        plantsMatchingFilings(catalog.plants, recallRows).map((item) => item.code),
      );
      const roundTrip = fromPublicSummary(toPublicSummary(record));
      assert.equal(roundTrip.sizeCount, record.sizeCount);
      assert.equal(roundTrip.wearMin, record.wearMin);
      assert.equal(roundTrip.wearMedian, record.wearMedian);
      assert.equal(roundTrip.wearMax, record.wearMax);
      assert.deepEqual(roundTrip.traction, record.traction);
      assert.deepEqual(roundTrip.temperature, record.temperature);
      assert.equal(roundTrip.recalls.length, record.recalls.length);
      assert.equal(roundTrip.plants.length, record.plants.length);
      for (const sentence of compareAnswers([record, record])) {
        assert.match(sentence, /[.!?]$/);
        assert.equal(bannedCompareWord(sentence), "");
      }
    }
  }
});

test("a lines query is noindex and canonical to the tool page", () => {
  assert.deepEqual(compareIndexing(""), { noindex: false, canonicalPath: COMPARE_PATH });
  assert.deepEqual(compareIndexing("?q=pilot"), { noindex: false, canonicalPath: COMPARE_PATH });
  assert.equal(compareIndexing("?lines=").noindex, true);
  assert.equal(compareIndexing("?lines=michelin/pilot-sport-4,goodyear/eagle-f1-asymmetric-6").noindex, true);
  assert.equal(compareIndexing("?lines=michelin/pilot-sport-4,goodyear/eagle-f1-asymmetric-6").canonicalPath, "/compare/");
  assert.equal(sitemapPathname("https://treadgrade.com/compare/?lines=michelin/pilot-sport-4,goodyear/eagle-touring"), "/compare/");
  assert.equal(includeInSitemap("https://treadgrade.com/compare/", retired), true);
  assert.equal(includeInSitemap("/compare/", retired), true);
  const tool = readFileSync("src/pages/compare/index.astro", "utf8");
  assert.match(tool, /params\.has\("lines"\)/);
  assert.match(tool, /"no" \+ "index"/);
  assert.doesNotMatch(tool, /content="noindex"/);
  const examplePage = readFileSync("src/pages/compare/[aBrand]/[aLine]/vs/[bBrand]/[bLine].astro", "utf8");
  assert.doesNotMatch(examplePage, /noindex/);
  assert.equal(exampleComparisons.length, selectExampleComparisons(catalog).length);
  for (const pair of exampleComparisons) {
    assert.equal(includeInSitemap(`https://treadgrade.com${pair.path}`, retired), true);
  }
});

test("compare addresses keep two to four valid line ids", () => {
  assert.deepEqual(parseCompareLines("?lines=Michelin/Pilot-Sport,goodyear/eagle"), ["michelin/pilot-sport", "goodyear/eagle"]);
  assert.deepEqual(parseCompareLines("?lines=aaa/one,aaa/one,bbb/two"), ["aaa/one", "bbb/two"]);
  assert.equal(parseCompareLines("?lines=../secret,aaa/one,bad,ccc/two").length, 2);
  const many = ["a/a", "b/b", "c/c", "d/d", "e/e"];
  assert.equal(parseCompareLines(`?lines=${many.join(",")}`).length, COMPARE_MAX_LINES);
  assert.equal(compareToolHref(["Michelin/Defender-2"]), "/compare/?lines=michelin/defender-2");
  assert.equal(compareSearch(["aaa/one", "bbb/two"]), "?lines=aaa/one,bbb/two");
  const found = filterCompareIndex(
    [
      { id: "michelin/pilot-sport-4", b: "Michelin", l: "Pilot Sport 4", n: 4 },
      { id: "goodyear/eagle-touring", b: "Goodyear", l: "Eagle Touring", n: 4 },
    ],
    "pilot sport",
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].id, "michelin/pilot-sport-4");
});

test("compare copy avoids ranking words", () => {
  const texts = [
    ...toolAnswers(catalog),
    ...exampleRuleParagraphs(),
    ...TOOL_FAQS.flatMap((item) => [item.name, item.text]),
    ...EXAMPLE_FAQS.flatMap((item) => [item.name, item.text]),
    ...exampleComparisons.flatMap((pair) => compareAnswers([pair.left, pair.right])),
  ];
  for (const text of texts) assert.equal(bannedCompareWord(text), "", text);
  for (const file of [
    "src/pages/compare/index.astro",
    "src/pages/compare/[aBrand]/[aLine]/vs/[bBrand]/[bLine].astro",
    "src/components/CompareNote.astro",
    "src/components/ComparePair.astro",
    "src/scripts/compare.js",
  ]) {
    assert.equal(bannedCompareWord(readFileSync(file, "utf8")), "", file);
  }
  const linePage = readFileSync("src/pages/tires/[brand]/[line].astro", "utf8");
  const ratingsPage = readFileSync("src/pages/ratings.astro", "utf8");
  const homePage = readFileSync("src/pages/index.astro", "utf8");
  assert.match(linePage, /Compare with other tires/);
  assert.match(linePage, /compareToolHref/);
  assert.match(ratingsPage, /href="\/compare\/"/);
  assert.match(homePage, /href="\/compare\/"/);
  assert.match(readFileSync("src/components/Footer.astro", "utf8"), /href="\/compare\/"/);
});
