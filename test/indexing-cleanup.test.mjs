import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog } from "../src/lib/catalog.js";
import { formatNumber } from "../src/lib/format.js";
import { countryHubs, manufacturerGroups, plantByCode } from "../src/lib/plant-hubs.js";
import { companyCore } from "../src/lib/recalls.js";
import {
  GROUP_LINE_CAP,
  THIN_GROUP_MAX,
  describeGroup,
  groupDetailRecord,
} from "../src/lib/plant-group-detail.js";
import { liveGroupDetail, liveGroupIndex } from "../src/lib/plant-group-page.js";
import { ratingsHubFacts } from "../src/lib/hub-quality.js";

function read(path) {
  return readFileSync(path, "utf8");
}

test("hub titles separate the decoder, the full TIN, and the date digits", () => {
  const decoder = read("src/pages/decoder.astro");
  const dot = read("src/pages/guides/dot-code.astro");
  const date = read("src/pages/guides/tire-date-code.astro");
  const home = read("src/pages/index.astro");
  const ratings = read("src/pages/ratings.astro");
  assert.match(decoder, /Tire DOT code decoder: plant, week and age/);
  assert.match(decoder, /<h1>\{title\}<\/h1>/);
  assert.match(decoder, /<form class="decoder-form"/);
  const formAt = decoder.indexOf("<form");
  const h2At = decoder.indexOf("<h2");
  assert.ok(formAt > 0 && formAt < h2At);
  assert.match(dot, /DOT tire identification number: plant, manufacturer code, and date/);
  assert.match(dot, /<h1>DOT tire identification number<\/h1>/);
  assert.match(date, /Tire date code: week and year digits/);
  assert.match(date, /<h1>Tire date code: week and year digits<\/h1>/);
  assert.doesNotMatch(date, /<h1>How to read a tire date code<\/h1>/);
  assert.doesNotMatch(dot, /<h1>How to read a DOT tire code<\/h1>/);
  assert.doesNotMatch(home, /UTQG tire grades/);
  const facts = ratingsHubFacts(catalog.lines);
  assert.equal(facts.rowCount, catalog.stats.rows);
  assert.match(ratings, /UTQG ratings lookup: \$\{formatNumber\(facts\.rowCount\)\} NHTSA rows, sortable/);
  assert.equal(formatNumber(facts.rowCount), formatNumber(catalog.stats.rows));
  const tableAt = ratings.indexOf('id="ratings-table"');
  const proseAt = ratings.indexOf("ratingsHubProse");
  assert.ok(tableAt > 0 && proseAt > 0 && tableAt < ratings.indexOf("<div class=\"prose\">"));
});

test("plant and brand directories lead with a first-party filter", () => {
  const plants = read("src/pages/plants/index.astro");
  const brands = read("src/pages/brands/index.astro");
  assert.ok(plants.indexOf("data-filter-q") < plants.indexOf('id="codes"'));
  assert.match(plants, /country-\$\{plant\.countryKey\}/);
  assert.match(plants, /data-code=\{plant\.code\}/);
  assert.doesNotMatch(plants, /googletagmanager|cdn\.|jquery/i);
  assert.ok(brands.indexOf("data-brand-filter") < brands.indexOf('id="brand-table"'));
  assert.match(brands, /Brands with the most grade rows/);
  assert.match(brands, /not a ranking/);
  assert.doesNotMatch(`${plants}\n${brands}`, /<script[^>]+src="https?:/i);
});

test("leaf templates keep one sourced line and the removed caveats stay on the method page", () => {
  const plant = read("src/pages/plants/[code].astro");
  const brand = read("src/pages/brands/[brand].astro");
  const line = read("src/pages/tires/[brand]/[line].astro");
  const method = read("src/pages/methodology.astro");
  const sourced = read("src/components/SourcedLine.astro");
  assert.match(sourced, /\/methodology\/#data-quality/);
  for (const page of [plant, brand, line]) {
    assert.match(page, /SourcedLine/);
    assert.doesNotMatch(page, /<Disclaimer|<PlantNote|<HowToFindCode/);
  }
  assert.match(plant, /<PlantMiniDecoder/);
  assert.match(method, /id="leaf-pages"/);
  assert.match(method, /plantRecordCaveat/);
  assert.match(method, /BRAND_PLANT_RULE/);
  assert.match(method, /BRAND_RECALL_RULE/);
  assert.match(method, /TREADWEAR_BAND_NOTE/);
  assert.match(method, /GRADE_SHARE_NOTE/);
  assert.match(method, /not a mileage warranty/);
  assert.match(method, /certification mark, not the plant code/);
  assert.match(method, /shared first word is not a match/);
  assert.match(method, /does not say that plant built the recalled tires/);
  assert.match(method, /not evidence of rebadging/);
  assert.match(method, /active flag is not proof/);
  for (const page of [plant, brand, line]) {
    assert.doesNotMatch(page, /noindex=\{|\bnoindex\b/);
  }
});

test("thin plant groups are enriched from committed rows and none are dropped", () => {
  const groups = [
    ...countryHubs.map((country) => ({ url: country.url, plants: country.plants })),
    ...manufacturerGroups.map((group) => ({ url: group.url, plants: group.plants })),
  ];
  assert.equal(groups.length, 78);
  const thin = groups.filter((group) => group.plants.length <= THIN_GROUP_MAX);
  assert.equal(thin.length, 32);
  assert.equal(THIN_GROUP_MAX, 2);
  const index = liveGroupIndex();
  for (const group of thin) {
    const detail = liveGroupDetail(group.plants);
    assert.equal(detail.thin, true);
    assert.equal(detail.plantCount, group.plants.length);
    const record = groupDetailRecord(detail);
    assert.equal(record.plants, group.plants.length);
    assert.equal(detail.lines.length, detail.lineCount);
    const shown = record.shownLines || [];
    assert.ok(shown.length <= GROUP_LINE_CAP);
    assert.ok(shown.length <= detail.lineCount);
    for (const member of detail.members) {
      const plant = group.plants.find((item) => item.code === member.code);
      assert.equal(member.address, plant.address || "");
      for (const brand of member.linkedBrands) {
        const linked = index.brandsByCode.get(member.code) || [];
        assert.ok(linked.some((item) => item.url === brand.url), member.code);
      }
      for (const near of member.nearby) {
        assert.ok(catalog.getPlant(near.code.toLowerCase()), near.code);
      }
      const extra = plantByCode.get(member.code);
      assert.equal(member.recalls.length, (extra?.recalls || []).length);
      const key = companyCore(plant.name);
      for (const sibling of member.siblings) {
        const other = catalog.getPlant(sibling.code.toLowerCase());
        assert.equal(companyCore(other.name), key);
        assert.notEqual(sibling.code, member.code);
      }
    }
  }
  const again = describeGroup(thin[0].plants, index);
  assert.deepEqual(groupDetailRecord(again), groupDetailRecord(liveGroupDetail(thin[0].plants)));
});
