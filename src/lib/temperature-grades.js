import { formatNumber, formatUtcDate, formatVerified, percent } from "./format.js";
import { USUAL_TEMPERATURE } from "./grade-quality.js";
import { ratingsTableHref } from "./ratings-table.js";

/**
 * Temperature grades on the existing UTQG guide, at
 * /guides/utqg-grades/#temperature-grades. This module does not add a route.
 *
 * Rule text is 49 CFR 575.104 as returned by the eCFR versioner for the
 * title issue date 2026-11-25, retrieved on ECFR_RETRIEVED. Paragraph
 * (d)(2)(iii) assigns C, B, and A. Paragraph (g)(4) names the steel test
 * wheel. Paragraph (g)(9) sets the wheel speeds. Figure 2 calls that wheel
 * an indoor laboratory test wheel and names Federal Motor Safety Standard
 * No. 109. The section does not name Standard No. 139 in that sentence.
 *
 * Counts are grade rows on the catalog, after exact duplicate grade rows
 * are dropped. They are computed at build time. Do not hard-code them.
 */

export const TEMPERATURE_GRADES_ID = "temperature-grades";
export const UTQG_GRADES_PATH = "/guides/utqg-grades/";
export const TEMPERATURE_GRADES_HREF = `${UTQG_GRADES_PATH}#${TEMPERATURE_GRADES_ID}`;

export const TEMPERATURE_LETTERS = ["A", "B", "C"];

export const ECFR_TEMPERATURE_URL =
  "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-575/section-575.104";
export const ECFR_RETRIEVED = "2026-11-28";

export const TRACTION_GRADES_PATH = "/guides/traction-grades/";
export const TREADWEAR_NUMBERS_PATH = "/guides/treadwear-numbers/";
export const TREADWEAR_VS_TRACTION_PATH = "/guides/treadwear-vs-traction/";
export const RATINGS_PATH = "/ratings/";
export const METHODOLOGY_PATH = "/methodology/";
export const KNOWN_ERRORS_INVALID_HREF = "/methodology/known-errors/#invalid-fields";

/** Verdicts this section must not use. */
export const BANNED_TEMPERATURE_WORD = /\b(best|recommend(?:ed|s|ing)?)\b/i;

/** Figure 2, temperature explanation, without the warning sentence. */
export const FIGURE_2_TEMPERATURE =
  "The temperature grades are A (the highest), B, and C, representing the tire's resistance to the generation of heat and its ability to dissipate heat when tested under controlled conditions on a specified indoor laboratory test wheel. Sustained high temperature can cause the material of the tire to degenerate and reduce tire life, and excessive temperature can lead to sudden tire failure. The grade C corresponds to a level of performance which all passenger car tires must meet under the Federal Motor Safety Standard No. 109. Grades B and A represent higher levels of performance on the laboratory test wheel than the minimum required by law.";

export const FIGURE_2_TEMPERATURE_WARNING =
  "Warning: The temperature grade for this tire is established for a tire that is properly inflated and not overloaded. Excessive speed, underinflation, or excessive loading, either separately or in combination, can cause heat buildup and possible tire failure.";

export const GRADE_C_STANDARD_QUOTE =
  "The grade C corresponds to a level of performance which all passenger car tires must meet under the Federal Motor Safety Standard No. 109.";

export const GRADES_AB_ABOVE_MINIMUM_QUOTE =
  "Grades B and A represent higher levels of performance on the laboratory test wheel than the minimum required by law.";

/** First sentence of the Figure 2 temperature explanation. */
export const INDOOR_WHEEL_QUOTE =
  "The temperature grades are A (the highest), B, and C, representing the tire's resistance to the generation of heat and its ability to dissipate heat when tested under controlled conditions on a specified indoor laboratory test wheel.";

/** Paragraph (d)(2)(iii), before the lettered grade rules. */
export const TEMPERATURE_INTRO_QUOTE =
  "(iii) Temperature resistance. Each tire shall be graded for temperature resistance performance with the word “TEMPERATURE” followed by the letter A, B, or C, based on its performance when the tire is tested in accordance with the procedures specified in paragraph (g) of this section. A tire shall be considered to have successfully completed a test stage in accordance with this paragraph if, at the end of the test stage, it exhibits no visual evidence of tread, sidewall, ply, cord, innerliner, or bead separation, chunking, broken cords, cracking or open splices as defined in § 571.109 of this chapter, and the tire pressure is not less than the pressure specified in paragraph (g)(1) of this section.";

export const TEST_WHEEL_QUOTE =
  "(4) Mount the tire-rim assembly on an axle, and press the tire tread against the surface of a flat-faced steel test wheel that is 67.23 inches in diameter and at least as wide as the section width of the tire.";

export const SPEED_STAGE_QUOTE =
  "(9) Reapply the load and without interruption or readjustment of inflation pressure, rotate the test wheel at 375 rpm for 30 minutes, and then at successively higher rates in 25 rpm increments, each for 30 minutes, until the tire has run at 575 rpm for 30 minutes, or to failure, whichever occurs first.";

/**
 * Paragraph (d)(2)(iii)(A), (B), and (C). The paragraph letter is not the
 * grade letter: (A) is grade C, (B) is grade B, and (C) is grade A.
 */
export const TEMPERATURE_RULES = [
  {
    id: "C",
    paragraph: "(d)(2)(iii)(A)",
    quote:
      "(A) The tire shall be graded C if it fails to complete the 500 rpm test stage specified in paragraph (g)(9) of this section.",
  },
  {
    id: "B",
    paragraph: "(d)(2)(iii)(B)",
    quote:
      "(B) The tire may be graded B only if it successfully completes the 500 rpm test stage specified in paragraph (g)(9) of this section.",
  },
  {
    id: "A",
    paragraph: "(d)(2)(iii)(C)",
    quote:
      "(C) The tire may be graded A only if it successfully completes the 575 rpm test stage specified in paragraph (g)(9) of this section.",
  },
];

const GRADE_ORDER = [...TEMPERATURE_LETTERS, "outside"];

function noun(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function listJoin(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function quotePublished(value) {
  return `"${value}"`;
}

export function temperatureLetter(value) {
  return USUAL_TEMPERATURE.includes(value) ? value : "outside";
}

export function gradeLabel(id) {
  return id === "outside" ? "Outside A–C" : id;
}

export function ecfrRetrievedLabel(iso = ECFR_RETRIEVED) {
  return formatUtcDate(iso);
}

function publishedValue(temp) {
  return temp == null ? "" : String(temp);
}

function emptyGrade(id) {
  return {
    id,
    label: gradeLabel(id),
    rows: 0,
    lines: 0,
    href: id === "outside" ? "" : ratingsTableHref({ temp: [id] }),
  };
}

function compareLines(a, b) {
  const byBrand = a.brand.localeCompare(b.brand, "en");
  if (byBrand) return byBrand;
  return a.line.localeCompare(b.line, "en");
}

export function temperatureGradesReport(catalog) {
  const grades = new Map(GRADE_ORDER.map((id) => [id, emptyGrade(id)]));
  const cLines = [];
  const invalidRows = [];

  for (const line of catalog?.lines || []) {
    const seen = new Set();
    let cRows = 0;
    const others = [];
    const invalid = [];
    for (const row of line.rows || []) {
      const id = temperatureLetter(row.temp);
      grades.get(id).rows += 1;
      if (!seen.has(id)) {
        seen.add(id);
        grades.get(id).lines += 1;
      }
      if (id === "C") {
        cRows += 1;
        continue;
      }
      if (id === "outside") {
        const value = publishedValue(row.temp);
        if (!invalid.includes(value)) invalid.push(value);
        invalidRows.push({
          value,
          brand: line.brand,
          line: line.line,
          url: line.url,
          rows: 1,
        });
        continue;
      }
      if (!others.includes(id)) others.push(id);
    }
    if (cRows) {
      const usualOthers = TEMPERATURE_LETTERS.filter((letter) => letter !== "C" && others.includes(letter));
      const invalidValues = [...invalid].sort((a, b) => a.localeCompare(b, "en"));
      cLines.push({
        brand: line.brand,
        line: line.line,
        url: line.url,
        cRows,
        rowCount: (line.rows || []).length,
        others: usualOthers,
        invalid: invalidValues,
        otherText: otherTemperatureText(usualOthers, invalidValues),
      });
    }
  }

  const mergedInvalid = [];
  for (const row of invalidRows) {
    const existing = mergedInvalid.find((item) => item.value === row.value && item.url === row.url);
    if (existing) existing.rows += 1;
    else mergedInvalid.push({ ...row });
  }
  mergedInvalid.sort((a, b) => a.value.localeCompare(b.value, "en") || compareLines(a, b));

  const gradeRows = GRADE_ORDER.reduce((sum, id) => sum + grades.get(id).rows, 0);
  return {
    gradeRows,
    lineCount: (catalog?.lines || []).length,
    grades: GRADE_ORDER.map((id) => grades.get(id)),
    cLines,
    invalidRows: mergedInvalid,
    verifiedAt: catalog?.meta?.verifiedAt || "",
  };
}

/** Compact rows for the sitemap hash. Dates and formatted labels stay out. */
export function temperatureGradesData(catalog) {
  const report = temperatureGradesReport(catalog);
  return {
    grades: report.grades.map((grade) => [grade.id, grade.rows, grade.lines]),
    cLines: report.cLines.map((line) => [line.url, line.cRows, line.others.join(","), line.invalid.join("|")]),
    invalid: report.invalidRows.map((row) => [row.value, row.url, row.rows]),
  };
}

export function otherTemperatureText(others, invalid) {
  const parts = [...others, ...invalid.map((value) => quotePublished(value))];
  return parts.length ? parts.join(", ") : "C only";
}

export function temperatureGradesAnswer() {
  return [
    "Under 49 CFR 575.104, temperature grades A, B, and C measure heat resistance on a specified indoor laboratory test wheel.",
    "A tire shall be graded C if it fails to complete the 500 rpm test stage, may be graded B only if it successfully completes that 500 rpm stage, and may be graded A only if it successfully completes the 575 rpm stage.",
    "Figure 2 says grade C corresponds to a level of performance which all passenger car tires must meet under the Federal Motor Safety Standard No. 109, and that grades B and A represent higher levels of performance on the laboratory test wheel than the minimum required by law.",
  ];
}

export function temperatureCountsParagraph(report) {
  const letters = report.grades.filter((grade) => grade.id !== "outside");
  const outside = report.grades.find((grade) => grade.id === "outside");
  const letterList = listJoin(
    letters.map((grade) => `${grade.id} is ${noun(grade.rows, "grade row")} on ${noun(grade.lines, "tire line")}`),
  );
  const outsideVerb = outside.rows === 1 ? "is" : "are";
  return `In the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC), ${letterList}. ${noun(outside.rows, "grade row")} ${outsideVerb} outside A, B, and C, on ${noun(outside.lines, "tire line")}. A tire line with more than one temperature value is counted under each value.`;
}

export function temperatureQualityNote(report) {
  if (!report.invalidRows.length) return "Every grade row in this pull uses temperature A, B, or C.";
  const values = [];
  for (const row of report.invalidRows) {
    if (!values.includes(row.value)) values.push(row.value);
  }
  return `Temperature values outside A, B, and C in this pull are ${listJoin(values.map(quotePublished))}. Each value is quoted as published and is not stated as a temperature grade. The row stays in the ratings table.`;
}

export function thresholdCaption() {
  return `Temperature grade rules in 49 CFR 575.104(d)(2)(iii), retrieved ${ecfrRetrievedLabel()} from the eCFR. Paragraph (A) is grade C, paragraph (B) is grade B, and paragraph (C) is grade A. Each rule names a test stage in paragraph (g)(9).`;
}

export function distributionCaption(report) {
  return `Temperature grades in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). Grade rows are the rows kept after exact duplicate grade rows are dropped. Share uses those grade rows. A tire line with more than one temperature value is counted in each tire-line cell.`;
}

export function cLineCaption(report) {
  return `Tire lines with at least one temperature C grade row in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). The row count is grade rows whose temperature is C.`;
}

export function invalidCaption(report) {
  return `Temperature values outside A, B, and C in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). The published value is quoted. It is not stated as a temperature grade.`;
}

export function temperatureGradesText(report) {
  return [
    ...temperatureGradesAnswer(),
    temperatureCountsParagraph(report),
    temperatureQualityNote(report),
    thresholdCaption(),
    distributionCaption(report),
    cLineCaption(report),
    invalidCaption(report),
    FIGURE_2_TEMPERATURE,
    FIGURE_2_TEMPERATURE_WARNING,
    GRADE_C_STANDARD_QUOTE,
    GRADES_AB_ABOVE_MINIMUM_QUOTE,
    INDOOR_WHEEL_QUOTE,
    TEMPERATURE_INTRO_QUOTE,
    TEST_WHEEL_QUOTE,
    SPEED_STAGE_QUOTE,
    ...TEMPERATURE_RULES.map((rule) => rule.quote),
    ...report.cLines.map((line) => line.otherText),
    ECFR_TEMPERATURE_URL,
    ecfrRetrievedLabel(),
  ].join(" ");
}

export function temperatureShare(report, grade) {
  return percent(grade.rows, report.gradeRows);
}
