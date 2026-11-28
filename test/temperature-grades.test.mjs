import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalog } from "../src/lib/catalog.js";
import { formatNumber, formatVerified } from "../src/lib/format.js";
import { USUAL_TEMPERATURE } from "../src/lib/grade-quality.js";
import { ratingsTableHref } from "../src/lib/ratings-table.js";
import { includeInSitemap, STATIC_INDEXABLE_PATHS } from "../src/lib/sitemap.js";
import {
  BANNED_TEMPERATURE_WORD,
  ECFR_RETRIEVED,
  ECFR_TEMPERATURE_URL,
  FIGURE_2_TEMPERATURE,
  FIGURE_2_TEMPERATURE_WARNING,
  GRADE_C_STANDARD_QUOTE,
  INDOOR_WHEEL_QUOTE,
  SPEED_STAGE_QUOTE,
  TEMPERATURE_GRADES_HREF,
  TEMPERATURE_GRADES_ID,
  TEMPERATURE_INTRO_QUOTE,
  TEMPERATURE_LETTERS,
  TEMPERATURE_RULES,
  TEST_WHEEL_QUOTE,
  UTQG_GRADES_PATH,
  cLineCaption,
  distributionCaption,
  ecfrRetrievedLabel,
  invalidCaption,
  temperatureCountsParagraph,
  temperatureGradesAnswer,
  temperatureGradesData,
  temperatureGradesReport,
  temperatureGradesText,
  temperatureLetter,
  temperatureQualityNote,
  temperatureShare,
  thresholdCaption,
} from "../src/lib/temperature-grades.js";

const EXPECTED_STATIC_PATHS = [
  "/",
  "/about/",
  "/affiliate-disclosure/",
  "/brands/",
  "/compare/",
  "/contact/",
  "/decoder/",
  "/guides/",
  "/guides/dot-code/",
  "/guides/no-utqg-rating/",
  "/guides/rebadged-tires/",
  "/guides/tire-age/",
  "/guides/tire-date-code/",
  "/guides/tire-pressure-and-roadside-kit/",
  "/guides/traction-grades/",
  "/guides/treadwear-numbers/",
  "/guides/treadwear-varies-by-size/",
  "/guides/treadwear-vs-traction/",
  "/guides/utqg-grades/",
  "/lists/highest-treadwear/",
  "/lists/long-treadwear-high-traction/",
  "/methodology/",
  "/methodology/known-errors/",
  "/plants/",
  "/privacy/",
  "/ratings/",
  "/recalls/",
  "/who-makes-it/",
];

function assertNoVerdict(text, where) {
  assert.equal(BANNED_TEMPERATURE_WORD.test(text) ? text.match(BANNED_TEMPERATURE_WORD)[0] : "", "", where);
}

function assertAnswerShape(sentences, where) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3, `${where}: ${sentences.length} sentences`);
  for (const sentence of sentences) assert.match(sentence, /[.!?]$/, `${where}: ${sentence}`);
}

function fixtureCatalog(lines) {
  return {
    meta: { verifiedAt: "2024-05-06T07:08:09.000Z" },
    lines,
  };
}

function row(temp) {
  return { temp };
}

test("a fixture counts grade rows, tire lines, C lines, and invalid temperatures", () => {
  const report = temperatureGradesReport(
    fixtureCatalog([
      {
        brand: "Example",
        line: "One",
        url: "/tires/example/one/",
        rows: [row("A"), row("A"), row("B")],
      },
      {
        brand: "Example",
        line: "Two",
        url: "/tires/example/two/",
        rows: [row("C"), row("C"), row("AA")],
      },
      {
        brand: "Other",
        line: "Three",
        url: "/tires/other/three/",
        rows: [row("500"), row("W"), row("W")],
      },
      {
        brand: "Plain",
        line: "Four",
        url: "/tires/plain/four/",
        rows: [row("C")],
      },
    ]),
  );
  assert.equal(report.gradeRows, 10);
  assert.equal(report.grades.find((grade) => grade.id === "A").rows, 2);
  assert.equal(report.grades.find((grade) => grade.id === "A").lines, 1);
  assert.equal(report.grades.find((grade) => grade.id === "B").rows, 1);
  assert.equal(report.grades.find((grade) => grade.id === "C").rows, 3);
  assert.equal(report.grades.find((grade) => grade.id === "C").lines, 2);
  assert.equal(report.grades.find((grade) => grade.id === "outside").rows, 4);
  assert.equal(report.grades.find((grade) => grade.id === "outside").lines, 2);
  assert.deepEqual(
    report.cLines.map((line) => [line.url, line.cRows, line.otherText]),
    [
      ["/tires/example/two/", 2, '"AA"'],
      ["/tires/plain/four/", 1, "C only"],
    ],
  );
  assert.deepEqual(report.cLines[0].invalid, ["AA"]);
  assert.deepEqual(
    report.invalidRows.map((item) => [item.value, item.url, item.rows]),
    [
      ["500", "/tires/other/three/", 1],
      ["AA", "/tires/example/two/", 1],
      ["W", "/tires/other/three/", 2],
    ],
  );
  const note = temperatureQualityNote(report);
  assert.match(note, /"500"/);
  assert.match(note, /"AA"/);
  assert.match(note, /"W"/);
  assert.match(note, /not stated as a temperature grade/);
  assertNoVerdict(temperatureGradesText(report), "fixture copy");
  const answers = temperatureGradesAnswer();
  assertAnswerShape(answers, "fixture");
  assert.match(answers.join(" "), /500 rpm/);
  assert.match(answers.join(" "), /575 rpm/);
  assert.match(answers.join(" "), /Federal Motor Safety Standard No\. 109/);
  assert.doesNotMatch(answers.join(" "), /139/);
  assert.equal(temperatureLetter("A"), "A");
  assert.equal(temperatureLetter("AA"), "outside");
  assert.equal(temperatureLetter("500"), "outside");
  assert.equal(temperatureLetter(null), "outside");
});

test("an empty pull states that every grade uses A, B, or C and still explains the letters", () => {
  const report = temperatureGradesReport(fixtureCatalog([]));
  assert.equal(report.gradeRows, 0);
  assert.equal(report.cLines.length, 0);
  assert.equal(report.invalidRows.length, 0);
  assert.equal(temperatureQualityNote(report), "Every grade row in this pull uses temperature A, B, or C.");
  assertAnswerShape(temperatureGradesAnswer(), "empty");
  assert.match(temperatureCountsParagraph(report), /0 grade rows/);
  assertNoVerdict(temperatureGradesText(report), "empty copy");
  assert.equal(temperatureShare(report, report.grades[0]), "0%");
});

test("the live temperature counts match a recompute of the committed catalog", () => {
  const report = temperatureGradesReport(catalog);
  const expected = { A: 0, B: 0, C: 0, outside: 0 };
  const lines = { A: new Set(), B: new Set(), C: new Set(), outside: new Set() };
  const cLines = [];
  const invalid = new Map();
  for (const line of catalog.lines) {
    const seen = new Set();
    let cRows = 0;
    for (const row of line.rows) {
      const id = USUAL_TEMPERATURE.includes(row.temp) ? row.temp : "outside";
      expected[id] += 1;
      seen.add(id);
      if (id === "C") cRows += 1;
      if (id === "outside") {
        const value = row.temp == null ? "" : String(row.temp);
        const key = `${value}\n${line.url}`;
        invalid.set(key, (invalid.get(key) || 0) + 1);
      }
    }
    for (const id of seen) lines[id].add(line.url);
    if (cRows) cLines.push({ url: line.url, cRows });
  }
  let rowSum = 0;
  for (const grade of report.grades) {
    assert.equal(grade.rows, expected[grade.id], grade.id);
    assert.equal(grade.lines, lines[grade.id].size, grade.id);
    assert.equal(grade.rows, catalog.stats.temperature[grade.id === "outside" ? "other" : grade.id], grade.id);
    rowSum += grade.rows;
    if (grade.id === "outside") assert.equal(grade.href, "");
    else assert.equal(grade.href, ratingsTableHref({ temp: [grade.id] }));
    assert.equal(temperatureShare(report, grade), `${((grade.rows / report.gradeRows) * 100).toFixed(1)}%`);
  }
  assert.equal(rowSum, catalog.stats.rows);
  assert.equal(report.gradeRows, catalog.stats.rows);
  assert.equal(report.lineCount, catalog.lines.length);
  assert.deepEqual(
    report.cLines.map((line) => [line.url, line.cRows]),
    cLines.map((line) => [line.url, line.cRows]),
  );
  for (const line of report.cLines) {
    assert.equal(catalog.lines.some((item) => item.url === line.url), true, line.url);
    const source = catalog.lines.find((item) => item.url === line.url);
    const cRows = source.rows.filter((row) => row.temp === "C").length;
    assert.equal(line.cRows, cRows, line.url);
    const others = [];
    const invalidValues = [];
    for (const row of source.rows) {
      if (row.temp === "C") continue;
      if (USUAL_TEMPERATURE.includes(row.temp)) {
        if (!others.includes(row.temp)) others.push(row.temp);
      } else {
        const value = row.temp == null ? "" : String(row.temp);
        if (!invalidValues.includes(value)) invalidValues.push(value);
      }
    }
    const usual = ["A", "B"].filter((letter) => others.includes(letter));
    invalidValues.sort((a, b) => a.localeCompare(b, "en"));
    const parts = [...usual, ...invalidValues.map((value) => `"${value}"`)];
    assert.equal(line.otherText, parts.length ? parts.join(", ") : "C only", line.url);
  }
  assert.equal(report.invalidRows.length, invalid.size);
  for (const row of report.invalidRows) {
    assert.equal(invalid.get(`${row.value}\n${row.url}`), row.rows, `${row.value} ${row.url}`);
    assert.equal(USUAL_TEMPERATURE.includes(row.value), false, row.value);
    assert.equal(catalog.lines.some((item) => item.url === row.url), true, row.url);
  }
  const note = temperatureQualityNote(report);
  const values = [...new Set(report.invalidRows.map((row) => row.value))];
  assert.ok(values.length > 0, "this pull has temperature values outside A, B, and C");
  for (const value of values) assert.match(note, new RegExp(`"${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(note, /not stated as a temperature grade/);
  assert.match(note, /stays in the ratings table/);

  const answers = temperatureGradesAnswer();
  assertAnswerShape(answers, "live");
  assert.equal(answers.length, 3);
  const answerText = answers.join(" ");
  assert.match(answerText, /indoor laboratory test wheel/);
  assert.match(answerText, /shall be graded C if it fails to complete the 500 rpm/);
  assert.match(answerText, /may be graded B only if it successfully completes that 500 rpm/);
  assert.match(answerText, /may be graded A only if it successfully completes the 575 rpm/);
  assert.match(answerText, /Federal Motor Safety Standard No\. 109/);
  assert.doesNotMatch(answerText, /139/);
  const counts = temperatureCountsParagraph(report);
  assert.match(counts, new RegExp(formatVerified(catalog.meta.verifiedAt)));
  for (const grade of report.grades) {
    if (grade.id === "outside") continue;
    assert.match(counts, new RegExp(`${grade.id} is ${formatNumber(grade.rows).replace(/,/g, "\\,")}`));
  }
  assertNoVerdict(temperatureGradesText(report), "live copy");
  const packed = temperatureGradesData(catalog);
  assert.equal(JSON.stringify(packed).includes(catalog.meta.verifiedAt), false);
  assert.equal(packed.cLines.length, report.cLines.length);
  assert.equal(packed.invalid.length, report.invalidRows.length);

  const lib = readFileSync(new URL("../src/lib/temperature-grades.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/guides/utqg-grades.astro", import.meta.url), "utf8");
  const keptOut = [500, 575, 375, 25, 30, 67];
  for (const count of [report.gradeRows, ...report.grades.flatMap((grade) => [grade.rows, grade.lines]), report.cLines.length]) {
    if (count < 20 || keptOut.includes(count)) continue;
    const formatted = formatNumber(count).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.doesNotMatch(lib, new RegExp(`\\b${count}\\b`), `lib hard-codes ${count}`);
    assert.doesNotMatch(page, new RegExp(`\\b${count}\\b`), `page hard-codes ${count}`);
    assert.doesNotMatch(lib, new RegExp(formatted), `lib hard-codes ${formatted}`);
    assert.doesNotMatch(page, new RegExp(formatted), `page hard-codes ${formatted}`);
  }

  const gradeLog = report.grades.map((grade) => `${grade.id}=${grade.rows} rows/${grade.lines} lines`).join(", ");
  console.log(
    `temperature grade rows ${report.gradeRows}; lines ${report.lineCount}; C lines ${report.cLines.length}; invalid rows ${report.invalidRows.length}; ${gradeLog}`,
  );
});

test("regulation quotes keep the retrieved eCFR wording", () => {
  assert.match(ECFR_RETRIEVED, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(ecfrRetrievedLabel(), ecfrRetrievedLabel(ECFR_RETRIEVED));
  assert.equal(ECFR_TEMPERATURE_URL, "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-575/section-575.104");
  const byId = Object.fromEntries(TEMPERATURE_RULES.map((rule) => [rule.id, rule]));
  assert.match(byId.C.quote, /shall be graded C if it fails to complete the 500 rpm test stage/);
  assert.match(byId.B.quote, /may be graded B only if it successfully completes the 500 rpm test stage/);
  assert.match(byId.A.quote, /may be graded A only if it successfully completes the 575 rpm test stage/);
  assert.equal(byId.C.paragraph, "(d)(2)(iii)(A)");
  assert.equal(byId.A.paragraph, "(d)(2)(iii)(C)");
  assert.match(TEST_WHEEL_QUOTE, /flat-faced steel test wheel that is 67\.23 inches in diameter/);
  assert.match(SPEED_STAGE_QUOTE, /375 rpm for 30 minutes/);
  assert.match(SPEED_STAGE_QUOTE, /25 rpm increments/);
  assert.match(SPEED_STAGE_QUOTE, /575 rpm for 30 minutes/);
  assert.match(INDOOR_WHEEL_QUOTE, /specified indoor laboratory test wheel/);
  assert.match(GRADE_C_STANDARD_QUOTE, /Federal Motor Safety Standard No\. 109/);
  assert.doesNotMatch(FIGURE_2_TEMPERATURE, /Federal Motor Vehicle Safety Standard/);
  assert.doesNotMatch(FIGURE_2_TEMPERATURE, /No\. 139/);
  assert.match(FIGURE_2_TEMPERATURE, /Federal Motor Safety Standard No\. 109/);
  assert.match(FIGURE_2_TEMPERATURE_WARNING, /properly inflated and not overloaded/);
  assert.match(TEMPERATURE_INTRO_QUOTE, /§ 571\.109/);
  assert.match(thresholdCaption(), /Paragraph \(A\) is grade C/);
  assert.match(distributionCaption({ verifiedAt: "2024-05-06T00:00:00.000Z", gradeRows: 1 }), /exact duplicate grade rows/);
  assert.match(cLineCaption({ verifiedAt: "2024-05-06T00:00:00.000Z" }), /at least one temperature C/);
  assert.match(invalidCaption({ verifiedAt: "2024-05-06T00:00:00.000Z" }), /quoted/);
  assert.deepEqual(TEMPERATURE_LETTERS, ["A", "B", "C"]);
  assertNoVerdict(
    [
      FIGURE_2_TEMPERATURE,
      FIGURE_2_TEMPERATURE_WARNING,
      TEMPERATURE_INTRO_QUOTE,
      TEST_WHEEL_QUOTE,
      SPEED_STAGE_QUOTE,
      ...TEMPERATURE_RULES.map((rule) => rule.quote),
      thresholdCaption(),
    ].join(" "),
    "quotes",
  );
});

test("the temperature section is an anchor on the existing guide, and sitemap membership is unchanged", () => {
  assert.equal(TEMPERATURE_GRADES_HREF, `${UTQG_GRADES_PATH}#${TEMPERATURE_GRADES_ID}`);
  assert.equal(UTQG_GRADES_PATH, "/guides/utqg-grades/");
  const page = readFileSync(new URL("../src/pages/guides/utqg-grades.astro", import.meta.url), "utf8");
  const traction = readFileSync(new URL("../src/pages/guides/traction-grades.astro", import.meta.url), "utf8");
  assert.match(page, /<h2 id=\{TEMPERATURE_GRADES_ID\}>Temperature grades A, B and C explained<\/h2>/);
  assert.match(page, /temperatureGradesAnswer/);
  assert.match(page, /temperatureReport\.grades\.map/);
  assert.match(page, /temperatureReport\.cLines\.map/);
  assert.match(page, /temperatureReport\.invalidRows\.map/);
  assert.match(page, /FIGURE_2_TEMPERATURE/);
  assert.doesNotMatch(page, /Federal Motor Vehicle Safety Standard/);
  assert.doesNotMatch(page, /FAQPage/);
  const start = page.indexOf("id={TEMPERATURE_GRADES_ID}");
  assert.ok(start > 0);
  const end = page.indexOf("<h2", start + 1);
  const section = page.slice(start, end);
  assert.match(section, /TRACTION_GRADES_PATH/);
  assert.match(section, /TREADWEAR_NUMBERS_PATH/);
  assert.match(section, /TREADWEAR_VS_TRACTION_PATH/);
  assert.match(section, /RATINGS_PATH/);
  assert.match(section, /METHODOLOGY_PATH/);
  assert.match(section, /KNOWN_ERRORS_INVALID_HREF/);
  assert.match(section, /temperature-data-quality/);
  assertNoVerdict(section, "section source");
  assert.equal(traction.split("TEMPERATURE_GRADES_HREF").length - 1, 2);
  assertNoVerdict(traction.split("\n").find((line) => line.includes("TEMPERATURE_GRADES_HREF") && line.includes("href")), "traction link");

  assert.deepEqual(STATIC_INDEXABLE_PATHS, EXPECTED_STATIC_PATHS);
  assert.equal(STATIC_INDEXABLE_PATHS.filter((path) => path === UTQG_GRADES_PATH).length, 1);
  assert.equal(STATIC_INDEXABLE_PATHS.some((path) => path.includes("temperature")), false);
  assert.equal(includeInSitemap(UTQG_GRADES_PATH, new Set()), true);
});
