import { formatTreadwearMedian, treadwearMedian } from "./answers.js";
import { formatNumber, formatUtcDate, formatVerified, percent } from "./format.js";
import { SIZE_VARIANCE_PATH } from "./size-variance.js";

/**
 * Section on the existing UTQG guide. The address is
 * /guides/utqg-grades/#across-brands. This module does not add a route.
 *
 * Rule text is 49 CFR 575.104 as read on the eCFR page on ECFR_RETRIEVED.
 * Paragraph (d)(1)(i) says each tire manufacturer, or the brand name owner
 * when a tire is marketed under a brand name, provides the grades.
 * Paragraph (d)(2) grades a tire when it is tested under paragraphs (e),
 * (f), and (g). Paragraphs (e)(1)(i) and (f)(1)(i) establish the treadwear
 * course and the traction pads both for NHTSA's own compliance testing and
 * for regulated persons.
 *
 * Tire Review text is from "UTQG Ratings Unfurled" (Rich Ashley, December 1,
 * 2015): the DOT does not conduct the tests; each manufacturer performs its
 * own tests or hires an independent testing company; there are no routine
 * audits; comparing treadwear ratings within a single brand is somewhat
 * helpful, and comparing grades between different brands is questionable.
 * That article's control-tire discussion and its mileage rule of thumb are
 * not repeated here.
 *
 * Counts use the catalog, after exact duplicate grade rows are dropped.
 * Usable treadwear is a positive whole number, the same rule as
 * treadwearMedian. The 10th and 90th percentiles are the value at
 * (n - 1) * p in that ordered list, on a straight line between the two
 * nearest rows. The table is the brands with the most graded lines.
 * It is not a quality ranking.
 */

export const UTQG_GRADES_PATH = "/guides/utqg-grades/";
export const ACROSS_BRANDS_ID = "across-brands";
export const ACROSS_BRANDS_HREF = `${UTQG_GRADES_PATH}#${ACROSS_BRANDS_ID}`;

/** Twelve is inside the requested band of 10 to 15 brands. */
export const ACROSS_BRAND_LIMIT = 12;

export const ECFR_UTQG_URL =
  "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-575/section-575.104";
export const ECFR_RETRIEVED = "2026-11-22";

export const TIRE_REVIEW_URL = "https://www.tirereview.com/utqg-ratings-unfurled/";
export const TIRE_REVIEW_PUBLISHED = "2015-12-01";

export const RATINGS_PATH = "/ratings/";
export const METHODOLOGY_PATH = "/methodology/";
export { SIZE_VARIANCE_PATH };

export const BANNED_ACROSS_WORD =
  /\b(best|better|worse|winner|safest|popular|top-rated|top rated|recommend(?:ed|s|ing)?|worth buying)\b/i;

export const CROSS_CHECK = [
  {
    id: "warranty",
    text: "The treadwear mileage warranty on the tire maker's site. That warranty is the maker's figure, not a UTQG grade.",
  },
  {
    id: "tests",
    text: "Independent test results. This file does not include them.",
  },
  {
    id: "size",
    text: "The grade for the size. The same line can list more than one grade.",
  },
];

function usableWear(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Inclusive linear percentile of usable treadwear values. p is 0.1 or 0.9.
 * Rounded to one decimal so a binary fraction does not change the printed
 * tenth. An empty list returns null.
 */
export function treadwearPercentile(values, p) {
  const wears = (values || []).filter(usableWear).sort((a, b) => a - b);
  if (!wears.length) return null;
  const rank = (wears.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const value = wears[lo] + (wears[hi] - wears[lo]) * (rank - lo);
  return Math.round(value * 10) / 10;
}

export function formatPercentileSpan(low, high) {
  if (low == null || high == null) return "Not reported";
  const left = formatTreadwearMedian(low);
  const right = formatTreadwearMedian(high);
  if (left === right) return left;
  return `${left}–${right}`;
}

export function ecfrRetrievedLabel(iso = ECFR_RETRIEVED) {
  return formatUtcDate(iso);
}

export function tireReviewPublishedLabel(iso = TIRE_REVIEW_PUBLISHED) {
  return formatUtcDate(iso);
}

function brandRow(brand, lines) {
  const rows = lines.flatMap((line) => line.rows || []);
  const wears = rows.map((row) => row.wearN);
  const aaCount = rows.filter((row) => row.trac === "AA" || row.trac === "A").length;
  const median = treadwearMedian(wears);
  const p10 = treadwearPercentile(wears, 0.1);
  const p90 = treadwearPercentile(wears, 0.9);
  return {
    name: brand.name,
    slug: brand.slug,
    url: brand.url,
    lineCount: lines.length,
    rowCount: rows.length,
    median,
    p10,
    p90,
    aaCount,
    medianText: formatTreadwearMedian(median),
    spanText: formatPercentileSpan(p10, p90),
    shareText: percent(aaCount, rows.length),
  };
}

/**
 * Brands with the most graded lines. A line with no brand page is left out.
 * Ties break on grade-row count, then brand slug.
 */
export function acrossBrandsReport(catalog, limit = ACROSS_BRAND_LIMIT) {
  const lines = catalog?.lines || [];
  const bySlug = new Map();
  for (const line of lines) {
    const slug = line.brandSlug;
    if (!slug) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(line);
  }
  const brandBySlug = new Map((catalog?.brands || []).map((brand) => [brand.slug, brand]));
  const ranked = [];
  for (const [slug, group] of bySlug) {
    const brand = brandBySlug.get(slug);
    if (!brand?.url || !brand.name) continue;
    ranked.push(brandRow(brand, group));
  }
  ranked.sort((a, b) => b.lineCount - a.lineCount || b.rowCount - a.rowCount || a.slug.localeCompare(b.slug, "en"));
  const cap = Number.isInteger(limit) && limit > 0 ? limit : 0;
  return {
    limit: cap,
    brandCount: ranked.length,
    brands: ranked.slice(0, cap),
  };
}

/** Compact row for the sitemap hash. Dates and formatted labels stay out. */
export function acrossBrandsData(catalog) {
  return acrossBrandsReport(catalog).brands.map((brand) => [
    brand.slug,
    brand.lineCount,
    brand.rowCount,
    brand.median,
    brand.p10,
    brand.p90,
    brand.aaCount,
  ]);
}

export function acrossBrandsAnswer() {
  return [
    "Under 49 CFR 575.104, each tire manufacturer, or the brand name owner when a tire is marketed under a brand name, provides the treadwear, traction, and temperature grades for tires tested under the procedures in that section.",
    "That section establishes the treadwear course and the traction pads both for NHTSA's own compliance testing and for regulated persons.",
    "Tire Review reports that the DOT does not conduct the tests, that each manufacturer performs its own tests or hires an independent testing company, that there are no routine audits, and that comparing treadwear ratings within a single brand is somewhat helpful while comparing grades between different brands is questionable.",
  ];
}

export function acrossBrandsIntro(report) {
  const shown = report?.brands?.length || 0;
  const listed = report?.brandCount || 0;
  if (!shown) return "This file has no graded line to put in the table.";
  const noun = shown === 1 ? "brand" : "brands";
  const which =
    shown < listed
      ? `the ${formatNumber(shown)} ${noun} with the most graded lines`
      : shown === 1
        ? "the one brand"
        : `all ${formatNumber(shown)} brands`;
  return `The table lists ${which} in this file, ordered by that line count. Median and 10th–90th treadwear use rows with a positive whole-number treadwear. When a percentile falls between two rows, the figure is the straight line between those grades. The share of traction AA or A uses every grade row.`;
}

export function acrossBrandsCaption(verifiedAt) {
  const when = formatVerified(verifiedAt);
  return `How each brand grades its own tires in NHTSA's published UTQG list, verified ${when} (UTC). This shows how each brand grades its own tires, not a quality ranking.`;
}

export function acrossBrandsText(report, verifiedAt = "2020-01-01T00:00:00.000Z") {
  return [
    ...acrossBrandsAnswer(),
    acrossBrandsIntro(report),
    acrossBrandsCaption(verifiedAt),
    ...CROSS_CHECK.map((item) => item.text),
  ].join("\n");
}
