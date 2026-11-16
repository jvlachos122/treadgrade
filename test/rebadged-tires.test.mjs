import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog, ratingRows } from "../src/lib/catalog.js";
import { formatNumber, formatUtcDate, formatVerified } from "../src/lib/format.js";
import { brandKey, nameKey } from "../src/lib/normalize.js";
import { recallRows, recallSummary } from "../src/lib/recall-catalog.js";
import { summarizeRecallRows } from "../src/lib/recalls.js";
import {
  BANNED_VERDICT,
  ECFR_PLANT_URL,
  ECFR_RETRIEVED,
  ECFR_TIN_URL,
  MANUFACTURER_CODE_QUOTE,
  NOT_IN_FILES,
  PLANT_CODE_QUOTE,
  REBADGED_TIRES_PATH,
  TIRE_TYPE_QUOTE,
  countCodesAcrossBrands,
  countRegistrantNames,
  isBrandLinkKey,
  isLineLinkKey,
  isPlantLinkKey,
  mentionsStoreBrand,
  rebadgedJsonLd,
  rebadgedReport,
  rebadgedText,
} from "../src/lib/rebadged-tires.js";
import { includeInSitemap, indexablePathSet, PINNED_STATIC_INDEXABLE_PATHS, STATIC_INDEXABLE_PATHS } from "../src/lib/sitemap.js";
import { laterIso } from "../src/lib/structured.js";
import { whoMakesPages } from "../src/lib/who-makes-pages.js";

const meta = JSON.parse(readFileSync(new URL("../data/meta.json", import.meta.url), "utf8"));
const rawPlants = JSON.parse(readFileSync(new URL("../data/plants.json", import.meta.url), "utf8"));

function assertNoVerdict(text, where) {
  assert.equal(BANNED_VERDICT.test(text) ? text.match(BANNED_VERDICT)[0] : "", "", where);
}

function assertAnswerShape(sentences, where) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3, `${where}: ${sentences.length} sentences`);
  for (const sentence of sentences) assert.match(sentence, /[.!?]$/, `${where}: ${sentence}`);
}

function keysOf(rows) {
  const keys = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) keys.add(key);
  }
  return keys;
}

function fixtureMeta() {
  return {
    verifiedAt: "2024-05-06T07:08:09.000Z",
    ratings: { source: "https://example.com/ratings" },
    plants: { source: "https://example.com/plants" },
    recalls: { source: "https://example.com/recalls", layout: "https://example.com/layout", retrievedAt: "2024-06-07T08:09:10.000Z" },
  };
}

function recallFixture(overrides = {}) {
  return {
    campaigns: 4,
    brands: 3,
    lines: 5,
    brandsWithDifferentFiler: 2,
    madeByRows: 1,
    filedByRows: 4,
    ...overrides,
  };
}

test("a plant code on rating rows counts brands, and punctuation is one brand", () => {
  const ratings = [
    { brand: "Acme", tireline: "One", plantCode: "AAA" },
    { brand: "Acme.", tireline: "Two", plantCode: "AAA" },
    { brand: "Acme Tires", tireline: "Three", plantCode: "AAA" },
    { brand: "Other", tireline: "Four", plantCode: "BBB" },
    { brand: "Solo", tireline: "Five", plantCode: "" },
    { brand: "Solo", tireline: "Six" },
    { brand: "ACME", tireline: "Seven", plantCode: "CCC" },
  ];
  const plants = [
    { code: "AAA", name: "North Plant" },
    { code: "BBB", name: "north plant" },
    { code: "CCC", name: "Michelin" },
    { code: "DDD", name: "Michelin North America" },
    { code: "EEE", name: "   " },
    { code: "FFF", name: "" },
  ];
  const report = rebadgedReport({
    ratings,
    rawPlants: plants.map((plant) => ({ dotCode: plant.code, name: plant.name })),
    plants,
    recalls: [{ brand: "Acme", line: "One", filer: "Acme" }],
    meta: fixtureMeta(),
    recallSummary: recallFixture(),
    whoMakesPages: [{ name: "Acme", url: "/who-makes/acme/" }],
  });
  assert.equal(report.sharedFromRatings.computable, true);
  assert.equal(report.sharedFromRatings.field, "plantCode");
  assert.equal(report.sharedFromRatings.rowsWithCode, 5);
  assert.equal(report.sharedFromRatings.codesOnTwoOrMoreBrands, 1);
  assert.equal(report.sharedFromRatings.linesWithCode, 5);
  assert.equal(report.sharedFromPlants.computable, false);
  assert.equal(report.sharedFromPlants.codesOnTwoOrMoreBrands, null);
  assert.equal(report.plants.plantCount, 6);
  assert.equal(report.plants.distinctNames, 3);
  assert.equal(report.plants.namesOnMultipleCodes, 1);
  assert.equal(report.plants.codesSharingName, 2);
  assert.equal(report.plants.blankNameCodes, 2);
  assert.equal(brandKey("Acme."), brandKey("ACME"));
  assert.notEqual(brandKey("Acme"), brandKey("Acme Tires"));
  const again = countCodesAcrossBrands(ratings, "plantCode");
  assert.equal(again.codesOnTwoOrMoreBrands, 1);
  assert.equal(countRegistrantNames(plants).namesOnMultipleCodes, 1);
  assert.match(report.answers[1], /1 plant code/);
  assert.match(report.answers[1], /not proof of one design/);
  assert.doesNotMatch(report.answers[1], /not in these files/);
  assertAnswerShape(report.answers, "linked ratings");
  assert.equal(report.faqs.length, 4);
  assertNoVerdict(rebadgedText(report), "linked ratings");
  const types = rebadgedJsonLd(report).map((node) => node["@type"]);
  assert.deepEqual(types, ["Dataset", "Article", "FAQPage"]);
});

test("a brand field on the plant record is a separate count from tire lines", () => {
  const rawPlants = [
    { dotCode: "AAA", name: "One Co", brand: ["Acme", "Acme."] },
    { dotCode: "BBB", name: "Two Co", brand: ["Acme", "Acme Tires"] },
    { dotCode: "CCC", name: "Three Co", brand: "Solo" },
    { dotCode: "DDD", name: "Four Co", line: "Road" },
  ];
  const report = rebadgedReport({
    ratings: [{ brand: "Acme", tireline: "One", wear: "100" }],
    rawPlants,
    plants: rawPlants.map((plant) => ({ code: plant.dotCode, name: plant.name })),
    recalls: [],
    meta: fixtureMeta(),
    recallSummary: recallFixture({ campaigns: 0, brands: 0, lines: 0, brandsWithDifferentFiler: 0, madeByRows: 0, filedByRows: 0 }),
    whoMakesPages: [],
  });
  assert.equal(report.sharedFromRatings.computable, false);
  assert.equal(report.sharedFromRatings.codesOnTwoOrMoreBrands, null);
  assert.equal(report.sharedFromPlants.computable, true);
  assert.equal(report.sharedFromPlants.field, "brand");
  assert.equal(report.sharedFromPlants.codesOnTwoOrMoreBrands, 1);
  assert.equal(report.plantLineKey, "line");
  assert.match(report.answers[1], /1 plant code lists two or more brands/);
  assert.match(report.answers[1], /no plant code on a tire line/);
  assert.match(rebadgedText(report), /not counted as a brand/);
  assert.equal(report.whoMakes.length, 0);
  assert.match(rebadgedText(report), /no separate brand page/);
  assertAnswerShape(report.answers, "plant brands");
  assertNoVerdict(rebadgedText(report), "plant brands");
});

test("an empty pull states that the join is not in the files", () => {
  const report = rebadgedReport({
    meta: fixtureMeta(),
    recallSummary: recallFixture({ campaigns: 0, brands: 0, lines: 0, brandsWithDifferentFiler: 0, madeByRows: 0, filedByRows: 0 }),
  });
  assert.equal(report.shared.computable, false);
  assert.equal(report.shared.codesOnTwoOrMoreBrands, null);
  assert.equal(report.plants.plantCount, 0);
  assert.equal(report.plants.namesOnMultipleCodes, 0);
  assertAnswerShape(report.answers, "empty");
  assert.match(report.answers[1], /not in these files/);
  assert.match(report.answers[1], /0 registrant names are on two or more of the 0 plant codes/);
  assert.equal(report.faqs.length, 4);
  assertNoVerdict(rebadgedText(report), "empty");
  assert.equal(mentionsStoreBrand(rebadgedText(report)), "");
  const nodes = rebadgedJsonLd(report);
  assert.doesNotMatch(nodes.map((node) => node["@type"]).join(" "), /Product|Review|AggregateRating/);
  assert.equal(nodes[2].mainEntity.length, report.faqs.length);
});

test("the live counts match a recompute of the committed files", () => {
  const report = rebadgedReport({
    ratings: ratingRows,
    rawPlants,
    plants: catalog.plants,
    recalls: recallRows,
    meta: catalog.meta,
    recallSummary,
    whoMakesPages,
  });
  const byName = new Map();
  let blank = 0;
  for (const plant of catalog.plants) {
    const key = nameKey(plant.name);
    if (!key) {
      blank += 1;
      continue;
    }
    byName.set(key, (byName.get(key) || 0) + 1);
  }
  let multiple = 0;
  let sharing = 0;
  for (const count of byName.values()) {
    if (count < 2) continue;
    multiple += 1;
    sharing += count;
  }
  assert.equal(report.plants.plantCount, catalog.plants.length);
  assert.equal(report.plants.plantCount, rawPlants.length);
  assert.equal(report.plants.distinctNames, byName.size);
  assert.equal(report.plants.namesOnMultipleCodes, multiple);
  assert.equal(report.plants.codesSharingName, sharing);
  assert.equal(report.plants.blankNameCodes, blank);
  assert.equal(report.ratingCount, ratingRows.length);
  assert.equal(report.recallCount, recallRows.length);

  for (const key of keysOf(ratingRows)) assert.equal(isPlantLinkKey(key), false, key);
  for (const key of keysOf(recallRows)) assert.equal(isPlantLinkKey(key), false, key);
  for (const key of keysOf(rawPlants)) {
    assert.equal(isBrandLinkKey(key), false, key);
    assert.equal(isLineLinkKey(key), false, key);
  }
  assert.equal(report.sharedFromRatings.computable, false);
  assert.equal(report.sharedFromPlants.computable, false);
  assert.equal(report.shared.computable, false);
  assert.equal(report.shared.codesOnTwoOrMoreBrands, null);
  assert.equal(report.ratingPlantKey, "");
  assert.equal(report.plantBrandKey, "");
  assert.equal(report.recallPlantKey, "");

  const summary = summarizeRecallRows(recallRows);
  assert.equal(report.recall.campaigns, summary.campaigns);
  assert.equal(report.recall.brands, summary.brands);
  assert.equal(report.recall.lines, summary.lines);
  assert.equal(report.recall.brandsWithDifferentFiler, summary.brandsWithDifferentFiler);
  assert.equal(report.recall.madeByRows, summary.madeByRows);
  assert.equal(report.recall.filedByRows, summary.filedByRows);
  assert.equal(report.recall.madeByRows + report.recall.filedByRows, report.recall.lines);
  assert.equal(report.whoMakes.length, whoMakesPages.length);
  for (const page of report.whoMakes) {
    assert.equal(whoMakesPages.some((item) => item.url === page.url && item.name === page.name), true, page.url);
    assert.match(page.url, /^\/who-makes\/[a-z0-9-]+\/$/);
  }

  const link = reportLink(report, "Plant codes on tire lines of two or more brands");
  assert.equal(link.result, NOT_IN_FILES);
  assert.equal(link.value, null);
  const names = reportLink(report, "Registrant names on two or more plant codes");
  assert.equal(names.value, multiple);
  assert.equal(names.result, formatNumber(multiple));

  assertAnswerShape(report.answers, "live");
  assert.match(report.answers[0], /not a tire design or a brand/);
  assert.match(report.answers[1], /not in these files/);
  assert.match(report.answers[1], new RegExp(escapeRegExp(formatNumber(multiple))));
  assert.match(report.answers[1], new RegExp(escapeRegExp(formatNumber(report.plants.plantCount))));
  assert.match(report.answers[1], new RegExp(escapeRegExp(formatVerified(catalog.meta.verifiedAt))));
  assert.match(report.answers[2], /strongest public evidence/);
  assert.match(report.answers[2], /not answered/);
  const text = rebadgedText(report);
  assertNoVerdict(text, "live copy");
  let withoutPages = text;
  for (const page of report.whoMakes) withoutPages = withoutPages.replaceAll(page.name, "");
  assert.equal(mentionsStoreBrand(withoutPages), "");
  assert.equal(report.faqs.length >= 2 && report.faqs.length <= 4, true);
  for (const item of report.faqs) assertNoVerdict(`${item.name} ${item.text}`, item.name);

  const nodes = rebadgedJsonLd(report);
  assert.deepEqual(nodes.map((node) => node["@type"]), ["Dataset", "Article", "FAQPage"]);
  assert.equal(nodes[0].dateModified, laterIso(catalog.meta.verifiedAt, catalog.meta.recalls.retrievedAt));
  assert.equal(nodes[1].dateModified, nodes[0].dateModified);
  assert.equal(nodes[0].isBasedOn.length, 3);
  assert.ok(nodes[0].isBasedOn.includes(catalog.meta.ratings.source));
  assert.ok(nodes[0].isBasedOn.includes(catalog.meta.plants.source));
  assert.ok(nodes[0].isBasedOn.includes(catalog.meta.recalls.source));
  assert.deepEqual(
    nodes[2].mainEntity.map((item) => item.acceptedAnswer.text),
    report.faqs.map((item) => item.text),
  );
  assert.doesNotMatch(nodes.map((node) => node["@type"]).join(" "), /Product|Review|AggregateRating/);
  console.log(
    `rebadged plants ${report.plants.plantCount}; registrant names ${report.plants.distinctNames}; names on 2+ codes ${report.plants.namesOnMultipleCodes}; codes sharing a name ${report.plants.codesSharingName}; blank names ${report.plants.blankNameCodes}; rating rows ${report.ratingCount}; recall rows ${report.recallCount}; campaigns ${report.recall.campaigns}; brand strings ${report.recall.brands}; recalled lines ${report.recall.lines}; different filer ${report.recall.brandsWithDifferentFiler}; made by ${report.recall.madeByRows}; filed by ${report.recall.filedByRows}; who-makes pages ${report.whoMakes.length}; shared plant codes ${report.shared.computable ? report.shared.codesOnTwoOrMoreBrands : NOT_IN_FILES}`,
  );
});

test("the guide is the one new static path and cites the opened regulations", () => {
  assert.equal(REBADGED_TIRES_PATH, "/guides/rebadged-tires/");
  assert.equal(STATIC_INDEXABLE_PATHS.filter((path) => path === REBADGED_TIRES_PATH).length, 1);
  assert.equal(PINNED_STATIC_INDEXABLE_PATHS.includes(REBADGED_TIRES_PATH), false);
  assert.equal(includeInSitemap(REBADGED_TIRES_PATH, new Set()), true);
  assert.equal(includeInSitemap(`https://treadgrade.com${REBADGED_TIRES_PATH}`, new Set()), true);
  const added = STATIC_INDEXABLE_PATHS.filter((path) => !PINNED_STATIC_INDEXABLE_PATHS.includes(path));
  const removed = PINNED_STATIC_INDEXABLE_PATHS.filter((path) => !STATIC_INDEXABLE_PATHS.includes(path));
  assert.deepEqual(added, [REBADGED_TIRES_PATH]);
  assert.deepEqual(removed, []);

  assert.equal(PLANT_CODE_QUOTE, "The plant code represents the identity of the new tire manufacturer or retreader.");
  assert.equal(
    MANUFACTURER_CODE_QUOTE,
    "For new tires, the manufacturer's code may be used as a descriptive code for the purpose of identifying significant characteristics of the tire or to identify the brand name owner.",
  );
  assert.equal(
    TIRE_TYPE_QUOTE,
    "The type of tires manufactured at each plant, e.g., pneumatic tires for passenger cars, buses, trucks, or motorcycles; pneumatic retreaded tires; or non-pneumatic tires or non-pneumatic tire assemblies.",
  );
  assert.equal(formatUtcDate(ECFR_RETRIEVED), "November 16, 2026");

  const page = readFileSync(new URL("../src/pages/guides/rebadged-tires.astro", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../src/lib/rebadged-tires.js", import.meta.url), "utf8");
  assert.match(page, /<Answer /);
  assert.match(page, /<SourceLine /);
  assert.match(page, /<caption>/);
  assert.match(page, /PLANT_CODE_QUOTE/);
  assert.match(page, /MANUFACTURER_CODE_QUOTE/);
  assert.match(page, /TIRE_TYPE_QUOTE/);
  const libProse = lib.replace(/const STORE_BRAND =[\s\S]*?;\n/, "").replace(/export const BANNED_VERDICT =[\s\S]*?;\n/, "");
  assertNoVerdict(page, "page source");
  assertNoVerdict(libProse, "library source");
  assert.equal(mentionsStoreBrand(`${page}\n${libProse}`), "");
  assert.doesNotMatch(page, /awin|sponsored|affiliate/i);
  assert.doesNotMatch(lib, /awin|sponsored|affiliate/i);
  assert.doesNotMatch(page, /https?:\/\//);
  const urls = [...lib.matchAll(/https:\/\/[^"'`\s)]+/g)].map((match) => match[0]);
  assert.deepEqual([...new Set(urls)].sort(), [ECFR_PLANT_URL, ECFR_TIN_URL].sort());
  assertRetrievedNear(page, "ECFR_TIN_URL", "ecfrRetrieved");
  assertRetrievedNear(page, "ECFR_PLANT_URL", "ecfrRetrieved");
  assertRetrievedNear(page, "ratingsSource", "verified");
  assertRetrievedNear(page, "plantsSource", "verified");
  assertRetrievedNear(page, "recallsSource", "recallVerified");
  assertRetrievedNear(page, "recallsLayout", "recallVerified");

  const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const pages = indexablePathSet();
  assert.ok(hrefs.length >= 8, hrefs.join(" "));
  for (const href of hrefs) {
    const path = href.split("#")[0];
    assert.equal(pages.has(path), true, href);
    if (!href.includes("#")) continue;
    const id = href.split("#")[1];
    const source = readFileSync(new URL(`../src/pages${path.replace(/\/$/, "")}.astro`, import.meta.url), "utf8");
    assert.match(source, new RegExp(`id="${id}"`), href);
  }

  for (const file of [
    "src/pages/guides/index.astro",
    "src/pages/guides/dot-code.astro",
    "src/pages/plants/index.astro",
    "src/pages/who-makes-it.astro",
    "src/components/Footer.astro",
  ]) {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /\/guides\/rebadged-tires\//, file);
  }
  const links = readFileSync(new URL("../scripts/check-links.mjs", import.meta.url), "utf8");
  const structured = readFileSync(new URL("../scripts/check-structured.mjs", import.meta.url), "utf8");
  assert.match(links, /REBADGED_TIRES_PATH/);
  assert.match(structured, /REBADGED_TIRES_PATH/);

  const totals = [
    meta.ratings.rows,
    meta.plants.rows,
    meta.recalls.tireRows,
    meta.recalls.campaigns,
    meta.recalls.brands,
    meta.recalls.lines,
    meta.recalls.brandsWithDifferentFiler,
  ];
  const source = `${page}\n${lib}`;
  for (const total of totals) {
    if (total < 50) continue;
    for (const token of [String(total), formatNumber(total)]) {
      assert.doesNotMatch(source, new RegExp(`\\b${escapeRegExp(token)}\\b`), token);
    }
  }
});

function reportLink(report, label) {
  const rows = rebadgedText(report).split("\n");
  const index = rows.indexOf(label);
  assert.ok(index >= 0, label);
  return { result: rows[index + 1], value: rows[index + 1] === NOT_IN_FILES ? null : Number(rows[index + 1].replace(/,/g, "")) };
}

function assertRetrievedNear(source, token, dateToken) {
  let at = 0;
  let found = 0;
  while (at >= 0) {
    at = source.indexOf(token, at);
    if (at < 0) break;
    found += 1;
    assert.match(source.slice(at, at + 320), new RegExp(dateToken), token);
    at += token.length;
  }
  assert.ok(found >= 1, token);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
