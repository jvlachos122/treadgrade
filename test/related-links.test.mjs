import assert from "node:assert/strict";
import { test } from "node:test";
import { catalog } from "../src/lib/catalog.js";
import { plantByCode } from "../src/lib/plant-hubs.js";
import { registrantKey } from "../src/lib/plant-hubs.js";
import {
  BANNED_RELATED_WORD,
  RELATED_LINE_CAP,
  buildRelatedLineIndex,
  exactGradeKey,
  relatedLineStaticText,
  relatedLinesFromIndex,
} from "../src/lib/related-lines.js";
import {
  RELATED_PLANT_CAP,
  buildRelatedPlantIndex,
  relatedPlantStaticText,
  relatedPlantsFromIndex,
} from "../src/lib/related-plants.js";

function row(partial) {
  const wear = partial.wear == null ? null : String(partial.wear);
  return {
    id: partial.id,
    size: partial.size || "All sizes",
    wear,
    wearN: wear != null && /^\d+$/.test(wear) ? Number(wear) : null,
    trac: partial.trac,
    temp: partial.temp,
  };
}

function line(partial) {
  const rows = partial.rows.map((item) => row(item));
  const wears = rows.map((item) => item.wearN).filter((value) => value != null);
  return {
    brand: partial.brand,
    line: partial.line,
    url: partial.url,
    rows,
    wearMin: wears.length ? Math.min(...wears) : null,
    wearMax: wears.length ? Math.max(...wears) : null,
    traction: [...new Set(rows.map((item) => item.trac))],
    temperature: [...new Set(rows.map((item) => item.temp))],
  };
}

function plant(partial) {
  return {
    code: partial.code,
    name: partial.name,
    city: partial.city || "",
    country: partial.country || "",
    countryKey: partial.countryKey || "",
    url: partial.url || `/plants/${partial.code.toLowerCase()}/`,
  };
}

function linksOf(related) {
  return [...related.brand, ...related.exact, ...related.letters];
}

test("related lines follow NHTSA row id, stay on the same brand string, and stay under the cap", () => {
  const acme = [
    line({
      brand: "Acme",
      line: "Zulu",
      url: "/tires/acme/zulu/",
      rows: [{ id: 10, wear: "400", trac: "A", temp: "A" }],
    }),
    line({
      brand: "Acme",
      line: "Alpha",
      url: "/tires/acme/alpha/",
      rows: [{ id: 30, wear: "400", trac: "A", temp: "A" }],
    }),
    line({
      brand: "Acme",
      line: "Mike",
      url: "/tires/acme/mike/",
      rows: [{ id: 20, wear: "200", trac: "B", temp: "B" }],
    }),
  ];
  const other = line({
    brand: "Acme Tires",
    line: "Zulu",
    url: "/tires/acme-tires/zulu/",
    rows: [{ id: 5, wear: "400", trac: "A", temp: "A" }],
  });
  const lines = [...acme, other];
  const index = buildRelatedLineIndex(lines);
  const zulu = relatedLinesFromIndex(acme[0], index);
  const again = relatedLinesFromIndex(acme[0], index);
  assert.deepEqual(zulu, again);
  assert.deepEqual(
    zulu.brand.map((item) => item.href),
    ["/tires/acme/mike/", "/tires/acme/alpha/"],
  );
  assert.equal(zulu.brand.some((item) => item.href.startsWith("/tires/acme-tires/")), false);
  assert.equal(exactGradeKey(acme[0]), exactGradeKey(acme[1]));
  assert.notEqual(exactGradeKey(acme[0]), exactGradeKey(acme[2]));
  assert.ok(zulu.exact.some((item) => item.href === other.url));
  assert.equal(zulu.exact.some((item) => item.href === acme[2].url), false);
  const hrefs = linksOf(zulu).map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(hrefs.includes(acme[0].url), false);
  assert.ok(hrefs.length <= RELATED_LINE_CAP);
  assert.equal(BANNED_RELATED_WORD.test(relatedLineStaticText()), false);
});

test("a line with no brand mate and a unique grade combination still links the same traction and temperature", () => {
  const alone = line({
    brand: "Solo",
    line: "Only",
    url: "/tires/solo/only/",
    rows: [{ id: 1, wear: "0", trac: "B", temp: "C" }],
  });
  const peers = [2, 3, 4].map((id) =>
    line({
      brand: `Brand ${id}`,
      line: "Peer",
      url: `/tires/brand-${id}/peer/`,
      rows: [{ id, wear: String(id * 100), trac: "B", temp: "C" }],
    }),
  );
  const index = buildRelatedLineIndex([alone, ...peers]);
  const related = relatedLinesFromIndex(alone, index);
  assert.equal(related.brand.length, 0);
  assert.equal(related.exact.length, 0);
  assert.deepEqual(
    related.letters.map((item) => item.href),
    ["/tires/brand-2/peer/", "/tires/brand-4/peer/"],
  );
  const back = relatedLinesFromIndex(peers[0], index);
  assert.ok(linksOf(back).some((item) => item.href === alone.url));
});

test("plant neighbours are adjacent codes, and filer plants are added only from an existing recall link", () => {
  const plants = [
    plant({ code: "B", name: "Acme Tire Inc.", city: "Akron", country: "United States", countryKey: "united-states" }),
    plant({ code: "A", name: "Acme Tire LLC", city: "Canton", country: "United States", countryKey: "united-states" }),
    plant({ code: "E", name: "Acme Tire Company", city: "Troy", country: "United States", countryKey: "united-states" }),
    plant({ code: "F", name: "Acme Tire Corp", city: "Lima", country: "United States", countryKey: "united-states" }),
    plant({ code: "C", name: "Other Rubber", city: "Dayton", country: "United States", countryKey: "united-states" }),
    plant({ code: "D", name: "Solo Works", city: "Lima", country: "Peru", countryKey: "peru" }),
  ];
  assert.equal(registrantKey("Acme Tire Inc."), registrantKey("Acme Tire LLC"));
  assert.notEqual(registrantKey("Acme Tire Inc."), registrantKey("Other Rubber"));
  const index = buildRelatedPlantIndex(plants);
  const acmeA = plants[1];
  const quiet = relatedPlantsFromIndex(acmeA, index, { recallLinked: false });
  const linked = relatedPlantsFromIndex(acmeA, index, { recallLinked: true });
  assert.deepEqual(quiet, relatedPlantsFromIndex(acmeA, index));
  assert.deepEqual(
    quiet.country.map((item) => item.code),
    ["B", "F"],
  );
  assert.equal(quiet.country.some((item) => item.code === "D"), false);
  assert.deepEqual(
    quiet.registrant.map((item) => item.code),
    [],
  );
  assert.equal(quiet.filer.length, 0);
  assert.deepEqual(
    linked.filer.map((item) => item.code),
    ["E"],
  );
  const all = [...linked.country, ...linked.registrant, ...linked.filer];
  assert.ok(all.length <= RELATED_PLANT_CAP);
  assert.equal(new Set(all.map((item) => item.code)).size, all.length);
  const solo = relatedPlantsFromIndex(plants[5], index, { recallLinked: false });
  assert.deepEqual(solo, { country: [], registrant: [], filer: [] });
  assert.equal(BANNED_RELATED_WORD.test(relatedPlantStaticText()), false);
});

test("the published catalog gives every tire line and plant code at least three inlink sources", () => {
  const lineIndex = buildRelatedLineIndex(catalog.lines);
  const lineInbound = new Map();
  const add = (inbound, target, source) => {
    if (!target || target === source) return;
    if (!inbound.has(target)) inbound.set(target, new Set());
    inbound.get(target).add(source);
  };
  for (const item of catalog.lines) {
    add(lineInbound, item.url, `/brands/${item.brandSlug}/`);
    const related = relatedLinesFromIndex(item, lineIndex);
    const emitted = linksOf(related);
    assert.ok(emitted.length <= RELATED_LINE_CAP, item.url);
    for (const link of emitted) add(lineInbound, link.href, item.url);
  }
  const shortLines = catalog.lines.filter((item) => (lineInbound.get(item.url)?.size || 0) < 3);
  assert.equal(shortLines.length, 0, shortLines.slice(0, 5).map((item) => item.url).join(", "));

  const plantIndex = buildRelatedPlantIndex(catalog.plants);
  const countrySize = new Map();
  for (const item of catalog.plants) countrySize.set(item.countryKey, (countrySize.get(item.countryKey) || 0) + 1);
  const plantInbound = new Map();
  for (const item of catalog.plants) {
    add(plantInbound, item.url, "/plants/");
    if (item.countryKey) add(plantInbound, item.url, `/plants/country/${item.countryKey}/`);
    if (countrySize.get(item.countryKey) === 1) add(plantInbound, item.url, "/plants/country/");
    const extra = plantByCode.get(item.code);
    const related = relatedPlantsFromIndex(item, plantIndex, { recallLinked: extra.recalls.length > 0 });
    const emitted = [...related.country, ...related.registrant, ...related.filer];
    assert.ok(emitted.length <= RELATED_PLANT_CAP, item.code);
    for (const link of emitted) add(plantInbound, link.url, item.url);
  }
  const shortPlants = catalog.plants.filter((item) => (plantInbound.get(item.url)?.size || 0) < 3);
  assert.equal(shortPlants.length, 0, shortPlants.slice(0, 8).map((item) => item.code).join(", "));
});
