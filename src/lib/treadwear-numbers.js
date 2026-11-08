import { formatNumber, formatVerified, percent } from "./format.js";
import { flattenGradeRows, ratingsTableHref } from "./ratings-table.js";
import { article, dataset } from "./structured.js";

/**
 * Treadwear grades counted from the committed NHTSA UTQG rows.
 * A band is a hundred-wide group: 0–99, then 100–199, and so on through
 * the highest grade the file or the example list needs.
 * Counts are computed at build time. Do not hard-code them.
 */

export const TREADWEAR_NUMBERS_PATH = "/guides/treadwear-numbers/";

/** Grades the page answers by name. 500 is the one the answer box places. */
export const EXAMPLE_GRADES = [60, 300, 500, 600, 700];
export const FOCUS_GRADE = 500;

export const CONSUMER_GUIDE_HREF = "https://rosap.ntl.bts.gov/view/dot/75939/dot_75939_DS1.pdf";
export const TIREWISE_HREF = "https://www.nhtsa.gov/vehicle-safety/tires";

/**
 * Verified sentences from NHTSA's July 2024 consumer guide, DOT HS 813 585.
 * The parenthetical fraction in the PDF extract is ambiguous, so the
 * second sentence keeps the words "one and a half" and leaves that mark out.
 */
export const CONSUMER_GUIDE_TREADWEAR = [
  "The treadwear grade is a comparative rating based on the wear rate of the tire when tested under controlled conditions on a specified government test course.",
  "A tire graded 150 would last one and a half times the distance on the government test course under specified test conditions as one graded 100.",
  "The relative performance of tires depends upon the actual conditions of their use, however, and may depart significantly from the norm due to variations in driving habits, service practices and differences in road characteristics and climate.",
];

/** Verified sentences from NHTSA's TireWise page. */
export const TIREWISE_CONTROL = [
  "A control tire is assigned a grade of 100.",
  "Other tires are compared to the control tire.",
  "For example, a tire grade of 200 should wear twice as long as the control tire.",
];

export const BANNED_VERDICT = /\b(best|better|winner|safest|good tire|bad tire|worth buying)\b/i;

/**
 * A published conversion of a grade into road miles. The course comparison
 * in the consumer guide does not match this.
 */
export const MILES_FORMULA =
  /\b\d[\d,]*\s+miles\b|\bmiles\s*[=≈]|\btreadwear\s*[*x×/]\s*\d|\b\d+\s*miles\s+per\b|\bwarranty\s+(?:of|for)\s+\d/i;

function noun(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function listGrades(grades) {
  const labels = grades.map((grade) => String(grade));
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function parseWear(row) {
  const raw = row?.wear;
  if (raw == null || String(raw).trim() === "") return { kind: "missing" };
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return { kind: "nonnumeric" };
  return { kind: "number", wearN: Number(text) };
}

export function bandStart(grade) {
  if (grade < 100) return 0;
  return Math.floor(grade / 100) * 100;
}

export function bandLabel(start) {
  return `${start}–${start + 99}`;
}

/**
 * One pass over rows that carry a published `wear` value, using the same
 * whole-number rule as the catalog. A blank wear stays missing even when
 * another field holds a number.
 */
export function summarizeTreadwear(rows) {
  const exact = new Map();
  let missing = 0;
  let nonnumeric = 0;
  let numeric = 0;
  let zero = 0;
  let max = null;
  for (const row of rows || []) {
    const parsed = parseWear(row);
    if (parsed.kind === "missing") {
      missing += 1;
      continue;
    }
    if (parsed.kind === "nonnumeric") {
      nonnumeric += 1;
      continue;
    }
    numeric += 1;
    if (parsed.wearN === 0) zero += 1;
    exact.set(parsed.wearN, (exact.get(parsed.wearN) || 0) + 1);
    if (max == null || parsed.wearN > max) max = parsed.wearN;
  }
  return { exact, missing, nonnumeric, numeric, zero, max, rows: (rows || []).length };
}

function bandStops(summaries) {
  const values = [];
  for (const summary of summaries) {
    if (summary.max != null) values.push(summary.max);
  }
  values.push(...EXAMPLE_GRADES);
  const max = values.length ? Math.max(...values) : null;
  if (max == null) return [];
  const last = bandStart(max);
  const starts = [];
  for (let start = 0; start <= last; start += 100) starts.push(start);
  return starts;
}

function countInMap(exact, start) {
  let count = 0;
  for (const [grade, rows] of exact) {
    if (bandStart(grade) === start) count += rows;
  }
  return count;
}

function belowCount(exact, grade) {
  let count = 0;
  for (const [value, rows] of exact) {
    if (value < grade) count += rows;
  }
  return count;
}

export function mileageFieldNote(fields) {
  const names = (fields || []).map((field) => String(field));
  const hits = names.filter((name) => /mile|warranty|distance/i.test(name));
  if (!names.length) return "The committed ratings file does not list its fields here.";
  if (!hits.length) return "The committed ratings fields do not include a mileage or a warranty.";
  const listed = hits.length === 1 ? hits[0] : `${hits.slice(0, -1).join(", ")} and ${hits.at(-1)}`;
  return `The committed ratings fields include ${listed}.`;
}

export function treadwearNumbersReport(ratings, catalog) {
  const source = summarizeTreadwear(ratings);
  const shownRows = flattenGradeRows(catalog || { lines: [] });
  const shown = summarizeTreadwear(shownRows);
  const bands = bandStops([source, shown]).map((start) => {
    const end = start + 99;
    return {
      start,
      end,
      label: bandLabel(start),
      count: countInMap(source.exact, start),
      shown: countInMap(shown.exact, start),
      href: ratingsTableHref({ wearMin: String(start), wearMax: String(end) }),
    };
  });
  const byStart = new Map(bands.map((band) => [band.start, band]));
  const placements = EXAMPLE_GRADES.map((grade) => ({
    grade,
    exact: source.exact.get(grade) || 0,
    shown: shown.exact.get(grade) || 0,
    below: belowCount(source.exact, grade),
    band: byStart.get(bandStart(grade)),
    href: ratingsTableHref({ wearMin: String(grade), wearMax: String(grade) }),
  }));
  return {
    sourceRows: source.rows,
    shownRows: shown.rows,
    numeric: source.numeric,
    missing: source.missing,
    missingShown: shown.missing,
    nonnumeric: source.nonnumeric,
    nonnumericShown: shown.nonnumeric,
    zero: source.zero,
    bands,
    placements,
    focus: placements.find((item) => item.grade === FOCUS_GRADE) || null,
    verifiedAt: catalog?.meta?.verifiedAt || "",
    ratingsSource: catalog?.meta?.ratings?.source || "",
    fields: catalog?.meta?.ratings?.fields || [],
  };
}

export function treadwearNumbersAnswer(report) {
  const verified = formatVerified(report.verifiedAt);
  if (!report.numeric || !report.focus) {
    return [
      `NHTSA lists no numeric treadwear grade among ${formatNumber(report.sourceRows)} UTQG source rows, last verified ${verified} (UTC).`,
      "NHTSA's 2024 consumer guide compares a grade with a tire graded 100 on a government test course.",
      "That comparison is not a mileage promise, and the committed file has no mileage field.",
    ];
  }
  const focus = report.focus;
  return [
    `NHTSA lists ${formatNumber(report.numeric)} numeric treadwear grades among ${formatNumber(report.sourceRows)} UTQG source rows, last verified ${verified} (UTC).`,
    `Treadwear 500 is ${formatNumber(focus.exact)} of those grades, and ${formatNumber(focus.below)} numeric grades are lower (${percent(focus.below, report.numeric)} of the numeric grades).`,
    `The ${focus.band.label} band is ${formatNumber(focus.band.count)} source rows (${percent(focus.band.count, report.numeric)} of the numeric grades), and the grade is a course comparison in NHTSA's consumer guide, not a mileage promise.`,
  ];
}

export function duplicateParagraph(report) {
  const dropped = report.sourceRows - report.shownRows;
  if (dropped === 0) return "The ratings table lists every source row in this pull.";
  const rows = `${formatNumber(report.shownRows)} ${noun(report.shownRows, "grade row")}`;
  return `The ratings table drops exact duplicate grade rows. It lists ${rows} from these ${formatNumber(report.sourceRows)} source rows, so a band link can show fewer rows than the source count.`;
}

export function zeroParagraph(report) {
  if (!report.zero) return "";
  const rows = `${formatNumber(report.zero)} ${noun(report.zero, "source row")}`;
  return `The 0–99 band includes ${rows} with treadwear 0. The ratings table marks treadwear 0 as outside the usual grades. Those rows stay in this count because NHTSA published 0.`;
}

export function missingParagraph(report) {
  if (!report.missing) return "";
  const lead =
    report.missing === 1
      ? "1 source row has no treadwear number."
      : `${formatNumber(report.missing)} source rows have no treadwear number.`;
  return `${lead} A value NHTSA stored in another field stays in that field. Those rows are not in a band.`;
}

export function examplesIntro(report) {
  return `The grades in this table are ${listGrades(report.placements.map((item) => item.grade))}. Each count is source rows in the committed file. Numeric grades below a number are the numeric grades in this file that are lower.`;
}

export function bandsCaption(report) {
  return `Treadwear grades in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). Source rows are the committed file. The ratings table drops exact duplicate grade rows. Shares use the numeric grades.`;
}

export function examplesCaption(report) {
  return `Selected treadwear grades in the NHTSA UTQG file verified ${formatVerified(report.verifiedAt)} (UTC). Counts are source rows.`;
}

export function treadwearNumbersFaqs(report) {
  const byGrade = new Map(report.placements.map((item) => [item.grade, item]));
  const grade60 = byGrade.get(60);
  const grade300 = byGrade.get(300);
  const grade500 = byGrade.get(500);
  const grade600 = byGrade.get(600);
  const grade700 = byGrade.get(700);
  return [
    {
      name: "Where does treadwear 500 sit in NHTSA's list?",
      text: `NHTSA lists ${formatNumber(grade500.exact)} source rows at treadwear 500. ${formatNumber(grade500.below)} of ${formatNumber(report.numeric)} numeric grades are lower (${percent(grade500.below, report.numeric)}). The ${grade500.band.label} band is ${formatNumber(grade500.band.count)} source rows. The grade is a course comparison, not a mileage promise.`,
    },
    {
      name: "How does treadwear 300 compare with treadwear 600 in NHTSA's list?",
      text: `NHTSA lists ${formatNumber(grade300.exact)} source rows at treadwear 300 and ${formatNumber(grade600.exact)} source rows at treadwear 600. The ${grade300.band.label} band is ${formatNumber(grade300.band.count)} source rows, and the ${grade600.band.label} band is ${formatNumber(grade600.band.count)} source rows. Both numbers are course grades. NHTSA's file does not state a road distance for either grade.`,
    },
    {
      name: "How many miles does a treadwear grade of 700 stand for?",
      text: `NHTSA's file does not give a mileage figure for treadwear 700 or for any other grade. NHTSA lists ${formatNumber(grade700.exact)} source rows at 700, in the ${grade700.band.label} band of ${formatNumber(grade700.band.count)} source rows. A treadwear warranty, where a tire maker publishes one, is that maker's own figure and is not this grade.`,
    },
    {
      name: "What does a treadwear grade of 60 mean?",
      text: `NHTSA lists ${formatNumber(grade60.exact)} source rows with treadwear 60. Those rows sit in the ${grade60.band.label} band, which has ${formatNumber(grade60.band.count)} numeric grades. The 2024 consumer guide's example compares a grade of 150 with a grade of 100 on the government test course. A published 60 is a lower number on that scale. NHTSA's file does not convert 60 into a road distance.`,
    },
  ];
}

export function treadwearNumbersText(report) {
  const faqs = treadwearNumbersFaqs(report);
  return [
    ...treadwearNumbersAnswer(report),
    duplicateParagraph(report),
    zeroParagraph(report),
    missingParagraph(report),
    examplesIntro(report),
    mileageFieldNote(report.fields),
    bandsCaption(report),
    examplesCaption(report),
    ...CONSUMER_GUIDE_TREADWEAR,
    ...TIREWISE_CONTROL,
    ...faqs.flatMap((item) => [item.name, item.text]),
  ].join(" ");
}

export function treadwearNumbersJsonLd(report) {
  const answers = treadwearNumbersAnswer(report);
  const description = answers.join(" ");
  const faqs = treadwearNumbersFaqs(report);
  return [
    dataset({
      name: "Treadwear grade counts in NHTSA's published UTQG list",
      description,
      path: TREADWEAR_NUMBERS_PATH,
      dateModified: report.verifiedAt,
      isBasedOn: report.ratingsSource,
      keywords: ["UTQG", "treadwear", "NHTSA"],
    }),
    article({
      headline: "What treadwear numbers mean",
      description,
      path: TREADWEAR_NUMBERS_PATH,
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
