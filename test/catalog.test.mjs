import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { affiliateLinks } from "../src/lib/affiliates.js";
import { buildCatalog } from "../src/lib/normalize.js";
import { searchRecords } from "../src/lib/search.js";
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
