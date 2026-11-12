import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { brandAnswer, formatTreadwearMedian, treadwearMedian } from "../src/lib/answers.js";
import {
  BANNED_BRAND_WORD,
  BRAND_PLANT_RULE,
  BRAND_RECALL_RULE,
  FULL_BRAND_MIN_LINES,
  INDEX_FOLD_NOTE,
  brandFaqLd,
  brandIndexLetter,
  brandPageCopy,
  brandProfile,
  brandProfileSummary,
  brandProfiles,
  foldedIndexText,
  mapBrandPlants,
} from "../src/lib/brand-pages.js";
import { catalog } from "../src/lib/catalog.js";
import { treadwearStats } from "../src/lib/compare.js";
import { formatNumber, percent } from "../src/lib/format.js";
import { brandKey, buildCatalog, nameKey } from "../src/lib/normalize.js";
import { companyCore, summarizeRecallRows } from "../src/lib/recalls.js";
import { includeInSitemap, indexablePathSet } from "../src/lib/sitemap.js";

const recallRows = JSON.parse(readFileSync("data/recalls.json", "utf8"));
const summary = summarizeRecallRows(recallRows);

function offlineShare(count, total) {
  if (!total) return "0%";
  return `${((count / total) * 100).toFixed(1)}%`;
}

function offlineMedian(values) {
  const wears = values.filter((value) => Number.isInteger(value) && value > 0).sort((a, b) => a - b);
  if (!wears.length) return null;
  const mid = Math.floor(wears.length / 2);
  return wears.length % 2 === 1 ? wears[mid] : (wears[mid - 1] + wears[mid]) / 2;
}

function leadCore(name) {
  return companyCore(name).replace(/^the /, "");
}

function phraseIn(haystack, needle) {
  return needle && ` ${haystack} `.includes(` ${needle} `);
}

/** Independent copy of the documented plant rule, for the committed files. */
function offlinePlantCodes(brand, brands, plants) {
  const items = brands
    .map((item) => ({ slug: item.slug, core: companyCore(item.name) }))
    .filter((item) => item.core.length >= 4);
  const prefixCount = new Map(items.map((item) => [item.core, 0]));
  for (const plant of plants) {
    const lead = leadCore(plant.name);
    for (const item of items) {
      if (lead === item.core || lead.startsWith(`${item.core} `)) {
        prefixCount.set(item.core, prefixCount.get(item.core) + 1);
      }
    }
  }
  const strong = items.filter((item) => prefixCount.get(item.core) > 0);
  const codes = [];
  for (const plant of plants) {
    const core = companyCore(plant.name);
    const lead = leadCore(plant.name);
    const hits = strong.filter((item) => phraseIn(core, item.core));
    if (hits.length !== 1 || hits[0].slug !== brand.slug) continue;
    if (lead === hits[0].core || lead.startsWith(`${hits[0].core} `)) codes.push(plant.code);
  }
  codes.sort((a, b) => a.localeCompare(b));
  return codes;
}

function gradeCounts(rows, grades, field) {
  const counts = Object.fromEntries(grades.map((grade) => [grade, 0]));
  let other = 0;
  for (const row of rows) {
    if (counts[row[field]] != null) counts[row[field]] += 1;
    else other += 1;
  }
  return { counts, other };
}

function assertProfile(profile) {
  const lines = catalog.getBrandLines(profile.slug);
  const rows = lines.flatMap((line) => line.rows);
  const wears = rows.map((row) => row.wearN);
  const median = offlineMedian(wears);
  assert.equal(profile.lineCount, lines.length, profile.slug);
  assert.equal(profile.rowCount, rows.length, profile.slug);
  assert.equal(profile.median, median, profile.slug);
  assert.equal(profile.median, treadwearMedian(wears), profile.slug);
  assert.equal(profile.median, treadwearStats(wears).median, profile.slug);
  assert.equal(profile.medianText, formatTreadwearMedian(median), profile.slug);
  assert.equal(profile.full, lines.length >= FULL_BRAND_MIN_LINES, profile.slug);
  assert.equal(profile.folded, lines.length === 1, profile.slug);
  assert.equal(profile.linksToIndex, lines.length < FULL_BRAND_MIN_LINES, profile.slug);

  const traction = gradeCounts(rows, ["AA", "A", "B", "C"], "trac");
  for (const item of profile.traction) {
    assert.equal(item.count, traction.counts[item.grade], `${profile.slug} traction ${item.grade}`);
    assert.equal(item.share, offlineShare(item.count, rows.length), `${profile.slug} traction share ${item.grade}`);
    assert.equal(item.share, percent(item.count, rows.length));
  }
  assert.equal(profile.tractionOther?.count || 0, traction.other, profile.slug);
  const temperature = gradeCounts(rows, ["A", "B", "C"], "temp");
  for (const item of profile.temperature) {
    assert.equal(item.count, temperature.counts[item.grade], `${profile.slug} temperature ${item.grade}`);
    assert.equal(item.share, offlineShare(item.count, rows.length), `${profile.slug} temperature share ${item.grade}`);
  }
  assert.equal(profile.temperatureOther?.count || 0, temperature.other, profile.slug);

  const usable = wears.filter((value) => Number.isInteger(value) && value > 0);
  let bandRows = 0;
  for (const band of profile.bands) {
    const [start] = band.label.split("–").map(Number);
    const count = usable.filter((value) => value >= start && value <= start + 99).length;
    assert.equal(band.count, count, `${profile.slug} ${band.label}`);
    assert.equal(band.share, offlineShare(count, usable.length), `${profile.slug} ${band.label} share`);
    bandRows += band.count;
  }
  assert.equal(bandRows, usable.length, profile.slug);
  assert.equal(profile.usableWear, usable.length, profile.slug);
  assert.equal(profile.excludedWear, rows.length - usable.length, profile.slug);

  const brand = catalog.brands.find((item) => item.slug === profile.slug);
  const matched = recallRows.filter((row) => brandKey(row.brand) === brandKey(brand.name));
  assert.equal(profile.recallCount, matched.length, profile.slug);
  assert.equal(profile.recalls.length, matched.length, profile.slug);
  assert.equal(profile.campaignCount, new Set(matched.map((row) => row.campaign)).size, profile.slug);
  const named = summary.byBrand.get(nameKey(brand.name));
  assert.equal(profile.recallCount, named ? named.rows.length : 0, profile.slug);
  const plantCodes = offlinePlantCodes(brand, catalog.brands, catalog.plants);
  assert.deepEqual(profile.plants.map((plant) => plant.code), plantCodes, profile.slug);

  const filings = named || null;
  const answers = brandAnswer(brand, lines, filings, catalog.meta.verifiedAt);
  assert.equal(answers.length, 3, profile.slug);
  assert.match(answers[0], new RegExp(`${formatNumber(profile.lineCount)} tire lines?`));
  assert.match(answers[0], new RegExp(`${formatNumber(profile.rowCount)} size rows?`));
  const copy = brandPageCopy(profile, answers).join("\n");
  assert.equal(BANNED_BRAND_WORD.test(copy), false, copy.match(BANNED_BRAND_WORD)?.[0]);
  assert.doesNotMatch(copy, /\bmade by\b/i, profile.slug);
  assert.ok(profile.faqs.length >= 2 && profile.faqs.length <= 4, `${profile.slug} faqs ${profile.faqs.length}`);
  const ld = brandFaqLd(profile);
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity.length, profile.faqs.length);
  ld.mainEntity.forEach((question, index) => {
    assert.equal(question.name, profile.faqs[index].name);
    assert.equal(question.acceptedAnswer.text, profile.faqs[index].text);
  });
  const blob = JSON.stringify(ld);
  assert.equal(blob.includes("AggregateRating"), false);
  assert.equal(blob.includes('"Product"'), false);
  assert.equal(blob.includes('"Review"'), false);
}

test("plant names map only when the registrant begins with one brand", () => {
  const brands = [
    { slug: "michelin", name: "Michelin" },
    { slug: "america", name: "America" },
    { slug: "bridgestone", name: "Bridgestone" },
    { slug: "firestone", name: "Firestone" },
    { slug: "goodyear", name: "Goodyear" },
    { slug: "general-tire", name: "General Tire" },
    { slug: "private", name: "Private" },
  ];
  const plants = [
    { code: "M1", name: "Michelin North America, INC." },
    { code: "A1", name: "Specialty Tires of America" },
    { code: "BF", name: "Bridgestone/Firestone Hispania" },
    { code: "F1", name: "Firestone Hispania S.A." },
    { code: "G1", name: "The Goodyear Tire & Rubber Company" },
    { code: "G2", name: "Companhia Goodyear do Brazil" },
    { code: "GT", name: "General Tires Technology" },
    { code: "GR", name: "General Tire & Rubber CO." },
    { code: "P1", name: "Future Tyres Private Limited" },
  ];
  const mapped = mapBrandPlants(brands, plants);
  const codes = (slug) => mapped.get(slug).map((plant) => plant.code);
  assert.deepEqual(codes("michelin"), ["M1"]);
  assert.deepEqual(codes("america"), []);
  assert.deepEqual(codes("bridgestone"), []);
  assert.deepEqual(codes("firestone"), ["F1"]);
  assert.deepEqual(codes("goodyear"), ["G1"]);
  assert.deepEqual(codes("general-tire"), ["GR"]);
  assert.deepEqual(codes("private"), []);
  assert.match(BRAND_PLANT_RULE, /begins with the brand/);
  assert.match(BRAND_PLANT_RULE, /closed and historic/);
  assert.match(BRAND_PLANT_RULE, /does not show where a given tire was made/);
  assert.match(BRAND_RECALL_RULE, /capitalization and punctuation/);
  assert.doesNotMatch(BRAND_PLANT_RULE, BANNED_BRAND_WORD);
  assert.doesNotMatch(BRAND_RECALL_RULE, BANNED_BRAND_WORD);
  assert.doesNotMatch(INDEX_FOLD_NOTE, BANNED_BRAND_WORD);
});

test("Hankook, Goodyear, and a one-line brand match an offline recompute", () => {
  const one = brandProfiles.find((profile) => profile.lineCount === 1);
  assert.ok(one, "a 1-line brand");
  for (const slug of ["hankook", "goodyear", one.slug]) assertProfile(brandProfile(slug));
  const hankook = brandProfile("hankook");
  const goodyear = brandProfile("goodyear");
  assert.equal(hankook.full, true);
  assert.equal(goodyear.full, true);
  assert.equal(one.full, false);
  assert.equal(one.folded, true);
  assert.equal(one.linksToIndex, true);
  assert.match(one.indexHref, /^\/brands\/#letter-/);
  assert.match(foldedIndexText(one), new RegExp(`1 line · ${one.singleLine.name}`));
  assert.match(foldedIndexText(one), new RegExp(`median treadwear ${one.medianText}`));
  assert.ok(hankook.plants.length > 0);
  assert.ok(goodyear.plants.length > 0);
  assert.ok(hankook.plants.every((plant) => plant.url.startsWith("/plants/")));
  assert.ok(goodyear.recalls.every((row) => row.href.startsWith("/recalls/#")));
});

test("every brand profile stays factual and plant codes are not shared", () => {
  const seen = new Map();
  for (const profile of brandProfiles) {
    assert.equal(profile.lineCount >= 1, true, profile.slug);
    assert.ok(profile.faqs.length >= 2 && profile.faqs.length <= 4, profile.slug);
    const copy = brandPageCopy(profile).join("\n");
    assert.equal(BANNED_BRAND_WORD.test(copy), false, `${profile.slug} ${copy.match(BANNED_BRAND_WORD)?.[0]}`);
    assert.equal(brandIndexLetter(profile.name), profile.indexLetter);
    for (const plant of profile.plants) {
      assert.equal(seen.has(plant.code), false, plant.code);
      seen.set(plant.code, profile.slug);
      assert.equal(plant.url, `/plants/${plant.code.toLowerCase()}/`);
    }
  }
  const stats = brandProfileSummary(brandProfiles);
  assert.equal(stats.brands, catalog.brands.length);
  assert.equal(stats.full, brandProfiles.filter((profile) => profile.lineCount >= FULL_BRAND_MIN_LINES).length);
  assert.equal(stats.folded, brandProfiles.filter((profile) => profile.lineCount === 1).length);
  assert.equal(stats.plantCodes, seen.size);
  assert.equal(stats.plantBrands, brandProfiles.filter((profile) => profile.plants.length).length);
  assert.equal(
    stats.recallRows,
    brandProfiles.reduce((sum, profile) => sum + profile.recallCount, 0),
  );
});

test("brand addresses stay in the sitemap, including one-line brands", () => {
  const paths = indexablePathSet();
  const retired = new Set(catalog.redirects.map((item) => item.from));
  assert.equal(paths.has("/404.html"), false);
  assert.equal(paths.has("/brands/"), true);
  for (const brand of catalog.brands) {
    assert.equal(paths.has(brand.url), true, brand.url);
    assert.equal(retired.has(brand.url), false, brand.url);
    assert.equal(includeInSitemap(`https://treadgrade.com${brand.url}`, retired), true, brand.url);
    assert.equal(includeInSitemap(brand.url, retired), true, brand.url);
  }
  const folded = catalog.brands.filter((brand) => brand.lineCount === 1);
  assert.ok(folded.length > 0);
  for (const brand of folded) assert.equal(paths.has(brand.url), true, brand.url);
  for (const redirect of catalog.redirects) {
    assert.equal(paths.has(redirect.from), false, redirect.from);
    assert.equal(includeInSitemap(`https://treadgrade.com${redirect.from}`, retired), false, redirect.from);
  }
  const built = buildCatalog(
    JSON.parse(readFileSync("data/ratings.json", "utf8")),
    JSON.parse(readFileSync("data/plants.json", "utf8")),
    JSON.parse(readFileSync("data/meta.json", "utf8")),
  );
  assert.equal(built.brands.length, catalog.brands.length);
  assert.equal(paths.size, indexablePathSet().size);
});
