import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog, ratingRows } from "../src/lib/catalog.js";
import { formatNumber, formatVerified, percent } from "../src/lib/format.js";
import { filterGradeRows, flattenGradeRows } from "../src/lib/ratings-table.js";
import { includeInSitemap } from "../src/lib/sitemap.js";
import {
  BANNED_VERDICT,
  CONSUMER_GUIDE_TREADWEAR,
  EXAMPLE_GRADES,
  FOCUS_GRADE,
  MILES_FORMULA,
  TIREWISE_CONTROL,
  TREADWEAR_NUMBERS_PATH,
  bandLabel,
  bandStart,
  mileageFieldNote,
  summarizeTreadwear,
  treadwearNumbersAnswer,
  treadwearNumbersFaqs,
  treadwearNumbersJsonLd,
  treadwearNumbersReport,
  treadwearNumbersText,
} from "../src/lib/treadwear-numbers.js";

const ratings = JSON.parse(readFileSync(new URL("../data/ratings.json", import.meta.url), "utf8"));

function line(name, wears) {
  return {
    brand: "Example",
    line: name,
    url: `/tires/example/${name.toLowerCase()}/`,
    rows: wears.map((wear) => ({
      wear: wear == null ? null : String(wear),
      wearN: wear != null && /^\d+$/.test(String(wear)) ? Number(wear) : null,
      trac: "A",
      temp: "A",
      size: "All",
    })),
  };
}

function fixtureCatalog(lines) {
  return {
    meta: {
      verifiedAt: "2024-05-06T07:08:09.000Z",
      ratings: { source: "https://example.com/ratings", fields: ["id", "brand", "wear", "trac", "temp"] },
    },
    lines,
  };
}

function assertNoFormula(text, where) {
  assert.equal(MILES_FORMULA.test(text) ? text.match(MILES_FORMULA)[0] : "", "", where);
  assert.equal(BANNED_VERDICT.test(text) ? text.match(BANNED_VERDICT)[0] : "", "", where);
}

function independentSummary(rows) {
  const exact = new Map();
  let missing = 0;
  let nonnumeric = 0;
  let numeric = 0;
  for (const row of rows) {
    const wear = row.wear == null || String(row.wear).trim() === "" ? null : String(row.wear).trim();
    if (wear == null) {
      missing += 1;
      continue;
    }
    if (!/^\d+$/.test(wear)) {
      nonnumeric += 1;
      continue;
    }
    numeric += 1;
    const grade = Number(wear);
    exact.set(grade, (exact.get(grade) || 0) + 1);
  }
  return { exact, missing, nonnumeric, numeric };
}

test("band edges stay on hundred-wide groups", () => {
  assert.equal(bandStart(0), 0);
  assert.equal(bandStart(60), 0);
  assert.equal(bandStart(99), 0);
  assert.equal(bandStart(100), 100);
  assert.equal(bandStart(500), 500);
  assert.equal(bandStart(599), 500);
  assert.equal(bandStart(900), 900);
  assert.equal(bandLabel(0), "0–99");
  assert.equal(bandLabel(500), "500–599");
  assert.equal(bandLabel(900), "900–999");
});

test("a fixture counts source rows and leaves a number in another field alone", () => {
  const source = [
    { wear: "60" },
    { wear: "0" },
    { wear: "500" },
    { wear: "500" },
    { wear: "500" },
    { wear: null, temp: "500" },
    { wear: "n/a" },
  ];
  const report = treadwearNumbersReport(source, fixtureCatalog([line("Kept", ["60", "0", "500", "500"])]));
  assert.equal(report.sourceRows, 7);
  assert.equal(report.numeric, 5);
  assert.equal(report.missing, 1);
  assert.equal(report.nonnumeric, 1);
  assert.equal(report.zero, 1);
  assert.equal(report.shownRows, 4);
  const band500 = report.bands.find((band) => band.start === 500);
  const band0 = report.bands.find((band) => band.start === 0);
  assert.equal(band500.count, 3);
  assert.equal(band500.shown, 2);
  assert.equal(band0.count, 2);
  assert.equal(band0.shown, 2);
  assert.equal(report.focus.grade, 500);
  assert.equal(report.focus.exact, 3);
  assert.equal(report.focus.below, 2);
  assert.equal(report.focus.href, "/ratings/?wearMin=500&wearMax=500");
  assert.equal(band500.href, "/ratings/?wearMin=500&wearMax=599");
  const summary = summarizeTreadwear(source);
  assert.equal(summary.exact.get(500), 3);
  assert.equal(summary.exact.has("500"), false);
  const text = treadwearNumbersText(report);
  assert.match(text, /NHTSA lists/);
  assert.match(text, /not a mileage promise/);
  assert.match(text, /treadwear 0/);
  assert.match(text, /no treadwear number/);
  assertNoFormula(text, "fixture copy");
  const answers = treadwearNumbersAnswer(report);
  assert.ok(answers.length >= 1 && answers.length <= 3);
  for (const sentence of answers) assert.match(sentence, /[.!?]$/);
  assert.match(answers.join(" "), new RegExp(formatVerified(report.verifiedAt)));
  const types = treadwearNumbersJsonLd(report).map((node) => node["@type"]);
  assert.deepEqual(types, ["Dataset", "Article", "FAQPage"]);
});

test("an empty pull states that no numeric grade is listed", () => {
  const report = treadwearNumbersReport([], fixtureCatalog([]));
  assert.equal(report.numeric, 0);
  assert.equal(report.sourceRows, 0);
  const answers = treadwearNumbersAnswer(report);
  assert.equal(answers.length, 3);
  assert.match(answers[0], /no numeric treadwear grade/);
  assert.match(answers[2], /not a mileage promise/);
  assertNoFormula(treadwearNumbersText(report), "empty copy");
  assert.equal(mileageFieldNote(["wear", "trac", "temp"]), "The committed ratings fields do not include a mileage or a warranty.");
  assert.equal(mileageFieldNote(["wear", "mileage warranty"]), "The committed ratings fields include mileage warranty.");
});

test("the live histogram matches a recompute of the committed ratings file", () => {
  const report = treadwearNumbersReport(ratingRows, catalog);
  assert.equal(ratingRows.length, ratings.length);
  const expected = independentSummary(ratings);
  assert.equal(report.sourceRows, ratings.length);
  assert.equal(report.numeric, expected.numeric);
  assert.equal(report.missing, expected.missing);
  assert.equal(report.nonnumeric, expected.nonnumeric);
  assert.equal(report.shownRows, catalog.stats.rows);
  let bandRows = 0;
  const flat = flattenGradeRows(catalog);
  for (const band of report.bands) {
    let count = 0;
    for (const [grade, rows] of expected.exact) {
      if (bandStart(grade) === band.start) count += rows;
    }
    assert.equal(band.count, count, band.label);
    assert.equal(band.shown, filterGradeRows(flat, { wearMin: String(band.start), wearMax: String(band.end) }).length, band.label);
    bandRows += band.count;
    assert.equal(band.label, bandLabel(band.start));
    assert.match(band.href, new RegExp(`wearMin=${band.start}`));
    assert.match(band.href, new RegExp(`wearMax=${band.end}`));
  }
  assert.equal(bandRows, report.numeric);
  let signed = report.missing - report.missingShown + (report.nonnumeric - report.nonnumericShown);
  for (const band of report.bands) signed += band.count - band.shown;
  assert.equal(signed, report.sourceRows - report.shownRows);

  for (const grade of EXAMPLE_GRADES) {
    const placement = report.placements.find((item) => item.grade === grade);
    let below = 0;
    let exact = 0;
    for (const [value, rows] of expected.exact) {
      if (value < grade) below += rows;
      if (value === grade) exact += rows;
    }
    assert.equal(placement.exact, exact, String(grade));
    assert.equal(placement.below, below, String(grade));
    assert.equal(placement.exact + placement.below <= report.numeric, true);
  }

  const focus = report.focus;
  assert.equal(focus.grade, FOCUS_GRADE);
  const answers = treadwearNumbersAnswer(report);
  assert.equal(answers.length, 3);
  const answerText = answers.join(" ");
  assert.match(answerText, /NHTSA lists/);
  assert.match(answerText, new RegExp(formatNumber(report.numeric)));
  assert.match(answerText, new RegExp(formatNumber(report.sourceRows)));
  assert.match(answerText, new RegExp(formatNumber(focus.exact)));
  assert.match(answerText, new RegExp(formatNumber(focus.below)));
  assert.match(answerText, new RegExp(percent(focus.below, report.numeric).replace(".", "\\.")));
  assert.match(answerText, new RegExp(formatVerified(catalog.meta.verifiedAt)));
  assert.match(answerText, /not a mileage promise/);
  for (const sentence of answers) assert.match(sentence, /[.!?]$/);
  assertNoFormula(treadwearNumbersText(report), "live copy");

  const nodes = treadwearNumbersJsonLd(report);
  assert.deepEqual(
    nodes.map((node) => node["@type"]),
    ["Dataset", "Article", "FAQPage"],
  );
  assert.equal(nodes[0].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[1].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[0].isBasedOn, catalog.meta.ratings.source);
  assert.doesNotMatch(nodes.map((node) => node["@type"]).join(" "), /Product|Review|AggregateRating/);
  const faqs = treadwearNumbersFaqs(report);
  assert.equal(faqs.length, 4);
  assert.deepEqual(
    nodes[2].mainEntity.map((item) => item.acceptedAnswer.text),
    faqs.map((item) => item.text),
  );
  for (const item of faqs) assertNoFormula(`${item.name} ${item.text}`, item.name);

  const bandLog = report.bands.map((band) => `${band.label}=${band.count}`).join(", ");
  console.log(
    `treadwear source rows ${report.sourceRows}; numeric ${report.numeric}; missing ${report.missing}; shown ${report.shownRows}; 500 exact ${focus.exact}; 500 below ${focus.below}; bands ${bandLog}`,
  );
});

test("the miles pattern catches a formula and the page does not publish one", () => {
  assert.match("rated for 60000 miles", MILES_FORMULA);
  assert.match("miles = treadwear * 200", MILES_FORMULA);
  assert.match("treadwear x 300", MILES_FORMULA);
  assert.doesNotMatch(CONSUMER_GUIDE_TREADWEAR.join(" "), MILES_FORMULA);
  assert.doesNotMatch(TIREWISE_CONTROL.join(" "), MILES_FORMULA);
  const page = readFileSync(new URL("../src/pages/guides/treadwear-numbers.astro", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../src/lib/treadwear-numbers.js", import.meta.url), "utf8");
  assertNoFormula(page, "page source");
  assert.equal(MILES_FORMULA.test(lib) ? lib.match(MILES_FORMULA)[0] : "", "", "library source");
  assert.doesNotMatch(page, /1,140|1,648|1,718|1,879|7,628/);
  assert.doesNotMatch(lib, /1,140|1,648|1,718|1,879|7,628/);
});

test("the treadwear guide stays in the sitemap and quotes the consumer guide", () => {
  assert.equal(existsSync("src/pages/guides/treadwear-numbers.astro"), true);
  assert.equal(TREADWEAR_NUMBERS_PATH, "/guides/treadwear-numbers/");
  assert.equal(includeInSitemap(TREADWEAR_NUMBERS_PATH, new Set()), true);
  assert.equal(includeInSitemap(`https://treadgrade.com${TREADWEAR_NUMBERS_PATH}`, new Set()), true);
  assert.equal(includeInSitemap(TREADWEAR_NUMBERS_PATH, new Set([TREADWEAR_NUMBERS_PATH])), false);
  const page = readFileSync(new URL("../src/pages/guides/treadwear-numbers.astro", import.meta.url), "utf8");
  assert.match(page, /CONSUMER_GUIDE_TREADWEAR/);
  assert.match(page, /TIREWISE_CONTROL/);
  assert.match(page, /id="not-a-mileage-promise"/);
  assert.match(page, /not a mileage promise/);
  assert.match(page, /\/ratings\//);
  assert.match(page, /\/lists\/highest-treadwear\//);
  assert.match(page, /\/compare\//);
  assert.match(page, /\/methodology\//);
  assert.match(page, /\/guides\/utqg-grades\//);
  assert.match(page, /SIZE_VARIANCE_PATH/);
  assert.match(page, /\/guides\/no-utqg-rating\//);
  assert.match(page, /ratingRows/);
  assert.match(page, /<Answer /);
  assert.match(page, /<SourceLine /);
  assert.deepEqual(CONSUMER_GUIDE_TREADWEAR, [
    "The treadwear grade is a comparative rating based on the wear rate of the tire when tested under controlled conditions on a specified government test course.",
    "A tire graded 150 would last one and a half times the distance on the government test course under specified test conditions as one graded 100.",
    "The relative performance of tires depends upon the actual conditions of their use, however, and may depart significantly from the norm due to variations in driving habits, service practices and differences in road characteristics and climate.",
  ]);
  assert.deepEqual(TIREWISE_CONTROL, [
    "A control tire is assigned a grade of 100.",
    "Other tires are compared to the control tire.",
    "For example, a tire grade of 200 should wear twice as long as the control tire.",
  ]);
  for (const file of ["src/pages/guides/index.astro", "src/components/Footer.astro"]) {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /\/guides\/treadwear-numbers\//, file);
  }
  const links = readFileSync(new URL("../scripts/check-links.mjs", import.meta.url), "utf8");
  assert.match(links, /TREADWEAR_NUMBERS_PATH/);
});
