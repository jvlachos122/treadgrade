import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog } from "../src/lib/catalog.js";
import { packPlantCodes, plantsIndexFromPacked, unpackPlantCodes } from "../src/lib/decoder-plants.js";
import {
  addCalendarDays,
  addCalendarYears,
  ageSpan,
  candidateAgeCopy,
  formatAgeSpan,
  parseIsoDay,
  REMINDER_YEARS,
} from "../src/lib/dot-age.js";
import { buildAgeReminderIcs, reminderWeeks } from "../src/lib/dot-ics.js";
import { decoderPath, plantMatchParts, samePlantHref } from "../src/lib/dot-reading.js";
import { plantDateFaq } from "../src/lib/plant-date-faq.js";
import { plantByCode, plantJsonLd } from "../src/lib/plant-hubs.js";
import { ageBetween, decodeTin, indexPlants, nhtsaWeekRange } from "../src/lib/tin.js";
import { BANNED_AGE_VERDICT } from "../src/lib/tire-age.js";

const now = new Date(Date.UTC(2026, 10, 10));
const fullIndex = indexPlants(catalog.plants);
const packed = packPlantCodes(catalog.plants);
const slimIndex = plantsIndexFromPacked(packed);

function core(result) {
  return {
    ok: result.ok,
    normalized: result.normalized,
    hadDot: result.hadDot,
    triangle: result.triangle,
    format: result.format,
    plantCode: result.plantCode,
    middle: result.middle,
    matches: result.matches.map((item) => ({ code: item.code, url: item.url, matchedOn: item.matchedOn })),
    date: result.date
      ? {
          style: result.date.style,
          raw: result.date.raw,
          week: result.date.week,
          triangle: result.date.triangle,
          candidates: result.date.candidates.map((item) => ({
            year: item.year,
            week: item.week,
            start: item.start,
            end: item.end,
            validWeek: item.validWeek,
            triangleYear: item.triangleYear,
            age: item.age,
          })),
        }
      : null,
    notes: result.notes.map((note) => ({ level: note.level, text: note.text, caveat: note.caveat || false })),
  };
}

function assertSameReading(raw, options) {
  const full = decodeTin(raw, fullIndex, now, options);
  const slim = decodeTin(raw, slimIndex, now, options);
  assert.deepEqual(core(slim), core(full), raw || "(empty)");
  assert.deepEqual(
    (full.date?.candidates || []).map((item) => candidateAgeCopy(item, now)),
    (slim.date?.candidates || []).map((item) => candidateAgeCopy(item, now)),
    raw || "(empty)",
  );
  return full;
}

test("the plant widget and the decoder share one parser", () => {
  const decoder = readFileSync("src/scripts/decoder.js", "utf8");
  const widget = readFileSync("src/scripts/plant-decoder.js", "utf8");
  const component = readFileSync("src/components/PlantMiniDecoder.astro", "utf8");
  for (const source of [decoder, widget]) {
    assert.match(source, /import \{ decodeTin(?:,|\s)/);
    assert.match(source, /from "\.\.\/lib\/tin\.js"/);
    assert.match(source, /import \{[^}]*candidateAgeCopy[^}]*\} from "\.\.\/lib\/dot-age\.js"/);
  }
  assert.match(component, /initPlantDecoder/);
  assert.doesNotMatch(widget, /\bfetch\s*\(/);
  assert.doesNotMatch(widget, /XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|import\s*\(/);
  assert.doesNotMatch(component, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
  assert.match(widget, /plantsIndexFromPacked|unpackPlantCodes/);

  const download = decoder.slice(decoder.indexOf("function downloadCalendar"), decoder.indexOf("export function initDecoder"));
  assert.match(download, /new Blob/);
  assert.match(download, /text\/calendar/);
  assert.match(download, /createObjectURL/);
  assert.doesNotMatch(download, /fetch|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.match(decoder, /buildAgeReminderIcs/);
  assert.match(decoder, /downloadCalendar/);

  const unpacked = unpackPlantCodes(packed);
  assert.equal(unpacked.length, catalog.plants.length);
  assert.deepEqual(
    unpacked.map((item) => item.code),
    catalog.plants.map((item) => item.code).sort((a, b) => a.localeCompare(b)),
  );
  for (const plant of catalog.plants) {
    const record = unpacked.find((item) => item.code === plant.code);
    assert.equal(record.oldCode, plant.oldCode);
    assert.equal(record.url, plant.url);
  }

  const fixtures = [
    ["DOT 1U2 ABCDEF 0109"],
    ["DOT 05H 9T5R 2319"],
    ["329"],
    ["329", { triangle: true }],
    ["1U2HD"],
    [""],
    ["6099"],
    ["@@@"],
    ["DOT U2 AB 3524"],
    ["NAA"],
  ];
  for (const [raw, options] of fixtures) assertSameReading(raw, options);

  const sharedOld = catalog.plants.find((plant) => plant.oldCode && plant.oldCodeSharedWith.length);
  if (sharedOld) assertSameReading(sharedOld.oldCode);
});

test("age ranges cover week 01, week 52, week 53, and leap days", () => {
  const week1 = nhtsaWeekRange(2009, 1);
  assert.equal(week1.start, "2009-01-04");
  assert.equal(week1.end, "2009-01-10");
  const first = ageSpan(week1.start, week1.end, now);
  assert.equal(first.older.totalDays - first.younger.totalDays, 6);
  assert.deepEqual(first.older, ageBetween(week1.start, now));
  assert.equal(formatAgeSpan(first), "17 years, 10 months to 17 years, 10 months, 6 days");
  const onSunday = ageSpan(week1.start, week1.end, new Date(Date.UTC(2009, 0, 4)));
  assert.equal(formatAgeSpan(onSunday), "inside this production week");
  const before = ageSpan(week1.start, week1.end, new Date(Date.UTC(2009, 0, 3)));
  assert.equal(formatAgeSpan(before), "before this production week");

  const week52 = nhtsaWeekRange(2009, 52);
  assert.equal(week52.validWeek, true);
  assert.equal(week52.start, "2009-12-27");
  assert.equal(week52.end, "2010-01-02");
  const late = ageSpan(week52.start, week52.end, now);
  assert.equal(late.older.totalDays - late.younger.totalDays, 6);
  assert.equal(formatAgeSpan(late), "16 years, 10 months, 8 days to 16 years, 10 months, 14 days");

  const week53 = nhtsaWeekRange(2012, 53);
  assert.equal(week53.validWeek, true);
  assert.equal(week53.start, "2012-12-30");
  assert.equal(week53.end, "2013-01-05");
  assert.equal(nhtsaWeekRange(2020, 53).validWeek, false);
  assert.equal(nhtsaWeekRange(2012, 1).start, "2012-01-01");
  const crossed = ageSpan(week53.start, week53.end, new Date(Date.UTC(2018, 0, 5)));
  assert.equal(crossed.younger.years, 5);
  assert.equal(crossed.younger.days, 0);
  assert.equal(crossed.older.totalDays - crossed.younger.totalDays, 6);

  assert.equal(addCalendarYears("2020-02-29", 1), "2021-02-28");
  assert.equal(addCalendarYears("2020-02-29", 4), "2024-02-29");
  assert.equal(addCalendarYears("2019-06-09", 5), "2024-06-09");
  assert.equal(addCalendarYears("2019-06-15", 6), "2025-06-15");
  const leapAge = ageSpan("2020-02-29", "2020-03-06", new Date(Date.UTC(2024, 1, 29)));
  assert.equal(leapAge.older.years, 4);
  assert.equal(leapAge.older.months, 0);
  assert.equal(leapAge.older.days, 0);
  assert.equal(leapAge.older.totalDays - leapAge.younger.totalDays, 6);
  assert.equal(parseIsoDay("2021-02-29"), "");
  assert.equal(parseIsoDay("2020-02-29"), "2020-02-29");

  let leapWeek = null;
  for (let week = 1; week <= 53; week += 1) {
    const range = nhtsaWeekRange(2020, week);
    if (range?.validWeek && range.start <= "2020-02-29" && range.end >= "2020-02-29") leapWeek = range;
  }
  assert.ok(leapWeek);
  assert.equal(addCalendarYears(leapWeek.end, 5) < addCalendarDays(addCalendarYears(leapWeek.start, 5), 7), true);

  const full = decodeTin("DOT 1U2 ABCDEF 0109", fullIndex, now);
  const candidate = full.date.candidates[0];
  assert.deepEqual(ageSpan(candidate.start, candidate.end, now).older, candidate.age);
  const copy = candidateAgeCopy(candidate, now, "2015-06-01");
  assert.match(copy[0], /2009-01-04 through 2009-01-10/);
  assert.match(copy[1], /Age today is 17 years, 10 months to 17 years, 10 months, 6 days/);
  assert.match(copy[2], /Age on 2015-06-01 is /);
  assert.equal(candidateAgeCopy(candidate, now, "2015-13-40").length, 2);
  const legacy = decodeTin("329", fullIndex, now, { triangle: true });
  assert.equal(legacy.date.candidates.length > 1, true);
  assert.ok(legacy.date.candidates.some((item) => item.triangleYear));
  const partial = decodeTin("1U2HD", fullIndex, now);
  assert.equal(partial.date, null);
  assert.equal(candidateAgeCopy({ year: 2020, week: 53, validWeek: false }, now)[0].includes("does not start"), true);
});

test("the calendar file is a client-side list of production-week anniversaries", () => {
  assert.deepEqual(REMINDER_YEARS, [5, 6, 10]);
  const stamp = new Date(Date.UTC(2026, 10, 10, 12, 0, 0));
  const body = buildAgeReminderIcs({
    years: 6,
    plantCode: "1U2",
    dateCode: "2319",
    weeks: [{ year: 2019, week: 23, start: "2019-06-09", end: "2019-06-15" }],
    dtstamp: stamp,
  });
  assert.match(body, /^BEGIN:VCALENDAR\r\n/);
  assert.match(body, /BEGIN:VEVENT/);
  assert.match(body, /DTSTART;VALUE=DATE:20250609/);
  assert.match(body, /DTEND;VALUE=DATE:20250616/);
  assert.match(body, /END:VEVENT/);
  assert.match(body, /END:VCALENDAR\r\n$/);
  assert.equal(body.includes("https://"), false);
  assert.equal(body.includes("http://"), false);
  for (const line of body.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);

  const week53 = nhtsaWeekRange(2012, 53);
  const later = buildAgeReminderIcs({
    years: 10,
    dateCode: "5312",
    weeks: [{ year: week53.year, week: week53.week, start: week53.start, end: week53.end }],
    dtstamp: stamp,
  });
  assert.match(later, /DTSTART;VALUE=DATE:20221230/);
  assert.match(later, /DTEND;VALUE=DATE:20230106/);

  let leapWeek = null;
  for (let week = 1; week <= 53; week += 1) {
    const range = nhtsaWeekRange(2020, week);
    if (range?.validWeek && range.end === "2020-02-29") leapWeek = range;
  }
  if (leapWeek) {
    const leapFile = buildAgeReminderIcs({
      years: 5,
      dateCode: "0820",
      weeks: [leapWeek],
      dtstamp: stamp,
    });
    assert.match(leapFile, new RegExp(`DTSTART;VALUE=DATE:${addCalendarYears(leapWeek.start, 5).replaceAll("-", "")}`));
    const end = addCalendarYears(leapWeek.end, 5);
    assert.equal(end, "2025-02-28");
    assert.match(leapFile, /DTEND;VALUE=DATE:20250301/);
  }

  const legacy = decodeTin("329", fullIndex, now);
  const weeks = reminderWeeks(legacy);
  assert.equal(weeks.length, legacy.date.candidates.filter((item) => item.validWeek).length);
  assert.equal(weeks.length >= 2, true);
  const legacyFile = buildAgeReminderIcs({ years: 5, dateCode: legacy.date.raw, weeks, dtstamp: stamp });
  assert.equal(legacyFile.split("BEGIN:VEVENT").length - 1, weeks.length);
  const future = decodeTin("0199", fullIndex, now);
  assert.equal(future.date.candidates[0].age.future, true);
  if (future.date.candidates[0].validWeek) {
    const futureWeeks = reminderWeeks(future);
    assert.equal(futureWeeks.length, 1);
    const futureFile = buildAgeReminderIcs({ years: 5, dateCode: "0199", weeks: futureWeeks, dtstamp: stamp });
    assert.match(futureFile, new RegExp(`DTSTART;VALUE=DATE:${addCalendarYears(futureWeeks[0].start, 5).replaceAll("-", "")}`));
  }
  assert.equal(nhtsaWeekRange(2020, 53).validWeek, false);
  const invalidWeek = decodeTin("5320", fullIndex, now);
  assert.equal(invalidWeek.date.candidates.some((item) => item.year === 2020 && item.week === 53 && item.validWeek), false);
  assert.equal(reminderWeeks(invalidWeek).some((item) => item.year === 2020 && item.week === 53), false);
  assert.equal(buildAgeReminderIcs({ years: 7, weeks: [{ year: 2019, week: 23, start: "2019-06-09", end: "2019-06-15" }] }), null);
  assert.equal(buildAgeReminderIcs({ years: 5, weeks: [] }), null);
});

test("plant match text and the decoder link stay on this site", () => {
  const here = decodeTin("DOT 1U2 ABCDEF 2319", fullIndex, now);
  assert.deepEqual(plantMatchParts(here, "1U2"), [{ text: "Plant code 1U2 matches this page." }]);
  const elsewhere = plantMatchParts(here, "05H");
  assert.equal(elsewhere.length, 1);
  assert.equal(elsewhere[0].code, "1U2");
  assert.equal(samePlantHref(elsewhere[0].href, elsewhere[0].code), "/plants/1u2/");
  assert.equal(samePlantHref("https://example.com/plants/1u2/", "1U2"), "");
  assert.equal(samePlantHref("/plants/05h/", "1U2"), "");

  const former = decodeTin("U2", fullIndex, now);
  assert.match(plantMatchParts(former, "1U2")[0].text, /Former code U2 matches this page/);
  const formerElsewhere = plantMatchParts(former, "05H");
  assert.equal(formerElsewhere[0].href, "/plants/1u2/");
  assert.match(formerElsewhere[0].before, /Former code U2/);

  assert.equal(plantMatchParts(decodeTin("0109", fullIndex, now), "1U2")[0].text, "No plant code in this entry.");
  assert.match(plantMatchParts(decodeTin("NAA", fullIndex, now), "1U2")[0].text, /not in NHTSA's list/);

  const path = decoderPath("DOT 05H 9T5R 2319", { triangle: true });
  const url = new URL(path, "https://treadgrade.com");
  assert.equal(url.pathname, "/decoder/");
  assert.equal(url.searchParams.get("tin"), "DOT 05H 9T5R 2319");
  assert.equal(url.searchParams.get("triangle"), "1");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["tin", "triangle"]);
  assert.equal(decoderPath(""), "/decoder/");
});

test("every plant page includes the mini decoder and a visible date question", () => {
  const page = readFileSync("src/pages/plants/[code].astro", "utf8");
  const widget = readFileSync("src/components/PlantMiniDecoder.astro", "utf8");
  const decoderPage = readFileSync("src/pages/decoder.astro", "utf8");
  assert.match(page, /<PlantMiniDecoder code=\{plant\.code\} \/>/);
  assert.match(page, /catalog\.plants\.map\(\(plant\) => \(\{ params: \{ code: plant\.slug \} \}\)\)/);
  assert.match(widget, /data-plant-decoder/);
  assert.match(widget, /data-plant-code=\{code\}/);
  assert.match(widget, /Paste your full DOT code/);
  assert.match(widget, /DOT 05H 9T5R 2319/);
  assert.match(widget, /production week/);
  assert.match(widget, /ISO week/);
  assert.match(widget, /action="\/decoder\/"/);
  assert.match(widget, /data-full-decoder/);
  assert.match(widget, /data-output/);
  assert.match(widget, /plantDateFaq/);
  assert.match(widget, /\/guides\/tire-age\//);
  assert.doesNotMatch(`${widget}\n${page}`, /amazon|awin|astroai|affiliate/i);

  assert.match(decoderPage, /id="purchased"/);
  assert.doesNotMatch(decoderPage, /name="purchased"/);
  assert.match(decoderPage, /data-remind="5"/);
  assert.match(decoderPage, /data-remind="6"/);
  assert.match(decoderPage, /data-remind="10"/);
  assert.match(decoderPage, /production week/);
  assert.match(decoderPage, /not an ISO week/);
  assert.match(decoderPage, /age is a range/);
  assert.match(decoderPage, /href="\/guides\/tire-age\/"/);
  assert.match(decoderPage, /Nothing is saved or sent/);

  const fresh = [
    "src/lib/dot-age.js",
    "src/lib/dot-ics.js",
    "src/lib/dot-reading.js",
    "src/lib/plant-date-faq.js",
    "src/lib/decoder-plants.js",
    "src/components/PlantMiniDecoder.astro",
    "src/scripts/plant-decoder.js",
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  const banned = BANNED_AGE_VERDICT.exec(fresh);
  assert.equal(banned?.[0] || "", "");
  assert.doesNotMatch(fresh, /amazon|awin|astroai|affiliate/i);

  assert.ok(catalog.plants.length > 0);
  for (const plant of catalog.plants) {
    const faq = plantDateFaq(plant.code);
    assert.equal(faq.name, `How do I find the date on a tire with plant code ${plant.code}?`);
    assert.match(faq.text, new RegExp(`plant code ${plant.code}`));
    const nodes = plantJsonLd(plant, plantByCode.get(plant.code));
    const faqNode = nodes.find((node) => node["@type"] === "FAQPage");
    assert.equal(faqNode.mainEntity[0].name, faq.name);
    assert.equal(faqNode.mainEntity[0].acceptedAnswer.text, faq.text);
    assert.equal(nodes.at(-1)["@type"], "Article");
    assert.equal(nodes.at(-1).headline, `How to find plant code ${plant.code} on a tire`);
  }
});
