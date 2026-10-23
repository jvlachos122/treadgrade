import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "../src/lib/normalize.js";
import { ageBetween, decodeTin, indexPlants, nhtsaWeekRange } from "../src/lib/tin.js";

const now = new Date(Date.UTC(2026, 9, 21, 15, 0, 0));
const hankook = {
  code: "00T",
  oldCode: "",
  name: "Hankook Tire Manufacturing Tennessee, LP",
  city: "Clarksville",
  state: "TN",
  country: "United States",
  status: "Active",
  url: "/plants/00t/",
};
const shenyang = {
  code: "17H",
  oldCode: "7H",
  name: "Shenyang Sunshine Tyre Co., Ltd.",
  city: "Shenyang",
  country: "China",
  status: "Active",
  url: "/plants/17h/",
};
const one = { code: "1TW", oldCode: "TW", name: "Plant One", city: "A", country: "X", status: "Active", url: "/plants/1tw/" };
const two = { code: "2TW", oldCode: "TW", name: "Plant Two", city: "B", country: "Y", status: "Closed", url: "/plants/2tw/" };
const plants = indexPlants([hankook, shenyang, one, two]);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const realPlants = indexPlants(
  buildCatalog([], JSON.parse(readFileSync(join(root, "data/plants.json"), "utf8")), {
    verifiedAt: "2026-10-21T00:00:00.000Z",
  }).plants,
);

test("week 01 of 2009 is the regulation's Sunday-Saturday example", () => {
  const range = nhtsaWeekRange(2009, 1);
  assert.equal(range.start, "2009-01-04");
  assert.equal(range.end, "2009-01-10");
  assert.equal(range.validWeek, true);
  const age = ageBetween(range.start, now);
  assert.deepEqual({ years: age.years, months: age.months, days: age.days }, { years: 17, months: 9, days: 17 });
});

test("week 31 of 1997 matches the 1999 rule's published example", () => {
  const range = nhtsaWeekRange(1997, 31);
  assert.equal(range.start, "1997-08-03");
  assert.equal(range.end, "1997-08-09");
  const first = nhtsaWeekRange(1998, 1);
  assert.equal(first.start, "1998-01-04");
  assert.equal(first.end, "1998-01-10");
});

test("week numbers that do not start in the year are flagged", () => {
  assert.equal(nhtsaWeekRange(2009, 53).validWeek, false);
  assert.equal(nhtsaWeekRange(2012, 1).start, "2012-01-01");
  assert.equal(nhtsaWeekRange(2012, 53).validWeek, true);
  assert.equal(nhtsaWeekRange(2012, 54), null);
});

test("decodes a 13-symbol TIN", () => {
  const result = decodeTin("DOT 00T ABCDEF 0109", plants, now);
  assert.equal(result.ok, true);
  assert.equal(result.format, "new-13");
  assert.equal(result.plantCode, "00T");
  assert.equal(result.matches[0].url, "/plants/00t/");
  assert.equal(result.middle, "ABCDEF");
  assert.equal(result.date.candidates[0].year, 2009);
  assert.equal(result.date.candidates[0].start, "2009-01-04");
});

test("reads a plant code and a date code on their own", () => {
  const plant = decodeTin("00t", plants, now);
  assert.equal(plant.format, "plant-only");
  assert.equal(plant.matches[0].code, "00T");
  const date = decodeTin("0109", plants, now);
  assert.equal(date.format, "date-only");
  assert.equal(date.date.candidates[0].start, "2009-01-04");
});

test("lists every pre-2000 decade and does not invent one", () => {
  const result = decodeTin("329", plants, now);
  assert.equal(result.format, "pre-2000");
  assert.deepEqual(
    result.date.candidates.map((item) => item.year),
    [1979, 1989, 1999],
  );
  assert.ok(result.notes.some((note) => /decade is not/.test(note.text)));
});

test("matches a former two-symbol code and a shared former code", () => {
  const old = decodeTin("DOT 7H AB 3524", plants, now);
  assert.equal(old.format, "old-two-symbol");
  assert.equal(old.matches[0].code, "17H");
  assert.equal(old.plantCode, "7H");
  const shared = decodeTin("TW", plants, now);
  assert.equal(shared.matches.length, 2);
  assert.ok(shared.notes.some((note) => /more than one/.test(note.text)));
});

test("flags a future week, a bad week, unknown plants, and symbols outside the regulation", () => {
  const future = decodeTin("0199", plants, now);
  assert.equal(future.date.candidates[0].age.future, true);
  const bad = decodeTin("6099", plants, now);
  assert.equal(bad.ok, false);
  const unknown = decodeTin("XXX", plants, now);
  assert.equal(unknown.ok, false);
  const symbols = decodeTin("DOT 00T GGGGGG 0109", plants, now);
  assert.ok(symbols.notes.some((note) => note.text.includes("G")));
  assert.equal(symbols.plantCode, "00T");
});

test("treats a 7-symbol code as the retread length without calling it a retread", () => {
  const result = decodeTin("17H0109", plants, now);
  assert.equal(result.format, "retread-7");
  assert.ok(result.notes.some((note) => /does not prove the tire was retreaded/.test(note.text)));
});

test("rejects an empty entry", () => {
  const result = decodeTin("   ", plants, now);
  assert.equal(result.ok, false);
});

test("year digit 0 includes 2000 only for weeks that start before July 2", () => {
  const early = decodeTin("260", plants, now);
  assert.deepEqual(
    early.date.candidates.map((item) => item.year),
    [1980, 1990, 2000],
  );
  assert.equal(early.date.candidates.at(-1).start, "2000-06-25");
  assert.equal(early.date.candidates.at(-1).end, "2000-07-01");
  const later = decodeTin("270", plants, now);
  assert.deepEqual(
    later.date.candidates.map((item) => item.year),
    [1980, 1990],
  );
  assert.ok(later.notes.some((note) => /2000 is not listed/.test(note.text)));
});

test("1U2 is Sumitomo's Shirakawa plant in the vPIC file", () => {
  const result = decodeTin("DOT 1U2 ABCDEF 0109", realPlants, now);
  assert.equal(result.ok, true);
  assert.equal(result.format, "new-13");
  assert.equal(result.matches.length, 1);
  const plant = result.matches[0];
  assert.equal(plant.code, "1U2");
  assert.equal(plant.name, "Sumitomo Rubber Industries, Ltd. - Shirakawa Plant");
  assert.equal(plant.city, "Shirakawa-shi");
  assert.equal(plant.country, "Japan");
  assert.equal(plant.url, "/plants/1u2/");
  assert.equal(result.date.candidates[0].start, "2009-01-04");
  assert.equal(result.date.candidates[0].end, "2009-01-10");
});

test("maps former code U2 to current code 1U2", () => {
  const result = decodeTin("DOT U2 AB 3524", realPlants, now);
  assert.equal(result.format, "old-two-symbol");
  assert.equal(result.plantCode, "U2");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].code, "1U2");
  assert.equal(result.matches[0].matchedOn, "old");
  assert.equal(result.matches[0].url, "/plants/1u2/");
  assert.ok(result.notes.some((note) => /April 13, 2025/.test(note.text)));
});

test("flags a three-digit date and the 1990s triangle", () => {
  const plain = decodeTin("329", realPlants, now);
  assert.equal(plain.format, "pre-2000");
  assert.equal(plain.date.triangle, false);
  assert.deepEqual(
    plain.date.candidates.map((item) => item.year),
    [1979, 1989, 1999],
  );
  assert.ok(plain.date.candidates.every((item) => item.triangleYear === false));
  assert.ok(plain.notes.some((note) => /does not by itself place the tire before 1990/.test(note.text)));
  const marked = decodeTin("329△", realPlants, now);
  assert.equal(marked.date.triangle, true);
  assert.equal(marked.normalized, "329");
  assert.equal(marked.date.candidates.find((item) => item.triangleYear).year, 1999);
  assert.ok(marked.notes.some((note) => note.text.includes("nht90-2.39")));
  const boxed = decodeTin("329", realPlants, now, { triangle: true });
  assert.equal(boxed.date.triangle, true);
  assert.equal(boxed.date.candidates.find((item) => item.triangleYear).year, 1999);
});

test("reads a 7-symbol code on the real Shirakawa plant as retread length", () => {
  const result = decodeTin("1U20109", realPlants, now);
  assert.equal(result.format, "retread-7");
  assert.equal(result.plantCode, "1U2");
  assert.equal(result.middle, "");
  assert.equal(result.matches[0].url, "/plants/1u2/");
  assert.equal(result.date.raw, "0109");
  assert.equal(result.date.candidates[0].start, "2009-01-04");
  assert.ok(result.notes.some((note) => /does not prove the tire was retreaded/.test(note.text)));
});

test("warns that a partial TIN with no date may be on the other sidewall", () => {
  const result = decodeTin("1U2HD", realPlants, now);
  assert.equal(result.format, "partial");
  assert.equal(result.plantCode, "1U2");
  assert.equal(result.middle, "HD");
  assert.equal(result.date, null);
  assert.equal(result.matches[0].name, "Sumitomo Rubber Industries, Ltd. - Shirakawa Plant");
  assert.equal(result.matches[0].url, "/plants/1u2/");
  const note = result.notes.find((item) => /other sidewall/.test(item.text));
  assert.ok(note);
  assert.equal(note.caveat, true);
  assert.doesNotMatch(note.text, /invalid/i);
});

test("an unknown plant code is not in NHTSA's list", () => {
  const result = decodeTin("NAA", realPlants, now);
  assert.equal(result.ok, false);
  assert.equal(result.plantCode, "NAA");
  assert.equal(result.matches.length, 0);
  const note = result.notes.find((item) => item.text.includes("not in NHTSA's list"));
  assert.ok(note);
  assert.match(note.text, /^Plant code NAA is not in NHTSA's list\./);
  for (const item of result.notes) assert.doesNotMatch(item.text, /invalid/i);
});
