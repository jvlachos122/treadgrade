import { formatNumber, formatVerified } from "./format.js";
import { formatNameList } from "./recalls.js";
import { article, dataset } from "./structured.js";

/**
 * Tire lines with treadwear of this value or above, traction A or AA, and
 * temperature A on at least one size row. Counts come from the catalog,
 * which keeps the committed NHTSA rows after exact duplicate grade rows
 * are dropped.
 */
export const LONG_TREADWEAR_MIN = 700;

export const LONG_TREADWEAR_TRACTION = ["AA", "A"];

export const LONG_TREADWEAR_TEMPERATURE = "A";

export const LONG_TREADWEAR_PATH = "/lists/long-treadwear-high-traction/";

export const LONG_TREADWEAR_TITLE =
  "Treadwear of 700 or above with traction A or AA and temperature A";

/**
 * Authored wording this page must not use. NHTSA brand and line names are
 * data, and a future file can contain these words.
 */
export const BANNED_LONG_WORD = /\b(best|top-rated|top rated|recommend(?:ed|s|ing)?)\b/i;

const TRACTION_RANK = { AA: 2, A: 1 };
const TRACTION_ORDER = ["AA", "A", "B", "C"];
const TEMPERATURE_ORDER = ["A", "B", "C"];

const CAVEAT =
  "UTQG grades are assigned by the manufacturer under NHTSA's test procedure in 49 CFR 575.104. Treadwear is a comparative grade from a government test course, not miles, and grades from different brands are not a precise wear prediction.";

function countWord(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function tractionRank(value) {
  return TRACTION_RANK[value] ?? 0;
}

function orderedGrades(values, order) {
  const present = new Set(values);
  const known = order.filter((grade) => present.has(grade));
  const other = [...present].filter((grade) => !order.includes(grade)).sort((a, b) => a.localeCompare(b, "en"));
  return [...known, ...other];
}

export function rowMeetsLongTreadwear(row) {
  return (
    row.wearN != null &&
    row.wearN >= LONG_TREADWEAR_MIN &&
    LONG_TREADWEAR_TRACTION.includes(row.trac) &&
    row.temp === LONG_TREADWEAR_TEMPERATURE
  );
}

function lineEntry(line) {
  const matching = line.rows.filter(rowMeetsLongTreadwear);
  if (!matching.length) return null;
  const wears = [...new Set(matching.map((row) => row.wearN))].sort((a, b) => b - a);
  const maxWear = wears[0];
  const atMax = matching.filter((row) => row.wearN === maxWear);
  let tractionAtMax = atMax[0].trac;
  for (const row of atMax) {
    if (tractionRank(row.trac) > tractionRank(tractionAtMax)) tractionAtMax = row.trac;
  }
  return {
    line,
    matchingCount: matching.length,
    totalCount: line.rows.length,
    someSizes: matching.length < line.rows.length,
    wears,
    wearLabel: wears.join(", "),
    tractions: orderedGrades(
      matching.map((row) => row.trac),
      TRACTION_ORDER,
    ),
    temps: orderedGrades(
      matching.map((row) => row.temp),
      TEMPERATURE_ORDER,
    ),
    maxWear,
    tractionAtMax,
  };
}

function byGrade(a, b) {
  return (
    b.maxWear - a.maxWear ||
    tractionRank(b.tractionAtMax) - tractionRank(a.tractionAtMax) ||
    a.line.brand.localeCompare(b.line.brand, "en") ||
    a.line.line.localeCompare(b.line.line, "en")
  );
}

/**
 * One row per tire line. A line is included when at least one size row meets
 * the filter. "some sizes" means other size rows on that line do not.
 */
export function longTreadwearReport(catalog) {
  const entries = [];
  for (const line of catalog.lines || []) {
    const entry = lineEntry(line);
    if (entry) entries.push(entry);
  }
  entries.sort(byGrade);
  const maxWear = entries.length ? entries[0].maxWear : null;
  const brands = new Set(entries.map((entry) => entry.line.brand));
  let matchingRowCount = 0;
  let someSizesCount = 0;
  let aaLineCount = 0;
  let aOnlyCount = 0;
  let bothCount = 0;
  for (const entry of entries) {
    matchingRowCount += entry.matchingCount;
    if (entry.someSizes) someSizesCount += 1;
    const hasAa = entry.tractions.includes("AA");
    const hasA = entry.tractions.includes("A");
    if (hasAa) aaLineCount += 1;
    else aOnlyCount += 1;
    if (hasAa && hasA) bothCount += 1;
  }
  return {
    minGrade: LONG_TREADWEAR_MIN,
    lineCount: entries.length,
    brandCount: brands.size,
    matchingRowCount,
    someSizesCount,
    aaLineCount,
    aOnlyCount,
    bothCount,
    maxWear,
    topLines: maxWear == null ? [] : entries.filter((entry) => entry.maxWear === maxWear),
    lines: entries,
    verifiedAt: catalog.meta?.verifiedAt || "",
    ratingsSource: catalog.meta?.ratings?.source || "",
  };
}

function tractionSplit(report) {
  if (report.aaLineCount === 0) {
    if (report.lineCount === 1) {
      return "That line does not include traction AA on a matching size row, so it matches only at traction A.";
    }
    return `None of those lines includes traction AA on a matching size row, so all ${countWord(report.lineCount, "line")} match only at traction A.`;
  }
  const also =
    report.bothCount === 1 && report.aaLineCount === 1
      ? ", and that line also lists traction A on another matching size row"
      : report.bothCount > 0
        ? `, ${formatNumber(report.bothCount)} of them also ${report.bothCount === 1 ? "lists" : "list"} traction A on another matching size row`
        : "";
  if (report.aOnlyCount === 0) {
    if (report.lineCount === 1) {
      return report.bothCount
        ? "That line includes traction AA on a matching size row. It also lists traction A on another matching size row."
        : "That line includes traction AA on a matching size row, and it does not match only at traction A.";
    }
    const lines = countWord(report.lineCount, "line");
    const verb = report.lineCount === 1 ? "includes" : "include";
    return `All ${lines} ${verb} traction AA on a matching size row${also}, and none match only at traction A.`;
  }
  const aa = countWord(report.aaLineCount, "line");
  const aaVerb = report.aaLineCount === 1 ? "includes" : "include";
  const only = countWord(report.aOnlyCount, "line");
  const onlyVerb = report.aOnlyCount === 1 ? "matches" : "match";
  return `${aa} ${aaVerb} traction AA on a matching size row${also}, and ${only} ${onlyVerb} only at traction A.`;
}

export function longTreadwearAnswer(report) {
  if (!report.lineCount) {
    return [
      `NHTSA's published UTQG list has no tire line with treadwear of ${report.minGrade} or above, traction A or AA, and temperature A on a size row.`,
      `The file was verified ${formatVerified(report.verifiedAt)} (UTC).`,
      caveatText(),
    ];
  }
  const lines = countWord(report.lineCount, "tire line");
  const brands = countWord(report.brandCount, "brand");
  const names = formatNameList(report.topLines.map((entry) => `${entry.line.brand} ${entry.line.line}`));
  return [
    `NHTSA's published UTQG list, verified ${formatVerified(report.verifiedAt)} (UTC), has ${lines} from ${brands} with treadwear of ${report.minGrade} or above, traction A or AA, and temperature A on at least one size row.`,
    `The highest treadwear in NHTSA's published UTQG list among those lines is ${report.maxWear}, on ${names}.`,
    tractionSplit(report),
  ];
}

export function caveatText() {
  return CAVEAT;
}

export function tableIntro() {
  return 'Each row is one tire line. Treadwear lists every matching grade, highest first. Lines are ordered by that highest number, then by traction AA before A, then by brand and line. A line marked some sizes meets the filter on only some of its size rows. NHTSA\'s published UTQG list is not exhaustive, and a row does not mean the tire is on sale.';
}

export function rowsCaption(report) {
  const lines = countWord(report.lineCount, "tire line");
  const rows = countWord(report.matchingRowCount, "matching size row");
  return `${lines} in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC) with treadwear of ${report.minGrade} or above, traction A or AA, and temperature A on at least one size row (${rows}). Ordered by the highest matching treadwear, then traction AA before A. Treadwear lists each matching grade. "some sizes" means the filter matches fewer size rows than the line lists.`;
}

export function sizeFlag(entry) {
  const ratio = `${formatNumber(entry.matchingCount)} of ${formatNumber(entry.totalCount)}`;
  return entry.someSizes ? `some sizes, ${ratio}` : ratio;
}

export function longTreadwearFaqs(report) {
  const when = formatVerified(report.verifiedAt);
  return [
    {
      name: "Which tire lines does this page list?",
      text: `A tire line is listed when at least one size row in NHTSA's published UTQG list has treadwear of ${report.minGrade} or above, traction A or AA, and temperature A. Counts come from the file verified ${when} (UTC).`,
    },
    {
      name: 'What does "some sizes" mean?',
      text: "It means the filter matches some of the size rows NHTSA published for that line and not the others. The count shown is matching size rows out of every size row on that line. A line without that flag meets the filter on every size row in the file.",
    },
    {
      name: "Are these grades a precise wear prediction across brands?",
      text: `No. ${CAVEAT}`,
    },
    {
      name: "Is every tire with these grades in this list?",
      text: "No. NHTSA's published UTQG list is not exhaustive. This page does not invent a grade for a line the file does not contain, and a row does not mean the tire is on sale.",
    },
  ];
}

export function longTreadwearText(report) {
  return [
    ...longTreadwearAnswer(report),
    caveatText(),
    tableIntro(),
    rowsCaption(report),
    ...report.lines.map((entry) => sizeFlag(entry)),
    ...longTreadwearFaqs(report).flatMap((item) => [item.name, item.text]),
  ].join(" ");
}

export function longTreadwearJsonLd(report) {
  const answers = longTreadwearAnswer(report);
  const description = answers.join(" ");
  const faqs = longTreadwearFaqs(report);
  return [
    dataset({
      name: `Tire lines with treadwear of ${report.minGrade} or above, traction A or AA, and temperature A in NHTSA's published UTQG list`,
      description,
      path: LONG_TREADWEAR_PATH,
      dateModified: report.verifiedAt,
      isBasedOn: report.ratingsSource,
      keywords: ["UTQG", "treadwear", "traction", "temperature", "NHTSA", String(report.minGrade)],
    }),
    article({
      headline: LONG_TREADWEAR_TITLE,
      description,
      path: LONG_TREADWEAR_PATH,
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
