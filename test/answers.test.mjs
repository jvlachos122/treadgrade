import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  brandAnswer,
  brandsIndexAnswer,
  dateGuideAnswer,
  decoderAnswer,
  homeAnswer,
  lineAnswer,
  plantAnswer,
  plantsIndexAnswer,
  ratingsAnswer,
  sourceEntries,
  whoMakesAnswer,
} from "../src/lib/answers.js";
import { buildCatalog } from "../src/lib/normalize.js";
import { nameKey } from "../src/lib/normalize.js";
import { summarizeRecallRows } from "../src/lib/recalls.js";
import { dataset, PUBLIC_DOMAIN_LICENSE } from "../src/lib/structured.js";

const TRACTION = new Set(["AA", "A", "B", "C"]);
const TEMPERATURE = new Set(["A", "B", "C"]);

function row(wear, trac, temp, extra = {}) {
  const wearText = wear == null ? null : String(wear);
  const wearN = wearText != null && /^\d+$/.test(wearText) ? Number(wearText) : null;
  return { wear: wearText, wearN, trac, temp, construction: extra.construction || "Radial" };
}

function assertSentences(sentences, where) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3, `${where}: ${sentences.length} sentences`);
  for (const sentence of sentences) {
    assert.match(sentence, /[.!?]$/, `${where}: ${sentence}`);
    assert.doesNotMatch(sentence, /\bthe best\b/i, sentence);
    if (/\bhighest\b/i.test(sentence)) {
      assert.match(sentence, /in NHTSA's published UTQG list/, sentence);
    }
  }
}

test("a single published grade is stated once", () => {
  const sentences = lineAnswer({
    brand: "Michelin",
    line: "Pilot Sport 4",
    sameName: [],
    rows: [row("320", "AA", "A")],
  });
  assertSentences(sentences, "single");
  const text = sentences.join(" ");
  assert.match(text, /treadwear 320\b/);
  assert.match(text, /traction AA\b/);
  assert.match(text, /temperature A\b/);
  assert.match(text, /one size row/);
  assert.match(text, /does not say whether this tire is still sold/);
});

test("a line with several grades states the range and every usual letter", () => {
  const sentences = lineAnswer({
    brand: "Bridgestone",
    line: "ECOPIA EP150",
    sameName: [],
    rows: [row("200", "A", "A"), row("880", "B", "B")],
  });
  assertSentences(sentences, "range");
  const text = sentences.join(" ");
  assert.match(text, /treadwear from 200 to 880/);
  assert.match(text, /traction grades A and B/);
  assert.match(text, /temperature grades A and B/);
  assert.doesNotMatch(text, /treadwear 200\b/);
  assert.doesNotMatch(text, /treadwear 880\b/);
});

test("invalid grades are quoted and not stated as the grade", () => {
  const swapped = lineAnswer({
    brand: "Bridgestone",
    line: "Turanza EV",
    sameName: [],
    rows: [row(null, "A", "500")],
  });
  const both = lineAnswer({
    brand: "Eldorado",
    line: "Tourmax GFT",
    sameName: [],
    rows: [row("380", "W", "W")],
  });
  const zero = lineAnswer({
    brand: "Toyo",
    line: "PROXES TQ",
    sameName: [],
    rows: [row("0", "A", "A"), row("400", "A", "A")],
  });
  for (const sentences of [swapped, both, zero]) assertSentences(sentences, "invalid");

  const swappedText = swapped.join(" ");
  assert.match(swappedText, /no usable treadwear number/);
  assert.match(swappedText, /traction A\b/);
  assert.match(swappedText, /temperature "500"/);
  assert.doesNotMatch(swappedText, /temperature 500\b/);
  assert.match(swappedText, /not stated above as a grade/);

  const bothText = both.join(" ");
  assert.match(bothText, /treadwear 380\b/);
  assert.match(bothText, /traction "W"/);
  assert.match(bothText, /temperature "W"/);
  assert.doesNotMatch(bothText, /traction W\b/);
  assert.doesNotMatch(bothText, /temperature W\b/);

  const zeroText = zero.join(" ");
  assert.match(zeroText, /treadwear 400\b/);
  assert.match(zeroText, /"0"/);
  assert.doesNotMatch(zeroText, /treadwear 0\b/);
  assert.doesNotMatch(zeroText, /from 0 to 400/);
});

test("a repeated line name is not called a rebadge", () => {
  const text = lineAnswer({
    brand: "Yokohama",
    line: "ADVAN A048",
    sameName: [{ brand: "Visa" }, { brand: "Vitour" }],
    rows: [row("100", "A", "A")],
  }).join(" ");
  assert.match(text, /2 other brand strings/);
  assert.match(text, /not evidence of rebadging/);
});

test("the date-code guide states the week, the year, and the three-digit form", () => {
  const sentences = dateGuideAnswer();
  assertSentences(sentences, "date guide");
  const text = sentences.join(" ");
  assert.match(text, /last four digits/);
  assert.match(text, /first two are the week/);
  assert.match(text, /last two are the year/);
  assert.match(text, /0109/);
  assert.match(text, /January 4, 2009/);
  assert.match(text, /January 10, 2009/);
  assert.match(text, /three digits/);
  assert.match(text, /do not name the decade/);
  assert.doesNotMatch(text, /\bbrand\b/i);
});

test("a plant answer names the registrant and skips the status field", () => {
  const text = plantAnswer({
    code: "1U2",
    name: "Sumitomo Rubber Industries, Ltd. - Shirakawa Plant",
    city: "Shirakawa-shi",
    state: "Fukushima-ken",
    country: "Japan",
    oldCode: "U2",
    oldCodeSharedWith: [],
    status: "Active",
  }).join(" ");
  assert.match(text, /Plant code 1U2 names Sumitomo Rubber Industries, Ltd\. - Shirakawa Plant in Shirakawa-shi, Fukushima-ken, Japan/);
  assert.match(text, /registrant at the time of registration/);
  assert.match(text, /former code U2/);
  assert.doesNotMatch(text, /\bActive\b/);
  assert.doesNotMatch(text, /currently operating/);
  assert.doesNotMatch(text, /\bbrand\b.*\bmakes\b/i);
});

test("recall filings name the filer and do not assign the whole brand", () => {
  const text = brandAnswer(
    { name: "Michelin", lineCount: 2, rowCount: 2 },
    [
      { rows: [row("140", "A", "A")] },
      { rows: [row("840", "AA", "B")] },
    ],
    { rows: [{}, {}, {}], filers: ["Michelin North America, Inc.", "Centropneus SRL"] },
  ).join(" ");
  assert.match(text, /2 tire lines and 2 grade rows/);
  assert.match(text, /from 140 to 840/);
  assert.match(text, /Michelin North America, Inc\. and Centropneus SRL/);
  assert.match(text, /an importer, or the brand owner/);
  assert.match(text, /recalled line only/);
  assert.doesNotMatch(text, /made by/i);
});

test("ratings extremes say highest only inside the published list", () => {
  const catalog = {
    stats: { rows: 3, lines: 2, brands: 1, plants: 1 },
    lines: [
      { rows: [row("30", "A", "A"), row("0", "A", "A")] },
      { rows: [row("900", "AA", "A"), row(null, "A", "500")] },
    ],
    plants: [],
  };
  const text = ratingsAnswer(catalog).join(" ");
  assert.match(text, /3 grade rows across 2 tire lines and 1 brand\b/);
  assert.match(text, /The highest treadwear in NHTSA's published UTQG list is 900/);
  assert.match(text, /lowest reported treadwear is 30/);
  assert.match(text, /leaving out rows without a usable treadwear number/);
  assert.doesNotMatch(text, /highest tire/i);
  assert.doesNotMatch(text, /\bthe best\b/i);
  assert.doesNotMatch(text, /treadwear is 0\b/);
  const home = homeAnswer(catalog).join(" ");
  assert.match(home, /The highest treadwear in NHTSA's published UTQG list is 900/);
});

test("source lines keep the recall date separate from the ratings date", () => {
  const meta = {
    verifiedAt: "2026-10-21T14:29:03.370Z",
    recalls: { retrievedAt: "2026-10-23T07:22:28.532Z" },
  };
  const sameDay = sourceEntries(meta, ["ratings", "plants"]);
  assert.equal(sameDay.length, 1);
  assert.equal(sameDay[0].name, "UTQG tire ratings and equipment plant codes");
  assert.equal(sameDay[0].updated, meta.verifiedAt);
  const both = sourceEntries(meta, ["ratings", "recalls"]);
  assert.equal(both.length, 2);
  assert.equal(both[1].name, "tire-recall file");
  assert.equal(both[1].updated, meta.recalls.retrievedAt);
});

test("dataset markup credits NHTSA and omits review types", () => {
  const entry = dataset({
    name: "Example",
    description: "Desc",
    path: "/ratings/",
    dateModified: "2026-10-21T14:29:03.370Z",
    isBasedOn: "https://api.nhtsa.gov/tires?dataSet=ratings",
  });
  assert.equal(entry["@type"], "Dataset");
  assert.equal(entry.creator.alternateName, "NHTSA");
  assert.match(entry.creator.name, /National Highway Traffic Safety Administration/);
  assert.equal(entry.license, PUBLIC_DOMAIN_LICENSE);
  assert.equal(entry.url, "https://treadgrade.com/ratings/");
  assert.equal(entry.publisher.name, "TreadGrade");
  const blob = JSON.stringify(entry);
  assert.equal(blob.includes("AggregateRating"), false);
  assert.equal(blob.includes('"Product"'), false);
  assert.equal(blob.includes('"Review"'), false);
});

test("committed files produce answer boxes that follow the grade rules", () => {
  const catalog = buildCatalog(
    JSON.parse(readFileSync("data/ratings.json", "utf8")),
    JSON.parse(readFileSync("data/plants.json", "utf8")),
    JSON.parse(readFileSync("data/meta.json", "utf8")),
  );
  const summary = summarizeRecallRows(JSON.parse(readFileSync("data/recalls.json", "utf8")));

  for (const line of catalog.lines) {
    const sentences = lineAnswer(line);
    assertSentences(sentences, line.url);
    const text = sentences.join(" ");
    const validWear = line.rows.map((item) => item.wearN).filter((value) => value > 0);
    if (validWear.length) {
      const min = Math.min(...validWear);
      const max = Math.max(...validWear);
      if (min === max) assert.match(text, new RegExp(`treadwear ${min}\\b`), line.url);
      else assert.match(text, new RegExp(`treadwear from ${min} to ${max}\\b`), line.url);
    }
    const trac = [...TRACTION].filter((grade) => line.rows.some((item) => item.trac === grade));
    const temp = [...TEMPERATURE].filter((grade) => line.rows.some((item) => item.temp === grade));
    if (trac.length > 1) assert.match(text, /traction grades/, line.url);
    else if (trac.length === 1) assert.match(text, new RegExp(`traction ${trac[0]}\\b`), line.url);
    if (temp.length > 1) assert.match(text, /temperature grades/, line.url);
    else if (temp.length === 1) assert.match(text, new RegExp(`temperature ${temp[0]}\\b`), line.url);
    for (const item of line.rows) {
      if (item.temp && !TEMPERATURE.has(item.temp)) {
        assert.ok(text.includes(`"${item.temp}"`), line.url);
        assert.equal(text.includes(`temperature ${item.temp}`), false, line.url);
      }
      if (item.trac && !TRACTION.has(item.trac)) {
        assert.ok(text.includes(`"${item.trac}"`), line.url);
        assert.equal(text.includes(`traction ${item.trac}`), false, line.url);
      }
      if (item.wearN === 0) {
        assert.ok(text.includes('"0"'), line.url);
        assert.doesNotMatch(text, /treadwear 0\b/, line.url);
      }
    }
  }

  for (const brand of catalog.brands) {
    const filings = summary.byBrand.get(nameKey(brand.name)) || null;
    const sentences = brandAnswer(brand, catalog.getBrandLines(brand.slug), filings);
    assertSentences(sentences, brand.url);
    assert.doesNotMatch(sentences.join(" "), /made by/i, brand.url);
  }

  for (const plant of catalog.plants) {
    const sentences = plantAnswer(plant);
    assertSentences(sentences, plant.url);
    const text = sentences.join(" ");
    assert.ok(text.includes(`Plant code ${plant.code} `), plant.url);
    assert.ok(text.includes(plant.name), plant.url);
    assert.match(text, /registrant at the time of registration/, plant.url);
    assert.doesNotMatch(text, /currently operating/, plant.url);
    if (plant.status && ![plant.name, plant.city, plant.state, plant.country].some((part) => part && part.includes(plant.status))) {
      assert.equal(text.includes(plant.status), false, plant.url);
    }
  }

  assertSentences(ratingsAnswer(catalog), "ratings");
  assertSentences(brandsIndexAnswer(catalog), "brands");
  assertSentences(plantsIndexAnswer(catalog), "plants");
  assertSentences(decoderAnswer(catalog), "decoder");
  assertSentences(dateGuideAnswer(), "date guide");
  assertSentences(homeAnswer(catalog), "home");
  assertSentences(whoMakesAnswer(summary), "recalls");
  const recalls = whoMakesAnswer(summary).join(" ");
  assert.match(recalls, new RegExp(`\\b${summary.campaigns} tire campaigns`));
  assert.match(recalls, new RegExp(`\\b${summary.brandsWithDifferentFiler} of those brand strings`));
  assert.match(recalls, /importer, or the brand owner/);
});
