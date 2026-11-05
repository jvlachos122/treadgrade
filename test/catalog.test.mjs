import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { affiliateLinks, affiliatesConfigured, gearConfigured, gearLinks } from "../src/lib/affiliates.js";
import { site } from "../src/lib/site.js";
import { brandKey, buildCatalog, nameKey } from "../src/lib/normalize.js";
import { redirectCopy, refreshContent } from "../src/lib/redirects.js";
import { searchRecords } from "../src/lib/search.js";
import { cleanSpace } from "../src/lib/format.js";
import { slugify } from "../src/lib/slug.js";

const meta = { verifiedAt: "2026-10-21T00:00:00.000Z" };

function row(id, brand, tireline, size, wear, trac, temp, construction = "Radial") {
  return { id, brand, tireline, size, const: construction, wear, trac, temp };
}

test("slug keeps plus-sign and roman-numeral lines apart", () => {
  assert.equal(slugify("Pilot Sport A/S 3+"), "pilot-sport-a-s-3-plus");
  assert.equal(slugify("Pilot Sport A/S 3"), "pilot-sport-a-s-3");
  assert.notEqual(slugify("HTRZⅡ"), slugify("HTRZⅢ"));
  assert.equal(slugify("SB-700α"), "sb-700-alpha");
});

test("merges capitalization and builds one page per brand and line", () => {
  const ratings = [
    row(1, "Michelin", "Pilot Sport 4", "All sizes", "320", "A", "A"),
    row(2, "Michelin", "Pilot Sport 4", "18", "300", "A", "A"),
    row(3, "MICHELIN", "Pilot Sport 4 S", "18", "300", "AA", "A"),
    row(4, "Hankook", "Ventus", "16", "400", "A", "A"),
    row(5, "HanKOOK", "Ventus", "17", "420", "A", "B"),
  ];
  const catalog = buildCatalog(ratings, [], meta);
  assert.equal(catalog.stats.brands, 2);
  assert.equal(catalog.stats.lines, 3);
  assert.equal(catalog.stats.rows, 5);
  const michelin = catalog.getBrand("michelin");
  assert.equal(michelin.name, "Michelin");
  assert.equal(michelin.lineCount, 2);
  const line = catalog.getLine("michelin", "pilot-sport-4");
  assert.equal(line.rows.length, 2);
  assert.equal(line.wearMin, 300);
  assert.equal(line.wearMax, 320);
});

test("does not merge a line with its plus variant", () => {
  const ratings = [
    row(1, "Michelin", "Pilot Sport A/S 3", "All", "500", "A", "A"),
    row(2, "Michelin", "Pilot Sport A/S 3+", "All", "500", "AA", "A"),
  ];
  const catalog = buildCatalog(ratings, [], meta);
  assert.equal(catalog.lines.length, 2);
  assert.ok(catalog.lines.some((line) => line.lineSlug === "pilot-sport-a-s-3-plus"));
});

test("links the same line name under other brands without calling it a rebadge", () => {
  const ratings = [
    row(1, "Yokohama", "ADVAN Sport", "17", "280", "AA", "A"),
    row(2, "Winda", "Advan Sport", "17", "180", "AA", "A"),
  ];
  const catalog = buildCatalog(ratings, [], meta);
  const line = catalog.getLine("yokohama", "advan-sport");
  assert.equal(line.sameName.length, 1);
  assert.equal(line.sameName[0].brand, "Winda");
});

test("search prefers an exact plant code", () => {
  const data = {
    brands: [{ n: "Hankook", u: "/brands/hankook/", c: 10 }],
    lines: [{ b: "Hankook", l: "Ventus", u: "/tires/hankook/ventus/", w: "400" }],
    plants: [{ c: "00T", o: "", n: "Hankook Plant", city: "Clarksville", country: "United States", u: "/plants/00t/" }],
  };
  const results = searchRecords(data, "00T");
  assert.equal(results[0].url, "/plants/00t/");
  assert.equal(searchRecords(data, "ventus")[0].type, "Tire line");
});

test("affiliate buttons stay off until an https template and id exist", () => {
  assert.deepEqual(affiliateLinks("Michelin Pilot Sport 4"), []);
  assert.equal(affiliatesConfigured(), false);
});

test("AstroAI gear links render nothing until an https address is set", () => {
  const program = site.affiliates.astroai;
  assert.equal(program.enabled, false);
  assert.equal(program.name, "AstroAI");
  assert.equal(program.network, "Awin");
  assert.deepEqual(
    program.products.map((item) => [item.key, item.href]),
    [
      ["inflator", ""],
      ["jump_starter", ""],
    ],
  );
  for (const product of program.products) {
    assert.ok(product.label);
    assert.doesNotMatch(product.label, /\d|\$|psi|awclick/i);
  }
  assert.deepEqual(gearLinks(), []);
  assert.equal(gearConfigured(), false);
  assert.deepEqual(
    gearLinks({
      enabled: false,
      name: "AstroAI",
      network: "Awin",
      products: [{ key: "inflator", label: "Portable tire inflator", href: "https://example.com/inflator" }],
    }),
    [],
  );

  const links = gearLinks({
    enabled: true,
    name: "AstroAI",
    network: "Awin",
    products: [
      { key: "inflator", label: "Portable tire inflator", href: "http://example.com/inflator" },
      { key: "jump_starter", label: "Jump starter", href: "" },
      { key: "blank", label: "Blank", href: "   " },
      { key: "bad", label: "Bad", href: "not-a-url" },
      { key: "nolabel", label: "  ", href: "https://example.com/nolabel" },
      { key: "ok", label: "  Portable compressor  ", href: "  https://example.com/compressor  " },
    ],
  });
  assert.deepEqual(links, [{ key: "ok", label: "Portable compressor", href: "https://example.com/compressor" }]);

  const component = readFileSync(new URL("../src/components/GearLinks.astro", import.meta.url), "utf8");
  const guide = readFileSync(new URL("../src/pages/guides/tire-pressure-and-roadside-kit.astro", import.meta.url), "utf8");
  assert.match(component, /links\.length \?/);
  assert.match(component, /rel="sponsored nofollow noopener"/);
  assert.match(component, /\/affiliate-disclosure\//);
  assert.doesNotMatch(component, /<script/i);
  assert.doesNotMatch(component, /<img/i);
  assert.doesNotMatch(component, /awclick|awin1\.com/i);
  assert.match(guide, /<GearLinks/);
  assert.match(guide, /https:\/\/www\.nhtsa\.gov\/vehicle-safety\/tires/);
  assert.match(guide, /571\.138/);
  assert.match(guide, /summer-driving-tips/);
  assert.match(guide, /\/guides\/utqg-grades\/#underinflation/);
  assert.doesNotMatch(guide, /awclick|awin1\.com|astroai\.com/i);
  assert.doesNotMatch(guide, /<script/i);
  assert.match(readFileSync(new URL("../src/pages/guides/utqg-grades.astro", import.meta.url), "utf8"), /id="underinflation"/);
  assert.match(readFileSync(new URL("../src/pages/affiliate-disclosure.astro", import.meta.url), "utf8"), /gearConfigured\(\)/);
});

test("committed NHTSA files build unique pages", () => {
  const ratings = JSON.parse(readFileSync("data/ratings.json", "utf8"));
  const plants = JSON.parse(readFileSync("data/plants.json", "utf8"));
  const savedMeta = JSON.parse(readFileSync("data/meta.json", "utf8"));
  const catalog = buildCatalog(ratings, plants, savedMeta);
  const urls = [
    ...catalog.brands.map((brand) => brand.url),
    ...catalog.lines.map((line) => line.url),
    ...catalog.plants.map((plant) => plant.url),
  ];
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(catalog.stats.brands >= 150);
  assert.ok(catalog.stats.lines >= 2000);
  assert.ok(catalog.stats.plants >= 1000);
  assert.ok(catalog.plants.some((plant) => plant.code === "00T"));
});

test("brand key ignores punctuation and keeps spaces", () => {
  assert.equal(brandKey("Multi-Mile"), brandKey("Multimile"));
  assert.equal(brandKey("Multi-Mile"), "multimile");
  assert.equal(nameKey("Multi-Mile"), "multi-mile");
  assert.notEqual(nameKey("Multi-Mile"), nameKey("Multimile"));
  assert.notEqual(brandKey("BF Goodrich"), brandKey("BFGoodrich"));
  assert.notEqual(brandKey("Good Year"), brandKey("Goodyear"));
  assert.equal(brandKey("CEAT Ltd."), "ceat ltd");
  assert.equal(refreshContent("https://treadgrade.com/brands/multi-mile/"), "0;url=https://treadgrade.com/brands/multi-mile/");
});

test("punctuation-only brand spellings share a hub and the slug with more lines survives", () => {
  const ratings = [
    row(1, "ZZ-Top", "Only", "15", "100", "A", "A"),
    row(2, "ZZ-Top", "Only", "16", "110", "A", "A"),
    row(3, "ZZ-Top", "Only", "17", "120", "A", "A"),
    row(4, "ZZ-Top", "Only", "18", "130", "A", "A"),
    row(5, "ZZ-Top", "Only", "19", "140", "A", "A"),
    row(10, "ZZTop", "Alpha", "15", "200", "A", "A"),
    row(11, "ZZTop", "Beta", "16", "210", "A", "A"),
    row(12, "ZZTop", "Gamma", "17", "220", "A", "A"),
    row(20, "Good Year", "Tour", "15", "300", "A", "A"),
    row(21, "Goodyear", "Eagle", "16", "310", "A", "A"),
    row(30, "Multi-Mile", "A/S", "15", "400", "A", "A"),
    row(31, "Multimile", "AS", "16", "410", "A", "A"),
  ];
  const catalog = buildCatalog(ratings, [], meta);
  assert.equal(catalog.stats.brands, 4);
  const zz = catalog.getBrand("zztop");
  assert.equal(zz.name, "ZZ-Top");
  assert.equal(zz.lineCount, 4);
  assert.equal(zz.rowCount, 8);
  assert.equal(catalog.getBrand("zz-top"), null);
  assert.equal(catalog.getLine("zztop", "only").rows.length, 5);
  assert.equal(catalog.getLine("zztop", "alpha").brand, "ZZ-Top");
  assert.ok(catalog.getBrand("good-year"));
  assert.ok(catalog.getBrand("goodyear"));
  const mile = catalog.getBrand("multimile");
  assert.equal(mile.name, "Multimile");
  assert.equal(mile.lineCount, 2);
  assert.notEqual(catalog.getLine("multimile", "a-s").lineKey, catalog.getLine("multimile", "as").lineKey);
  assert.match(catalog.getLine("multimile", "a-s").lineKey, /\//);

  const pairs = catalog.redirects.map((item) => [item.from, item.to]).sort();
  assert.deepEqual(pairs, [
    ["/brands/multi-mile/", "/brands/multimile/"],
    ["/brands/zz-top/", "/brands/zztop/"],
    ["/tires/multi-mile/a-s/", "/tires/multimile/a-s/"],
    ["/tires/zz-top/only/", "/tires/zztop/only/"],
  ]);
  for (const item of catalog.redirects) {
    const copy = redirectCopy(item);
    assert.equal(copy.sentences.length, 2);
    for (const sentence of copy.sentences) assert.match(sentence, /[.!?]$/);
    assert.doesNotMatch(copy.sentences.join(" "), /\bthe best\b/i);
    assert.equal(item.to.startsWith("/"), true);
  }
});

test("equal line counts keep the slug of the spelling NHTSA uses most often", () => {
  const ratings = [
    row(1, "Ace-One", "Line", "15", "100", "A", "A"),
    row(2, "AceOne", "Other", "16", "100", "A", "A"),
  ];
  const catalog = buildCatalog(ratings, [], meta);
  assert.equal(catalog.getBrand("ace-one").name, "Ace-One");
  assert.equal(catalog.getBrand("aceone"), null);
  assert.deepEqual(
    catalog.redirects.map((item) => item.from),
    ["/brands/aceone/", "/tires/aceone/other/"],
  );
});

test("committed file merges only Multi-Mile and Multimile", () => {
  const ratings = JSON.parse(readFileSync("data/ratings.json", "utf8"));
  const plants = JSON.parse(readFileSync("data/plants.json", "utf8"));
  const savedMeta = JSON.parse(readFileSync("data/meta.json", "utf8"));
  const catalog = buildCatalog(ratings, plants, savedMeta);

  const byBrandKey = new Map();
  for (const row of ratings) {
    const brand = cleanSpace(row.brand);
    if (!brand) continue;
    const key = brandKey(brand);
    if (!byBrandKey.has(key)) byBrandKey.set(key, new Set());
    byBrandKey.get(key).add(nameKey(brand));
  }
  const merged = [...byBrandKey.entries()]
    .filter(([, keys]) => keys.size > 1)
    .map(([key, keys]) => [key, [...keys].sort()]);
  assert.deepEqual(merged, [["multimile", ["multi-mile", "multimile"]]]);

  const nameKeys = new Set([...byBrandKey.values()].flatMap((keys) => [...keys]));
  const collapsed = [...byBrandKey.values()].reduce((sum, keys) => sum + (keys.size - 1), 0);
  assert.equal(catalog.stats.brands, catalog.brands.length);
  assert.equal(catalog.stats.brands, nameKeys.size - collapsed);
  assert.equal(catalog.stats.lines, catalog.lines.length);
  assert.equal(
    catalog.stats.rows,
    catalog.lines.reduce((sum, line) => sum + line.rows.length, 0),
  );
  assert.equal(catalog.stats.sourceRows, ratings.length);
  assert.equal(catalog.stats.plants, plants.length);
  assert.ok(catalog.stats.rows <= ratings.length);

  const brand = catalog.getBrand("multi-mile");
  assert.equal(brand.name, "Multi-Mile");
  const mileLines = catalog.getBrandLines(brand.slug);
  assert.equal(brand.lineCount, mileLines.length);
  assert.equal(
    brand.rowCount,
    mileLines.reduce((sum, line) => sum + line.rows.length, 0),
  );
  const mileSpellings = new Map();
  for (const row of ratings) {
    const name = cleanSpace(row.brand);
    if (!name || brandKey(name) !== brandKey(brand.name)) continue;
    mileSpellings.set(name, (mileSpellings.get(name) || 0) + 1);
  }
  const expectedAliases = [...mileSpellings.entries()]
    .filter(([name]) => nameKey(name) !== nameKey(brand.name))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "en"));
  assert.deepEqual(brand.aliases, expectedAliases);
  assert.ok(expectedAliases.some((alias) => alias.name === "Multimile" && alias.count > 0));
  assert.equal(catalog.getBrand("multimile"), null);
  const aspen = catalog.getLine("multi-mile", "aspen-touring-a-s");
  assert.ok(aspen.rows.length > 0);
  assert.ok(aspen.rows.some((item) => item.id === 857228));
  assert.equal(aspen.lineKey, nameKey(aspen.line));
  assert.match(aspen.lineKey, /\//);

  assert.deepEqual(
    catalog.redirects.map((item) => [item.kind, item.from, item.to, item.fromName, item.toName]),
    [
      ["brand", "/brands/multimile/", "/brands/multi-mile/", "Multimile", "Multi-Mile"],
      ["line", "/tires/multimile/aspen-touring-a-s/", "/tires/multi-mile/aspen-touring-a-s/", "Multimile", "Multi-Mile"],
    ],
  );
  const lineCopy = redirectCopy(catalog.redirects[1]);
  assert.match(lineCopy.sentences[0], /Aspen Touring A\/S/);
  assert.equal(lineCopy.sentences[1], "This address points at that tire-line page.");

  const live = new Set([...catalog.brands.map((item) => item.url), ...catalog.lines.map((item) => item.url)]);
  for (const item of catalog.redirects) {
    assert.equal(live.has(item.from), false);
    assert.equal(live.has(item.to), true);
    assert.equal(brandKey(item.fromName), brandKey(item.toName));
  }
  for (const slug of ["co-op", "k-mart", "pos-a-trac", "ceat-ltd", "del-nat", "atlas-exxon", "cooper-export"]) {
    assert.equal(catalog.getBrand(slug).slug, slug);
    assert.equal(catalog.redirects.some((item) => item.brandSlug === slug), false);
  }

  const sameNameGroups = new Map();
  for (const line of catalog.lines) {
    if (!sameNameGroups.has(line.lineKey)) sameNameGroups.set(line.lineKey, []);
    sameNameGroups.get(line.lineKey).push(line);
  }
  const crossBrand = [...sameNameGroups.values()].filter((group) => new Set(group.map((line) => line.brandSlug)).size > 1);
  assert.ok(crossBrand.length >= 50);
  const aspenBrands = catalog.lines.filter((line) => line.line === "Aspen Touring A/S").map((line) => line.brand);
  assert.deepEqual(aspenBrands.sort(), ["Motomaster", "Multi-Mile"]);

  const found = searchRecords(
    {
      brands: [{ n: brand.name, u: brand.url, c: brand.lineCount, a: brand.aliases.map((alias) => alias.name) }],
      lines: [],
      plants: [],
    },
    "multimile",
  );
  assert.equal(found[0].url, "/brands/multi-mile/");
  assert.equal(found[0].title, "Multi-Mile");
});
