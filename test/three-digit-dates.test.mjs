import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog } from "../src/lib/catalog.js";
import { REBADGED_TIRES_PATH } from "../src/lib/rebadged-tires.js";
import { indexablePathSet, PINNED_STATIC_INDEXABLE_PATHS, STATIC_INDEXABLE_PATHS } from "../src/lib/sitemap.js";
import { decodeTin, indexPlants } from "../src/lib/tin.js";

const now = new Date(Date.UTC(2026, 10, 24));
const plants = indexPlants(catalog.plants);
const BANNED = /\b(best|recommend(?:ed|s|ing)?)\b/i;

function years(result) {
  return result.date.candidates.map((item) => item.year);
}

test("403 is a pre-2000 date with and without the triangle", () => {
  const plain = decodeTin("403", plants, now);
  assert.equal(plain.format, "pre-2000");
  assert.equal(plain.date.style, "three");
  assert.equal(plain.date.triangle, false);
  assert.equal(plain.date.week, 40);
  assert.deepEqual(years(plain), [1973, 1983, 1993]);
  assert.equal(plain.date.candidates[0].start, "1973-10-07");
  assert.equal(plain.date.candidates[0].end, "1973-10-13");
  assert.equal(plain.date.candidates[1].start, "1983-10-02");
  assert.equal(plain.date.candidates[2].start, "1993-10-03");
  assert.equal(plain.date.candidates[2].end, "1993-10-09");
  assert.ok(plain.date.candidates.every((item) => item.triangleYear === false));
  assert.ok(plain.notes.some((note) => /decade is not/.test(note.text)));
  const asPlant = catalog.plants.find((plant) => plant.code === "403");
  if (!asPlant) {
    assert.equal(plain.plantCode, null);
    assert.equal(plain.alternativeReadings, false);
  }

  const marked = decodeTin("403△", plants, now);
  assert.equal(marked.normalized, "403");
  assert.equal(marked.date.triangle, true);
  assert.equal(marked.date.candidates.find((item) => item.triangleYear).year, 1993);
  assert.ok(marked.notes.some((note) => note.text.includes("nht90-2.39")));

  const word = decodeTin("403 triangle", plants, now);
  assert.equal(word.date.triangle, true);
  assert.equal(word.normalized, "403");
  assert.equal(word.date.candidates.find((item) => item.triangleYear).year, 1993);

  const boxed = decodeTin("403", plants, now, { triangle: true });
  assert.equal(boxed.date.triangle, true);
  assert.equal(boxed.date.candidates.find((item) => item.triangleYear).year, 1993);
});

test("a no-space TIN keeps a two-symbol plant code, including 16C100AUF", () => {
  const partial = decodeTin("16c100auf", plants, now);
  assert.equal(partial.normalized, "16C100AUF");
  assert.equal(partial.hadDot, false);
  assert.equal(partial.date, null);
  const current = catalog.plants.find((plant) => plant.code === "16C");
  if (current) {
    assert.equal(partial.ok, true);
    assert.equal(partial.format, "partial");
    assert.equal(partial.plantCode, "16C");
    assert.equal(partial.middle, "100AUF");
    assert.equal(partial.matches.length, 1);
    assert.equal(partial.matches[0].code, current.code);
    assert.equal(partial.matches[0].url, current.url);
    assert.equal(partial.matches[0].matchedOn, "current");
  }
  const dotted = decodeTin("DOT16C100AUF", plants, now);
  assert.equal(dotted.hadDot, true);
  assert.equal(dotted.normalized, partial.normalized);
  assert.equal(dotted.plantCode, partial.plantCode);
  assert.equal(dotted.middle, partial.middle);
  assert.equal(dotted.date, null);

  const former = catalog.plants.find((plant) => {
    if (!plant.oldCode || plant.oldCode.length !== 2 || (plant.oldCodeSharedWith || []).length) return false;
    const three = `${plant.oldCode}A`;
    return !catalog.plants.some((other) => other.code === three);
  });
  assert.ok(former);
  const threeDigit = decodeTin(`${former.oldCode}AB403`, plants, now);
  assert.equal(threeDigit.normalized, `${former.oldCode}AB403`.toUpperCase());
  assert.equal(threeDigit.format, "pre-2000");
  assert.equal(threeDigit.plantCode, former.oldCode);
  assert.equal(threeDigit.matches[0].code, former.code);
  assert.equal(threeDigit.matches[0].url, former.url);
  assert.equal(threeDigit.matches[0].matchedOn, "old");
  assert.equal(threeDigit.date.raw, "403");
  assert.deepEqual(years(threeDigit), [1973, 1983, 1993]);

  const fourDigit = decodeTin(`DOT${former.oldCode}AB3524`, plants, now);
  assert.equal(fourDigit.hadDot, true);
  assert.equal(fourDigit.format, "old-two-symbol");
  assert.equal(fourDigit.plantCode, former.oldCode);
  assert.equal(fourDigit.matches[0].code, former.code);
  assert.equal(fourDigit.date.raw, "3524");
  assert.equal(fourDigit.date.candidates[0].year, 2024);
});

test("plant code 226 is a pre-2000 date and a plant, as alternative readings", () => {
  const result = decodeTin("226", plants, now);
  assert.equal(result.format, "pre-2000");
  assert.equal(result.date.week, 22);
  assert.deepEqual(years(result), [1976, 1986, 1996]);
  assert.ok(result.notes.some((note) => /decade is not/.test(note.text)));
  const plant = catalog.plants.find((item) => item.code === "226");
  if (plant) {
    assert.equal(result.ok, true);
    assert.equal(result.alternativeReadings, true);
    assert.equal(result.plantCode, "226");
    assert.equal(result.middle, "");
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].code, plant.code);
    assert.equal(result.matches[0].url, plant.url);
    assert.equal(result.matches[0].matchedOn, "current");
    const note = result.notes.find((item) => item.alternativeReadings);
    assert.ok(note);
    assert.match(note.text, /plant code 226/);
    assert.match(note.text, /week 22, year digit 6/);
    assert.match(note.text, /two readings are alternatives/);
    assert.match(note.text, /not a plant and a date from one tire/);
    assert.equal(result.notes.some((item) => /former code 22/.test(item.text)), false);
    assert.equal(result.notes.some((item) => /recommend replacing/.test(item.text)), false);
    const marked = decodeTin("226△", plants, now);
    assert.equal(marked.alternativeReadings, true);
    assert.equal(marked.date.candidates.find((item) => item.triangleYear).year, 1996);
    assert.match(marked.notes.find((item) => item.alternativeReadings).text, /date reading, not to the plant code/);
  }

  const notWeek = catalog.plants.find(
    (item) => /^\d{3}$/.test(item.code) && (Number(item.code.slice(0, 2)) < 1 || Number(item.code.slice(0, 2)) > 53),
  );
  if (notWeek) {
    const only = decodeTin(notWeek.code, plants, now);
    assert.equal(only.format, "plant-only");
    assert.equal(only.date, null);
    assert.equal(only.alternativeReadings, false);
    assert.equal(only.ok, true);
    assert.equal(only.plantCode, notWeek.code);
    assert.equal(only.matches[0].url, notWeek.url);
    assert.equal(only.notes.some((item) => item.level === "error"), false);
    assert.match(only.notes.map((item) => item.text).join(" "), /not a manufacture week from 01 to 53/);
  }
});

test("the worked table is a section of the DOT guide and the sitemap gains no URL", () => {
  const guide = readFileSync(new URL("../src/pages/guides/dot-code.astro", import.meta.url), "utf8");
  const start = guide.indexOf('id="three-digit-dates"');
  assert.ok(start > 0);
  const section = guide.slice(start, guide.indexOf("<h2", start + 10));
  assert.match(section, /64 FR 36807/);
  assert.match(section, /nht90-2\.39/);
  assert.match(section, /https:\/\/www\.govinfo\.gov\/content\/pkg\/FR-1999-07-08\/html\/99-17402\.htm/);
  assert.match(section, /https:\/\/www\.nhtsa\.gov\/interpretations\/nht90-239/);
  assert.match(section, /<caption>/);
  assert.match(section, /What this shows/);
  assert.match(section, /What this does not show/);
  assert.match(section, />403</);
  assert.match(section, /isosceles right triangle/);
  assert.match(section, /July 2, 2000/);
  assert.match(section, /October 7–13, 1973/);
  assert.match(section, /October 3–9, 1993/);
  assert.match(section, /href="\/guides\/tire-age\/"/);
  assert.match(section, /href="\/methodology\/#data-quality"/);
  assert.match(section, /href="\/guides\/tire-date-code\/#three-digit"/);
  assert.match(section, /href="\/decoder\/\?tin=403"/);
  assert.match(section, /triangle=1/);
  assert.equal(BANNED.test(section), false, section.match(BANNED)?.[0] || "");
  assert.doesNotMatch(section, /replace your tire|you should replace/i);
  assert.match(section, /does not say whether a tire should stay in service/);

  const dateGuide = readFileSync(new URL("../src/pages/guides/tire-date-code.astro", import.meta.url), "utf8");
  const decoder = readFileSync(new URL("../src/pages/decoder.astro", import.meta.url), "utf8");
  assert.match(dateGuide, /href="\/guides\/dot-code\/#three-digit-dates"/);
  assert.match(decoder, /href="\/guides\/dot-code\/#three-digit-dates"/);
  assert.match(dateGuide, /id="three-digit"/);

  const added = STATIC_INDEXABLE_PATHS.filter((path) => !PINNED_STATIC_INDEXABLE_PATHS.includes(path));
  const removed = PINNED_STATIC_INDEXABLE_PATHS.filter((path) => !STATIC_INDEXABLE_PATHS.includes(path));
  assert.deepEqual(added, [REBADGED_TIRES_PATH]);
  assert.deepEqual(removed, []);
  const live = indexablePathSet();
  for (const path of ["/guides/dot-code/", "/guides/tire-date-code/", "/decoder/"]) {
    assert.equal(live.has(path), true, path);
  }
  assert.equal([...live].some((path) => path.includes("three-digit")), false);
});
