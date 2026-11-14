import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { formatTreadwearMedian, treadwearMedian } from "../src/lib/answers.js";
import { catalog, ratingRows } from "../src/lib/catalog.js";
import { formatNumber, formatVerified, percent } from "../src/lib/format.js";
import { nameKey } from "../src/lib/normalize.js";
import { flattenGradeRows, ratingsTableHref } from "../src/lib/ratings-table.js";
import { includeInSitemap, STATIC_INDEXABLE_PATHS } from "../src/lib/sitemap.js";
import { bandLabel, bandStart } from "../src/lib/treadwear-numbers.js";
import {
  BANNED_VERDICT,
  ECFR_RETRIEVED,
  ECFR_TRACTION_URL,
  FIGURE_2_TRACTION,
  FR_PEAK_TRACTION,
  FR_RETRIEVED,
  FR_TRACTION_URL,
  LOCKED_WHEEL_QUOTE,
  TRACTION_GRADES_PATH,
  TRACTION_LETTERS,
  TRACTION_RULES,
  WETTING_QUOTE,
  ecfrRetrievedLabel,
  frRetrievedLabel,
  tractionGradesAnswer,
  tractionGradesFaqs,
  tractionGradesJsonLd,
  tractionGradesReport,
  tractionGradesText,
  tractionLetter,
} from "../src/lib/traction-grades.js";

const ratings = JSON.parse(readFileSync(new URL("../data/ratings.json", import.meta.url), "utf8"));

function assertNoVerdict(text, where) {
  assert.equal(BANNED_VERDICT.test(text) ? text.match(BANNED_VERDICT)[0] : "", "", where);
}

function assertAnswerShape(sentences, where) {
  assert.ok(sentences.length >= 1 && sentences.length <= 3, `${where}: ${sentences.length} sentences`);
  for (const sentence of sentences) assert.match(sentence, /[.!?]$/, `${where}: ${sentence}`);
}

function fixtureCatalog(lines) {
  return {
    meta: {
      verifiedAt: "2024-05-06T07:08:09.000Z",
      ratings: { source: "https://example.com/ratings", fields: ["id", "brand", "trac", "wear"] },
    },
    lines,
  };
}

function keptRow(trac, wear, size = "All") {
  const text = wear == null ? null : String(wear);
  return {
    trac,
    wear: text,
    wearN: text != null && /^\d+$/.test(text) ? Number(text) : null,
    temp: "A",
    size,
  };
}

test("a fixture counts source rows, lines, medians, and a watched B line", () => {
  const source = [
    { id: 1, trac: "AA", wear: "100", brand: "Example", tireline: "One" },
    { id: 2, trac: "AA", wear: "300", brand: "Example", tireline: "One" },
    { id: 3, trac: "AA", wear: "500", brand: "Example", tireline: "One" },
    { id: 4, trac: "A", wear: "0", brand: "Example", tireline: "Two" },
    { id: 5, trac: "B", wear: null, brand: "Example", tireline: "Two" },
    { id: 6, trac: "W", wear: "380", brand: "Other", tireline: "Loose" },
    { id: 7, trac: "B", wear: "560", brand: "Michelin", tireline: "CrossClimate2", temp: "A", size: "255/45R20 105W" },
    { id: 8, trac: "B", wear: "640", brand: "Michelin", tireline: "CrossClimate2", temp: "A", size: "All except" },
  ];
  const report = tractionGradesReport(
    source,
    fixtureCatalog([
      {
        brand: "Example",
        line: "One",
        url: "/tires/example/one/",
        sourceIds: [1, 2, 3],
        rows: [keptRow("AA", "100"), keptRow("AA", "300")],
      },
      {
        brand: "Example",
        line: "Two",
        url: "/tires/example/two/",
        sourceIds: [4, 5],
        rows: [keptRow("A", "0"), keptRow("B", null)],
      },
      {
        brand: "Michelin",
        line: "CrossClimate2",
        url: "/tires/michelin/crossclimate2/",
        sourceIds: [7, 8],
        rows: [keptRow("B", "560", "255/45R20 105W"), keptRow("B", "640", "All except")],
      },
    ]),
  );
  assert.equal(report.sourceRows, 8);
  assert.equal(report.unmapped, 1);
  assert.equal(report.grades.find((grade) => grade.id === "AA").rows, 3);
  assert.equal(report.grades.find((grade) => grade.id === "AA").shown, 2);
  assert.equal(report.grades.find((grade) => grade.id === "A").rows, 1);
  assert.equal(report.grades.find((grade) => grade.id === "B").rows, 3);
  assert.equal(report.grades.find((grade) => grade.id === "C").rows, 0);
  assert.equal(report.grades.find((grade) => grade.id === "outside").rows, 1);
  assert.equal(report.aaLines, 1);
  assert.equal(report.mixedLines, 1);
  assert.equal(report.grades.find((grade) => grade.id === "AA").linesOnly, 1);
  assert.equal(report.grades.find((grade) => grade.id === "AA").medianText, "300");
  assert.equal(report.grades.find((grade) => grade.id === "A").medianValue, null);
  assert.equal(report.outsideRows[0].trac, "W");
  assert.equal(report.outsideRows[0].url, "");
  const band0 = report.bands.find((band) => band.start === 0);
  assert.equal(band0.counts.A, 1);
  assert.equal(band0.counts.AA, 0);
  assert.equal(report.watched.length, 1);
  assert.equal(report.watched[0].only, "B");
  assert.equal(report.watched[0].url, "/tires/michelin/crossclimate2/");
  const text = tractionGradesText(report);
  assert.match(text, /assigned by the manufacturer/);
  assert.match(text, /not a mileage promise|locked-wheel|does not include acceleration/);
  assert.match(text, /CrossClimate2/);
  assert.match(text, /traction B/);
  assert.match(text, new RegExp(ecfrRetrievedLabel()));
  assert.match(text, new RegExp(frRetrievedLabel()));
  assertNoVerdict(text, "fixture copy");
  assert.doesNotMatch(text, /all-weather|all weather/i);
  const answers = tractionGradesAnswer(report);
  assertAnswerShape(answers, "fixture");
  assert.match(answers.join(" "), /1 tire line has at least one AA row/);
  const faqs = tractionGradesFaqs(report);
  assert.equal(faqs.length, 4);
  assert.match(faqs[2].name, /Why does Michelin CrossClimate2 list traction B/);
  assert.match(faqs[2].text, /size rows/);
  const types = tractionGradesJsonLd(report).map((node) => node["@type"]);
  assert.deepEqual(types, ["Dataset", "Article", "FAQPage"]);
  assert.equal(tractionLetter(" AA "), "AA");
  assert.equal(tractionLetter("W"), "outside");
  assert.equal(tractionLetter(""), "outside");
});

test("an empty pull states that no source row is listed", () => {
  const report = tractionGradesReport([], fixtureCatalog([]));
  assert.equal(report.sourceRows, 0);
  assert.equal(report.aaLines, 0);
  assert.equal(report.bands.length, 0);
  assert.equal(report.watched.length, 0);
  const answers = tractionGradesAnswer(report);
  assertAnswerShape(answers, "empty");
  assert.match(answers[2], /no source rows/);
  assertNoVerdict(tractionGradesText(report), "empty copy");
  assert.equal(tractionGradesFaqs(report).length, 3);
});

test("the live traction counts match a recompute of the committed ratings file", () => {
  const report = tractionGradesReport(ratingRows, catalog);
  assert.equal(ratingRows.length, ratings.length);
  assert.equal(report.sourceRows, ratings.length);
  const expected = { AA: 0, A: 0, B: 0, C: 0, outside: 0 };
  const byId = new Map();
  for (const line of catalog.lines) {
    for (const id of line.sourceIds) byId.set(id, line.url);
  }
  const lineLetters = new Map();
  const wears = { AA: [], A: [], B: [], C: [], outside: [] };
  const bands = new Map();
  const aaLines = new Set();
  let unmapped = 0;
  for (const row of ratings) {
    const trac = row.trac == null ? "" : String(row.trac).trim();
    const id = TRACTION_LETTERS.includes(trac) ? trac : "outside";
    expected[id] += 1;
    const url = byId.get(row.id);
    if (!url) unmapped += 1;
    else {
      if (!lineLetters.has(url)) lineLetters.set(url, new Set());
      lineLetters.get(url).add(id);
      if (id === "AA") aaLines.add(url);
    }
    const wear = row.wear == null ? "" : String(row.wear).trim();
    if (/^\d+$/.test(wear)) {
      const value = Number(wear);
      if (value > 0) wears[id].push(value);
      const start = bandStart(value);
      if (!bands.has(start)) bands.set(start, { AA: 0, A: 0, B: 0, C: 0, outside: 0 });
      bands.get(start)[id] += 1;
    }
  }
  let rowSum = 0;
  let onlySum = 0;
  const flat = flattenGradeRows(catalog);
  for (const grade of report.grades) {
    assert.equal(grade.rows, expected[grade.id], grade.id);
    rowSum += grade.rows;
    onlySum += grade.linesOnly;
    const positive = wears[grade.id];
    assert.equal(grade.medianValue, treadwearMedian(positive), grade.id);
    assert.equal(grade.medianText, formatTreadwearMedian(treadwearMedian(positive)), grade.id);
    assert.equal(grade.medianRows, positive.length, grade.id);
    if (grade.id === "outside") assert.equal(grade.href, "");
    else {
      assert.equal(grade.href, ratingsTableHref({ traction: [grade.id] }));
      const shown = flat.filter((row) => (TRACTION_LETTERS.includes(String(row.trac).trim()) ? row.trac : "outside") === grade.id).length;
      assert.equal(grade.shown, shown, grade.id);
    }
    assert.equal(percent(grade.rows, report.sourceRows).endsWith("%"), true);
  }
  assert.equal(rowSum, ratings.length);
  assert.equal(report.unmapped, unmapped);
  assert.equal(report.aaLines, aaLines.size);
  let mixed = 0;
  for (const letters of lineLetters.values()) {
    if (letters.size > 1) mixed += 1;
    for (const id of letters) {
      // counted below
      void id;
    }
  }
  for (const id of [...TRACTION_LETTERS, "outside"]) {
    let atLeast = 0;
    let only = 0;
    for (const letters of lineLetters.values()) {
      if (letters.has(id)) atLeast += 1;
      if (letters.size === 1 && letters.has(id)) only += 1;
    }
    const grade = report.grades.find((item) => item.id === id);
    assert.equal(grade.linesAtLeast, atLeast, id);
    assert.equal(grade.linesOnly, only, id);
  }
  assert.equal(report.mixedLines, mixed);
  assert.equal(onlySum + report.mixedLines, lineLetters.size);
  assert.equal(report.lineCount, catalog.lines.length);
  assert.equal(lineLetters.size, catalog.lines.length);
  let bandRows = 0;
  for (const band of report.bands) {
    const counts = bands.get(band.start) || { AA: 0, A: 0, B: 0, C: 0, outside: 0 };
    for (const id of [...TRACTION_LETTERS, "outside"]) assert.equal(band.counts[id], counts[id], `${band.label} ${id}`);
    assert.equal(band.label, bandLabel(band.start));
    assert.equal(band.href, ratingsTableHref({ wearMin: String(band.start), wearMax: String(band.end) }));
    bandRows += band.total;
  }
  const numeric = [...bands.values()].reduce((sum, counts) => sum + Object.values(counts).reduce((inner, value) => inner + value, 0), 0);
  assert.equal(bandRows, numeric);

  const watched = catalog.lines.filter(
    (line) => nameKey(line.brand) === nameKey("Michelin") && nameKey(line.line) === nameKey("CrossClimate2"),
  );
  assert.equal(watched.length, report.watched.length);
  for (const item of report.watched) {
    assert.ok(catalog.lines.some((line) => line.url === item.url), item.url);
    const source = watched.find((line) => line.url === item.url);
    const letters = [];
    for (const row of source.rows) {
      const trac = row.trac == null || String(row.trac).trim() === "" ? "Not reported" : String(row.trac).trim();
      if (!letters.includes(trac)) letters.push(trac);
    }
    assert.deepEqual(item.traction, letters);
  }
  for (const row of report.outsideRows) {
    if (!row.url) continue;
    assert.ok(catalog.lines.some((line) => line.url === row.url), row.url);
  }

  const answers = tractionGradesAnswer(report);
  assertAnswerShape(answers, "live");
  assert.equal(answers.length, 3);
  const answerText = answers.join(" ");
  assert.match(answerText, /assigned by the manufacturer/);
  assert.match(answerText, /locked-wheel braking test on wet asphalt and wet concrete/);
  assert.match(answerText, new RegExp(formatNumber(report.sourceRows)));
  assert.match(answerText, new RegExp(formatNumber(report.aaLines)));
  assert.match(answerText, new RegExp(formatVerified(catalog.meta.verifiedAt)));
  for (const grade of report.grades) {
    if (grade.id === "outside") continue;
    assert.match(answerText, new RegExp(`${grade.id} is ${formatNumber(grade.rows)}`));
  }
  assertNoVerdict(tractionGradesText(report), "live copy");
  assert.doesNotMatch(tractionGradesText(report), /all-weather|all weather/i);

  const nodes = tractionGradesJsonLd(report);
  assert.deepEqual(
    nodes.map((node) => node["@type"]),
    ["Dataset", "Article", "FAQPage"],
  );
  assert.equal(nodes[0].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[1].dateModified, catalog.meta.verifiedAt);
  assert.equal(nodes[0].isBasedOn, catalog.meta.ratings.source);
  assert.doesNotMatch(nodes.map((node) => node["@type"]).join(" "), /Product|Review|AggregateRating/);
  const faqs = tractionGradesFaqs(report);
  assert.ok(faqs.length >= 2 && faqs.length <= 4);
  assert.deepEqual(
    nodes[2].mainEntity.map((item) => item.acceptedAnswer.text),
    faqs.map((item) => item.text),
  );
  const medianFaq = faqs.at(-1);
  assert.match(medianFaq.text, /median treadwear is /);
  assert.doesNotMatch(medianFaq.text, /treadwear is [A-Z]/);
  for (const item of faqs) assertNoVerdict(`${item.name} ${item.text}`, item.name);

  const gradeLog = report.grades.map((grade) => `${grade.id}=${grade.rows}`).join(", ");
  const watchedLog = report.watched
    .map((item) => `${item.brand} ${item.line} ${item.url} traction ${item.traction.join("/")}`)
    .join("; ");
  console.log(
    `traction source rows ${report.sourceRows}; lines ${report.lineCount}; AA lines ${report.aaLines}; mixed ${report.mixedLines}; unmapped ${report.unmapped}; grades ${gradeLog}; watched ${watchedLog}`,
  );
});

test("regulation quotes keep the retrieved eCFR wording and the page cites the date", () => {
  assert.match(ECFR_RETRIEVED, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(FR_RETRIEVED, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(ecfrRetrievedLabel(), ecfrRetrievedLabel(ECFR_RETRIEVED));
  assert.equal(frRetrievedLabel(), frRetrievedLabel(FR_RETRIEVED));
  const aa = TRACTION_RULES.find((rule) => rule.id === "AA");
  const b = TRACTION_RULES.find((rule) => rule.id === "B");
  const c = TRACTION_RULES.find((rule) => rule.id === "C");
  assert.equal(aa.asphalt, "more than 0.54μ");
  assert.equal(aa.concrete, "more than 0.38μ");
  assert.match(aa.quotes[1], /More than 0\.54μ when tested/);
  assert.match(aa.quotes[2], /More than 0\.38μ when tested/);
  assert.equal(b.asphalt, "more than 0.38");
  assert.equal(b.concrete, "more than 0.26");
  assert.match(c.quotes[0], /shall be graded C/);
  assert.match(b.quotes[0], /may be graded B only when/);
  assert.match(LOCKED_WHEEL_QUOTE, /40 mph, lock one trailer wheel/);
  assert.match(LOCKED_WHEEL_QUOTE, /0\.5 and 1\.5 seconds after lockup/);
  assert.match(WETTING_QUOTE, /pavement surface is wetted/);
  assert.match(FIGURE_2_TRACTION, /straight-ahead braking traction tests/);
  assert.match(FIGURE_2_TRACTION, /does not include acceleration, cornering, hydroplaning, or peak traction/);
  assert.match(FR_PEAK_TRACTION, /anti-lock braking systems/);
  assert.match(FR_PEAK_TRACTION, /while the tire is still rolling/);
  const page = readFileSync(new URL("../src/pages/guides/traction-grades.astro", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../src/lib/traction-grades.js", import.meta.url), "utf8");
  const ecfrUses = [...page.matchAll(/href=\{ECFR_TRACTION_URL\}/g)];
  const frUses = [...page.matchAll(/href=\{FR_TRACTION_URL\}/g)];
  assert.ok(ecfrUses.length >= 1);
  assert.ok(frUses.length >= 1);
  for (const use of ecfrUses) assert.match(page.slice(use.index, use.index + 240), /ecfrRetrieved/);
  for (const use of frUses) assert.match(page.slice(use.index, use.index + 240), /frRetrieved/);
  assert.match(lib, /https:\/\/www\.ecfr\.gov\/current\/title-49\/subtitle-B\/chapter-V\/part-575\/section-575\.104/);
  assert.match(lib, /https:\/\/www\.govinfo\.gov\/content\/pkg\/FR-1996-09-09\/html\/96-22761\.htm/);
  assertNoVerdict(page, "page source");
  assert.doesNotMatch(page, /all-weather|all weather/i);
  assert.doesNotMatch(page, /1,337|5,609|7,628|\b1337\b|\b5609\b|\b7628\b/);
  assert.doesNotMatch(lib, /1,337|5,609|7,628|\b1337\b|\b5609\b|\b7628\b/);
  assert.doesNotMatch(lib, /all-weather|all weather/i);
});

test("the traction guide is the one new static sitemap path and stays linked", () => {
  assert.equal(TRACTION_GRADES_PATH, "/guides/traction-grades/");
  assert.equal(STATIC_INDEXABLE_PATHS.filter((path) => path === TRACTION_GRADES_PATH).length, 1);
  assert.equal(includeInSitemap(TRACTION_GRADES_PATH, new Set()), true);
  assert.equal(includeInSitemap(`https://treadgrade.com${TRACTION_GRADES_PATH}`, new Set()), true);
  assert.equal(includeInSitemap(TRACTION_GRADES_PATH, new Set([TRACTION_GRADES_PATH])), false);
  const current = readFileSync(new URL("../src/lib/sitemap.js", import.meta.url), "utf8");
  const main = execSync("git show main:src/lib/sitemap.js", { encoding: "utf8" });
  const paths = (source) => {
    const block = source.match(/STATIC_INDEXABLE_PATHS = \[([\s\S]*?)\];/);
    assert.ok(block, "static path list");
    return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  };
  const added = paths(current).filter((path) => !paths(main).includes(path));
  const removed = paths(main).filter((path) => !paths(current).includes(path));
  assert.deepEqual(added, [TRACTION_GRADES_PATH]);
  assert.deepEqual(removed, []);
  const page = readFileSync(new URL("../src/pages/guides/traction-grades.astro", import.meta.url), "utf8");
  assert.match(page, /<Answer /);
  assert.match(page, /<SourceLine /);
  assert.match(page, /ratingRows/);
  assert.match(page, /<caption>/);
  for (const file of [
    "src/pages/guides/index.astro",
    "src/pages/guides/utqg-grades.astro",
    "src/pages/ratings.astro",
    "src/components/Footer.astro",
    "src/pages/index.astro",
    "src/pages/methodology.astro",
  ]) {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /\/guides\/traction-grades\//, file);
  }
  const ratings = readFileSync(new URL("../src/pages/ratings.astro", import.meta.url), "utf8");
  assert.match(ratings, /legend>Traction · <a href="\/guides\/traction-grades\/">/);
  const utqg = readFileSync(new URL("../src/pages/guides/utqg-grades.astro", import.meta.url), "utf8");
  assert.match(utqg, /does not include acceleration, cornering, hydroplaning, or peak traction characteristics/);
  assert.match(utqg, /\/guides\/traction-grades\//);
  const links = readFileSync(new URL("../scripts/check-links.mjs", import.meta.url), "utf8");
  assert.match(links, /TRACTION_GRADES_PATH/);
});
