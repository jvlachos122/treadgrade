import { formatNumber, formatUtcDate, formatVerified } from "./format.js";
import { nameKey } from "./normalize.js";
import { formatNameList, nhtsaCampaignUrl, phraseKey, recallAnchor } from "./recalls.js";
import { slugify } from "./slug.js";
import { article, dataset } from "./structured.js";

/** Campaign list built from the committed flat recall file. */
export const RECALLS_PATH = "/recalls/";

/** USTMA's page about its consumer tire-recall search. This list does not replace it. */
export const USTMA_RECALL_LOOKUP_URL =
  "https://www.ustires.org/newsroom/ustma-launches-tire-recall-search-tool-consumers";

export const NHTSA_RECALLS_URL = "https://www.nhtsa.gov/recalls";

export const MISSING_VALUE = "Not in this file";

/**
 * Visible phrase required on the page. The list names campaigns. It does
 * not decide an individual TIN.
 */
export const TIN_LIMIT = "not authoritative for an individual TIN";

/**
 * Authored claims this page must not make. NHTSA names are not passed
 * through this pattern.
 */
export const BANNED_RECALL_ADVICE =
  /\b(best|better|winner|safest|lawsuit|lawsuits|attorney|attorneys|lawyer|lawyers|sue|suing|settlement|compensation|damages|remedy|remedies|guaranteed|you should|stop driving|file a claim|legal advice)\b/i;

/**
 * Campaigns to mention when the committed file still has them. A campaign
 * that a later refresh drops is left out, along with its date and units.
 */
export const RECALL_EXAMPLES = [
  { campaign: "26T005000", brand: /^toyo$/i, line: /^open country a\/t iii$/i },
  { campaign: "25T018000", brand: /^toyo$/i, line: /^open country a\/t iii$/i },
  { campaign: "10T002000", brand: /^toyo$/i, line: /^open country a\/t$/i },
];

const METRIC_SIZE = /\b[A-Z]{0,3}\d{2,3}\/\d{2,3}Z?R\d{2}(?:\.\d)?\b/gi;
const FLOTATION_SIZE = /\b\d{2}x\d{1,2}(?:\.\d{1,2})?R\d{2}(?:\.\d)?\b/gi;

function noun(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function uniquePreserve(values) {
  const seen = new Set();
  const kept = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(value);
  }
  return kept;
}

/**
 * Sizes come only from a defect summary stored on the row. The line name
 * is not parsed. The committed snapshot has no defect text unless a row
 * carries `sizes`, `defect`, `defectSummary`, or `summary`.
 */
export function sizesFromDefect(row) {
  const explicit = Array.isArray(row?.sizes) ? row.sizes.map((value) => String(value ?? "").trim()).filter(Boolean) : [];
  if (explicit.length) return uniquePreserve(explicit);
  const text = [row?.defect, row?.defectSummary, row?.summary]
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  if (!text) return [];
  const found = [];
  for (const pattern of [METRIC_SIZE, FLOTATION_SIZE]) {
    for (const match of text.matchAll(pattern)) found.push(match[0].toUpperCase());
  }
  return uniquePreserve(found);
}

function rowId(row, used) {
  const base = `recall-${slugify(row.campaign)}-${slugify(row.brand)}-${slugify(row.line)}`;
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

/**
 * One table row per committed campaign, brand, and line. Counts are
 * recomputed from those rows.
 */
export function buildRecallList(rows, context = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const brands = new Map((context.brands || []).map((brand) => [nameKey(brand.name), brand]));
  const lines = new Map(
    (context.lines || []).map((line) => [`${nameKey(line.brand)}\n${line.lineKey || nameKey(line.line)}`, line]),
  );
  const whoMakes = new Map((context.whoMakes || []).map((page) => [page.key, page]));
  const built = list.map((row) => {
    const sizes = sizesFromDefect(row);
    const brand = brands.get(nameKey(row.brand)) || null;
    const line = lines.get(`${nameKey(row.brand)}\n${nameKey(row.line)}`) || null;
    const who = whoMakes.get(nameKey(row.brand)) || null;
    const unitsPresent = Number.isSafeInteger(row.units);
    return {
      brand: row.brand,
      line: row.line,
      filer: row.filer,
      campaign: row.campaign,
      reportDate: row.reportDate || "",
      units: unitsPresent ? row.units : null,
      unitsPresent,
      sizes,
      brandUrl: brand?.url || "",
      lineUrl: line?.url || "",
      whoMakesUrl: who?.url || "",
      filingsHref: `/who-makes-it/#${recallAnchor(row.brand)}`,
      campaignHref: nhtsaCampaignUrl(row.campaign),
    };
  });
  built.sort(
    (a, b) =>
      b.reportDate.localeCompare(a.reportDate) ||
      a.campaign.localeCompare(b.campaign) ||
      a.brand.localeCompare(b.brand, "en") ||
      a.line.localeCompare(b.line, "en"),
  );
  const used = new Set();
  for (const row of built) {
    row.id = rowId(row, used);
    row.search = [row.brand, row.line, row.filer, row.campaign, row.sizes.join(" "), row.reportDate].join(" ").toLowerCase();
  }
  const examples = [];
  for (const check of RECALL_EXAMPLES) {
    const match = built.find(
      (row) => row.campaign === check.campaign && check.brand.test(row.brand) && check.line.test(row.line),
    );
    if (match) examples.push(match);
  }
  const dates = built.map((row) => row.reportDate).filter(Boolean).sort();
  return {
    rows: built,
    examples,
    rowCount: built.length,
    campaignCount: new Set(built.map((row) => row.campaign)).size,
    brandCount: new Set(built.map((row) => nameKey(row.brand))).size,
    filerCount: new Set(built.map((row) => phraseKey(row.filer)).filter(Boolean)).size,
    linkedLineRows: built.filter((row) => row.lineUrl).length,
    linkedBrandRows: built.filter((row) => row.brandUrl).length,
    whoMakesRows: built.filter((row) => row.whoMakesUrl).length,
    rowsWithSizes: built.filter((row) => row.sizes.length).length,
    rowsMissingUnits: built.filter((row) => !row.unitsPresent).length,
    showSizes: built.some((row) => row.sizes.length),
    earliest: dates[0] || "",
    latest: dates.at(-1) || "",
    retrievedAt: context.retrievedAt || "",
    source: context.source || "",
    ratingRecallRows: context.ratingRecallRows || 0,
  };
}

export function countRatingRecallRows(catalog) {
  let count = 0;
  for (const line of catalog?.lines || []) {
    for (const row of line.rows || []) if (row.recallsCount > 0) count += 1;
  }
  return count;
}

export function recallsTitle(source) {
  return String(source || "").includes("POST_2010")
    ? "Tire recalls NHTSA lists since 2010"
    : "Tire recalls NHTSA lists";
}

export function recallListAnswer(report) {
  const tin = `This list is ${TIN_LIMIT}, so a code has to be checked with the USTMA tire recall lookup and with NHTSA recalls.`;
  if (!report.rowCount) {
    return [
      "NHTSA lists no tire campaign in the committed flat recall file.",
      "A units figure is shown only when that file includes one, and it is the campaign total.",
      tin,
    ];
  }
  const campaigns = `${formatNumber(report.campaignCount)} ${noun(report.campaignCount, "tire campaign")}`;
  const rows = `${formatNumber(report.rowCount)} ${noun(report.rowCount, "brand and line row")}`;
  const brands = `${formatNumber(report.brandCount)} ${noun(report.brandCount, "brand string")}`;
  const units = report.rowsMissingUnits
    ? `${formatNumber(report.rowsMissingUnits)} ${noun(report.rowsMissingUnits, "row")} ${report.rowsMissingUnits === 1 ? "has" : "have"} no units figure, and a figure that is present is the campaign total repeated on every line of that campaign.`
    : "Units on each row are the campaign total from that file, and the same total is repeated for every line in the campaign.";
  return [`NHTSA lists ${campaigns} in the flat recall file, across ${rows} and ${brands}.`, units, tin];
}

export function tinParagraphs() {
  return [
    "A tire identification number, or TIN, is the DOT code molded into the sidewall. This page does not take a TIN and does not say whether one tire is included.",
    `This list is ${TIN_LIMIT}.`,
    "The DOT decoder on this site reads the plant code and the date code in a TIN. It does not say whether that TIN is in a recall.",
  ];
}

export function sizesNote(report) {
  if (!report.rowCount) return "The file has no row in this pull, so no size is listed.";
  if (!report.rowsWithSizes) {
    return "This snapshot does not include defect-summary text, so the table does not list sizes. A size is not copied from the line name.";
  }
  const rows = `${formatNumber(report.rowsWithSizes)} ${noun(report.rowsWithSizes, "row")}`;
  const verb = report.rowsWithSizes === 1 ? "includes" : "include";
  return `${rows} ${verb} sizes taken from a defect summary stored on that row. A row without that text does not get a size from the line name.`;
}

export function dateSpanSentence(report) {
  if (!report.earliest || !report.latest) return "This pull has no report date.";
  if (report.earliest === report.latest) return `Every report date in this pull is ${formatUtcDate(report.earliest)}.`;
  return `Report dates in this pull run from ${formatUtcDate(report.earliest)} through ${formatUtcDate(report.latest)}.`;
}

export function exampleParagraph(report) {
  if (!report.examples.length) return "None of the watched campaigns is in this pull.";
  const bits = report.examples.map((row) => {
    const units = row.unitsPresent ? `campaign total ${formatNumber(row.units)}` : "units not in the file";
    return `${row.brand} ${row.line}, campaign ${row.campaign}, reported ${formatUtcDate(row.reportDate)}, ${units}, filed by ${row.filer}`;
  });
  return `NHTSA lists ${formatNameList(bits)} in this pull. A watched campaign that is not in the file is left out.`;
}

export function ratingRecallParagraph(report) {
  if (!report.ratingRecallRows) {
    return "The UTQG ratings file's recall count is zero on every grade row in this pull. That zero is not a safety record. This page uses the flat recall file instead.";
  }
  const rows = `${formatNumber(report.ratingRecallRows)} ${noun(report.ratingRecallRows, "grade row")}`;
  return `The UTQG ratings file's recall count is above zero on ${rows} in this pull. Those counts are separate from this list, and a zero on another row is not a safety record.`;
}

export function recallListCounts(report) {
  return [
    ["Tire campaigns", report.campaignCount],
    ["Brand and line rows", report.rowCount],
    ["Brand strings", report.brandCount],
    ["Filing companies", report.filerCount],
    ["Rows linked to a UTQG tire-line page", report.linkedLineRows],
    ["Rows linked to a UTQG brand page", report.linkedBrandRows],
    ["Rows whose brand has a who-makes page", report.whoMakesRows],
    ["Rows with sizes from a defect summary", report.rowsWithSizes],
  ];
}

export function countsCaption(report) {
  const when = formatVerified(report.retrievedAt);
  return `Counts from NHTSA's flat tire-recall file, retrieved ${when} (UTC). Filing companies ignore letter case and punctuation.`;
}

export function rowsCaption(report) {
  const rows = `${formatNumber(report.rowCount)} ${noun(report.rowCount, "row")}`;
  const when = formatVerified(report.retrievedAt);
  return `${rows} from NHTSA's flat tire-recall file, retrieved ${when} (UTC). Each row is one campaign, brand, and line. Units are the campaign total.`;
}

export function recallListFaqs(report) {
  return [
    {
      name: "How do I check a tire identification number for a recall?",
      text: "Read the TIN on the sidewall. This page lists campaigns from NHTSA's flat recall file and does not match a TIN. Check the code with the USTMA tire recall lookup and with NHTSA recalls. The DOT decoder on this site reads the plant code and the date code, not a recall.",
    },
    {
      name: "Does a row mean every tire of that line was recalled?",
      text: "No. A row is one brand and line named on one campaign. Units are the campaign total, not a count for that line. Sizes are shown only when the committed row includes them in a defect summary.",
    },
    {
      name: "Why might a tire-line page show no recall count?",
      text: ratingRecallParagraph(report),
    },
    {
      name: "Where do these campaigns come from?",
      text: "NHTSA's flat recall file supplies the tire rows, marked RCLTYPECD T. The campaign number is CAMPNO, the report date is RCDATE, the filer is MFGNAME, and units are POTAFF. Brand and line are the file's MAKETXT and MODELTXT.",
    },
  ];
}

export function recallListText(report) {
  return [
    ...recallListAnswer(report),
    ...tinParagraphs(),
    sizesNote(report),
    dateSpanSentence(report),
    exampleParagraph(report),
    ratingRecallParagraph(report),
    countsCaption(report),
    rowsCaption(report),
    ...recallListCounts(report).map(([label]) => label),
    ...recallListFaqs(report).flatMap((item) => [item.name, item.text]),
  ].join(" ");
}

export function recallListJsonLd(report) {
  const description = recallListAnswer(report).join(" ");
  const faqs = recallListFaqs(report);
  return [
    dataset({
      name: "NHTSA tire recall campaigns as presented by TreadGrade",
      description,
      path: RECALLS_PATH,
      dateModified: report.retrievedAt,
      isBasedOn: report.source,
      keywords: ["tires", "NHTSA", "recalls", "TIN"],
    }),
    article({
      headline: recallsTitle(report.source),
      description,
      path: RECALLS_PATH,
      dateModified: report.retrievedAt,
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
