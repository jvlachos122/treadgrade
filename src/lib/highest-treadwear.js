import { formatNumber, formatVerified, wearRange } from "./format.js";
import { rowQuality } from "./grade-quality.js";
import { formatNameList } from "./recalls.js";
import { sizeFlagLabel, sizeScope } from "./ratings-table.js";
import { GRADE_VARIES_ID, lineSizeVariance, tractionLabel, wearRangeLabel } from "./size-variance.js";
import { article, dataset } from "./structured.js";

/**
 * Usable treadwear of this value or above, from the committed NHTSA rows.
 * A flagged row (treadwear 0, no number, a non-whole number, or a traction
 * or temperature letter outside the usual grades) is left out.
 */
export const HIGH_TREADWEAR_MIN = 800;

export const HIGHEST_TREADWEAR_PATH = "/lists/highest-treadwear/";

/**
 * Authored claims this page must not make. NHTSA line names are not passed
 * through this pattern; a future file can contain those words.
 */
export const BANNED_LIST_WORD = /\b(best|better|winner|safest|longest[- ]lasting)\b/i;

export const MILES_CLAIM = /\b\d[\d,]*\s+miles\b/i;

/**
 * Names to look up in this pull. A name that is missing, or that has no
 * usable treadwear at the threshold, is omitted. The pattern is applied to
 * the catalog spelling, not to a corrected name.
 */
export const HIGHEST_TREADWEAR_EXAMPLES = [
  { brand: /^hankook$/i, line: /^ion ht$/i },
  { brand: /^bridgestone$/i, line: /^ecopia ep150$/i },
  { brand: /^hankook$/i, line: /^kinergy pt$/i },
  { brand: /^michelin$/i, line: /^defender 2$/i },
  { brand: /^michelin$/i, line: /^x tour a\/s 2$/i },
];

function noun(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function usable(row) {
  return rowQuality(row).kind === "ok";
}

function countWears(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.wearN, (counts.get(row.wearN) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([value, count]) => ({ value, count }));
}

function gradeRow(row) {
  return {
    wearN: row.wearN,
    size: row.size,
    scope: sizeScope(row.size),
    trac: row.trac,
    temp: row.temp,
  };
}

function lineEntry(line) {
  const high = [];
  let excluded = 0;
  const below = [];
  for (const row of line.rows) {
    if (row.wearN == null || row.wearN < HIGH_TREADWEAR_MIN) {
      if (usable(row) && row.wearN != null && row.wearN > 0) below.push(row.wearN);
      continue;
    }
    if (!usable(row)) {
      excluded += 1;
      continue;
    }
    high.push(gradeRow(row));
  }
  high.sort(
    (a, b) => b.wearN - a.wearN || a.size.localeCompare(b.size, "en") || a.trac.localeCompare(b.trac, "en") || a.temp.localeCompare(b.temp, "en"),
  );
  const sizeScopes = [];
  if (high.some((row) => row.scope === "specific")) sizeScopes.push("specific");
  if (high.some((row) => row.scope === "all")) sizeScopes.push("all");
  const belowSorted = [...below].sort((a, b) => a - b);
  return {
    line,
    rows: high,
    wears: countWears(high),
    max: high.length ? high[0].wearN : null,
    sizeScopes,
    sizeSpecificRows: high.filter((row) => row.scope === "specific").length,
    allSizesRows: high.filter((row) => row.scope === "all").length,
    excluded,
    belowCount: below.length,
    belowMin: belowSorted.length ? belowSorted[0] : null,
    belowMax: belowSorted.length ? belowSorted.at(-1) : null,
    variance: lineSizeVariance(line),
  };
}

function catalogMaxWear(catalog) {
  let max = null;
  for (const line of catalog.lines) {
    for (const row of line.rows) {
      if (!usable(row) || row.wearN == null || row.wearN <= 0) continue;
      if (max == null || row.wearN > max) max = row.wearN;
    }
  }
  return max;
}

/**
 * Every figure is counted from the catalog. Watched names that do not qualify
 * are left out of examples.
 */
export function highestTreadwearReport(catalog) {
  const entries = [];
  let excludedCount = 0;
  for (const line of catalog.lines || []) {
    const entry = lineEntry(line);
    excludedCount += entry.excluded;
    if (entry.rows.length) entries.push(entry);
  }
  entries.sort(
    (a, b) => b.max - a.max || a.line.brand.localeCompare(b.line.brand, "en") || a.line.line.localeCompare(b.line.line, "en"),
  );
  const max = entries.length ? entries[0].max : null;
  const topLines = max == null ? [] : entries.filter((entry) => entry.max === max);
  const examples = [];
  for (const wanted of HIGHEST_TREADWEAR_EXAMPLES) {
    const entry = entries.find((item) => wanted.brand.test(item.line.brand) && wanted.line.test(item.line.line));
    if (entry) examples.push(entry);
  }
  const rows = [];
  for (const entry of entries) {
    for (const row of entry.rows) rows.push({ entry, line: entry.line, ...row });
  }
  let sizeSpecificRows = 0;
  let allSizesRows = 0;
  let linesBelowCount = 0;
  let varyingLineCount = 0;
  for (const entry of entries) {
    sizeSpecificRows += entry.sizeSpecificRows;
    allSizesRows += entry.allSizesRows;
    if (entry.belowCount) linesBelowCount += 1;
    if (entry.variance.show) varyingLineCount += 1;
  }
  return {
    minGrade: HIGH_TREADWEAR_MIN,
    rowCount: rows.length,
    lineCount: entries.length,
    sizeSpecificRows,
    allSizesRows,
    linesBelowCount,
    varyingLineCount,
    excludedCount,
    max,
    catalogMax: catalogMaxWear(catalog),
    topLines,
    topRowCount: topLines.reduce((sum, entry) => sum + entry.rows.filter((row) => row.wearN === max).length, 0),
    entries,
    rows,
    varying: entries.filter((entry) => entry.variance.show),
    examples,
    verifiedAt: catalog.meta?.verifiedAt || "",
    ratingsSource: catalog.meta?.ratings?.source || "",
  };
}

export function highestTreadwearAnswer(report) {
  const caveat =
    "The list is not exhaustive, and a missing line is not a grade. Treadwear is a relative grade under 49 CFR 575.104, not miles.";
  if (!report.rowCount) {
    return [
      `NHTSA's published UTQG list has no usable grade row with treadwear of ${report.minGrade} or above.`,
      report.catalogMax == null
        ? "Treadwear is not reported as a usable number in that list."
        : `The highest treadwear in NHTSA's published UTQG list is ${report.catalogMax}.`,
      caveat,
    ];
  }
  const rows = `${formatNumber(report.rowCount)} ${noun(report.rowCount, "grade row")}`;
  const lines = `${formatNumber(report.lineCount)} ${noun(report.lineCount, "tire line")}`;
  const specific = `${formatNumber(report.sizeSpecificRows)} ${noun(report.sizeSpecificRows, "size-specific grade row")}`;
  const names = formatNameList(report.topLines.map((entry) => `${entry.line.brand} ${entry.line.line}`));
  const highest =
    report.max === report.catalogMax
      ? `The highest treadwear in NHTSA's published UTQG list is ${report.max}, on ${names}.`
      : `The highest treadwear of ${report.minGrade} or above in NHTSA's published UTQG list is ${report.max}, on ${names}.`;
  return [
    `NHTSA lists ${rows} with usable treadwear of ${report.minGrade} or above, on ${lines}, in NHTSA's published UTQG list, including ${specific}.`,
    highest,
    caveat,
  ];
}

function sizePhrase(entry) {
  const parts = [];
  if (entry.sizeSpecificRows) {
    parts.push(`${formatNumber(entry.sizeSpecificRows)} ${noun(entry.sizeSpecificRows, "size-specific row")}`);
  }
  if (entry.allSizesRows) {
    parts.push(
      `${formatNumber(entry.allSizesRows)} ${noun(entry.allSizesRows, "row listed as all sizes", "rows listed as all sizes")}`,
    );
  }
  return parts.join(" and ");
}

export function exampleParagraph(report) {
  if (!report.examples.length) {
    return `None of the watched line names has a usable treadwear of ${report.minGrade} or above in this pull.`;
  }
  const bits = report.examples.map((entry) => {
    const grades = formatNameList(entry.wears.map((item) => String(item.value)));
    return `${entry.line.brand} ${entry.line.line} at ${grades} (${sizePhrase(entry)})`;
  });
  return `NHTSA lists ${formatNameList(bits)} in this pull. A watched name that is not in the file, or that has no usable treadwear of ${report.minGrade} or above, is left out.`;
}

export function excludedParagraph(report) {
  if (!report.excludedCount) return "";
  const rows = `${formatNumber(report.excludedCount)} ${noun(report.excludedCount, "grade row")}`;
  const verb = report.excludedCount === 1 ? "has" : "have";
  const stay = report.excludedCount === 1 ? "It stays" : "They stay";
  return `${rows} at treadwear of ${report.minGrade} or above ${verb} a value outside the usual grades and ${report.excludedCount === 1 ? "is" : "are"} left out of this list. ${stay} on the tire-line page.`;
}

export function highestTreadwearCounts(report) {
  return [
    [`Usable grade rows at treadwear of ${report.minGrade} or above`, report.rowCount],
    ["Tire lines with at least one of those rows", report.lineCount],
    ["Size-specific grade rows", report.sizeSpecificRows],
    ["Grade rows whose size text says all sizes", report.allSizesRows],
    ["Tire lines that also list a lower usable treadwear", report.linesBelowCount],
    ["Tire lines where treadwear or traction differs by size", report.varyingLineCount],
  ];
}

export function countsCaption(report) {
  return `Counts of usable treadwear grades of ${report.minGrade} or above in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). Flagged rows are left out.`;
}

export function rowsCaption(report) {
  return `Usable grade rows with treadwear of ${report.minGrade} or above in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). Flagged rows are left out.`;
}

export function varianceCaption(report) {
  return `Tire lines in that set whose usable treadwear or traction differs by size in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC).`;
}

export function otherWearLabel(entry) {
  if (!entry.belowCount) return "None";
  return wearRange(entry.belowMin, entry.belowMax);
}

export function gradeVariesHref(line) {
  return `${line.url}#${GRADE_VARIES_ID}`;
}

export function sizeFlag(row) {
  return sizeFlagLabel(row.size);
}

export function varianceWearLabel(entry) {
  return wearRangeLabel(entry.variance);
}

export function varianceTractionLabel(entry) {
  return tractionLabel(entry.variance);
}

export function highestTreadwearFaqs(report) {
  const faqs = [
    {
      name: "Does a treadwear grade say how far the tire will travel?",
      text: "No. Treadwear is a relative grade under 49 CFR 575.104, from a government test course, not miles. NHTSA's file does not turn that number into a distance.",
    },
    {
      name: "Is every high-treadwear tire in this list?",
      text: "No. NHTSA's published UTQG list is not exhaustive. Some lines are missing from the file. This page does not invent a grade for a missing line, and absence is not a grade.",
    },
    {
      name: "What does size-specific mean on this page?",
      text: "NHTSA stores a size series on each grade row. A row is size-specific unless the size text, with extra spaces collapsed, is all, all size, or all sizes. The grade molded on the sidewall of the tire you buy is the grade for that tire.",
    },
    {
      name: "Why can one tire line list more than one treadwear grade?",
      text: "NHTSA lists a treadwear number on each size row. Another size of the same line can carry a different number. The grade molded on the sidewall of the tire you buy is the grade for that tire.",
    },
  ];
  if (report.rowCount && report.max != null && report.max === report.catalogMax && report.topLines.length) {
    const names = formatNameList(report.topLines.map((entry) => `${entry.line.brand} ${entry.line.line}`));
    const rows = `${formatNumber(report.topRowCount)} ${noun(report.topRowCount, "grade row")}`;
    faqs.unshift({
      name: "What is the highest treadwear grade NHTSA lists?",
      text: `The highest treadwear in NHTSA's published UTQG list is ${report.max}, on ${names}. NHTSA lists that grade on ${rows}.`,
    });
  }
  return faqs;
}

export function highestTreadwearText(report) {
  const faqs = highestTreadwearFaqs(report);
  return [
    ...highestTreadwearAnswer(report),
    exampleParagraph(report),
    excludedParagraph(report),
    countsCaption(report),
    rowsCaption(report),
    varianceCaption(report),
    ...highestTreadwearCounts(report).map(([label]) => label),
    ...faqs.flatMap((item) => [item.name, item.text]),
  ].join(" ");
}

export function highestTreadwearJsonLd(report) {
  const answers = highestTreadwearAnswer(report);
  const description = answers.join(" ");
  const faqs = highestTreadwearFaqs(report);
  return [
    dataset({
      name: `UTQG grade rows with treadwear of ${report.minGrade} or above in NHTSA's published list`,
      description,
      path: HIGHEST_TREADWEAR_PATH,
      dateModified: report.verifiedAt,
      isBasedOn: report.ratingsSource,
      keywords: ["UTQG", "treadwear", "NHTSA", String(report.minGrade)],
    }),
    article({
      headline: "Highest treadwear grades NHTSA lists",
      description,
      path: HIGHEST_TREADWEAR_PATH,
      dateModified: report.verifiedAt,
    }),
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.name,
        acceptedAnswer: { "@type": "Answer", text: item.text },
      })),
    },
  ];
}
