import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  BANNED_COUNTRY_WORD,
  PLANT_COUNTRY_BASIS,
  PLANT_COUNTRY_EXAMPLES,
  PLANT_COUNTRY_MIN,
  PLANT_COUNTRY_READ,
  PLANT_IDENTIFIES,
  plantCountryCopy,
  plantCountryReadText,
  plantCountryTable,
} from "../src/lib/brand-countries.js";
import { brandProfiles } from "../src/lib/brand-pages.js";
import { catalog } from "../src/lib/catalog.js";
import { exampleComparisonPaths } from "../src/lib/compare-pages.js";
import { formatNumber } from "../src/lib/format.js";
import { normalizeCountry } from "../src/lib/plant-countries.js";
import { hubPaths } from "../src/lib/plant-hubs.js";
import { companyCore } from "../src/lib/recalls.js";
import { STATIC_INDEXABLE_PATHS, indexablePathSet } from "../src/lib/sitemap.js";
import { whoMakesPages } from "../src/lib/who-makes-pages.js";

const rawPlants = JSON.parse(readFileSync(new URL("../data/plants.json", import.meta.url), "utf8"));

function leadCore(name) {
  return companyCore(name).replace(/^the /, "");
}

function phraseIn(haystack, needle) {
  return needle && ` ${haystack} `.includes(` ${needle} `);
}

/** Independent copy of the brand-page plant rule, applied to the committed catalog. */
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

function storedCountryByCode() {
  const byCode = new Map();
  for (const row of rawPlants) {
    const code = String(row.dotCode || "").trim().toUpperCase();
    if (!code) continue;
    byCode.set(code, normalizeCountry(row.country || ""));
  }
  return byCode;
}

function offlineCountries(codes, plants, stored) {
  const wanted = new Set(codes);
  const buckets = new Map();
  let omitted = 0;
  for (const plant of plants) {
    if (!wanted.has(plant.code)) continue;
    const fromFile = stored.get(plant.code);
    assert.ok(fromFile, plant.code);
    assert.equal(plant.country, fromFile.label, plant.code);
    assert.equal(plant.countryKey, fromFile.key, plant.code);
    if (!plant.country || !plant.countryKey) {
      omitted += 1;
      continue;
    }
    if (!buckets.has(plant.countryKey)) {
      buckets.set(plant.countryKey, { key: plant.countryKey, label: plant.country, codes: [] });
    }
    const bucket = buckets.get(plant.countryKey);
    assert.equal(bucket.label, plant.country, plant.countryKey);
    bucket.codes.push(plant.code);
  }
  for (const bucket of buckets.values()) bucket.codes.sort((a, b) => a.localeCompare(b));
  return { buckets, omitted };
}

function offlineAnswer(name, plantCount, countryCount) {
  const plants = plantCount === 1 ? "plant code" : "plant codes";
  const countries = countryCount === 1 ? "country" : "countries";
  return `NHTSA data links ${name} to ${formatNumber(plantCount)} ${plants} in ${formatNumber(countryCount)} ${countries}.`;
}

function pageTable(profile) {
  return plantCountryTable(
    profile.name,
    profile.plants.map((brief) => {
      const plant = catalog.getPlant(brief.code);
      assert.ok(plant, brief.code);
      return plant;
    }),
  );
}

test("a brand in fewer than two countries has no plant-country section", () => {
  assert.equal(PLANT_COUNTRY_MIN, 2);
  assert.equal(plantCountryTable("Acme", []), null);
  assert.equal(
    plantCountryTable("Acme", [{ code: "A1", country: "Japan", countryKey: "japan", url: "/plants/a1/" }]),
    null,
  );
  assert.equal(
    plantCountryTable("Acme", [
      { code: "A1", country: "Japan", countryKey: "japan", url: "/plants/a1/" },
      { code: "B2", country: "", countryKey: "", url: "/plants/b2/" },
    ]),
    null,
  );
  const capped = plantCountryTable("Acme", [
    { code: "D4", country: "Japan", countryKey: "japan", url: "/plants/d4/" },
    { code: "C3", country: "Japan", countryKey: "japan", url: "/plants/c3/" },
    { code: "B2", country: "Japan", countryKey: "japan", url: "/plants/b2/" },
    { code: "A1", country: "Japan", countryKey: "japan", url: "/plants/a1/" },
    { code: "E5", country: "France", countryKey: "france", url: "/plants/e5/" },
  ]);
  assert.equal(capped.countryCount, 2);
  assert.equal(capped.plantCount, 5);
  assert.equal(capped.countries[0].count, 4);
  assert.deepEqual(
    capped.countries[0].examples.map((item) => item.code),
    ["A1", "B2", "C3"],
  );
  assert.equal(capped.countries[1].count, 1);
  assert.deepEqual(capped.countries[1].examples.map((item) => item.code), ["E5"]);
  assert.equal(BANNED_COUNTRY_WORD.test(plantCountryCopy(capped).join("\n")), false);
  assert.doesNotMatch(plantCountryReadText(), /\bmade by\b/i);
  assert.match(plantCountryReadText(), new RegExp(PLANT_IDENTIFIES.replace(/[.]/g, "\\.")));
});

test("plant-country counts match an offline recompute of the committed files", () => {
  const stored = storedCountryByCode();
  const paths = indexablePathSet();
  const countriesByKey = new Map(catalog.countries.map((country) => [country.key, country]));
  let shown = 0;
  let hidden = 0;
  let maxCountries = 0;
  let maxName = "";
  for (const profile of brandProfiles) {
    const brand = catalog.brands.find((item) => item.slug === profile.slug);
    const codes = offlinePlantCodes(brand, catalog.brands, catalog.plants);
    assert.deepEqual(
      profile.plants.map((plant) => plant.code),
      codes,
      profile.slug,
    );
    const offline = offlineCountries(codes, catalog.plants, stored);
    const table = pageTable(profile);
    const text = plantCountryCopy(table).join("\n");
    assert.equal(BANNED_COUNTRY_WORD.test(text), false, `${profile.slug} ${text.match(BANNED_COUNTRY_WORD)?.[0] || ""}`);
    assert.doesNotMatch(text, /\bmade by\b/i, profile.slug);
    assert.doesNotMatch(text, /\b(makes|manufactures)\b/i, profile.slug);
    if (offline.buckets.size < 2) {
      assert.equal(table, null, profile.slug);
      assert.equal(text.includes("Plant countries linked to"), false, profile.slug);
      hidden += 1;
      continue;
    }
    shown += 1;
    assert.ok(table, profile.slug);
    assert.equal(table.omitted, offline.omitted, profile.slug);
    assert.equal(offline.omitted, 0, profile.slug);
    assert.equal(table.countryCount, offline.buckets.size, profile.slug);
    assert.equal(table.plantCount, codes.length, profile.slug);
    const summed = table.countries.reduce((sum, row) => sum + row.count, 0);
    assert.equal(summed, table.plantCount, profile.slug);
    assert.equal(table.answer, offlineAnswer(profile.name, table.plantCount, table.countryCount), profile.slug);
    assert.equal(table.caption, `Plant countries linked to ${profile.name} in NHTSA data`, profile.slug);
    assert.match(table.answer, /^NHTSA data links .+ plant codes? in \d[\d,]* countries?\.$/);
    if (table.countryCount > maxCountries) {
      maxCountries = table.countryCount;
      maxName = profile.name;
    }
    const seen = new Set();
    for (const row of table.countries) {
      const expected = offline.buckets.get(row.key);
      assert.ok(expected, `${profile.slug} ${row.key}`);
      assert.equal(row.label, expected.label, `${profile.slug} ${row.key}`);
      assert.equal(row.count, expected.codes.length, `${profile.slug} ${row.key}`);
      assert.equal(row.basis, "Registrant name begins with the brand", `${profile.slug} ${row.key}`);
      assert.equal(row.basis, PLANT_COUNTRY_BASIS);
      assert.deepEqual(row.examples.map((item) => item.code), expected.codes.slice(0, 3), `${profile.slug} ${row.key}`);
      assert.equal(row.examples.length, Math.min(3, expected.codes.length));
      const country = countriesByKey.get(row.key);
      assert.ok(country, row.key);
      assert.equal(row.url, country.url, row.key);
      assert.equal(row.label, country.label, row.key);
      assert.equal(paths.has(row.url), true, row.url);
      for (const example of row.examples) {
        assert.equal(seen.has(example.code), false, example.code);
        seen.add(example.code);
        const plant = catalog.getPlant(example.code);
        assert.equal(example.url, plant.url, example.code);
        assert.equal(paths.has(example.url), true, example.url);
        assert.equal(plant.country, row.label, example.code);
        assert.equal(plant.countryKey, row.key, example.code);
      }
    }
    assert.equal(table.countries.length, offline.buckets.size, profile.slug);
    const ordered = [...offline.buckets.values()].sort(
      (a, b) => b.codes.length - a.codes.length || a.label.localeCompare(b.label, "en") || a.key.localeCompare(b.key),
    );
    assert.deepEqual(
      table.countries.map((row) => row.key),
      ordered.map((row) => row.key),
      profile.slug,
    );
  }
  assert.equal(shown + hidden, brandProfiles.length);
  assert.equal(PLANT_COUNTRY_EXAMPLES, 3);
  assert.equal(PLANT_COUNTRY_READ.href, "/decoder/");
  assert.equal(paths.has("/decoder/"), true);
  assert.equal(paths.has("/methodology/"), true);
  assert.equal(paths.has("/guides/dot-code/"), true);
  assert.equal(paths.has("/brands/"), true);
  console.log(`brand pages with the section: ${shown}`);
  console.log(`max countries: ${maxCountries} (${maxName})`);
  console.log(`brand pages without the section: ${hidden}`);
});

test("plant-country sections add no URLs and the new links stay on indexable pages", () => {
  const expected = new Set(STATIC_INDEXABLE_PATHS);
  for (const brand of catalog.brands) expected.add(brand.url);
  for (const line of catalog.lines) expected.add(line.url);
  for (const plant of catalog.plants) expected.add(plant.url);
  for (const path of hubPaths) expected.add(path);
  for (const page of whoMakesPages) expected.add(page.url);
  for (const path of exampleComparisonPaths) expected.add(path);
  const live = indexablePathSet();
  assert.equal(live.size, expected.size);
  for (const path of live) assert.equal(expected.has(path), true, path);
  for (const path of expected) assert.equal(live.has(path), true, path);
  assert.equal([...live].some((path) => path.includes("/plant-countries")), false);

  const page = readFileSync(new URL("../src/pages/brands/[brand].astro", import.meta.url), "utf8");
  assert.match(page, /plantCountries \?/);
  assert.match(page, /id="plant-countries"/);
  assert.match(page, /PLANT_COUNTRY_READ\.href/);
  assert.match(page, /PLANT_COUNTRY_READ\.caveatHref/);
  assert.equal(PLANT_COUNTRY_READ.caveatHref, "/methodology/#data-quality");
  const methodology = readFileSync(new URL("../src/pages/methodology.astro", import.meta.url), "utf8");
  assert.match(methodology, /id="data-quality"/);
  const blockStart = page.indexOf('id="plant-countries"');
  const block = page.slice(blockStart, page.indexOf("makerLine", blockStart));
  assert.equal(BANNED_COUNTRY_WORD.test(block), false, block.match(BANNED_COUNTRY_WORD)?.[0]);
  assert.doesNotMatch(block, /noindex|canonical|robots/i);

  const guide = readFileSync(new URL("../src/pages/guides/dot-code.astro", import.meta.url), "utf8");
  const start = guide.indexOf('id="same-brand"');
  assert.ok(start > 0);
  const section = guide.slice(start, guide.indexOf("<h2>", start));
  assert.match(section, /A plant code identifies the registered plant, not the brand owner\./);
  assert.match(section, /href="\/brands\/"/);
  assert.match(section, /href="\/decoder\/"/);
  assert.match(section, /href="\/methodology\/#data-quality"/);
  assert.equal(BANNED_COUNTRY_WORD.test(section), false, section.match(BANNED_COUNTRY_WORD)?.[0]);
  assert.doesNotMatch(section, /\bmade by\b/i);
  assert.doesNotMatch(section, /\b(makes|manufactures)\b/i);
  assert.match(guide, /\/plants\/by-maker\//);
  assert.match(guide, /\/guides\/rebadged-tires\//);
});
