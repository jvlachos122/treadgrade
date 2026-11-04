import { USUAL_TEMPERATURE, USUAL_TRACTION } from "./grade-quality.js";
import { formatNumber } from "./format.js";
import { nameKey } from "./normalize.js";
import { nhtsaCampaignUrl, recallAnchor, recallStatement } from "./recalls.js";
import { plantsMatchingFilings } from "./who-makes.js";

/**
 * Example comparisons are a fixed, documented matching from the committed
 * ratings file. They are examples, not a popularity list and not a ranking.
 *
 * A line qualifies when all of the following hold:
 * - Its brand is one of the EXAMPLE_BRAND_LIMIT brands with the most grade
 *   rows. Ties break on brand slug, A to Z. The row count is how many rows
 *   NHTSA published. It is not a quality ranking.
 * - It has at least MIN_EXAMPLE_SIZE_ROWS size rows and at least two different
 *   size strings, so both sides of a pair have multi-size data.
 * - Every size row has a positive whole-number treadwear and a usual traction
 *   grade (AA, A, B, C) and temperature grade (A, B, C).
 * - The line name is not also stored under another brand. A shared name is a
 *   known mispair in this file, not a head-to-head.
 * - The line name does not start with a different brand's name.
 * - The line name does not contain OE or RFT as a whole word. Those rows are
 *   original-equipment or run-flat splits.
 * - The line name matches one token list below and does not match that list's
 *   skip pattern. Performance is tested first. NHTSA's file has no category
 *   field. A token is not an NHTSA category.
 *
 * For each token list, the qualifying line with the most size rows is that
 * brand's representative. Ties use the line name, A to Z, then the line slug.
 * Representatives are sorted by brand slug. Pages pair each representative
 * with the next one, then with the one two places away, and stop at
 * EXAMPLE_COMPARISON_LIMIT pages. The full set of combinations is not built.
 *
 * The treadwear median uses usable grades only (positive whole numbers), in
 * ascending order. An odd count uses the middle grade. An even count uses the
 * mean of the two middle grades.
 */

export const COMPARE_PATH = "/compare/";
export const COMPARE_MIN_LINES = 2;
export const COMPARE_MAX_LINES = 4;
export const EXAMPLE_COMPARISON_LIMIT = 20;
export const EXAMPLE_NEIGHBOR_DISTANCE = 2;
export const EXAMPLE_BRAND_LIMIT = 15;
export const MIN_EXAMPLE_SIZE_ROWS = 4;
export const MIN_DISTINCT_SIZES = 2;

const LINE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SPLIT_TOKEN = /\b(?:oe|rft)\b/i;

export const COMPARE_FAMILIES = [
  {
    id: "performance",
    label: "Performance name token",
    tokens: "Potenza, Pilot Sport, Eagle F1, SportContact, Azenis, Advan Sport, P Zero, S.drive, Sport Maxx, Ventus S1 evo, or Ventus evo",
    skip: "all-season, A/S, AS, winter, snow, ice, or SUV",
    include: [
      /\bpotenza\b/i,
      /\bpilot sport\b/i,
      /\beagle f1\b/i,
      /sportcontact/i,
      /\bazenis\b/i,
      /\badvan sport\b/i,
      /\bp zero\b/i,
      /\bs\.drive\b/i,
      /sport maxx/i,
      /ventus s1 evo/i,
      /ventus evo/i,
    ],
    exclude: [/all[\s-]?season/i, /\ba\/s\b/i, /\bas\b/i, /as$/i, /\bwinter\b/i, /\bsnow\b/i, /\bice\b/i, /\bsuv\b/i],
  },
  {
    id: "touring",
    label: "Touring name token",
    tokens:
      "Defender, Assurance, Primacy, Ecopia, Turanza, Kinergy, Avid, TrueContact, AltiMAX, Tiger Paw, ProContact, CrossClimate, ControlContact Tour, Optimo, Touring, or Energy Saver",
    skip: "Potenza, Pilot, Eagle F1, SportContact, Azenis, A/T, Wrangler, Dueler, Geolandar, Scorpion, LTX, Latitude, winter, snow, ice, Grabber, or sport",
    include: [
      /\bdefender\b/i,
      /\bassurance\b/i,
      /\bprimacy\b/i,
      /\becopia\b/i,
      /\bturanza\b/i,
      /\bkinergy\b/i,
      /\bavid\b/i,
      /truecontact/i,
      /\baltimax\b/i,
      /tiger paw/i,
      /procontact/i,
      /crossclimate/i,
      /controlcontact tour/i,
      /\boptimo\b/i,
      /\btouring\b/i,
      /energy saver/i,
    ],
    exclude: [
      /\bpotenza\b/i,
      /\bpilot\b/i,
      /\beagle f1\b/i,
      /sportcontact/i,
      /\bazenis\b/i,
      /\ba\/t\b/i,
      /wrangler/i,
      /\bdueler\b/i,
      /geolandar/i,
      /\bscorpion\b/i,
      /\bltx\b/i,
      /\blatitude\b/i,
      /\bwinter\b/i,
      /\bsnow\b/i,
      /\bice\b/i,
      /\bgrabber\b/i,
      /\bsport\b/i,
    ],
  },
];

export const GRADE_COMPARE_FAQ = {
  name: "Can UTQG grades from different brands be compared directly?",
  text: "NHTSA lists manufacturer-assigned grades under 49 CFR 575.104. Treadwear is a relative grade from a government test course, not miles, and grades from different brands are only loosely comparable.",
};

export const TOOL_FAQS = [
  {
    name: "How does a shared comparison address work?",
    text: "The address stores the chosen lines in the lines query. Opening that address shows those lines. A query address is not a separate indexed page. It points back at this tool page.",
  },
  GRADE_COMPARE_FAQ,
];

export const EXAMPLE_FAQS = [GRADE_COMPARE_FAQ];

export function familyForLineName(lineName) {
  for (const family of COMPARE_FAMILIES) {
    if (!family.include.some((pattern) => pattern.test(lineName))) continue;
    if (family.exclude.some((pattern) => pattern.test(lineName))) continue;
    return family.id;
  }
  return "";
}

export function familyById(id) {
  return COMPARE_FAMILIES.find((family) => family.id === id) || null;
}

export function exampleRuleParagraphs() {
  const performance = familyById("performance");
  const touring = familyById("touring");
  return [
    `Example comparisons are pairs chosen by a fixed rule from the committed ratings file. A line is included when its brand is one of the ${EXAMPLE_BRAND_LIMIT} brands with the most grade rows, it has at least ${MIN_EXAMPLE_SIZE_ROWS} size rows and at least ${MIN_DISTINCT_SIZES} different size strings, every row has a positive whole-number treadwear and a usual traction and temperature grade, the line name is not stored under another brand, the line name does not start with a different brand's name, and the name does not contain OE or RFT as a word. The brand cutoff uses the row count in the ratings file. It is not a quality ranking.`,
    `Each included line matches one token list. Performance tokens: ${performance.tokens}. A performance name is skipped when it also matches: ${performance.skip}. Touring tokens: ${touring.tokens}. A touring name is skipped when it also matches: ${touring.skip}. Performance is tested first. NHTSA's ratings file has no category field, so a token is not an NHTSA category.`,
    `For each token list, the line with the most size rows for that brand is the representative. Ties use the line name in alphabetical order. Representatives are sorted by brand slug. The pages pair each representative with the next one, then with the one two places away, and stop at ${EXAMPLE_COMPARISON_LIMIT} pages. The full set of combinations is not built.`,
  ];
}

export function topBrandSlugs(brands, limit = EXAMPLE_BRAND_LIMIT) {
  return [...brands]
    .sort((a, b) => b.rowCount - a.rowCount || a.slug.localeCompare(b.slug))
    .slice(0, limit)
    .map((brand) => brand.slug);
}

function brandPhrases(brands) {
  return brands
    .map((brand) => nameKey(brand.name))
    .filter((phrase) => phrase.length >= 4)
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function startsWithOtherBrand(line, phrases) {
  const name = nameKey(line.line);
  const own = nameKey(line.brand);
  for (const phrase of phrases) {
    if (phrase === own) continue;
    if (name === phrase || name.startsWith(`${phrase} `)) return true;
  }
  return false;
}

function usualRow(row) {
  return (
    Number.isInteger(row.wearN) &&
    row.wearN > 0 &&
    USUAL_TRACTION.includes(row.trac) &&
    USUAL_TEMPERATURE.includes(row.temp)
  );
}

function distinctSizeCount(line) {
  return new Set(line.rows.map((row) => row.size)).size;
}

export function lineQualifiesForExample(line, context) {
  if (!context.topSlugs.has(line.brandSlug)) return false;
  if (line.rows.length < MIN_EXAMPLE_SIZE_ROWS) return false;
  if (distinctSizeCount(line) < MIN_DISTINCT_SIZES) return false;
  if (line.sameName?.length) return false;
  if (startsWithOtherBrand(line, context.phrases)) return false;
  if (SPLIT_TOKEN.test(line.line)) return false;
  if (!line.rows.every(usualRow)) return false;
  return Boolean(familyForLineName(line.line));
}

function representatives(lines) {
  const byBrand = new Map();
  for (const line of lines) {
    const list = byBrand.get(line.brandSlug) || [];
    list.push(line);
    byBrand.set(line.brandSlug, list);
  }
  const reps = [];
  for (const list of byBrand.values()) {
    list.sort(
      (a, b) => b.rows.length - a.rows.length || a.line.localeCompare(b.line, "en") || a.lineSlug.localeCompare(b.lineSlug),
    );
    reps.push(list[0]);
  }
  reps.sort((a, b) => a.brandSlug.localeCompare(b.brandSlug) || a.lineSlug.localeCompare(b.lineSlug));
  return reps;
}

function orderLines(a, b) {
  const bySlug = a.brandSlug.localeCompare(b.brandSlug) || a.lineSlug.localeCompare(b.lineSlug);
  return bySlug <= 0 ? [a, b] : [b, a];
}

export function exampleComparisonPath(left, right) {
  return `/compare/${left.brandSlug}/${left.lineSlug}/vs/${right.brandSlug}/${right.lineSlug}/`;
}

export function selectExampleComparisons(catalog) {
  const context = {
    topSlugs: new Set(topBrandSlugs(catalog.brands)),
    phrases: brandPhrases(catalog.brands),
  };
  const byFamily = new Map();
  for (const line of catalog.lines) {
    if (!lineQualifiesForExample(line, context)) continue;
    const familyId = familyForLineName(line.line);
    if (!byFamily.has(familyId)) byFamily.set(familyId, []);
    byFamily.get(familyId).push(line);
  }
  const familyIds = [...byFamily.keys()].sort();
  const reps = new Map(familyIds.map((id) => [id, representatives(byFamily.get(id))]));
  const pairs = [];
  for (let distance = 1; distance <= EXAMPLE_NEIGHBOR_DISTANCE; distance += 1) {
    for (const familyId of familyIds) {
      const list = reps.get(familyId);
      for (let index = 0; index + distance < list.length; index += 1) {
        const [left, right] = orderLines(list[index], list[index + distance]);
        pairs.push({
          familyId,
          distance,
          left,
          right,
          path: exampleComparisonPath(left, right),
        });
        if (pairs.length === EXAMPLE_COMPARISON_LIMIT) return pairs;
      }
    }
  }
  return pairs;
}

export function treadwearStats(values) {
  const wears = values.filter((value) => Number.isInteger(value) && value > 0).sort((a, b) => a - b);
  if (!wears.length) return { min: null, max: null, median: null };
  const mid = Math.floor(wears.length / 2);
  const median = wears.length % 2 === 1 ? wears[mid] : (wears[mid - 1] + wears[mid]) / 2;
  return { min: wears[0], max: wears[wears.length - 1], median };
}

function uniqueGrades(values, order) {
  const present = new Set(values.filter(Boolean));
  const known = order.filter((grade) => present.has(grade));
  const other = [...present].filter((grade) => !order.includes(grade)).sort();
  return [...known, ...other];
}

export function recallRowsForLine(line, summary) {
  const entry = summary?.byBrand?.get(nameKey(line.brand));
  if (!entry) return [];
  return entry.rows.filter((row) => nameKey(row.line) === line.lineKey);
}

export function buildLineRecord(line, { recallRows = [], plants = [] } = {}) {
  const stats = treadwearStats(line.rows.map((row) => row.wearN));
  const recalls = recallRows.map((row) => ({
    campaign: row.campaign,
    reportDate: row.reportDate,
    filer: row.filer,
    units: row.units,
    text: recallStatement(row).text,
    href: nhtsaCampaignUrl(row.campaign),
    whoHref: `/who-makes-it/#${recallAnchor(row.brand)}`,
  }));
  const plantLinks = plantsMatchingFilings(plants, recallRows).map((plant) => ({
    code: plant.code,
    name: plant.name,
    city: plant.city,
    country: plant.country,
    status: plant.status,
    url: plant.url,
    matchedCompany: plant.matchedCompany,
  }));
  return {
    id: `${line.brandSlug}/${line.lineSlug}`,
    brand: line.brand,
    line: line.line,
    brandSlug: line.brandSlug,
    lineSlug: line.lineSlug,
    url: line.url,
    sizeCount: line.rows.length,
    wearMin: stats.min,
    wearMax: stats.max,
    wearMedian: stats.median,
    traction: uniqueGrades(
      line.rows.map((row) => row.trac),
      USUAL_TRACTION,
    ),
    temperature: uniqueGrades(
      line.rows.map((row) => row.temp),
      USUAL_TEMPERATURE,
    ),
    sizes: line.rows.map((row) => ({
      size: row.size,
      wear: row.wear,
      trac: row.trac,
      temp: row.temp,
    })),
    recalls,
    plants: plantLinks,
  };
}

export function toPublicSummary(record) {
  return {
    id: record.id,
    b: record.brand,
    l: record.line,
    u: record.url,
    n: record.sizeCount,
    min: record.wearMin,
    med: record.wearMedian,
    max: record.wearMax,
    tr: record.traction,
    te: record.temperature,
    sizes: record.sizes.map((row) => [row.size, row.wear ?? "", row.trac, row.temp]),
    recalls: record.recalls.map((row) => ({
      c: row.campaign,
      d: row.reportDate,
      f: row.filer,
      n: row.units,
      t: row.text,
      h: row.href,
      w: row.whoHref,
    })),
    plants: record.plants.map((plant) => ({
      c: plant.code,
      n: plant.name,
      city: plant.city,
      country: plant.country,
      s: plant.status || "",
      u: plant.url,
      co: plant.matchedCompany,
    })),
  };
}

export function fromPublicSummary(data) {
  return {
    id: data.id,
    brand: data.b,
    line: data.l,
    url: data.u,
    sizeCount: data.n,
    wearMin: data.min,
    wearMax: data.max,
    wearMedian: data.med,
    traction: data.tr || [],
    temperature: data.te || [],
    sizes: (data.sizes || []).map(([size, wear, trac, temp]) => ({
      size,
      wear: wear === "" || wear == null ? null : String(wear),
      trac,
      temp,
    })),
    recalls: (data.recalls || []).map((row) => ({
      campaign: row.c,
      reportDate: row.d,
      filer: row.f,
      units: row.n,
      text: row.t,
      href: row.h,
      whoHref: row.w,
    })),
    plants: (data.plants || []).map((plant) => ({
      code: plant.c,
      name: plant.n,
      city: plant.city,
      country: plant.country,
      status: plant.s || null,
      url: plant.u,
      matchedCompany: plant.co,
    })),
  };
}

export function formatMedian(value) {
  if (value == null) return "Not reported";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

export function formatWear(value) {
  if (value == null || value === "") return "Not reported";
  return String(value);
}

function wearPhrase(record) {
  if (record.wearMin == null || record.wearMax == null) return "no usable treadwear number";
  if (record.wearMin === record.wearMax) return `treadwear ${formatNumber(record.wearMin)}`;
  return `treadwear from ${formatNumber(record.wearMin)} to ${formatNumber(record.wearMax)}`;
}

function letterPhrase(label, values) {
  if (!values.length) return `${label} not reported`;
  if (values.length === 1) return `${label} ${values[0]}`;
  if (values.length === 2) return `${label} ${values[0]} and ${values[1]}`;
  return `${label} ${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function joinClauses(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function sizeNoun(count) {
  return `${formatNumber(count)} size ${count === 1 ? "row" : "rows"}`;
}

export function compareAnswers(records) {
  if (!records || records.length < 2) return [];
  if (records.length > 2) {
    const clauses = records.map(
      (record) => `${record.brand} ${record.line} on ${sizeNoun(record.sizeCount)}, with ${wearPhrase(record)}`,
    );
    return [
      `NHTSA lists ${joinClauses(clauses)}.`,
      "Treadwear is a relative grade under 49 CFR 575.104, not miles, and grades from different brands are only loosely comparable.",
    ];
  }
  const [left, right] = records;
  return [
    `NHTSA lists ${left.brand} ${left.line} on ${sizeNoun(left.sizeCount)}, with ${wearPhrase(left)}, and ${right.brand} ${right.line} on ${sizeNoun(right.sizeCount)}, with ${wearPhrase(right)}.`,
    `NHTSA lists ${letterPhrase("traction", left.traction)} with ${letterPhrase("temperature", left.temperature)} for ${left.line}, and ${letterPhrase("traction", right.traction)} with ${letterPhrase("temperature", right.temperature)} for ${right.line}.`,
    "Treadwear is a relative grade under 49 CFR 575.104, not miles, and grades from different brands are only loosely comparable.",
  ];
}

export function toolAnswers(catalog) {
  return [
    `NHTSA's published UTQG list has ${formatNumber(catalog.stats.lines)} tire lines and ${formatNumber(catalog.stats.rows)} grade rows. This tool places two, three, or four of those lines side by side.`,
    "Each column shows the size-row count and the minimum, median, and maximum treadwear, plus the traction and temperature grades NHTSA lists on each size row.",
    "Treadwear is a relative grade under 49 CFR 575.104, not miles, and grades from different brands are only loosely comparable.",
  ];
}

export function parseCompareLines(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search ?? "").replace(/^\?/, ""));
  const raw = params.get("lines");
  if (raw == null) return [];
  const seen = new Set();
  const ids = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (!LINE_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length === COMPARE_MAX_LINES) break;
  }
  return ids;
}

export function compareSearch(ids) {
  if (!ids?.length) return "";
  return `?lines=${ids.join(",")}`;
}

export function compareToolHref(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).map((id) => String(id || "").trim().toLowerCase()).filter((id) => LINE_ID.test(id));
  const unique = [];
  for (const id of list) {
    if (!unique.includes(id)) unique.push(id);
    if (unique.length === COMPARE_MAX_LINES) break;
  }
  return `${COMPARE_PATH}${compareSearch(unique)}`;
}

/**
 * A URL that carries a lines query is a shared comparison, not its own page.
 * The tool page itself, with no lines query, stays indexable.
 */
export function compareIndexing(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search ?? "").replace(/^\?/, ""));
  return {
    noindex: params.has("lines"),
    canonicalPath: COMPARE_PATH,
  };
}

export function filterCompareIndex(lines, query, limit = 12) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q || !lines) return [];
  const scored = [];
  for (const line of lines) {
    const combined = `${line.b} ${line.l}`.toLowerCase();
    const lineName = String(line.l || "").toLowerCase();
    let score = 0;
    if (lineName === q || combined === q) score = 90;
    else if (lineName.startsWith(q) || combined.startsWith(q)) score = 70;
    else if (lineName.includes(q) || combined.includes(q)) score = 30;
    if (!score) continue;
    scored.push({ score, line });
  }
  scored.sort(
    (a, b) => b.score - a.score || a.line.b.localeCompare(b.line.b, "en") || a.line.l.localeCompare(b.line.l, "en") || a.line.id.localeCompare(b.line.id),
  );
  return scored.slice(0, limit).map((item) => item.line);
}

const BANNED_WORD = /\b(best|better|winner|safest|popular)\b/i;

export function bannedCompareWord(text) {
  const match = String(text ?? "").match(BANNED_WORD);
  return match ? match[1] : "";
}
