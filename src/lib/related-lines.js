/**
 * Related tire-line links.
 *
 * Groups use the brand string on the line (the spelling NHTSA's file is
 * shown under) and the UTQG grades on its rows. Nothing here is random.
 * Within a brand, or within one grade combination, lines are ordered by the
 * lowest NHTSA row id, then by URL. Traction-and-temperature groups are
 * ordered by the treadwear number on that lowest-id row, then by the same
 * id. Each line links to the next and previous line in that order, wrapping
 * at the ends, so the first and last are linked too. The combined list is
 * capped.
 */

export const RELATED_LINE_CAP = 8;

const STATIC_LABELS = [
  "Other lines of this brand",
  "Same treadwear, traction, and temperature",
  "Same traction and temperature",
  "Treadwear numbers",
  "Traction grades",
  "Treadwear and traction",
];

export const BANNED_RELATED_WORD = /\b(best|better|winner|safest|popular)\b/i;

function minId(line) {
  let id = Infinity;
  for (const row of line.rows) {
    if (row.id < id) id = row.id;
  }
  return id;
}

function representativeRow(line) {
  let row = line.rows[0];
  for (const candidate of line.rows) {
    if (candidate.id < row.id) row = candidate;
  }
  return row;
}

function wearNumber(line) {
  const row = representativeRow(line);
  if (typeof row.wearN === "number") return row.wearN;
  if (row.wear != null && /^\d+$/.test(String(row.wear))) return Number(row.wear);
  return Number.POSITIVE_INFINITY;
}

export function exactGradeKey(line) {
  const triples = new Set(line.rows.map((row) => `${row.wear ?? ""}|${row.trac}|${row.temp}`));
  return [...triples].sort().join(" || ");
}

export function letterGradeKey(line) {
  const row = representativeRow(line);
  return `${row.trac}|${row.temp}`;
}

function byId(a, b) {
  return minId(a) - minId(b) || a.url.localeCompare(b.url);
}

function byWear(a, b) {
  return wearNumber(a) - wearNumber(b) || byId(a, b);
}

function adjacent(sorted, url) {
  const count = sorted.length;
  if (count < 2) return [];
  const index = sorted.findIndex((item) => item.url === url);
  if (index < 0) return [];
  const next = sorted[(index + 1) % count];
  const prev = sorted[(index - 1 + count) % count];
  if (next.url === prev.url) return [next];
  return [next, prev];
}

function gradeLabel(line) {
  let wear = "";
  if (line.wearMin != null) {
    wear = line.wearMin === line.wearMax ? String(line.wearMin) : `${line.wearMin}-${line.wearMax}`;
  }
  const traction = (line.traction || []).join("/");
  const temperature = (line.temperature || []).join("/");
  const grades = [wear, traction, temperature].filter(Boolean).join(" ");
  return grades ? `${line.brand} ${line.line}, ${grades}` : `${line.brand} ${line.line}`;
}

function linkFor(line) {
  return { href: line.url, label: gradeLabel(line) };
}

export function buildRelatedLineIndex(lines) {
  const byBrand = new Map();
  const byExact = new Map();
  const byLetter = new Map();
  for (const line of lines) {
    if (!byBrand.has(line.brand)) byBrand.set(line.brand, []);
    byBrand.get(line.brand).push(line);
    const exact = exactGradeKey(line);
    if (!byExact.has(exact)) byExact.set(exact, []);
    byExact.get(exact).push(line);
    const letter = letterGradeKey(line);
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter).push(line);
  }
  for (const list of byBrand.values()) list.sort(byId);
  for (const list of byExact.values()) list.sort(byId);
  for (const list of byLetter.values()) list.sort(byWear);
  return { byBrand, byExact, byLetter };
}

export function relatedLinesFromIndex(line, index) {
  const seen = new Set([line.url]);
  const take = (items) => {
    const out = [];
    for (const item of items) {
      if (seen.has(item.url)) continue;
      if (seen.size - 1 >= RELATED_LINE_CAP) break;
      seen.add(item.url);
      out.push(linkFor(item));
    }
    return out;
  };
  return {
    brand: take(adjacent(index.byBrand.get(line.brand) || [], line.url)),
    exact: take(adjacent(index.byExact.get(exactGradeKey(line)) || [], line.url)),
    letters: take(adjacent(index.byLetter.get(letterGradeKey(line)) || [], line.url)),
  };
}

let cachedLines = null;
let cachedIndex = null;

export function relatedLines(line, lines) {
  if (cachedLines !== lines) {
    cachedLines = lines;
    cachedIndex = buildRelatedLineIndex(lines);
  }
  return relatedLinesFromIndex(line, cachedIndex);
}

export function relatedLineStaticText() {
  return STATIC_LABELS.join(" ");
}
