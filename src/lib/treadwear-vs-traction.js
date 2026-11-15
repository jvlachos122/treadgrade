import { treadwearMedian } from "./answers.js";
import { formatNumber, formatVerified, percent } from "./format.js";
import { USUAL_TEMPERATURE, USUAL_TRACTION } from "./grade-quality.js";
import { LONG_TREADWEAR_MIN } from "./long-treadwear.js";
import { flattenGradeRows, ratingsTableHref } from "./ratings-table.js";
import { article, dataset } from "./structured.js";
import { ECFR_TRACTION_URL, ECFR_RETRIEVED, FIGURE_2_TRACTION, ecfrRetrievedLabel } from "./traction-grades.js";
import { bandLabel, bandStart } from "./treadwear-numbers.js";

/**
 * Treadwear counted against traction and temperature from the committed
 * NHTSA UTQG rows. Quartiles use Tukey's hinges: the median of each half,
 * and when the count is odd the overall median is in both halves. The same
 * middle-value rule as treadwearMedian. Counts are computed at build time.
 * Do not hard-code them.
 *
 * LINE_WEAR_CUTOFF is the cutoff this page uses when it describes traction
 * AA rows. It is not a threshold in 49 CFR 575.104.
 */

export const TREADWEAR_VS_TRACTION_PATH = "/guides/treadwear-vs-traction/";

export const LINE_WEAR_CUTOFF = 300;

export const BANNED_VERDICT =
  /\b(best|top-rated|top rated|recommend(?:ed|s|ing)?|better|winner|safest|good tire|bad tire|worth buying)\b/i;

export { ECFR_TRACTION_URL, ECFR_RETRIEVED, ecfrRetrievedLabel };

const SOURCE_TRACTION = [...USUAL_TRACTION, "outside"];
const SOURCE_TEMPERATURE = [...USUAL_TEMPERATURE, "outside"];
const LINE_TRACTION = [...USUAL_TRACTION, "mixed", "outside"];
const LINE_TEMPERATURE = [...USUAL_TEMPERATURE, "mixed", "outside"];

const TRACTION_SCOPE = "the tire's ability to stop on wet pavement";
const TRACTION_EXCLUDED = "does not include acceleration, cornering, hydroplaning, or peak traction";

function noun(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function listJoin(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function lowerFirst(text) {
  if (!text) return "";
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function joinSentences(parts) {
  return parts.filter(Boolean).join(" ");
}

export function gradeId(value, usual) {
  const text = value == null ? "" : String(value).trim();
  return usual.includes(text) ? text : "outside";
}

export function formatSpread(value) {
  if (value == null || Number.isNaN(value)) return "Not reported";
  if (Number.isInteger(value)) return String(value);
  const text = (Math.round(value * 100) / 100).toFixed(2);
  return text.endsWith("0") ? text.slice(0, -1) : text;
}

export function heatPercent(count, max) {
  if (!count || !max) return 0;
  return Math.max(1, Math.round((count / max) * 100));
}

function emptySpread() {
  return {
    count: 0,
    min: null,
    q1: null,
    median: null,
    q3: null,
    max: null,
    minText: "Not reported",
    q1Text: "Not reported",
    medianText: "Not reported",
    q3Text: "Not reported",
    maxText: "Not reported",
  };
}

/**
 * Middle of an already sorted list. Odd counts use the middle value.
 * Even counts use the mean of the two middle values.
 */
export function middleOfSorted(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Tukey hinges. `values` are the numbers already chosen for the summary.
 * Halves keep non-integers, so a line median of x.5 can be included.
 */
export function hingeSummary(values) {
  const sorted = [...(values || [])]
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return emptySpread();
  const count = sorted.length;
  const mid = Math.floor(count / 2);
  const lower = count % 2 === 1 ? sorted.slice(0, mid + 1) : sorted.slice(0, mid);
  const upper = count % 2 === 1 ? sorted.slice(mid) : sorted.slice(mid);
  const min = sorted[0];
  const max = sorted[count - 1];
  const q1 = middleOfSorted(lower);
  const median = middleOfSorted(sorted);
  const q3 = middleOfSorted(upper);
  return {
    count,
    min,
    q1,
    median,
    q3,
    max,
    minText: formatSpread(min),
    q1Text: formatSpread(q1),
    medianText: formatSpread(median),
    q3Text: formatSpread(q3),
    maxText: formatSpread(max),
  };
}

function positiveIntegers(values) {
  return (values || []).filter((value) => Number.isInteger(value) && value > 0);
}

export function spreadOfWear(values) {
  return hingeSummary(positiveIntegers(values));
}

export function spreadOfNumbers(values) {
  const kept = (values || []).filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
  return hingeSummary(kept);
}

function parseWear(row) {
  const raw = row?.wear;
  if (raw == null || String(raw).trim() === "") return { kind: "missing" };
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return { kind: "nonnumeric" };
  const wearN = Number(text);
  if (wearN === 0) return { kind: "zero", wearN };
  return { kind: "number", wearN };
}

function positiveFromRows(rows) {
  const values = [];
  for (const row of rows || []) {
    const parsed = parseWear(row);
    if (parsed.kind === "number") values.push(parsed.wearN);
  }
  return values;
}

function lineIndex(catalog) {
  const byId = new Map();
  for (const line of catalog?.lines || []) {
    for (const id of line.sourceIds || []) byId.set(id, line);
  }
  return byId;
}

function representative(rows, field, usual) {
  const seen = [];
  for (const row of rows || []) {
    const id = gradeId(row[field], usual);
    if (!seen.includes(id)) seen.push(id);
  }
  if (seen.length === 1) return seen[0];
  if (!seen.length) return "outside";
  return "mixed";
}

function shortHeader(id) {
  if (id === "outside") return "Outside";
  if (id === "mixed") return "Mixed";
  return id;
}

function tractionLabel(id) {
  if (id === "outside") return "Outside AA–C";
  if (id === "mixed") return "Mixed";
  return id;
}

function temperatureLabel(id) {
  if (id === "outside") return "Outside A–C";
  if (id === "mixed") return "Mixed";
  return id;
}

function blankCounts(colIds) {
  return new Map(colIds.map((id) => [id, 0]));
}

function tractionHref(id) {
  return USUAL_TRACTION.includes(id) ? ratingsTableHref({ traction: [id] }) : "";
}

function temperatureHref(id) {
  return USUAL_TEMPERATURE.includes(id) ? ratingsTableHref({ temp: [id] }) : "";
}

function crossCellHref(trac, temp) {
  if (!USUAL_TRACTION.includes(trac) || !USUAL_TEMPERATURE.includes(temp)) return "";
  return ratingsTableHref({ traction: [trac], temp: [temp] });
}

function bandCellHref(start, trac) {
  if (!USUAL_TRACTION.includes(trac)) return "";
  return ratingsTableHref({
    wearMin: String(start),
    wearMax: String(start + 99),
    traction: [trac],
  });
}

function bandRowHref(start) {
  return ratingsTableHref({ wearMin: String(start), wearMax: String(start + 99) });
}

function rowFromCounts(id, label, counts, colIds, hrefForCol, totalHref) {
  const cells = colIds.map((colId) => {
    const count = counts.get(colId) || 0;
    return { id: colId, count, href: count ? hrefForCol(colId) : "", heat: 0 };
  });
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);
  return { id, label, cells, total, totalHref: total ? totalHref : "" };
}

function finishMatrix(rows, columns, totalLabel, totalHref) {
  let max = 0;
  for (const row of rows) {
    for (const cell of row.cells) if (cell.count > max) max = cell.count;
  }
  for (const row of rows) {
    for (const cell of row.cells) cell.heat = heatPercent(cell.count, max);
  }
  const columnTotals = columns.map((column) => {
    const count = rows.reduce((sum, row) => sum + (row.cells.find((cell) => cell.id === column.id)?.count || 0), 0);
    return { id: column.id, header: column.header, count, href: count ? column.href : "" };
  });
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return {
    columns,
    rows,
    columnTotals,
    total,
    totalLabel,
    totalHref: total ? totalHref : "",
    max,
  };
}

function matrixFromCounts(rowIds, colIds, counts, options) {
  const rows = rowIds.map((rowId) =>
    rowFromCounts(
      rowId,
      options.rowLabel(rowId),
      counts.get(rowId) || blankCounts(colIds),
      colIds,
      (colId) => options.cellHref(rowId, colId),
      options.rowHref(rowId),
    ),
  );
  const columns = colIds.map((colId) => ({
    id: colId,
    header: options.colHeader(colId),
    href: options.colHref(colId),
  }));
  return finishMatrix(rows, columns, options.totalLabel, options.totalHref);
}

function buildHeatmap(items, colIds, unplacedLabel, totalLabel, link) {
  const placed = new Map();
  const unplaced = blankCounts(colIds);
  let maxValue = null;
  for (const item of items) {
    if (item.value == null || !Number.isFinite(item.value)) {
      unplaced.set(item.col, (unplaced.get(item.col) || 0) + 1);
      continue;
    }
    const start = bandStart(item.value);
    if (maxValue == null || item.value > maxValue) maxValue = item.value;
    if (!placed.has(start)) placed.set(start, blankCounts(colIds));
    const row = placed.get(start);
    row.set(item.col, (row.get(item.col) || 0) + 1);
  }
  const rows = [];
  if (maxValue != null) {
    for (let start = 0; start <= bandStart(maxValue); start += 100) {
      rows.push(
        rowFromCounts(
          start,
          bandLabel(start),
          placed.get(start) || blankCounts(colIds),
          colIds,
          (colId) => (link ? bandCellHref(start, colId) : ""),
          link ? bandRowHref(start) : "",
        ),
      );
    }
  }
  const unplacedTotal = [...unplaced.values()].reduce((sum, count) => sum + count, 0);
  if (unplacedTotal > 0) {
    rows.push(rowFromCounts("unplaced", unplacedLabel, unplaced, colIds, () => "", ""));
  }
  const columns = colIds.map((colId) => ({
    id: colId,
    header: shortHeader(colId),
    href: link ? tractionHref(colId) : "",
  }));
  return finishMatrix(rows, columns, totalLabel, link ? "/ratings/" : "");
}

function spreadList(ids, labelFor, valuesById, hrefFor, numeric) {
  return ids.map((id) => {
    const values = valuesById.get(id) || [];
    const spread = numeric ? spreadOfWear(values) : spreadOfNumbers(values);
    const href = spread.count ? hrefFor(id) : "";
    return { id, label: labelFor(id), href, spread };
  });
}

function publishedGrade(value, usual) {
  const text = value == null ? "" : String(value).trim();
  if (!text) return { text: "Not reported", usual: false, blank: true };
  if (usual.includes(text)) return { text, usual: true, blank: false };
  return { text, usual: false, blank: false };
}

function publishedWear(row) {
  const parsed = parseWear(row);
  if (parsed.kind === "missing") return "Not reported";
  return String(row.wear).trim();
}

export function letterMovement(spreads) {
  const present = (spreads || []).filter(
    (item) => item.id !== "mixed" && item.id !== "outside" && item.spread?.median != null,
  );
  let up = false;
  let down = false;
  const steps = [];
  for (let index = 1; index < present.length; index += 1) {
    const prev = present[index - 1];
    const curr = present[index];
    if (curr.spread.median > prev.spread.median) up = true;
    if (curr.spread.median < prev.spread.median) down = true;
    const dir =
      curr.spread.median > prev.spread.median
        ? "higher than"
        : curr.spread.median < prev.spread.median
          ? "lower than"
          : "the same as";
    steps.push(`${curr.id} is ${dir} ${prev.id} (${curr.spread.medianText} against ${prev.spread.medianText})`);
  }
  return { present, up, down, steps };
}

export function movementSentence(kind, spreads) {
  const move = letterMovement(spreads);
  if (move.present.length < 2) return `Fewer than two ${kind} grades have a median treadwear in this count.`;
  const listed = listJoin(move.present.map((item) => `${item.spread.medianText} for ${item.id}`));
  const span = `${kind} ${move.present[0].id} to ${move.present.at(-1).id}`;
  if (move.up && move.down) return `Median treadwear does not move in one direction from ${span} (${listed}).`;
  if (move.down && !move.up) return `Median treadwear does not rise from ${span} (${listed}).`;
  if (move.up && !move.down) return `Median treadwear does not fall from ${span} (${listed}).`;
  return `Median treadwear is the same at each letter from ${span} (${listed}).`;
}

export function stepSentence(kind, spreads) {
  const move = letterMovement(spreads);
  if (!(move.up && move.down) || !move.steps.length) return "";
  return `In the ${kind} order ${listJoin(move.present.map((item) => item.id))}, ${listJoin(move.steps)}.`;
}

export function plotGroups(spreads) {
  return (spreads || [])
    .filter((item) => item.spread?.count > 0 && item.spread.min != null)
    .map((item) => ({
      id: item.id,
      label: shortHeader(item.id),
      min: item.spread.min,
      q1: item.spread.q1,
      median: item.spread.median,
      q3: item.spread.q3,
      max: item.spread.max,
      medianText: item.spread.medianText,
    }));
}

function lineAtOrUnder(line) {
  const wears = positiveFromRows(line?.rows);
  return wears.length > 0 && wears.every((value) => value <= LINE_WEAR_CUTOFF);
}

export function treadwearTractionReport(ratings, catalog) {
  const source = ratings || [];
  const byId = lineIndex(catalog);
  const lines = catalog?.lines || [];
  const crossCounts = new Map(SOURCE_TRACTION.map((id) => [id, blankCounts(SOURCE_TEMPERATURE)]));
  const wearByTraction = new Map(SOURCE_TRACTION.map((id) => [id, []]));
  const wearByTemperature = new Map(SOURCE_TEMPERATURE.map((id) => [id, []]));
  const heatmapItems = [];
  const outsideRows = [];
  const aaRowsByLine = new Map();
  const excluded = { zero: 0, missing: 0, nonnumeric: 0 };
  let unmapped = 0;
  let aaRows = 0;
  let aaPositive = 0;
  let aaPositiveAtOrUnder = 0;
  let aaAtOrAboveLong = 0;

  for (const row of source) {
    const trac = gradeId(row.trac, USUAL_TRACTION);
    const temp = gradeId(row.temp, USUAL_TEMPERATURE);
    const tracRow = crossCounts.get(trac);
    tracRow.set(temp, tracRow.get(temp) + 1);
    const parsed = parseWear(row);
    if (parsed.kind === "number") {
      wearByTraction.get(trac).push(parsed.wearN);
      wearByTemperature.get(temp).push(parsed.wearN);
      heatmapItems.push({ value: parsed.wearN, col: trac });
    } else if (parsed.kind === "zero") {
      excluded.zero += 1;
      heatmapItems.push({ value: 0, col: trac });
    } else {
      if (parsed.kind === "missing") excluded.missing += 1;
      else excluded.nonnumeric += 1;
      heatmapItems.push({ value: null, col: trac });
    }
    const line = byId.get(row.id);
    if (!line) unmapped += 1;
    if (trac === "AA") {
      aaRows += 1;
      const key = line?.url || "";
      aaRowsByLine.set(key, (aaRowsByLine.get(key) || 0) + 1);
      if (parsed.kind === "number") {
        aaPositive += 1;
        if (parsed.wearN <= LINE_WEAR_CUTOFF) aaPositiveAtOrUnder += 1;
        if (parsed.wearN >= LONG_TREADWEAR_MIN) aaAtOrAboveLong += 1;
      }
    }
    if (trac === "outside" || temp === "outside") {
      outsideRows.push({
        id: row.id,
        brand: line?.brand || (row.brand == null ? "" : String(row.brand)),
        line: line?.line || (row.tireline == null ? "" : String(row.tireline)),
        url: line?.url || "",
        size: String(row.size ?? "").trim() || "Not reported",
        wear: publishedWear(row),
        trac: publishedGrade(row.trac, USUAL_TRACTION),
        temp: publishedGrade(row.temp, USUAL_TEMPERATURE),
      });
    }
  }
  outsideRows.sort(
    (a, b) => a.brand.localeCompare(b.brand, "en") || a.line.localeCompare(b.line, "en") || a.size.localeCompare(b.size, "en") || a.id - b.id,
  );

  let fromLinesAtOrUnder = 0;
  let linesAtOrUnder = 0;
  let aaLines = 0;
  let aaLinesAtOrUnder = 0;
  let mixedTraction = 0;
  let mixedTemperature = 0;
  let withoutPositive = 0;
  const lineCross = new Map(LINE_TRACTION.map((id) => [id, blankCounts(LINE_TEMPERATURE)]));
  const lineWearByTraction = new Map(LINE_TRACTION.map((id) => [id, []]));
  const lineWearByTemperature = new Map(LINE_TEMPERATURE.map((id) => [id, []]));
  const lineHeatItems = [];

  for (const line of lines) {
    const trac = representative(line.rows, "trac", USUAL_TRACTION);
    const temp = representative(line.rows, "temp", USUAL_TEMPERATURE);
    if (trac === "mixed") mixedTraction += 1;
    if (temp === "mixed") mixedTemperature += 1;
    const cell = lineCross.get(trac);
    cell.set(temp, cell.get(temp) + 1);
    const median = treadwearMedian(positiveFromRows(line.rows));
    if (median == null) {
      withoutPositive += 1;
      lineHeatItems.push({ value: null, col: trac });
    } else {
      lineWearByTraction.get(trac).push(median);
      lineWearByTemperature.get(temp).push(median);
      lineHeatItems.push({ value: median, col: trac });
    }
    const aa = aaRowsByLine.get(line.url) || 0;
    const under = lineAtOrUnder(line);
    if (aa) aaLines += 1;
    if (under) {
      linesAtOrUnder += 1;
      if (aa) {
        aaLinesAtOrUnder += 1;
        fromLinesAtOrUnder += aa;
      }
    }
  }

  const shownRows = lines.length ? flattenGradeRows(catalog).length : 0;
  const duplicateDropped = Math.max(0, source.length - unmapped - shownRows);
  const tractionSpreads = spreadList(SOURCE_TRACTION, tractionLabel, wearByTraction, tractionHref, true);
  const temperatureSpreads = spreadList(SOURCE_TEMPERATURE, temperatureLabel, wearByTemperature, temperatureHref, true);
  const lineTractionSpreads = spreadList(LINE_TRACTION, tractionLabel, lineWearByTraction, () => "", false);
  const lineTemperatureSpreads = spreadList(LINE_TEMPERATURE, temperatureLabel, lineWearByTemperature, () => "", false);

  return {
    sourceRows: source.length,
    shownRows,
    unmapped,
    duplicateDropped,
    lineCount: lines.length,
    verifiedAt: catalog?.meta?.verifiedAt || "",
    ratingsSource: catalog?.meta?.ratings?.source || "",
    excluded,
    outsideRows,
    aa: {
      cutoff: LINE_WEAR_CUTOFF,
      longMin: LONG_TREADWEAR_MIN,
      aaRows,
      aaPositive,
      aaPositiveAtOrUnder,
      aaAtOrAboveLong,
      fromLinesAtOrUnder,
      linesAtOrUnder,
      aaLines,
      aaLinesAtOrUnder,
    },
    row: {
      traction: tractionSpreads,
      temperature: temperatureSpreads,
      cross: matrixFromCounts(SOURCE_TRACTION, SOURCE_TEMPERATURE, crossCounts, {
        rowLabel: tractionLabel,
        colHeader: shortHeader,
        cellHref: crossCellHref,
        rowHref: tractionHref,
        colHref: temperatureHref,
        totalLabel: "All source rows",
        totalHref: "/ratings/",
      }),
      heatmap: buildHeatmap(heatmapItems, SOURCE_TRACTION, "No whole-number treadwear", "All source rows", true),
    },
    line: {
      traction: lineTractionSpreads,
      temperature: lineTemperatureSpreads,
      mixedTraction,
      mixedTemperature,
      withoutPositive,
      cross: matrixFromCounts(LINE_TRACTION, LINE_TEMPERATURE, lineCross, {
        rowLabel: tractionLabel,
        colHeader: shortHeader,
        cellHref: () => "",
        rowHref: () => "",
        colHref: () => "",
        totalLabel: "All tire lines",
        totalHref: "",
      }),
      heatmap: buildHeatmap(
        lineHeatItems,
        LINE_TRACTION,
        "No positive whole-number treadwear",
        "All tire lines",
        false,
      ),
    },
  };
}

export function studyAnswer(report) {
  if (!report.sourceRows) {
    return [
      "UTQG treadwear, traction, and temperature are three grades assigned by the manufacturer under 49 CFR 575.104.",
      "NHTSA's committed UTQG file lists no source rows, so this page has no median to compare.",
      "These grades are assigned by the manufacturer under 49 CFR 575.104 and cannot be compared as lab-audited scores.",
    ];
  }
  const when = formatVerified(report.verifiedAt);
  const temp = movementSentence("temperature", report.row.temperature);
  const trac = movementSentence("traction", report.row.traction);
  return [
    `In NHTSA's committed UTQG file of ${noun(report.sourceRows, "source row")}, last verified ${when} (UTC), ${lowerFirst(temp)}`,
    trac,
    "These grades are assigned by the manufacturer under 49 CFR 575.104 and cannot be compared as lab-audited scores.",
  ];
}

export function introParagraph() {
  return "This page counts the three UTQG grades in the committed NHTSA file together. The UTQG guide quotes Figure 2 of 49 CFR 575.104, which lists the temperature letters A, B, and C and the traction letters AA, A, B, and C. Tables on this page follow that letter order.";
}

export function methodNote() {
  return "The median is the middle value when the count is odd, and the mean of the two middle values when the count is even. The lower quartile is that median of the lower half, and the upper quartile is that median of the upper half. When the count is odd, the overall median is included in both halves.";
}

export function exclusionNote(report) {
  const bits = [];
  if (report.excluded.zero) bits.push(`${noun(report.excluded.zero, "source row")} with treadwear 0`);
  if (report.excluded.missing) bits.push(`${noun(report.excluded.missing, "source row")} with no treadwear number`);
  if (report.excluded.nonnumeric) bits.push(`${noun(report.excluded.nonnumeric, "source row")} whose treadwear is not a whole number`);
  if (!bits.length) return "Every source row in this pull has a positive whole-number treadwear, and the median and quartiles use those values.";
  const tail = [];
  if (report.excluded.zero) tail.push("Treadwear 0 stays in the 0–99 band of the shaded table.");
  if (report.excluded.missing || report.excluded.nonnumeric) {
    tail.push("Rows without a whole-number treadwear stay in the last row of that table.");
  }
  const rest = tail.length ? ` ${tail.join(" ")}` : "";
  return `The median and quartiles use positive whole-number treadwear. This pull leaves out ${listJoin(bits)}.${rest}`;
}

export function tractionTablePointer() {
  return "The median, minimum, and maximum treadwear for each traction letter are listed on the traction guide.";
}

export function cutoffDefinition(report) {
  const cutoff = report.aa.cutoff;
  return `This page uses ${cutoff} as a cutoff to describe traction AA rows. A tire line is at or under that cutoff when it has at least one positive whole-number treadwear on its kept size rows and every one of those numbers is ${cutoff} or less. The share counts source rows on those lines. Kept size rows are the rows on the tire-line page, after exact duplicate grade rows are dropped. The cutoff is not a threshold named in 49 CFR 575.104.`;
}

export function aaLineShareSentence(report) {
  const aa = report.aa;
  if (!aa.aaRows) return "This file has no traction AA source row.";
  const verb = aa.fromLinesAtOrUnder === 1 ? "is" : "are";
  return `${formatNumber(aa.fromLinesAtOrUnder)} of ${noun(aa.aaRows, "traction AA source row")} (${percent(aa.fromLinesAtOrUnder, aa.aaRows)}) ${verb} on a tire line whose positive whole-number treadwear is entirely at or under ${aa.cutoff}.`;
}

export function aaLineCountSentence(report) {
  const aa = report.aa;
  if (!aa.aaLines) return "";
  const verb = aa.aaLinesAtOrUnder === 1 ? "is" : "are";
  return `${formatNumber(aa.aaLinesAtOrUnder)} of ${noun(aa.aaLines, "tire line")} with at least one traction AA source row ${verb} at or under ${aa.cutoff} on every positive whole-number treadwear.`;
}

export function ownCutoffSentence(report) {
  const aa = report.aa;
  if (!aa.aaPositive) return "No traction AA source row has a positive whole-number treadwear.";
  const that = aa.aaPositive === 1 ? "has" : "have";
  const verb = aa.aaPositiveAtOrUnder === 1 ? "is" : "are";
  return `${formatNumber(aa.aaPositiveAtOrUnder)} of the ${noun(aa.aaPositive, "traction AA source row")} that ${that} a positive whole-number treadwear ${verb} at or under ${aa.cutoff}.`;
}

export function longAaSentence(report) {
  const aa = report.aa;
  if (!aa.aaRows) return "";
  const min = formatNumber(aa.longMin);
  if (aa.aaAtOrAboveLong === 0) {
    return `No traction AA source row has treadwear of ${min} or above, the cutoff on the long-treadwear list.`;
  }
  const verb = aa.aaAtOrAboveLong === 1 ? "has" : "have";
  return `${noun(aa.aaAtOrAboveLong, "traction AA source row")} ${verb} treadwear of ${min} or above, the cutoff on the long-treadwear list.`;
}

export function compoundSentence() {
  return "The ratings file has no rubber-compound field, so the comparison on this page is the counts of the assigned grades.";
}

export function duplicateNote(report) {
  if (!report.sourceRows && !report.shownRows) return "The ratings table has no grade row in this pull.";
  const parts = [];
  if (report.duplicateDropped > 0) {
    parts.push(
      `The ratings table drops ${noun(report.duplicateDropped, "exact duplicate grade row")} and lists ${noun(report.shownRows, "grade row")}.`,
    );
    parts.push("A link into the ratings table can show fewer rows than a source-row cell.");
  } else {
    parts.push(`The ratings table lists ${noun(report.shownRows, "grade row")} from this pull.`);
  }
  if (report.unmapped) {
    parts.push(
      `${noun(report.unmapped, "source row")} ${report.unmapped === 1 ? "is" : "are"} not attached to a tire line. ${report.unmapped === 1 ? "That row is" : "Those rows are"} in the source-row counts and not in the tire-line counts.`,
    );
  }
  return parts.join(" ");
}

export function outsideNote(report) {
  if (!report.outsideRows.length) return "Every source row in this pull uses a usual traction letter and a usual temperature letter.";
  const verb = report.outsideRows.length === 1 ? "has" : "have";
  return `${noun(report.outsideRows.length, "source row")} ${verb} a traction value outside AA, A, B, and C or a temperature value outside A, B, and C. The published value is quoted. It is not restated as a grade.`;
}

export function heatmapNote() {
  return "Each band is a hundred-wide group, the same groups as the treadwear page: 0–99, then 100–199, and so on. Whole-number treadwear includes treadwear 0. The shade is scaled to the largest cell in the table. A zero cell is not shaded. The number is the count.";
}

export function lineRuleNote() {
  return "Each tire line counts once, so a line with many sizes weighs the same as a line with one size. The treadwear value is the median of the positive whole-number treadwear on the size rows kept for that line. Traction is that letter when every kept size row has it, and mixed when the kept rows list more than one traction value. Temperature is read the same way.";
}

export function lineExclusionNote(report) {
  const count = report.line.withoutPositive;
  if (!count) return "Every tire line in this pull has a positive whole-number treadwear, and the line median uses those values.";
  const verb = count === 1 ? "has" : "have";
  const pronoun = count === 1 ? "That line is" : "Those lines are";
  return `${noun(count, "tire line")} ${verb} no positive whole-number treadwear. ${pronoun} in the line cross-tab and in the last row of the line band table, and out of the line median and quartiles.`;
}

export function mixedNote(report) {
  const trac = report.line.mixedTraction;
  const temp = report.line.mixedTemperature;
  if (!trac && !temp) {
    return "No tire line lists more than one traction value or more than one temperature value, so the mixed row and mixed column are zero.";
  }
  const tracVerb = trac === 1 ? "lists" : "list";
  const tempVerb = temp === 1 ? "lists" : "list";
  return `${noun(trac, "tire line")} ${tracVerb} more than one traction value, and ${noun(temp, "tire line")} ${tempVerb} more than one temperature value. Those lines are the mixed cells.`;
}

export function lineHeatmapNote() {
  return "The band is the hundred-wide group that contains the line median. A median that falls halfway between two whole numbers stays in the group that contains that halfway value. These cells count tire lines. They are not links into the ratings table, which lists size rows.";
}

export function lineTractionSentence(report) {
  return movementSentence("traction", report.line.traction);
}

export function lineTemperatureSentence(report) {
  return `Counting one median per tire line, ${lowerFirst(movementSentence("temperature", report.line.temperature))}`;
}

function when(report) {
  return formatVerified(report.verifiedAt);
}

export function temperatureCaption(report) {
  return `Median and quartiles of treadwear by temperature grade in the NHTSA UTQG file verified ${when(report)} (UTC). The summary uses source rows with a positive whole-number treadwear. Outside is a temperature value other than A, B, or C.`;
}

export function temperaturePlotCaption(report) {
  return `Box summary of the temperature table in the NHTSA UTQG file verified ${when(report)} (UTC). The box runs from the lower quartile to the upper quartile. The horizontal mark is the median. The line runs from the minimum to the maximum. The number under each letter is the median.`;
}

export function crossCaption(report) {
  return `Traction by temperature in the NHTSA UTQG file verified ${when(report)} (UTC). Each cell counts source rows. Columns are temperature. Outside is a value other than the usual letters for that grade. Each source row has one traction value and one temperature value, so this table has no mixed column.`;
}

export function outsideCaption(report) {
  return `Source rows whose traction value is outside AA, A, B, and C or whose temperature value is outside A, B, and C in the NHTSA UTQG file verified ${when(report)} (UTC). The published value is quoted.`;
}

export function heatmapCaption(report) {
  return `Whole-number treadwear by traction value in the NHTSA UTQG file verified ${when(report)} (UTC). Counts are source rows, including treadwear 0. A darker cell is a larger count within this table.`;
}

export function lineTemperatureCaption(report) {
  return `Median and quartiles of each tire line's median treadwear by the line's temperature value in the NHTSA UTQG file verified ${when(report)} (UTC). Mixed means the kept size rows list more than one temperature value. A line with no positive whole-number treadwear is left out of this table.`;
}

export function linePlotCaption(report) {
  return `Box summary of the tire-line temperature table in the NHTSA UTQG file verified ${when(report)} (UTC). Each value is one tire line's median treadwear. The box runs from the lower quartile to the upper quartile. The horizontal mark is the median. The number under each letter is the median of those line medians.`;
}

export function lineCrossCaption(report) {
  return `Traction by temperature, one tire line per cell, in the NHTSA UTQG file verified ${when(report)} (UTC). A line is mixed when its kept size rows list more than one value for that grade.`;
}

export function lineHeatmapCaption(report) {
  return `Tire lines by the band of the line's median treadwear and the line's traction value in the NHTSA UTQG file verified ${when(report)} (UTC). A darker cell is a larger count within this table.`;
}

export function heatmapEmptyNote() {
  return "This pull has no source row to place in a treadwear band.";
}

export function lineHeatmapEmptyNote() {
  return "This pull has no tire line to place in a treadwear band.";
}

function spreadBits(spreads, unit) {
  return spreads
    .filter((item) => item.spread.count)
    .map((item) => {
      const name = item.id === "outside" ? "outside those letters" : item.id === "mixed" ? "mixed" : item.id;
      return `${name} has median ${item.spread.medianText}, lower quartile ${item.spread.q1Text}, and upper quartile ${item.spread.q3Text} on ${noun(item.spread.count, unit)}`;
    });
}

function tractionScopeSentence() {
  return `The traction guide quotes Figure 2 of 49 CFR 575.104. That figure says the grades represent ${TRACTION_SCOPE}, and that the test ${TRACTION_EXCLUDED}.`;
}

function gripClose(report) {
  const move = letterMovement(report.row.traction);
  if (move.present.length < 2) return "This pull does not have two traction grades with a median treadwear.";
  if (move.up && move.down) {
    return "The file does not show one direction from a longer treadwear grade to a lower traction letter.";
  }
  const from = move.present[0].id;
  const to = move.present.at(-1).id;
  if (move.down && !move.up) return `In this pull the median treadwear does not rise from traction ${from} toward ${to}.`;
  if (move.up && !move.down) return `In this pull the median treadwear does not fall from traction ${from} toward ${to}.`;
  return "In this pull the median treadwear is the same at each traction letter.";
}

export function studyFaqs(report) {
  const tempBits = spreadBits(report.row.temperature, "row");
  const lineBits = spreadBits(report.line.temperature, "tire line");
  const quartile = tempBits.length
    ? `On source rows with a positive whole-number treadwear, ${listJoin(tempBits)}.`
    : "No temperature value has a positive whole-number treadwear in this pull.";
  const lineQuartile = lineBits.length
    ? `On tire lines with a positive whole-number treadwear, ${listJoin(lineBits)}.`
    : "No tire line has a positive whole-number treadwear in this pull.";
  return [
    {
      name: "Do longer-lasting tires in this file have less grip?",
      text: joinSentences([
        movementSentence("traction", report.row.traction),
        movementSentence("temperature", report.row.temperature),
        tractionScopeSentence(),
        aaLineShareSentence(report),
        longAaSentence(report),
        gripClose(report),
      ]),
    },
    {
      name: "What is the median treadwear for each temperature grade?",
      text: `${quartile} The quartiles use positive whole-number treadwear. ${methodNote()}`,
    },
    {
      name: "Why does this page also count one value per tire line?",
      text: joinSentences([
        lineRuleNote(),
        lineTemperatureSentence(report),
        lineQuartile,
        aaLineCountSentence(report),
      ]),
    },
    {
      name: "Are these UTQG grades lab-audited scores?",
      text: "These grades are assigned by the manufacturer under 49 CFR 575.104 and cannot be compared as lab-audited scores. The file records the assigned grade. This page compares those assigned grades.",
    },
  ];
}

export function studyText(report) {
  return [
    ...studyAnswer(report),
    introParagraph(),
    methodNote(),
    exclusionNote(report),
    movementSentence("temperature", report.row.temperature),
    movementSentence("traction", report.row.traction),
    stepSentence("temperature", report.row.temperature),
    stepSentence("traction", report.row.traction),
    tractionTablePointer(),
    cutoffDefinition(report),
    aaLineShareSentence(report),
    aaLineCountSentence(report),
    ownCutoffSentence(report),
    longAaSentence(report),
    compoundSentence(),
    duplicateNote(report),
    outsideNote(report),
    heatmapNote(),
    heatmapEmptyNote(),
    lineRuleNote(),
    lineExclusionNote(report),
    mixedNote(report),
    lineHeatmapNote(),
    lineHeatmapEmptyNote(),
    lineTractionSentence(report),
    lineTemperatureSentence(report),
    stepSentence("temperature", report.line.temperature),
    stepSentence("traction", report.line.traction),
    temperatureCaption(report),
    temperaturePlotCaption(report),
    crossCaption(report),
    outsideCaption(report),
    heatmapCaption(report),
    lineTemperatureCaption(report),
    linePlotCaption(report),
    lineCrossCaption(report),
    lineHeatmapCaption(report),
    ...studyFaqs(report).flatMap((item) => [item.name, item.text]),
    ECFR_TRACTION_URL,
    ecfrRetrievedLabel(),
    TRACTION_SCOPE,
    TRACTION_EXCLUDED,
  ].join(" ");
}

export function studyJsonLd(report) {
  const answers = studyAnswer(report);
  const description = answers.join(" ");
  const faqs = studyFaqs(report);
  return [
    dataset({
      name: "Treadwear, traction, and temperature counts in NHTSA's UTQG file",
      description,
      path: TREADWEAR_VS_TRACTION_PATH,
      dateModified: report.verifiedAt,
      isBasedOn: report.ratingsSource,
      keywords: ["UTQG", "treadwear", "traction", "temperature", "NHTSA"],
    }),
    article({
      headline: "Treadwear next to traction and temperature",
      description,
      path: TREADWEAR_VS_TRACTION_PATH,
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

export function figure2StillSupportsScope() {
  return FIGURE_2_TRACTION.includes(TRACTION_SCOPE) && FIGURE_2_TRACTION.includes(TRACTION_EXCLUDED);
}
