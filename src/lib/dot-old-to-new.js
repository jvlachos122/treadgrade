/**
 * Former plant code to current plant code, from the committed NHTSA file.
 * The April 13, 2015 final rule (80 FR 19553) is the source of the length
 * and the "1" prefix. Counts come from the rows passed in.
 */

import { formatNumber, formatVerified } from "./format.js";

export const DOT_GUIDE_PATH = "/guides/dot-code/";
export const OLD_TO_NEW_ID = "old-to-new";
export const FR_TIN_URL =
  "https://www.federalregister.gov/documents/2015/04/13/2015-08418/tire-identification-and-recordkeeping";
export const ECFR_TIN_URL =
  "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-574/section-574.5";
export const METHODOLOGY_CAVEAT_HREF = "/methodology/#data-quality";

export const BANNED_DOT_WORD = /\b(best|recommend(?:s|ed|ing)?)\b/i;

/** Preamble, 80 FR 19553, including footnote marker 2. */
export const FR_PREFIX_QUOTE =
  "For nearly all manufacturers, the agency will assign a \u201c1\u201d symbol in front of each existing two-symbol plant code. [2] For example, a manufacturer using two-symbol code \u201cAB\u201d will likely be assigned the three-symbol code \u201c1AB\u201d.";

/** Footnote 2 of the same preamble. */
export const FR_PREFIX_NOTE =
  "NHTSA will directly contact any manufacturer whose three-symbol plant code is something other than a \u201c1\u201d in front of its existing two-symbol code.";

export const OLD_TO_NEW_LEAD =
  "The April 13, 2015 final rule sets the plant code at three symbols, a new tire's TIN at 13 symbols, and a retreaded tire's TIN at 7 symbols.";

export const OLD_TO_NEW_NOSCRIPT =
  "The box filters the table in the browser. Without JavaScript, open the list and every former code is there.";

function noun(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function oldToNewRows(plants) {
  const rows = [];
  for (const plant of plants) {
    const oldCode = String(plant.oldCode || "").trim().toUpperCase();
    const code = String(plant.code || "").trim().toUpperCase();
    if (!oldCode || !code) continue;
    rows.push({ oldCode, code, url: plant.url || `/plants/${code.toLowerCase()}/` });
  }
  rows.sort((a, b) => a.oldCode.localeCompare(b.oldCode, "en") || a.code.localeCompare(b.code, "en"));
  return rows;
}

export function oldToNewReport(plants) {
  const rows = oldToNewRows(plants);
  const byOld = new Map();
  let prefixed = 0;
  for (const row of rows) {
    if (row.code === `1${row.oldCode}`) prefixed += 1;
    byOld.set(row.oldCode, (byOld.get(row.oldCode) || 0) + 1);
  }
  let shared = 0;
  for (const count of byOld.values()) {
    if (count > 1) shared += 1;
  }
  return { rows, count: rows.length, prefixed, shared };
}

/** Pairs the DOT guide renders. No dates, so a refresh that changes no pair leaves the hash still. */
export function oldToNewData(plants) {
  return oldToNewRows(plants).map((row) => [row.oldCode, row.code]);
}

export function oldToNewFileSentence(report) {
  if (!report.count) return "The plant file has no former code on a record.";
  const be = report.prefixed === 1 ? "is" : "are";
  let text = `${formatNumber(report.prefixed)} of the ${formatNumber(report.count)} current codes ${be} the character 1 followed by the former code.`;
  if (report.shared === 1) {
    text += " 1 former code is on more than one record, and each record is its own row.";
  } else if (report.shared > 1) {
    text += ` ${formatNumber(report.shared)} former codes are on more than one record, and each record is its own row.`;
  }
  return text;
}

export function oldToNewCaption(verifiedAt, count) {
  return `${noun(count, "former code")} and the current code on the same NHTSA plant record, verified ${formatVerified(verifiedAt)} (UTC).`;
}

export function oldToNewSummary(count) {
  return `All ${noun(count, "former code")}`;
}

export function oldToNewStatus(count) {
  return `${noun(count, "former code")}.`;
}
