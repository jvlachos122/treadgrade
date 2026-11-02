import { cleanSpace } from "./format.js";
import { brandKey } from "./normalize.js";
import { readSizeMark } from "./size-mark.js";

export const NO_UTQG_PATH = "/guides/no-utqg-rating/";

/** eCFR text of 49 CFR 575.104 fetched and compared on this date. */
export const ECFR_CHECKED = "2026-11-02";

export const ECFR_575_104 =
  "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-575/subpart-B/section-575.104";

export const FR_1999_575_104 = "https://www.govinfo.gov/content/pkg/FR-1999-05-24/html/99-13064.htm";

const KO2 = /ko2/i;
const K02 = /k02/i;

export function isBfGoodrichBrand(brand) {
  return brandKey(brand).replace(/\s+/g, "") === "bfgoodrich";
}

export function lineNameContains(line, pattern) {
  return pattern.test(cleanSpace(line));
}

function sourceLine(row) {
  return row.tireline ?? row.line ?? "";
}

export function countLineNameRows(rows, pattern) {
  let count = 0;
  for (const row of rows) {
    if (lineNameContains(sourceLine(row), pattern)) count += 1;
  }
  return count;
}

function brandSpellings(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (!isBfGoodrichBrand(row.brand)) continue;
    const brand = cleanSpace(row.brand);
    counts.set(brand, (counts.get(brand) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([brand, rowsInSpelling]) => ({ brand, rows: rowsInSpelling }))
    .sort((a, b) => b.rows - a.rows || a.brand.localeCompare(b.brand, "en"));
}

/**
 * KO2 and BFGoodrich figures from the committed ratings rows plus the catalog
 * built from those rows. Nothing here is a fixed count.
 */
export function utqgExemptReport(catalog, sourceRows) {
  const lines = catalog.lines
    .filter((line) => isBfGoodrichBrand(line.brand))
    .map((line) => ({
      brand: line.brand,
      line: line.line,
      rows: line.rows.length,
      url: line.url,
      ltInLineName: /\bLT\b/.test(line.line),
      sizes: [...new Set(line.rows.map((row) => row.size))].sort((a, b) => a.localeCompare(b, "en")),
      sizesStartingLt: line.rows.filter((row) => readSizeMark(row.size).ltPrefix).length,
    }))
    .sort((a, b) => a.line.localeCompare(b.line, "en") || a.brand.localeCompare(b.brand, "en"));

  let ko2GradeRows = 0;
  for (const line of catalog.lines) {
    if (lineNameContains(line.line, KO2)) ko2GradeRows += line.rows.length;
  }

  return {
    ko2SourceRows: countLineNameRows(sourceRows, KO2),
    ko2GradeRows,
    k02SourceRows: countLineNameRows(sourceRows, K02),
    bfSourceRows: sourceRows.filter((row) => isBfGoodrichBrand(row.brand)).length,
    bfGradeRows: lines.reduce((sum, line) => sum + line.rows, 0),
    bfLineCount: lines.length,
    brand: lines[0]?.brand || "",
    brandSpellings: brandSpellings(sourceRows),
    lines,
    ltNamedLines: lines.filter((line) => line.ltInLineName),
    sizesStartingLt: sourceRows.filter((row) => readSizeMark(row.size).ltPrefix).length,
  };
}
