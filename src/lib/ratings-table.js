import { rowQuality } from "./grade-quality.js";

export const TRACTION_OPTIONS = ["AA", "A", "B", "C"];
export const TEMPERATURE_OPTIONS = ["A", "B", "C"];
export const PAGE_SIZE = 40;

const SORTS = new Set(["brand", "wear-desc", "wear-asc", "traction", "temp"]);
const SIZES = new Set(["specific", "all"]);
const QUALITIES = new Set(["hide", "invalid", "suspect", "flagged"]);
const TRACTION_RANK = { AA: 4, A: 3, B: 2, C: 1 };
const TEMPERATURE_RANK = { A: 3, B: 2, C: 1 };

/**
 * "All sizes" is only the published phrases that name every size and nothing
 * else. Extra words ("except", a series, a speed rating, a named size) stay
 * size-specific. Spacing is collapsed. Spelling is not corrected, so a typo
 * such as "All Sizea" stays size-specific.
 */
export function sizeScope(size) {
  const text = String(size ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (/^all(?:\s+sizes?)?$/i.test(text)) return "all";
  return "specific";
}

export function sizeFlagLabel(size) {
  return sizeScope(size) === "all" ? "All sizes" : "Size-specific";
}

export function qualityLabel(row) {
  const quality = rowQuality(row);
  if (quality.kind === "ok") return "";
  const title = quality.kind === "invalid" ? "Invalid" : "Suspect";
  return `${title}: ${quality.reasons.join("; ")}`;
}

export function emptyRatingsQuery() {
  return {
    q: "",
    traction: [],
    temp: [],
    wearMin: "",
    wearMax: "",
    size: "",
    quality: "",
    sort: "brand",
    page: 1,
  };
}

function cleanList(values, order) {
  const allowed = new Set(order);
  const present = new Set();
  for (const value of values) {
    for (const part of String(value).split(",")) {
      const token = part.trim().toUpperCase();
      if (allowed.has(token)) present.add(token);
    }
  }
  return order.filter((grade) => present.has(grade));
}

function cleanBound(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return "";
  return String(Number(text));
}

export function parseRatingsQuery(input) {
  const params =
    input instanceof URLSearchParams ? input : new URLSearchParams(String(input ?? "").replace(/^\?/, ""));
  const state = emptyRatingsQuery();
  state.q = (params.get("q") || "").trim();
  state.traction = cleanList(params.getAll("traction"), TRACTION_OPTIONS);
  state.temp = cleanList(params.getAll("temp"), TEMPERATURE_OPTIONS);
  state.wearMin = cleanBound(params.get("wearMin"));
  state.wearMax = cleanBound(params.get("wearMax"));
  const size = params.get("size") || "";
  state.size = SIZES.has(size) ? size : "";
  const quality = params.get("quality") || "";
  state.quality = QUALITIES.has(quality) ? quality : "";
  const sort = params.get("sort") || "brand";
  state.sort = SORTS.has(sort) ? sort : "brand";
  const page = Number(params.get("page"));
  state.page = Number.isInteger(page) && page > 1 ? page : 1;
  return state;
}

export function serializeRatingsQuery(state) {
  const normalized = { ...emptyRatingsQuery(), ...state };
  const params = new URLSearchParams();
  if (normalized.q) params.set("q", normalized.q);
  for (const grade of cleanList(normalized.traction, TRACTION_OPTIONS)) params.append("traction", grade);
  for (const grade of cleanList(normalized.temp, TEMPERATURE_OPTIONS)) params.append("temp", grade);
  const wearMin = cleanBound(normalized.wearMin);
  const wearMax = cleanBound(normalized.wearMax);
  if (wearMin) params.set("wearMin", wearMin);
  if (wearMax) params.set("wearMax", wearMax);
  if (SIZES.has(normalized.size)) params.set("size", normalized.size);
  if (QUALITIES.has(normalized.quality)) params.set("quality", normalized.quality);
  if (SORTS.has(normalized.sort) && normalized.sort !== "brand") params.set("sort", normalized.sort);
  if (Number.isInteger(normalized.page) && normalized.page > 1) params.set("page", String(normalized.page));
  return params.toString();
}

export function ratingsTableHref(partial = {}) {
  const query = serializeRatingsQuery({ ...emptyRatingsQuery(), ...partial });
  return query ? `/ratings/?${query}` : "/ratings/";
}

function bound(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function rowMatches(row, partial = {}) {
  const state = { ...emptyRatingsQuery(), ...partial };
  const query = state.q.trim().toLowerCase();
  if (query && !`${row.brand} ${row.line}`.toLowerCase().includes(query)) return false;
  if (state.traction.length && !state.traction.includes(row.trac)) return false;
  if (state.temp.length && !state.temp.includes(row.temp)) return false;
  const wearMin = bound(state.wearMin);
  const wearMax = bound(state.wearMax);
  if (wearMin != null && (row.wearN == null || row.wearN < wearMin)) return false;
  if (wearMax != null && (row.wearN == null || row.wearN > wearMax)) return false;
  if (state.size && sizeScope(row.size) !== state.size) return false;
  const kind = rowQuality(row).kind;
  if (state.quality === "hide" && kind !== "ok") return false;
  if (state.quality === "invalid" && kind !== "invalid") return false;
  if (state.quality === "suspect" && kind !== "suspect") return false;
  if (state.quality === "flagged" && kind === "ok") return false;
  return true;
}

export function filterGradeRows(rows, partial = {}) {
  return rows.filter((row) => rowMatches(row, partial));
}

function rank(table, value) {
  return table[value] ?? 0;
}

export function sortGradeRows(rows, partial = {}) {
  const state = { ...emptyRatingsQuery(), ...partial };
  const copy = [...rows];
  copy.sort((a, b) => {
    let diff = 0;
    if (state.sort === "wear-desc") diff = (b.wearN ?? -1) - (a.wearN ?? -1);
    else if (state.sort === "wear-asc") diff = (a.wearN ?? 9999) - (b.wearN ?? 9999);
    else if (state.sort === "traction") diff = rank(TRACTION_RANK, b.trac) - rank(TRACTION_RANK, a.trac);
    else if (state.sort === "temp") diff = rank(TEMPERATURE_RANK, b.temp) - rank(TEMPERATURE_RANK, a.temp);
    if (diff) return diff;
    return (
      a.brand.localeCompare(b.brand, "en") ||
      a.line.localeCompare(b.line, "en") ||
      String(a.size).localeCompare(String(b.size), "en")
    );
  });
  return copy;
}

export function tireLineCount(rows) {
  return new Set(rows.map((row) => row.url || `${row.brand}\n${row.line}`)).size;
}

export function gradeTableSummary(rows) {
  const summary = { rows: rows.length, sizeSpecific: 0, allSizes: 0, invalid: 0, suspect: 0 };
  for (const row of rows) {
    if (sizeScope(row.size) === "specific") summary.sizeSpecific += 1;
    else summary.allSizes += 1;
    const kind = rowQuality(row).kind;
    if (kind === "invalid") summary.invalid += 1;
    else if (kind === "suspect") summary.suspect += 1;
  }
  return summary;
}

export function flattenGradeRows(catalog) {
  const rows = [];
  for (const line of catalog.lines) {
    for (const row of line.rows) {
      rows.push({
        brand: line.brand,
        line: line.line,
        url: line.url,
        size: row.size,
        wear: row.wear,
        wearN: row.wearN,
        trac: row.trac,
        temp: row.temp,
      });
    }
  }
  return rows;
}

/**
 * Compact row stored in public/data/ratings.json.
 * A sixth cell is the published treadwear text only when it is not the same
 * as the numeric value, so a non-numeric treadwear still reaches rowQuality.
 */
export function compactPublicRow(index, row) {
  const cells = [index, row.size, row.wearN, row.trac, row.temp];
  const numeric = row.wearN == null ? "" : String(row.wearN);
  if (row.wear != null && row.wear !== "" && String(row.wear) !== numeric) cells.push(String(row.wear));
  return cells;
}

export function expandPublicRow(cells, lines) {
  const line = lines[cells[0]];
  const wearN = cells[2] == null ? null : Number(cells[2]);
  const published = cells.length > 5 ? String(cells[5]) : null;
  const wear = published != null ? published : wearN == null ? null : String(wearN);
  return {
    brand: line.b,
    line: line.l,
    url: line.u,
    size: cells[1] ?? "",
    wear,
    wearN,
    trac: cells[3] ?? "",
    temp: cells[4] ?? "",
  };
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function ratingsCsv(rows, { source, verifiedAt }) {
  const attribution = `Source: NHTSA UTQG file ${source}. Verified ${verifiedAt} (UTC). Published by TreadGrade. These grades are copied from that file. They are not a ranking, and a row does not mean a tire is on sale.`;
  const header = [
    "Brand",
    "Tire line",
    "Size series",
    "Size flag",
    "Treadwear",
    "Traction",
    "Temperature",
    "Data quality",
    "Line page",
  ];
  const lines = [`# ${attribution}`, header.join(",")];
  for (const row of rows) {
    const treadwear = row.wear == null || row.wear === "" ? "" : String(row.wear);
    lines.push(
      [
        row.brand,
        row.line,
        row.size,
        sizeFlagLabel(row.size),
        treadwear,
        row.trac,
        row.temp,
        qualityLabel(row),
        row.url,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
