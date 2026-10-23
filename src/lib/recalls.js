import { cleanSpace } from "./format.js";
import { nameKey } from "./normalize.js";
import { slugify } from "./slug.js";

/**
 * NHTSA FLAT_RCL field positions from RCL.txt (1-based field number minus 1).
 * Tire campaigns are RCLTYPECD T. MFGNAME is the Part 573 filer.
 * MFGTXT is the file's manufacturer field for the recalled tires.
 */
export const RECALL_FIELDS = {
  campaign: 1,
  brand: 2,
  line: 3,
  filer: 7,
  type: 10,
  units: 11,
  manufacturer: 14,
  reportDate: 15,
};

export const RECALL_ZIP_URL = "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip";
export const RECALL_LAYOUT_URL = "https://static.nhtsa.gov/odi/ffdd/rcl/RCL.txt";

const KNOWN_TYPES = new Set(["V", "E", "C", "T"]);
const MIN_FIELDS = RECALL_FIELDS.reportDate + 1;
const LEGAL_WORDS = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "co",
  "company",
  "corp",
  "corporation",
  "plc",
  "lp",
]);

/**
 * Lowercase, strip accents and punctuation, and treat "&" as "and".
 * Used to compare a brand with a filing company, not to merge UTQG brands.
 */
export function phraseKey(value) {
  return cleanSpace(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(haystack, needle) {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * True when the filing company's name is a different phrase from the brand.
 * Letter case and punctuation are ignored. "Michelin" is not different from
 * "Michelin North America". "Mastercraft" is different from "Cooper Tire".
 */
export function namesDiffer(brand, filer) {
  const left = phraseKey(brand);
  const right = phraseKey(filer);
  if (!left || !right) return true;
  if (left === right) return false;
  return !containsPhrase(right, left) && !containsPhrase(left, right);
}

export function companyCore(value) {
  return phraseKey(value)
    .split(" ")
    .filter((word) => word && !LEGAL_WORDS.has(word))
    .join(" ");
}

export function sameCompany(a, b) {
  const left = companyCore(a);
  const right = companyCore(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return containsPhrase(left, right) || containsPhrase(right, left);
}

/**
 * The backlog names these filers as importers or brand owners. Rows for them
 * stay "recall filed by" even when the manufacturer field repeats their name.
 */
export function isImporterOrBrandOwnerExample(filer) {
  const key = phraseKey(filer);
  if (!key) return false;
  if (containsPhrase(key, "tireco") || key === "tireco") return true;
  if (containsPhrase(key, "harbor freight")) return true;
  if (containsPhrase(key, "discount tire")) return true;
  return key.split(" ").includes("tbc");
}

export function filerNameLooksLikeTireMaker(filer) {
  const words = phraseKey(filer).split(" ").filter(Boolean);
  if (words.includes("sales")) return false;
  return words.some((word) => word === "tire" || word === "tires" || word === "tyre" || word === "tyres" || word === "rubber");
}

/**
 * "made-by" only when the report names the filer as the manufacturer of that
 * line and the filer's own name reads as a tire or rubber company.
 * Every other row is "filed-by".
 */
export function recallWording(filer, manufacturers) {
  const list = (manufacturers || []).map((name) => cleanSpace(name)).filter(Boolean);
  const recordedAsMaker = list.length > 0 && list.every((name) => sameCompany(name, filer));
  if (recordedAsMaker && !isImporterOrBrandOwnerExample(filer) && filerNameLooksLikeTireMaker(filer)) {
    return "made-by";
  }
  return "filed-by";
}

export function formatNameList(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function nhtsaCampaignUrl(campaign) {
  return `https://www.nhtsa.gov/recalls?nhtsaId=${encodeURIComponent(campaign)}`;
}

function endSentence(text) {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function recallStatement(row) {
  const wording = recallWording(row.filer, row.manufacturers);
  const lead =
    wording === "made-by"
      ? `Made by ${row.filer} for this recalled line`
      : `Recall filed by ${row.filer} for this recalled line`;
  const others = [];
  const seen = new Set();
  for (const name of row.manufacturers || []) {
    if (!cleanSpace(name) || sameCompany(name, row.filer)) continue;
    const key = phraseKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    others.push(name);
  }
  const text = others.length
    ? `${endSentence(lead)} The report's manufacturer field names ${endSentence(formatNameList(others))}`
    : endSentence(lead);
  return { wording, text };
}

export function parseReportDate(raw) {
  const text = cleanSpace(raw);
  if (!/^\d{8}$/.test(text)) throw new Error(`Bad RCDATE ${text || "(blank)"}`);
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Impossible RCDATE ${text}`);
  }
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

export function parseUnits(raw) {
  const text = cleanSpace(raw);
  if (!/^\d+$/.test(text)) throw new Error(`Bad POTAFF ${text || "(blank)"}`);
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new Error(`POTAFF out of range ${text}`);
  return value;
}

export function recallAnchor(brand) {
  return `brand-${slugify(brand)}`;
}

function addSpell(map, key, spelling) {
  if (!map.has(key)) map.set(key, new Map());
  const spells = map.get(key);
  spells.set(spelling, (spells.get(spelling) || 0) + 1);
}

function chooseDisplay(counts) {
  let best = "";
  let bestCount = -1;
  let bestLower = -1;
  for (const [spelling, count] of counts) {
    const lower = (spelling.match(/[a-z]/g) || []).length;
    if (
      count > bestCount ||
      (count === bestCount && lower > bestLower) ||
      (count === bestCount && lower === bestLower && spelling.localeCompare(best) < 0)
    ) {
      best = spelling;
      bestCount = count;
      bestLower = lower;
    }
  }
  return best;
}

export async function collectTireRecalls(lines) {
  const groups = new Map();
  const campaigns = new Map();
  const brandSpells = new Map();
  const lineSpells = new Map();
  const companySpells = new Map();
  let tireRows = 0;
  let otherRows = 0;

  for await (const rawLine of lines) {
    const line = String(rawLine).replace(/^\uFEFF/, "").replace(/\r$/, "");
    if (!line.trim()) continue;
    const fields = line.split("\t");
    if (fields.length < MIN_FIELDS) throw new Error(`Recall record has ${fields.length} fields`);
    const type = cleanSpace(fields[RECALL_FIELDS.type]);
    if (!KNOWN_TYPES.has(type)) throw new Error(`Unexpected RCLTYPECD ${type || "(blank)"}`);
    if (type !== "T") {
      otherRows += 1;
      continue;
    }
    tireRows += 1;
    const campaign = cleanSpace(fields[RECALL_FIELDS.campaign]);
    const brand = cleanSpace(fields[RECALL_FIELDS.brand]);
    const model = cleanSpace(fields[RECALL_FIELDS.line]);
    const filer = cleanSpace(fields[RECALL_FIELDS.filer]);
    const manufacturer = cleanSpace(fields[RECALL_FIELDS.manufacturer]);
    const units = parseUnits(fields[RECALL_FIELDS.units]);
    const reportDate = parseReportDate(fields[RECALL_FIELDS.reportDate]);
    if (!campaign || !brand || !model || !filer) {
      throw new Error(`Tire recall ${campaign || "?"} is missing a brand, line, or filer`);
    }
    const bKey = nameKey(brand);
    const lKey = nameKey(model);
    const fKey = phraseKey(filer);
    const seen = campaigns.get(campaign);
    if (!seen) campaigns.set(campaign, { fKey, units, reportDate });
    else if (seen.fKey !== fKey || seen.units !== units || seen.reportDate !== reportDate) {
      throw new Error(`Campaign ${campaign} has conflicting filer, units, or report date`);
    }
    addSpell(brandSpells, bKey, brand);
    addSpell(lineSpells, `${bKey}\n${lKey}`, model);
    addSpell(companySpells, fKey, filer);
    if (manufacturer) addSpell(companySpells, phraseKey(manufacturer), manufacturer);
    const groupKey = `${campaign}\n${bKey}\n${lKey}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { campaign, bKey, lKey, fKey, units, reportDate, manufacturers: new Set() };
      groups.set(groupKey, group);
    }
    if (manufacturer) group.manufacturers.add(phraseKey(manufacturer));
  }

  const rows = [...groups.values()].map((group) => ({
    brand: chooseDisplay(brandSpells.get(group.bKey)),
    line: chooseDisplay(lineSpells.get(`${group.bKey}\n${group.lKey}`)),
    filer: chooseDisplay(companySpells.get(group.fKey)),
    manufacturers: [...group.manufacturers]
      .map((key) => chooseDisplay(companySpells.get(key)))
      .sort((a, b) => a.localeCompare(b, "en")),
    campaign: group.campaign,
    reportDate: group.reportDate,
    units: group.units,
  }));
  rows.sort(
    (a, b) =>
      a.brand.localeCompare(b.brand, "en") ||
      a.line.localeCompare(b.line, "en") ||
      a.reportDate.localeCompare(b.reportDate) ||
      a.campaign.localeCompare(b.campaign),
  );
  return { rows, tireRows, otherRows, campaigns: campaigns.size };
}

export function summarizeRecallRows(rows) {
  const byBrand = new Map();
  const campaignIds = new Set();
  let madeByRows = 0;
  let filedByRows = 0;
  for (const row of rows) {
    campaignIds.add(row.campaign);
    const key = nameKey(row.brand);
    if (!byBrand.has(key)) {
      byBrand.set(key, {
        key,
        brand: row.brand,
        anchor: recallAnchor(row.brand),
        rows: [],
        filers: [],
        campaigns: new Set(),
        differs: false,
      });
    }
    const entry = byBrand.get(key);
    entry.rows.push(row);
    entry.campaigns.add(row.campaign);
    if (!entry.filers.includes(row.filer)) entry.filers.push(row.filer);
    if (namesDiffer(row.brand, row.filer)) entry.differs = true;
    if (recallWording(row.filer, row.manufacturers) === "made-by") madeByRows += 1;
    else filedByRows += 1;
  }

  const anchors = new Set();
  for (const entry of byBrand.values()) {
    if (anchors.has(entry.anchor)) throw new Error(`Recall anchor collision ${entry.anchor}`);
    anchors.add(entry.anchor);
    entry.campaigns = entry.campaigns.size;
  }

  let sameExample = null;
  let differExample = null;
  for (const entry of byBrand.values()) {
    if (!differExample && entry.differs) {
      const row = entry.rows.find((item) => namesDiffer(item.brand, item.filer));
      differExample = { brand: row.brand, filer: row.filer };
    }
    if (!sameExample && !entry.differs) {
      const row = entry.rows.find((item) => phraseKey(item.filer) !== phraseKey(item.brand));
      if (row) sameExample = { brand: row.brand, filer: row.filer };
    }
  }

  return {
    campaigns: campaignIds.size,
    brands: byBrand.size,
    lines: rows.length,
    brandsWithDifferentFiler: [...byBrand.values()].filter((entry) => entry.differs).length,
    madeByRows,
    filedByRows,
    byBrand,
    sameExample,
    differExample,
  };
}
