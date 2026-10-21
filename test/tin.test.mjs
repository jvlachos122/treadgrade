import assert from "node:assert/strict";
import { test } from "node:test";
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

test("week 01 of 2009 is the regulation's Sunday-Saturday example", () => {
  const range = nhtsaWeekRange(2009, 1);
  assert.equal(range.start, "2009-01-04");
  assert.equal(range.end, "2009-01-10");
  assert.equal(range.validWeek, true);
  const age = ageBetween(range.start, now);
  assert.deepEqual({ years: age.years, months: age.months, days: age.days }, { years: 17, months: 9, days: 17 });
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
