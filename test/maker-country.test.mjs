import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  makerCountryAnswer,
  makerCountryBelowMinText,
  makerCountryCaption,
  makerCountryCopy,
  makerCountryFaqLd,
  makerCountryFaqs,
  makerCountryIntro,
} from "../src/lib/answers.js";
import { brandPageCopy, brandProfile } from "../src/lib/brand-pages.js";
import { catalog } from "../src/lib/catalog.js";
import { formatNumber, formatVerified } from "../src/lib/format.js";
import { normalizeCountry } from "../src/lib/plant-countries.js";
import { MAKER_COUNTRY_DEFS, MAKER_COUNTRY_MIN } from "../src/lib/plant-groups.js";
import { countryHubs, hubPaths, manufacturerGroupForBrand, manufacturerGroups } from "../src/lib/plant-hubs.js";
import { MAKER_COUNTRY_PATH, makerCountryBrandLine, makerCountryReport } from "../src/lib/plant-makers.js";
import { indexablePathSet } from "../src/lib/sitemap.js";

const BANNED = /\b(best|top-rated|top rated|recommend(?:ed|s|ing)?)\b/i;

/** Independent copy of the name rules, applied to the committed plant file. */
const OFFLINE_RULES = {
  bridgestone: (name) => name.includes("bridgestone") || name.includes("firestone"),
  michelin: (name) => name.includes("michelin"),
  goodyear: (name) => name.includes("goodyear"),
  continental(name) {
    if (name.includes("continental")) return true;
    if (name.includes("general tires technology")) return false;
    return name.includes("general tire");
  },
  pirelli: (name) => name.includes("pirelli"),
  yokohama: (name) => name.includes("yokohama"),
  sumitomo: (name) => name.includes("sumitomo"),
  kumho: (name) => name.includes("kumho"),
  ceat: (name) => name.includes("ceat"),
  toyo: (name) => name.includes("toyo tire") || name.includes("toyo tyre"),
  hankook: (name) => name.includes("hankook"),
  "cheng-shin": (name) => name.includes("cheng shin"),
  dunlop: (name) => name.includes("dunlop"),
  kenda: (name) => name.includes("kenda rubber"),
};

function committedPlants() {
  const raw = JSON.parse(readFileSync("data/plants.json", "utf8"));
  const plants = [];
  for (const row of raw) {
    const code = String(row.dotCode || "").trim().toUpperCase();
    if (!code) continue;
    const country = normalizeCountry(row.country || "");
    plants.push({
      code,
      name: String(row.name || "").toLowerCase(),
      countryKey: country.key,
      countryLabel: country.label,
    });
  }
  return plants;
}

function offlineGroups(plants) {
  const groups = new Map();
  for (const [id, rule] of Object.entries(OFFLINE_RULES)) {
    const matched = plants.filter((plant) => rule(plant.name));
    const byCountry = new Map();
    for (const plant of matched) {
      if (!byCountry.has(plant.countryKey)) byCountry.set(plant.countryKey, []);
      byCountry.get(plant.countryKey).push(plant.code);
    }
    for (const codes of byCountry.values()) codes.sort((a, b) => a.localeCompare(b));
    groups.set(id, {
      codes: matched.map((plant) => plant.code).sort((a, b) => a.localeCompare(b)),
      byCountry,
    });
  }
  return groups;
}

test("maker and country counts match an offline recompute of the committed plant file", () => {
  const plants = committedPlants();
  const offline = offlineGroups(plants);
  assert.equal(offline.size, MAKER_COUNTRY_DEFS.length);
  assert.equal(plants.length, catalog.stats.plants);
  assert.equal(makerCountryReport.plantCount, plants.length);
  assert.equal(makerCountryReport.min, MAKER_COUNTRY_MIN);

  const seen = new Map();
  for (const def of MAKER_COUNTRY_DEFS) {
    const rule = OFFLINE_RULES[def.id];
    assert.equal(typeof rule, "function", def.id);
    const expected = offline.get(def.id);
    const fromDef = plants.filter((plant) => def.matches(plant.name)).map((plant) => plant.code).sort((a, b) => a.localeCompare(b));
    assert.deepEqual(fromDef, expected.codes, def.id);
    for (const code of expected.codes) {
      assert.equal(seen.has(code), false, `${code} is in ${seen.get(code)} and ${def.id}`);
      seen.set(code, def.id);
    }
    const published = makerCountryReport.groups.find((group) => group.id === def.id) || null;
    const held = makerCountryReport.belowMin.find((group) => group.id === def.id) || null;
    if (expected.codes.length >= MAKER_COUNTRY_MIN) {
      assert.ok(published, def.id);
      assert.equal(held, null, def.id);
      assert.equal(published.count, expected.codes.length, def.id);
      assert.deepEqual(published.codes, expected.codes, def.id);
      const summed = published.countries.reduce((sum, country) => sum + country.count, 0);
      assert.equal(summed, published.count, def.id);
      for (const country of published.countries) {
        const codes = expected.byCountry.get(country.key) || [];
        assert.deepEqual(country.codes, codes, `${def.id} ${country.key}`);
        assert.equal(country.count, codes.length, `${def.id} ${country.key}`);
      }
      assert.equal(published.countries.length, expected.byCountry.size, def.id);
    } else if (expected.codes.length > 0) {
      assert.equal(published, null, def.id);
      assert.ok(held, def.id);
      assert.deepEqual(held.codes, expected.codes, def.id);
    } else {
      assert.equal(published, null, def.id);
      assert.equal(held, null, def.id);
    }
  }

  const countryCounts = new Map();
  for (const plant of plants) {
    if (!countryCounts.has(plant.countryKey)) {
      countryCounts.set(plant.countryKey, { key: plant.countryKey, label: plant.countryLabel, count: 0 });
    }
    countryCounts.get(plant.countryKey).count += 1;
  }
  const ranked = [...countryCounts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "en"),
  );
  assert.equal(makerCountryReport.topCountry.key, ranked[0].key);
  assert.equal(makerCountryReport.topCountry.count, ranked[0].count);
  assert.equal(makerCountryReport.topCountry.label, ranked[0].label);
  assert.equal(makerCountryReport.topCountryIsStrict, ranked.length < 2 || ranked[0].count > ranked[1].count);
});

test("false name matches stay out of Toyo, Kenda, and Continental", () => {
  const plants = committedPlants();
  const toyomoto = plants.find((plant) => plant.name.includes("toyomoto"));
  const kendal = plants.find((plant) => plant.name.includes("kendal"));
  const technology = plants.find((plant) => plant.name.includes("general tires technology"));
  assert.ok(toyomoto);
  assert.ok(kendal);
  assert.ok(technology);
  const toyo = makerCountryReport.groups.find((group) => group.id === "toyo");
  const kenda = makerCountryReport.belowMin.find((group) => group.id === "kenda");
  const continental = makerCountryReport.groups.find((group) => group.id === "continental");
  assert.equal(toyo.codes.includes(toyomoto.code), false);
  assert.equal(kenda.codes.includes(kendal.code), false);
  assert.equal(continental.codes.includes(technology.code), false);
  assert.ok(toyo.omitted.some((plant) => plant.code === toyomoto.code));
  assert.ok(kenda.omitted.some((plant) => plant.code === kendal.code));
  assert.ok(continental.omitted.some((plant) => plant.code === technology.code));
  const naiveToyo = plants.filter((plant) => plant.name.includes("toyo")).length;
  const naiveKenda = plants.filter((plant) => plant.name.includes("kenda")).length;
  assert.equal(naiveToyo, toyo.count + toyo.omitted.length);
  assert.equal(naiveKenda, kenda.count + kenda.omitted.length);
});

test("every maker link points at a brand page and a country page that exist", () => {
  const brandUrls = new Set(catalog.brands.map((brand) => brand.url));
  const countryUrls = new Set(catalog.countries.map((country) => country.url));
  const hubUrls = new Set(manufacturerGroups.map((group) => group.url));
  assert.equal(makerCountryReport.path, MAKER_COUNTRY_PATH);
  for (const group of makerCountryReport.groups) {
    assert.ok(group.brands.length >= 1, group.id);
    for (const brand of group.brands) {
      assert.equal(brandUrls.has(brand.url), true, brand.url);
      assert.equal(catalog.brands.some((item) => item.slug === brand.slug && item.url === brand.url), true, brand.slug);
      const line = makerCountryBrandLine(brand.slug);
      assert.equal(line.href, `${MAKER_COUNTRY_PATH}#${group.id}`);
      assert.match(line.text, /registered plant codes/);
      assert.ok(brandPageCopy(brandProfile(brand.slug)).join("\n").includes(line.text), brand.slug);
    }
    for (const country of group.countries) {
      if (!country.key) continue;
      assert.equal(countryUrls.has(country.url), true, country.url);
      assert.equal(country.url, `/plants/country/${country.key}/`);
    }
    if (group.hubUrl) assert.equal(hubUrls.has(group.hubUrl), true, group.hubUrl);
  }
  for (const group of makerCountryReport.belowMin) {
    for (const brand of group.brands) assert.equal(makerCountryBrandLine(brand.slug), null, brand.slug);
  }
  assert.equal(makerCountryBrandLine("bf-goodrich"), null);
  assert.equal(manufacturerGroupForBrand("yokohama"), null);
  assert.equal(manufacturerGroupForBrand("hankook"), null);
  assert.deepEqual(
    manufacturerGroups.map((group) => group.id),
    ["bridgestone", "michelin", "goodyear", "continental", "pirelli"],
  );
});

test("the answer, FAQ, and page copy stay factual and inside the answer-box rules", () => {
  const answers = makerCountryAnswer(makerCountryReport);
  assert.ok(answers.length >= 1 && answers.length <= 3, answers.length);
  for (const sentence of answers) assert.match(sentence, /[.!?]$/, sentence);
  const blob = answers.join(" ");
  assert.ok(blob.includes(formatVerified(makerCountryReport.verifiedAt)));
  assert.ok(blob.includes(formatNumber(makerCountryReport.plantCount)));
  assert.ok(blob.includes(formatNumber(makerCountryReport.topCountry.count)));
  assert.ok(blob.includes(makerCountryReport.topCountry.label));
  for (const group of makerCountryReport.spotlight) {
    assert.ok(blob.includes(group.nameNote), group.nameNote);
    assert.ok(blob.includes(formatNumber(group.count)), group.id);
    for (const key of group.headlineCountries) {
      const country = group.countries.find((item) => item.key === key);
      assert.ok(country, `${group.id} ${key}`);
      assert.ok(blob.includes(formatNumber(country.count)), `${group.id} ${key}`);
      assert.ok(blob.includes(country.label), country.label);
    }
  }
  const faqs = makerCountryFaqs(makerCountryReport);
  assert.ok(faqs.length >= 2 && faqs.length <= 4, faqs.length);
  const ld = makerCountryFaqLd(faqs);
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity.length, faqs.length);
  for (const [index, faq] of faqs.entries()) {
    assert.equal(ld.mainEntity[index].name, faq.name);
    assert.equal(ld.mainEntity[index].acceptedAnswer.text, faq.text);
    assert.match(faq.text, /registered plant code/i);
  }
  const intro = makerCountryIntro(makerCountryReport);
  assert.ok(intro.length >= 1);
  assert.match(makerCountryCaption(makerCountryReport), /registered plant codes/i);
  assert.match(makerCountryBelowMinText(makerCountryReport), /registered plant codes/);
  const copy = [
    makerCountryCopy(makerCountryReport),
    ...makerCountryReport.groups.flatMap((group) => group.brands.map((brand) => makerCountryBrandLine(brand.slug).text)),
  ].join("\n");
  assert.equal(BANNED.test(copy), false, copy.match(BANNED)?.[0]);
  assert.doesNotMatch(copy, /current factories/i);
});

test("the new page is the only added sitemap path and the templates link to it", () => {
  const expected = new Set([
    "/plants/manufacturer/",
    "/plants/country/",
    MAKER_COUNTRY_PATH,
    ...manufacturerGroups.map((group) => group.url),
    ...countryHubs.map((country) => country.url),
  ]);
  assert.equal(hubPaths.size, expected.size);
  for (const path of expected) assert.equal(hubPaths.has(path), true, path);
  assert.equal(indexablePathSet().has(MAKER_COUNTRY_PATH), true);

  const page = readFileSync("src/pages/plants/by-maker/index.astro", "utf8");
  assert.equal((page.match(/<h1\b/g) || []).length, 1);
  assert.equal((page.match(/<Answer\b/g) || []).length, 1);
  assert.match(page, /makerCountryFaqLd/);
  assert.match(page, /<h3>\{item\.name\}<\/h3>/);
  assert.match(page, /\{item\.text\}/);
  assert.match(page, /href="\/decoder\/"/);
  assert.match(page, /sidewall/);
  assert.match(page, /registered plant codes/i);
  assert.doesNotMatch(page, /current factories|noindex|AggregateRating|Product"|Review"/);
  assert.equal(BANNED.test(page), false, page.match(BANNED)?.[0]);

  const linked = [
    "src/pages/plants/index.astro",
    "src/pages/plants/country/index.astro",
    "src/pages/plants/country/[country].astro",
    "src/pages/plants/manufacturer/index.astro",
    "src/pages/decoder.astro",
    "src/pages/guides/dot-code.astro",
    "src/pages/methodology.astro",
  ];
  for (const file of linked) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /\/plants\/by-maker\//, file);
  }
  const groupPage = readFileSync("src/pages/plants/manufacturer/[group].astro", "utf8");
  assert.match(groupPage, /makerCountryReport\.path/);
  const brandPage = readFileSync("src/pages/brands/[brand].astro", "utf8");
  assert.match(brandPage, /makerCountryBrandLine/);
  assert.match(brandPage, /makerLine\.href/);
});
