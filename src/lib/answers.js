import { formatNumber, formatVerified } from "./format.js";
import { formatNameList } from "./recalls.js";

const TRACTION = ["AA", "A", "B", "C"];
const TEMPERATURE = ["A", "B", "C"];

const SOURCE_LABELS = {
  ratings: "UTQG tire ratings",
  plants: "equipment plant codes",
  recalls: "tire-recall file",
};

/**
 * Answer-box sentences for each template. Every number comes from the
 * catalog or the recall summary. Invalid grades are quoted as published
 * values, not stated as treadwear, traction, or temperature grades.
 * A treadwear range is written as "from min to max", never as one number.
 */

function countNoun(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function listWords(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function uniqueInOrder(values, order) {
  const present = new Set(values);
  return order.filter((grade) => present.has(grade));
}

function quoteList(values) {
  return listWords(values.map((value) => `"${value}"`));
}

export function collectGradeFacts(rows) {
  const wearValid = [];
  const wearInvalid = [];
  let wearMissing = 0;
  const tracValid = [];
  const tracInvalid = [];
  let tracMissing = 0;
  const tempValid = [];
  const tempInvalid = [];
  let tempMissing = 0;

  for (const row of rows) {
    if (row.wearN != null && row.wearN > 0) wearValid.push(row.wearN);
    else if (row.wearN === 0 || (row.wear != null && String(row.wear).trim() !== "")) wearInvalid.push(String(row.wear).trim());
    else wearMissing += 1;

    const trac = String(row.trac ?? "").trim();
    if (!trac) tracMissing += 1;
    else if (TRACTION.includes(trac)) tracValid.push(trac);
    else tracInvalid.push(trac);

    const temp = String(row.temp ?? "").trim();
    if (!temp) tempMissing += 1;
    else if (TEMPERATURE.includes(temp)) tempValid.push(temp);
    else tempInvalid.push(temp);
  }

  return {
    rows: rows.length,
    wearValid,
    wearInvalid: [...new Set(wearInvalid)],
    wearMissing,
    tracValid: uniqueInOrder(tracValid, TRACTION),
    tracInvalid: [...new Set(tracInvalid)].sort(),
    tracMissing,
    tempValid: uniqueInOrder(tempValid, TEMPERATURE),
    tempInvalid: [...new Set(tempInvalid)].sort(),
    tempMissing,
  };
}

function wearClause(facts) {
  if (!facts.wearValid.length) return "no usable treadwear number";
  const min = Math.min(...facts.wearValid);
  const max = Math.max(...facts.wearValid);
  const partial = facts.wearMissing || facts.wearInvalid.length ? " where a usable number is published" : "";
  if (min === max) return `treadwear ${min}${partial}`;
  return `treadwear from ${min} to ${max}${partial}`;
}

function letterClause(label, valid, missing, invalid) {
  const partial = valid.length && (missing || invalid.length) ? " on rows with a usual grade" : "";
  if (valid.length > 1) return `${label} grades ${listWords(valid)}${partial}`;
  if (valid.length === 1) return `${label} ${valid[0]}${partial}`;
  if (invalid.length) return `${label} outside the usual grades`;
  return `${label} not reported`;
}

function flagSentence(facts) {
  const parts = [];
  if (facts.wearInvalid.length) parts.push(`treadwear ${quoteList(facts.wearInvalid)}`);
  if (facts.tracInvalid.length) parts.push(`traction ${quoteList(facts.tracInvalid)}`);
  if (facts.tempInvalid.length) parts.push(`temperature ${quoteList(facts.tempInvalid)}`);
  if (!parts.length) return "";
  const count = facts.wearInvalid.length + facts.tracInvalid.length + facts.tempInvalid.length;
  if (count === 1) {
    return `NHTSA published ${listWords(parts)}, which is outside the usual UTQG grades, so it is not stated above as a grade.`;
  }
  return `NHTSA published ${listWords(parts)}, which are outside the usual UTQG grades, so they are not stated above as grades.`;
}

function sameNameSentence(line) {
  const count = line.sameName?.length || 0;
  if (!count) return "";
  const where = count === 1 ? "another brand string" : `${formatNumber(count)} other brand strings`;
  return `The same line name is also stored under ${where}, which is not evidence of rebadging.`;
}

function constructionClause(rows) {
  const values = [...new Set(rows.map((row) => row.construction).filter(Boolean))];
  if (!values.length) return "";
  return `, with ${listWords(values)} construction,`;
}

function sizeClause(count) {
  if (count === 1) return "on its one size row";
  return `across its ${formatNumber(count)} size rows`;
}

export function lineAnswer(line) {
  if (!line.rows?.length) {
    return [`${line.brand} ${line.line} has no grade rows in NHTSA's published UTQG list.`];
  }
  const facts = collectGradeFacts(line.rows);
  const sentences = [
    `In NHTSA's published UTQG list, ${line.brand} ${line.line} has ${wearClause(facts)}, ${letterClause("traction", facts.tracValid, facts.tracMissing, facts.tracInvalid)}, and ${letterClause("temperature", facts.tempValid, facts.tempMissing, facts.tempInvalid)}${constructionClause(line.rows)} ${sizeClause(facts.rows)}.`,
  ];
  const flag = flagSentence(facts);
  if (flag) sentences.push(flag);
  const sameName = sameNameSentence(line);
  if (sameName && sentences.length < 3) sentences.push(sameName);
  if (sentences.length < 3) {
    sentences.push("The ratings file does not say whether this tire is still sold, and it has no category for the line.");
  }
  return sentences;
}

function brandWearSentence(facts) {
  const excluded = facts.wearInvalid.length || facts.tracInvalid.length || facts.tempInvalid.length;
  if (!facts.wearValid.length) return "Treadwear is not reported as a usable number on those rows.";
  const min = Math.min(...facts.wearValid);
  const max = Math.max(...facts.wearValid);
  const range = min === max ? `is ${min}` : `runs from ${min} to ${max}`;
  const tail = excluded ? ", leaving out values outside the usual grades" : "";
  return `Treadwear on those rows ${range}${tail}.`;
}

function filingSentence(brand, filings) {
  const count = filings.rows.length;
  const lineNoun = count === 1 ? "1 recalled line" : `${formatNumber(count)} recalled lines`;
  const filerNoun = filings.filers.length === 1 ? "filer" : "filers";
  return `NHTSA tire-recall filings name ${brand.name} on ${lineNoun}, with ${formatNameList(filings.filers)} as the ${filerNoun}, and a filer can be the factory, an importer, or the brand owner for that recalled line only.`;
}

export function brandAnswer(brand, lines, filings) {
  const rows = [];
  for (const line of lines) rows.push(...line.rows);
  const facts = collectGradeFacts(rows);
  const lineNoun = brand.lineCount === 1 ? "tire line" : "tire lines";
  const rowNoun = brand.rowCount === 1 ? "grade row" : "grade rows";
  return [
    `${brand.name} has ${formatNumber(brand.lineCount)} ${lineNoun} and ${formatNumber(brand.rowCount)} ${rowNoun} in NHTSA's published UTQG list.`,
    brandWearSentence(facts),
    filings
      ? filingSentence(brand, filings)
      : "The ratings file does not say which of these lines are still sold.",
  ];
}

function extremes(facts) {
  if (!facts.wearValid.length) return "Treadwear is not reported as a usable number in that list.";
  const min = Math.min(...facts.wearValid);
  const max = Math.max(...facts.wearValid);
  const tail = facts.wearInvalid.length || facts.wearMissing ? ", leaving out rows without a usable treadwear number" : "";
  if (min === max) return `The highest treadwear in NHTSA's published UTQG list is ${max}${tail}.`;
  return `The highest treadwear in NHTSA's published UTQG list is ${max}, and the lowest reported treadwear is ${min}${tail}.`;
}

let cachedFacts = null;

export function catalogFacts(catalog) {
  if (cachedFacts && cachedFacts.catalog === catalog) return cachedFacts.facts;
  const rows = [];
  for (const line of catalog.lines) rows.push(...line.rows);
  const facts = collectGradeFacts(rows);
  cachedFacts = { catalog, facts };
  return facts;
}

export function ratingsAnswer(catalog) {
  const facts = catalogFacts(catalog);
  return [
    `NHTSA's published UTQG list on this site has ${countNoun(catalog.stats.rows, "grade row")} across ${countNoun(catalog.stats.lines, "tire line")} and ${countNoun(catalog.stats.brands, "brand")}.`,
    extremes(facts),
    "Sorting high to low on this page orders those published grades and is not a ranking.",
  ];
}

export function brandsIndexAnswer(catalog) {
  const facts = catalogFacts(catalog);
  const min = facts.wearValid.length ? Math.min(...facts.wearValid) : null;
  const max = facts.wearValid.length ? Math.max(...facts.wearValid) : null;
  const wear =
    min == null
      ? "Treadwear is not reported as a usable number in that list."
      : min === max
        ? `Treadwear in that published list is ${min}.`
        : `Treadwear in that published list runs from ${min} to ${max}${facts.wearInvalid.length || facts.wearMissing ? ", leaving out rows without a usable treadwear number" : ""}.`;
  return [
    `NHTSA's published UTQG list on this site has ${formatNumber(catalog.stats.brands)} brands and ${formatNumber(catalog.stats.lines)} tire lines.`,
    wear,
    "A shared line name is not evidence of rebadging, and the list does not say which lines are still sold.",
  ];
}

export function homeAnswer(catalog) {
  const facts = catalogFacts(catalog);
  return [
    `TreadGrade repeats NHTSA's public files: ${countNoun(catalog.stats.rows, "UTQG grade row")}, ${countNoun(catalog.stats.lines, "tire line")}, ${countNoun(catalog.stats.brands, "brand")}, and ${countNoun(catalog.stats.plants, "plant code")}.`,
    extremes(facts),
    "A plant code names the registered plant, not a brand, and these grades are not a ranking.",
  ];
}

function placeOf(plant) {
  return [plant.city, plant.state, plant.country].filter(Boolean).join(", ");
}

export function plantAnswer(plant) {
  const place = placeOf(plant);
  const where = place ? ` in ${place}` : "";
  const sentences = [
    `Plant code ${plant.code} names ${plant.name}${where}, per NHTSA's plant list.`,
    "The name is the registrant at the time of registration, and the record does not list brands.",
  ];
  if (plant.oldCode) {
    const shared = plant.oldCodeSharedWith?.length;
    const also = shared
      ? `, which is also listed on ${shared === 1 ? "another plant record" : `${formatNumber(shared)} other plant records`}`
      : "";
    sentences.push(`The same record lists former code ${plant.oldCode}${also}.`);
  }
  return sentences;
}

export function plantsIndexAnswer(catalog) {
  const former = catalog.plants.filter((plant) => plant.oldCode).length;
  const active = catalog.plants.filter((plant) => plant.status === "Active").length;
  return [
    `NHTSA's equipment plant list on this site has ${formatNumber(catalog.stats.plants)} codes, including ${formatNumber(former)} with a former two-symbol code.`,
    `The status field is Active on ${formatNumber(active)} of those records, and that value is not a finding that the plant is operating.`,
    "Each code names the registrant at the time of registration, and it is not a list of brands.",
  ];
}

export function decoderAnswer(catalog) {
  const former = catalog.plants.filter((plant) => plant.oldCode).length;
  const example = catalog.getPlant?.("1u2");
  const sentences = [
    `This decoder reads a DOT tire identification number against ${formatNumber(catalog.stats.plants)} plant records in NHTSA's list, including ${formatNumber(former)} former two-symbol codes.`,
    "A match names the registrant on that plant code and does not name a brand, and the manufacture week follows the Sunday–Saturday rule in 49 CFR 574.5.",
  ];
  if (example) {
    const place = placeOf(example);
    sentences.push(`Plant code ${example.code} in that list names ${example.name}${place ? ` in ${place}` : ""}.`);
  }
  return sentences;
}

export function whoMakesAnswer(summary) {
  return [
    `NHTSA's tire-recall file since 2010 lists ${formatNumber(summary.campaigns)} tire campaigns, ${formatNumber(summary.brands)} brand strings, and ${formatNumber(summary.lines)} recalled lines.`,
    `On ${formatNumber(summary.brandsWithDifferentFiler)} of those brand strings, the filing company's name differs from the brand.`,
    "The filer can be the factory, an importer, or the brand owner, and a filing covers only the recalled line.",
  ];
}

export function utqgGuideAnswer(catalog) {
  const { rows, wearBuckets, traction, temperature } = catalog.stats;
  return [
    "UTQG grades new passenger-car tires for treadwear, traction, and temperature under 49 CFR 575.104.",
    `In NHTSA's published list of ${formatNumber(rows)} grade rows, ${formatNumber(wearBuckets.over600)} have treadwear above 600, ${formatNumber(traction.AA)} have traction AA, and ${formatNumber(temperature.A)} have temperature A.`,
    "Those counts describe the published list, not tires currently for sale, and the file has no category field.",
  ];
}

export function dotGuideAnswer(catalog) {
  const former = catalog.plants.filter((plant) => plant.oldCode).length;
  return [
    "A current new-tire DOT identification number has 13 symbols: a 3-symbol plant code, a 6-symbol manufacturer code, and a 4-digit manufacture week and year.",
    `The plant list on this site holds ${formatNumber(catalog.stats.plants)} NHTSA records, including ${formatNumber(former)} with a former two-symbol code.`,
    "A plant record names the registrant at the time of registration, not the brands made there.",
  ];
}

export function dateGuideAnswer() {
  return [
    "The last four digits of a DOT tire identification number are the date code: the first two are the week, and the last two are the year.",
    "In 49 CFR 574.5, 0109 means the week of Sunday, January 4, 2009 through Saturday, January 10, 2009.",
    "A date code from before the four-digit form is three digits, and those digits do not name the decade.",
  ];
}

export function guidesIndexAnswer(catalog, summary) {
  return [
    `These guides cover NHTSA's published list of ${formatNumber(catalog.stats.rows)} grade rows, ${formatNumber(catalog.stats.plants)} plant records, and the four-digit tire date code.`,
    `Who makes it lists ${formatNumber(summary.campaigns)} tire-recall campaigns and ${formatNumber(summary.brands)} brand strings from NHTSA's recall file.`,
    "A recall filer can be the factory, an importer, or the brand owner, and only for the recalled line.",
  ];
}

export function methodologyAnswer(catalog, summary) {
  return [
    `This site was built from an NHTSA pull last verified ${formatVerified(catalog.meta.verifiedAt)} (UTC): ${formatNumber(catalog.stats.rows)} UTQG grade rows and ${formatNumber(catalog.stats.plants)} plant codes.`,
    `The tire-recall file, retrieved ${formatVerified(catalog.meta.recalls.retrievedAt)} (UTC), has ${formatNumber(summary.campaigns)} tire campaigns and ${formatNumber(summary.lines)} recalled lines.`,
    "Grade numbers and plant records are copied from those files, and a brand string is not corrected by hand.",
  ];
}

export function sourceEntries(meta, kinds) {
  const groups = new Map();
  for (const kind of kinds) {
    const updated = kind === "recalls" ? meta.recalls.retrievedAt : meta.verifiedAt;
    if (!groups.has(updated)) groups.set(updated, []);
    groups.get(updated).push(SOURCE_LABELS[kind]);
  }
  return [...groups.entries()].map(([updated, names]) => ({
    name: names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`,
    updated,
  }));
}
