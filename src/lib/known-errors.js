import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanSpace, formatNumber, formatVerified } from "./format.js";
import { brandKey, nameKey } from "./normalize.js";
import { formatNameList, isImporterOrBrandOwnerExample } from "./recalls.js";
import { contactEmail } from "./site.js";
import { article, dataset, laterIso } from "./structured.js";

const TRACTION = ["AA", "A", "B", "C"];
const TEMPERATURE = ["A", "B", "C"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const KNOWN_ERRORS_PATH = "/methodology/known-errors/";

const WORKFLOW_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../.github/workflows/refresh-data.yml");

/**
 * Line names the ratings file has stored under alphabetically neighboring
 * brands. The brand list is looked up from the file. A name that is not in
 * the file is omitted.
 */
const WATCHED_LINES = [
  { id: "advan-a048", key: nameKey("ADVAN A048"), absentBrand: "Yokohama" },
  { id: "p-zero-rosso", key: nameKey("P ZERO ROSSO") },
  { id: "mach-4-r302", key: nameKey("Mach 4 R302") },
  { id: "strada-i", key: nameKey("Strada I") },
];

/**
 * Lines named in public notes about this file. Each query runs against the
 * committed rows. A query that matches nothing stays, with a count of zero.
 */
const COVERAGE = [
  {
    id: "quiettrack",
    label: "Bridgestone Turanza QuietTrack",
    test: (brand, line) => /quiet\s*track/i.test(brand) || /quiet\s*track/i.test(line),
  },
  {
    id: "westlake",
    label: "Westlake",
    test: (brand, line) => /westlake/i.test(brand) || /westlake/i.test(line),
  },
  {
    id: "linglong",
    label: "Linglong",
    test: (brand, line) => /linglong/i.test(brand) || /linglong/i.test(line),
  },
  {
    id: "lexani",
    label: "Lexani",
    test: (brand, line) => /lexani/i.test(brand) || /lexani/i.test(line),
  },
  {
    id: "defender-2",
    label: "Michelin Defender 2",
    test: (brand, line) => /michelin/i.test(brand) && /^defender\s*2$/i.test(line),
  },
  {
    id: "ko2",
    label: "BFGoodrich KO2",
    test: (brand, line) => /\bko2\b/i.test(brand) || /\bko2\b/i.test(line) || /\bk02\b/i.test(brand) || /\bk02\b/i.test(line),
  },
];

const RANGE_LINES = [
  { brand: /^bridgestone$/i, line: /^ecopia ep150$/i },
  { brand: /^hankook$/i, line: /^ventus s1 evo3 suv \(oe\)$/i },
  { brand: /^toyo$/i, line: /^versado lx$/i },
];

const HANDLING = {
  repeated:
    "Kept under the brand string NHTSA stored. Other brand strings with the same line name are linked. The shared name is not treated as a rebadge, and the brand string is not corrected.",
  invalid:
    "Shown as published. Quoted instead of being stated as a grade. Traction and temperature sorts order only the usual letters, and these values sort after those letters. The row stays in the table.",
  wearZero:
    "Shown as 0. Left out of usable treadwear, including the highest treadwear in NHTSA's published UTQG list. A high-to-low treadwear sort still orders 0 as a published number.",
  wearMissing:
    "Shown as not reported. Left out of usable treadwear. A high-to-low treadwear sort places it after numbered rows.",
  coverageMiss:
    "Not filled in. Absence is not a grade, and it is not a claim that the tire is unsold.",
  coverageHit:
    "Shown as published. The file does not say that missing sizes exist, and a missing size is not a grade.",
  range: "Each size series stays on its own row. The line is not collapsed to one treadwear number.",
};

function quote(value) {
  return `"${value}"`;
}

function rowNoun(count) {
  return count === 1 ? "grade row" : "grade rows";
}

function noun(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

export function refreshSchedule(cron) {
  const match = String(cron ?? "").trim().match(/^(\d{1,2}) (\d{1,2}) \* \* (\d)$/);
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  const day = Number(match[3]);
  if (minute > 59 || hour > 23 || day > 6) return null;
  return {
    day: WEEKDAYS[day],
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    cron: match[0],
  };
}

export function refreshScheduleFromWorkflow(text) {
  const match = String(text ?? "").match(/^\s*-\s*cron:\s*"([^"]+)"/m);
  if (!match) return null;
  return refreshSchedule(match[1]);
}

export function loadRefreshSchedule() {
  const candidates = [WORKFLOW_PATH, join(process.cwd(), ".github/workflows/refresh-data.yml")];
  for (const path of candidates) {
    try {
      const schedule = refreshScheduleFromWorkflow(readFileSync(path, "utf8"));
      if (schedule) return schedule;
    } catch {
      // The module URL can move during the site build, so try the next path.
    }
  }
  return null;
}

function usualTraction(value) {
  return TRACTION.includes(value);
}

function usualTemperature(value) {
  return TEMPERATURE.includes(value);
}

function positiveWears(line) {
  return [...new Set(line.rows.map((row) => row.wearN).filter((value) => value != null && value > 0))];
}

function brandRuns(names, orderedNames) {
  const index = new Map(orderedNames.map((name, position) => [name, position]));
  const sorted = [...names].sort((a, b) => index.get(a) - index.get(b));
  const runs = [];
  for (const name of sorted) {
    const previous = runs.at(-1);
    if (previous && index.get(name) === index.get(previous.at(-1)) + 1) previous.push(name);
    else runs.push([name]);
  }
  return runs;
}

function adjacencySentence(runs) {
  const long = runs.filter((run) => run.length > 1);
  if (!long.length) return "";
  if (runs.length === 1) return "Those brand strings are next to one another in this site's brand index.";
  return long.map((run) => `${formatNameList(run)} are next to one another in this site's brand index.`).join(" ");
}

function lineLabel(line) {
  if (line.brand === line.line) return `${line.brand}, line ${line.line}`;
  return `${line.brand} ${line.line}`;
}

function mostCommonLine(lines) {
  const counts = new Map();
  for (const line of lines) counts.set(line.line, (counts.get(line.line) || 0) + line.rows.length);
  let best = "";
  let bestCount = -1;
  for (const [spelling, count] of counts) {
    if (count > bestCount || (count === bestCount && spelling.localeCompare(best, "en") < 0)) {
      best = spelling;
      bestCount = count;
    }
  }
  return best;
}

function problemLabels(row) {
  const labels = [];
  if (row.wear == null || row.wear === "") labels.push("no treadwear number");
  else if (row.wearN == null) labels.push(`treadwear ${quote(row.wear)}`);
  else if (row.wearN === 0) labels.push("treadwear 0");
  if (!usualTraction(row.trac)) labels.push(`traction ${quote(row.trac || "")}`);
  if (!usualTemperature(row.temp)) labels.push(`temperature ${quote(row.temp || "")}`);
  return labels;
}

function anomalyKind(row) {
  if (!usualTraction(row.trac) || !usualTemperature(row.temp)) return "invalid";
  if (row.wearN === 0) return "wearZero";
  if (row.wear == null || row.wear === "") return "wearMissing";
  if (row.wearN == null) return "invalid";
  return "";
}

function countRows(hits) {
  const counts = new Map();
  for (const label of hits) counts.set(label, (counts.get(label) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"));
}

function anomalySummary(line, badRows) {
  const labels = countRows(badRows.flatMap((row) => problemLabels(row)));
  const parts = labels.map(([label, count]) => {
    if (count === badRows.length) return label;
    return `${formatNumber(count)} with ${label}`;
  });
  const scope =
    badRows.length === line.rows.length
      ? `${formatNumber(badRows.length)} ${rowNoun(badRows.length)}`
      : `${formatNumber(badRows.length)} of ${formatNumber(line.rows.length)} ${rowNoun(line.rows.length)}`;
  return `${scope} with ${formatNameList(parts)}.`;
}

function coverageSummary(item, hits) {
  if (!hits.length) return `No grade row in this file matches ${item.label}.`;
  const lines = new Map();
  for (const hit of hits) {
    const key = `${hit.brand}\n${hit.line}`;
    lines.set(key, (lines.get(key) || 0) + 1);
  }
  const described = [...lines.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "en"))
    .map(([key, count]) => {
      const [brand, line] = key.split("\n");
      return `${brand} ${line} (${formatNumber(count)} ${rowNoun(count)})`;
    });
  if (described.length === 1) {
    const [key, count] = [...lines.entries()][0];
    const [brand, line] = key.split("\n");
    return `${brand} ${line} has ${formatNumber(count)} ${rowNoun(count)}.`;
  }
  return `${formatNumber(hits.length)} ${rowNoun(hits.length)}: ${formatNameList(described)}.`;
}

function rangeSummary(line, wears) {
  const min = Math.min(...wears);
  const max = Math.max(...wears);
  return `Treadwear from ${min} to ${max} across ${formatNumber(line.rows.length)} ${rowNoun(line.rows.length)}.`;
}

/**
 * Counts and examples for the known-errors page. Every figure is counted
 * from the catalog built for this site and from the ratings and recall rows
 * passed in. Watched line names that are absent are left out.
 */
export function buildKnownErrors({ catalog, ratings, recalls = [] }) {
  const rawBrands = new Set();
  const caseKeys = new Set();
  const punctuationKeys = new Set();
  let skippedRows = 0;
  for (const row of ratings) {
    const brand = cleanSpace(row.brand);
    const line = cleanSpace(row.tireline);
    if (!brand || !line) {
      skippedRows += 1;
      continue;
    }
    rawBrands.add(brand);
    caseKeys.add(nameKey(brand));
    punctuationKeys.add(brandKey(brand));
  }

  let gradeRows = 0;
  let activeRows = 0;
  let safetyRows = 0;
  let wearZeroRows = 0;
  let wearMissingRows = 0;
  let wearNonNumericRows = 0;
  let invalidLetterRows = 0;
  const anomalies = [];
  const byLineKey = new Map();

  for (const line of catalog.lines) {
    if (!byLineKey.has(line.lineKey)) byLineKey.set(line.lineKey, []);
    byLineKey.get(line.lineKey).push(line);
    const badRows = [];
    for (const row of line.rows) {
      gradeRows += 1;
      if (row.active) activeRows += 1;
      if (row.complaintsCount || row.recallsCount || row.investigationsCount || row.manufacturerCommunicationsCount) {
        safetyRows += 1;
      }
      const letter = !usualTraction(row.trac) || !usualTemperature(row.temp);
      if (letter) invalidLetterRows += 1;
      if (row.wear == null || row.wear === "") wearMissingRows += 1;
      else if (row.wearN == null) wearNonNumericRows += 1;
      else if (row.wearN === 0) wearZeroRows += 1;
      if (letter || row.wearN === 0 || row.wear == null || row.wear === "" || (row.wear != null && row.wear !== "" && row.wearN == null)) {
        badRows.push(row);
      }
    }
    if (!badRows.length) continue;
    const kind = badRows.every((row) => anomalyKind(row) === "wearZero")
      ? "wearZero"
      : badRows.every((row) => anomalyKind(row) === "wearMissing")
        ? "wearMissing"
        : "invalid";
    const kindLabel = {
      invalid: "Value outside the usual grades",
      wearZero: "Treadwear 0",
      wearMissing: "Treadwear not reported",
    }[kind];
    const summary = anomalySummary(line, badRows);
    const label = lineLabel(line);
    anomalies.push({
      kind: kindLabel,
      example: label,
      href: line.url,
      rows: badRows.length,
      summary,
      detail: `${label}: ${summary}`,
      handling: HANDLING[kind],
    });
  }
  anomalies.sort((a, b) => a.example.localeCompare(b.example, "en"));

  let sharedLineNames = 0;
  for (const group of byLineKey.values()) {
    if (new Set(group.map((line) => line.brandSlug)).size > 1) sharedLineNames += 1;
  }

  let multiWearLines = 0;
  for (const line of catalog.lines) {
    if (positiveWears(line).length > 1) multiWearLines += 1;
  }

  const orderedNames = catalog.brands.map((brand) => brand.name);
  const repeatedLines = [];
  for (const watched of WATCHED_LINES) {
    const lines = byLineKey.get(watched.key) || [];
    const brandSlugs = new Set(lines.map((line) => line.brandSlug));
    if (brandSlugs.size < 2) continue;
    const brands = lines
      .map((line) => ({
        name: line.brand,
        href: line.url,
        rows: line.rows.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "en") || a.href.localeCompare(b.href));
    const runs = brandRuns(
      brands.map((brand) => brand.name),
      orderedNames,
    );
    const absent = [];
    if (watched.absentBrand) {
      const wanted = brandKey(watched.absentBrand);
      const present = new Set(lines.map((line) => brandKey(line.brand)));
      if (!present.has(wanted)) {
        const stored = catalog.brands.find((brand) => brandKey(brand.name) === wanted);
        if (stored) absent.push(stored.name);
      }
    }
    const adjacency = adjacencySentence(runs);
    const brandBits = brands.map((brand) => `${brand.name} (${formatNumber(brand.rows)} ${rowNoun(brand.rows)})`);
    let detail = `Stored under ${formatNameList(brandBits)}.`;
    if (absent.length) detail += ` Not stored under ${formatNameList(absent)}.`;
    if (adjacency) detail += ` ${adjacency}`;
    repeatedLines.push({
      id: watched.id,
      kind: "Repeated line name",
      example: mostCommonLine(lines),
      rows: brands.reduce((sum, brand) => sum + brand.rows, 0),
      brands,
      absent,
      adjacency,
      summary: detail,
      detail,
      handling: HANDLING.repeated,
    });
  }

  const coverage = COVERAGE.map((item) => {
    const hits = [];
    for (const line of catalog.lines) {
      for (const row of line.rows) {
        if (item.test(line.brand, line.line)) hits.push({ brand: line.brand, line: line.line, href: line.url });
      }
    }
    const summary = coverageSummary(item, hits);
    return {
      id: item.id,
      kind: hits.length ? "In this file" : "Not in this file",
      example: item.label,
      rows: hits.length,
      href: hits.length === 1 ? hits[0].href : "",
      summary,
      detail: summary,
      handling: hits.length ? HANDLING.coverageHit : HANDLING.coverageMiss,
    };
  });

  const ranges = [];
  for (const wanted of RANGE_LINES) {
    const line = catalog.lines.find((item) => wanted.brand.test(item.brand) && wanted.line.test(item.line.toLowerCase()));
    if (!line) continue;
    const wears = positiveWears(line);
    if (wears.length < 2) continue;
    const summary = rangeSummary(line, wears);
    const label = lineLabel(line);
    ranges.push({
      kind: "Treadwear varies by size",
      example: label,
      href: line.url,
      rows: line.rows.length,
      min: Math.min(...wears),
      max: Math.max(...wears),
      summary,
      detail: `${label}: ${summary}`,
      handling: HANDLING.range,
    });
  }

  const proxy = { allSeason: 0, allTerrain: 0, touring: 0, highway: 0 };
  for (const line of catalog.lines) {
    if (/\bA\/S\b/i.test(line.line)) proxy.allSeason += 1;
    if (/\bA\/T\b/i.test(line.line)) proxy.allTerrain += 1;
    if (/touring/i.test(line.line)) proxy.touring += 1;
    if (/\bH\/T\b/i.test(line.line)) proxy.highway += 1;
  }

  const plantStatus = { Active: 0, Closed: 0, empty: 0 };
  let formerTwoSymbol = 0;
  let formerOther = 0;
  const plantCodes = new Set();
  for (const plant of catalog.plants) {
    plantCodes.add(plant.code);
    if (plant.status === "Active") plantStatus.Active += 1;
    else if (plant.status === "Closed") plantStatus.Closed += 1;
    else plantStatus.empty += 1;
    if (!plant.oldCode) continue;
    if (plant.oldCode.length === 2) formerTwoSymbol += 1;
    else formerOther += 1;
  }
  const statusExamples = catalog.plants
    .filter((plant) => /phillips petroleum company|gates rubber/i.test(plant.name) && plant.status === "Active")
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((plant) => ({
      code: plant.code,
      name: plant.name,
      status: plant.status,
      href: plant.url,
    }));

  const fields = catalog.meta?.ratings?.fields || [];
  const plantFields = catalog.meta?.plants?.fields || [];
  const filers = new Map();
  for (const row of recalls) {
    const name = cleanSpace(row.filer);
    if (!name || !isImporterOrBrandOwnerExample(name)) continue;
    filers.set(name, (filers.get(name) || 0) + 1);
  }
  const importerFilers = [...filers.entries()]
    .map(([name, rows]) => ({ name, rows }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  const sourceRows = ratings.length;
  const duplicateRows = sourceRows - skippedRows - gradeRows;
  const verifiedAt = catalog.meta?.verifiedAt || "";
  const recallsRetrievedAt = catalog.meta?.recalls?.retrievedAt || "";

  const report = {
    verifiedAt,
    recallsRetrievedAt,
    sourceRows,
    skippedRows,
    duplicateRows,
    gradeRows,
    rawBrandStrings: rawBrands.size,
    brandsAfterCase: caseKeys.size,
    brandKeys: punctuationKeys.size,
    brands: catalog.stats.brands,
    lines: catalog.stats.lines,
    sharedLineNames,
    multiWearLines,
    wearZeroRows,
    wearMissingRows,
    wearNonNumericRows,
    invalidLetterRows,
    activeRows,
    safetyRows,
    plants: catalog.stats.plants,
    formerTwoSymbol,
    formerOther,
    plantStatus,
    statusExamples,
    absentPlantCodes: ["XXXX", "XXXXXX"].filter((code) => !plantCodes.has(code)),
    presentPlantCodes: ["XXXX", "XXXXXX"].filter((code) => plantCodes.has(code)),
    hasCategoryField: fields.some((field) => String(field).toLowerCase() === "category"),
    ratingFields: fields,
    hasPlantBrandField: plantFields.some((field) => String(field).toLowerCase() === "brand"),
    plantFields,
    proxy,
    punctuationMerges: catalog.brands
      .filter((brand) => brand.aliases.length)
      .map((brand) => ({
        name: brand.name,
        href: brand.url,
        aliases: brand.aliases,
      })),
    redirects: catalog.redirects,
    repeatedLines,
    anomalies,
    coverage,
    ranges,
    importerFilers,
    recallCampaigns: new Set(recalls.map((row) => row.campaign).filter(Boolean)).size,
    recallLines: recalls.length,
    contactEmail: contactEmail(),
    ratingsSource: catalog.meta?.ratings?.source || "",
    plantsSource: catalog.meta?.plants?.source || "",
    recallsSource: catalog.meta?.recalls?.source || "",
    plantYear: catalog.meta?.plants?.yearRequested ?? null,
    plantSearch: catalog.meta?.plants?.searchCriteria || "",
  };
  report.answers = knownErrorsAnswer(report);
  report.counts = knownErrorCounts(report);
  report.examples = [...repeatedLines, ...anomalies, ...ranges, ...coverage];
  return report;
}

export function knownErrorsAnswer(report) {
  const when = formatVerified(report.verifiedAt);
  return [
    `NHTSA's UTQG file verified ${when} (UTC) contains ${formatNumber(report.rawBrandStrings)} raw brand strings, published here as ${formatNumber(report.brands)} brands and ${formatNumber(report.gradeRows)} grade rows.`,
    `That NHTSA UTQG file, verified ${when} (UTC), stores ${formatNumber(report.sharedLineNames)} line names under more than one brand, which is not evidence of rebadging.`,
    `The same NHTSA UTQG file, verified ${when} (UTC), has ${formatNumber(report.wearZeroRows)} ${rowNoun(report.wearZeroRows)} with treadwear 0 and ${formatNumber(report.invalidLetterRows)} ${rowNoun(report.invalidLetterRows)} whose traction or temperature is outside the usual letters.`,
  ];
}

export function knownErrorsDescription(report) {
  const when = formatVerified(report.verifiedAt);
  return `Limits of the NHTSA UTQG file verified ${when} (UTC): ${formatNumber(report.sharedLineNames)} shared line names are not rebadges, and ${formatNumber(report.invalidLetterRows)} grade rows sit outside the usual letters.`;
}

function countRow(label, value, singular, plural = `${singular}s`) {
  return { label, value, unit: noun(value, singular, plural) };
}

export function knownErrorCounts(report) {
  const rows = [
    countRow("Source rows in the ratings file", report.sourceRows, "source row"),
    countRow("Exact duplicate grade rows dropped", report.duplicateRows, "source row"),
    countRow("Grade rows shown", report.gradeRows, "grade row"),
    countRow("Raw brand strings", report.rawBrandStrings, "brand string"),
    countRow("Brands after letter case and spacing", report.brandsAfterCase, "brand"),
    countRow("Brands after punctuation is also ignored", report.brands, "brand"),
    countRow("Retired addresses after that punctuation merge", report.redirects.length, "address", "addresses"),
    countRow("Line names under more than one brand", report.sharedLineNames, "line name"),
    countRow("Tire lines with more than one treadwear number above 0", report.multiWearLines, "tire line"),
    countRow("Grade rows with treadwear 0", report.wearZeroRows, "grade row"),
    countRow("Grade rows with no treadwear number", report.wearMissingRows, "grade row"),
    countRow("Grade rows with traction or temperature outside the usual letters", report.invalidLetterRows, "grade row"),
    countRow("Grade rows with the active flag set", report.activeRows, "grade row"),
    countRow("Grade rows with an issue count above 0", report.safetyRows, "grade row"),
    countRow("Plant records", report.plants, "plant record"),
    countRow("Plant records with a former two-symbol code", report.formerTwoSymbol, "plant record"),
    countRow("Tire-recall campaigns", report.recallCampaigns, "campaign"),
    countRow("Recalled lines in the recall table", report.recallLines, "recalled line"),
  ];
  if (report.skippedRows) rows.splice(1, 0, countRow("Source rows skipped for a missing brand or line", report.skippedRows, "source row"));
  if (report.wearNonNumericRows) {
    rows.push(countRow("Grade rows with treadwear that is not a whole number", report.wearNonNumericRows, "grade row"));
  }
  if (report.formerOther) rows.push(countRow("Plant records with a former code that is not two symbols", report.formerOther, "plant record"));
  return rows;
}

export function countsCaption(report) {
  return `Counts from the NHTSA files verified ${formatVerified(report.verifiedAt)} (UTC).`;
}

export function examplesCaption(report) {
  return `Known-error examples in the NHTSA files verified ${formatVerified(report.verifiedAt)} (UTC).`;
}

export function knownErrorsJsonLd(report) {
  const description = report.answers.join(" ");
  const sources = [report.ratingsSource, report.plantsSource, report.recallsSource].filter((source) => /^https:\/\//.test(source));
  const dateModified = laterIso(report.verifiedAt, report.recallsRetrievedAt);
  return [
    dataset({
      name: "Known errors in NHTSA UTQG ratings, tire plant codes, and tire-recall filings as presented by TreadGrade",
      description,
      path: KNOWN_ERRORS_PATH,
      dateModified,
      isBasedOn: sources,
      keywords: ["UTQG", "NHTSA", "data quality", "treadwear"],
    }),
    article({
      headline: "Known errors in NHTSA's UTQG data",
      description,
      path: KNOWN_ERRORS_PATH,
      dateModified,
    }),
  ];
}
