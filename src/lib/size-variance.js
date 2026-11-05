import { formatNumber } from "./format.js";
import { USUAL_TEMPERATURE, USUAL_TRACTION, rowQuality } from "./grade-quality.js";

/**
 * "Grade varies by size" is computed inside one normalized brand and line,
 * which is how the catalog already groups NHTSA rows.
 *
 * Flagged rows are left out before the distinct grades are counted. A flagged
 * row is an invalid or suspect row in rowQuality, the same rule the
 * known-errors page and the ratings table use: treadwear 0, no treadwear
 * number, a treadwear value that is not a whole number, or a traction or
 * temperature value outside the usual letters. A value sitting in the wrong
 * grade field is not treated as a second grade.
 */

export const SIZE_VARIANCE_PATH = "/guides/treadwear-varies-by-size/";
export const GRADE_VARIES_ID = "grade-varies";
export const GRADE_VARIES_LABEL = "Grade varies by size";

export const BANNED_GRADE_WORD = /\b(best|better|winner|safest)\b/i;

/**
 * Watched lines from the backlog. A name that is not in this pull is omitted.
 * The pattern is applied to the catalog spelling, not to a corrected name.
 */
export const SIZE_VARIANCE_EXAMPLES = [
  { brand: /^bridgestone$/i, line: /^ecopia ep150$/i },
  { brand: /^hankook$/i, line: /^dynapro hp2 \(oe\)$/i },
  { brand: /^toyo$/i, line: /^versado lx$/i },
  { brand: /^toyo$/i, line: /^tourevo ls$/i },
];

export const SIZE_VARIANCE_FAQS = [
  {
    name: "Why do different sizes of the same tire list different treadwear?",
    text: "NHTSA lists a treadwear number on each size row. Tire makers often assign that grade from a test of a representative size, and another size of the same line can carry a different number. The grade molded on the sidewall of the tire you buy is the grade for that tire.",
  },
  {
    name: "Does a different treadwear number say how far the tire will travel?",
    text: "No. Treadwear is a relative grade under 49 CFR 575.104, from a government test course, not miles. NHTSA's file does not turn that number into a distance.",
  },
  {
    name: "Which grade applies to the tire I buy?",
    text: "The grade molded on the sidewall of the tire you buy is the grade for that tire. A single number in a generic listing can hide the range NHTSA lists across sizes of the line.",
  },
];

function noun(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function usableRows(line) {
  return (line?.rows || []).filter((row) => rowQuality(row).kind === "ok");
}

function countGrades(rows, pick, order) {
  const counts = new Map();
  for (const row of rows) {
    const value = pick(row);
    if (value == null || value === "") continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const values = order ? order.filter((value) => counts.has(value)) : [...counts.keys()].sort((a, b) => a - b);
  return values.map((value) => ({ value, count: counts.get(value) }));
}

export function lineSizeVariance(line) {
  const rows = usableRows(line);
  const wears = countGrades(rows, (row) => (row.wearN != null && row.wearN > 0 ? row.wearN : null));
  const tractions = countGrades(rows, (row) => (USUAL_TRACTION.includes(row.trac) ? row.trac : null), USUAL_TRACTION);
  const temperatures = countGrades(
    rows,
    (row) => (USUAL_TEMPERATURE.includes(row.temp) ? row.temp : null),
    USUAL_TEMPERATURE,
  );
  const wearVaries = wears.length > 1;
  const tractionVaries = tractions.length > 1;
  return {
    show: wearVaries || tractionVaries,
    wearVaries,
    tractionVaries,
    temperatureVaries: temperatures.length > 1,
    rowCount: rows.length,
    excludedCount: (line?.rows?.length || 0) - rows.length,
    wearMin: wears.length ? wears[0].value : null,
    wearMax: wears.length ? wears.at(-1).value : null,
    wears,
    tractions,
    temperatures,
  };
}

function variesClause(variance) {
  const parts = [];
  if (variance.wearVaries) parts.push(`treadwear from ${variance.wearMin} to ${variance.wearMax}`);
  if (variance.tractionVaries) parts.push(`traction grades ${joinList(variance.tractions.map((item) => item.value))}`);
  return joinList(parts);
}

export function sizeVarianceParagraphs(line, variance) {
  const rows = formatNumber(variance.rowCount);
  const rowWord = noun(variance.rowCount, "size row");
  const paragraphs = [
    `NHTSA lists ${variesClause(variance)} for ${line.brand} ${line.line} across ${rows} ${rowWord}.`,
    "Tire makers often assign the UTQG grade from a test of a representative size. The grade molded on the sidewall of the tire you buy is the grade for that tire. A single number in a generic listing can hide the range NHTSA lists across sizes. Treadwear is a relative grade under 49 CFR 575.104, not miles, and grades from different brands are only loosely comparable.",
  ];
  if (variance.temperatureVaries) {
    paragraphs.push(
      `NHTSA also lists temperature grades ${joinList(variance.temperatures.map((item) => item.value))} on this line. Those letters are in the size table.`,
    );
  }
  if (variance.excludedCount) {
    const left = noun(variance.excludedCount, "size row");
    const verb = variance.excludedCount === 1 ? "is" : "are";
    const stay = variance.excludedCount === 1 ? "stays" : "stay";
    paragraphs.push(
      `${formatNumber(variance.excludedCount)} ${left} with a value outside the usual grades ${verb} left out of these counts and ${stay} in the size table.`,
    );
  }
  if (line.sameName?.length) {
    paragraphs.push(
      "This line name is also stored under other brand strings. That is not evidence the tires are the same product. The range above is what NHTSA lists under this brand string.",
    );
  }
  return paragraphs;
}

export function wearRangeLabel(variance) {
  if (variance.wearMin == null) return "Not reported";
  if (!variance.wearVaries) return String(variance.wearMin);
  return `${variance.wearMin}–${variance.wearMax}`;
}

export function tractionLabel(variance) {
  if (!variance.tractions.length) return "Not reported";
  return joinList(variance.tractions.map((item) => item.value));
}

export function sizeVarianceGuideAnswer(report) {
  const wear = `${formatNumber(report.multiWearLines)} ${noun(report.multiWearLines, "tire line")}`;
  const traction = `${formatNumber(report.multiTractionLines)} ${noun(report.multiTractionLines, "tire line")}`;
  return [
    `NHTSA lists more than one treadwear number above 0 on ${wear}, and more than one traction grade on ${traction}.`,
    "Tire makers often assign the UTQG grade from a test of a representative size. The grade molded on the sidewall of the tire you buy is the grade for that tire.",
    "Treadwear is a relative grade under 49 CFR 575.104, not miles, and grades from different brands are only loosely comparable.",
  ];
}

export function sizeVarianceReport(catalog) {
  let multiWearLines = 0;
  let multiTractionLines = 0;
  let notedLines = 0;
  for (const line of catalog.lines) {
    const variance = lineSizeVariance(line);
    if (variance.wearVaries) multiWearLines += 1;
    if (variance.tractionVaries) multiTractionLines += 1;
    if (variance.show) notedLines += 1;
  }
  const examples = [];
  for (const wanted of SIZE_VARIANCE_EXAMPLES) {
    const line = catalog.lines.find((item) => wanted.brand.test(item.brand) && wanted.line.test(item.line));
    if (!line) continue;
    const variance = lineSizeVariance(line);
    if (!variance.show) continue;
    examples.push({ line, variance });
  }
  return {
    multiWearLines,
    multiTractionLines,
    notedLines,
    examples,
    verifiedAt: catalog.meta?.verifiedAt || "",
    ratingsSource: catalog.meta?.ratings?.source || "",
  };
}
