import { cleanSpace, formatNumber, formatUtcDate, formatVerified } from "./format.js";
import { brandKey, nameKey } from "./normalize.js";
import { formatNameList } from "./recalls.js";
import { article, dataset, laterIso } from "./structured.js";

/**
 * What a DOT plant code can prove about who made a tire.
 * Counts come from the committed NHTSA files. A plant code is joined to a
 * brand only when a committed row actually carries both. Otherwise the count
 * is left unset.
 */

export const REBADGED_TIRES_PATH = "/guides/rebadged-tires/";
export const REBADGED_TITLE = "What a DOT code can prove about who made a tire";

export const ECFR_TIN_URL =
  "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-574/section-574.5";
export const ECFR_PLANT_URL =
  "https://www.ecfr.gov/current/title-49/subtitle-B/chapter-V/part-574/section-574.6";
/** Calendar date the two eCFR sections above were opened. */
export const ECFR_RETRIEVED = "2026-11-16";

export const PLANT_CODE_QUOTE =
  "The plant code represents the identity of the new tire manufacturer or retreader.";

export const MANUFACTURER_CODE_QUOTE =
  "For new tires, the manufacturer's code may be used as a descriptive code for the purpose of identifying significant characteristics of the tire or to identify the brand name owner.";

export const TIRE_TYPE_QUOTE =
  "The type of tires manufactured at each plant, e.g., pneumatic tires for passenger cars, buses, trucks, or motorcycles; pneumatic retreaded tires; or non-pneumatic tires or non-pneumatic tire assemblies.";

export const NOT_IN_FILES = "Not in these files";

export const BANNED_VERDICT =
  /\b(best|top-rated|top rated|recommend|same as|better|winner|safest|good tire|bad tire|worth buying)\b/i;

const STORE_BRAND = /\b(kirkland|douglas)\b/i;

function noun(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function be(count) {
  return count === 1 ? "is" : "are";
}

export function ecfrRetrievedLabel() {
  return formatUtcDate(ECFR_RETRIEVED);
}

export function isPlantLinkKey(key) {
  const text = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!text || text.includes("count")) return false;
  return text === "plant" || text === "factory" || text.includes("plantcode") || text.includes("dotcode");
}

export function isBrandLinkKey(key) {
  const text = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  return text === "brand" || text === "brands";
}

export function isLineLinkKey(key) {
  const text = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  return text === "tireline" || text === "tirelines" || text === "line" || text === "lines";
}

function keysOf(rows) {
  const keys = new Set();
  for (const row of rows || []) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b, "en"));
}

function matchingKeys(keys, pred) {
  return keys.filter(pred).sort((a, b) => a.localeCompare(b, "en"));
}

function fieldList(keys) {
  if (!keys.length) return "no fields";
  return formatNameList(keys);
}

function lineName(row) {
  return nameKey(row?.tireline ?? row?.tireLine ?? row?.line ?? row?.model ?? "");
}

function plantCodeValue(row) {
  return cleanSpace(row?.dotCode ?? row?.DOTCode ?? row?.code ?? "").toUpperCase();
}

function brandList(value) {
  const items = Array.isArray(value) ? value : [value];
  const keys = [];
  for (const item of items) {
    if (item && typeof item === "object") continue;
    const key = brandKey(item);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * Plant codes that show up under two or more brand strings.
 * Brand identity follows brandKey: letter case, spacing, and punctuation.
 */
export function countCodesAcrossBrands(rows, plantKey) {
  const brandsByCode = new Map();
  const lines = new Set();
  let rowsWithCode = 0;
  for (const row of rows || []) {
    const code = cleanSpace(row?.[plantKey]).toUpperCase();
    if (!code) continue;
    rowsWithCode += 1;
    const brand = brandKey(row?.brand ?? row?.Brand ?? "");
    if (!brand) continue;
    if (!brandsByCode.has(code)) brandsByCode.set(code, new Set());
    brandsByCode.get(code).add(brand);
    lines.add(`${brand}\n${lineName(row)}`);
  }
  let codesOnTwoOrMoreBrands = 0;
  for (const brands of brandsByCode.values()) {
    if (brands.size >= 2) codesOnTwoOrMoreBrands += 1;
  }
  return {
    computable: true,
    source: "ratings",
    field: plantKey,
    rowsWithCode,
    distinctCodes: brandsByCode.size,
    codesOnTwoOrMoreBrands,
    linesWithCode: lines.size,
  };
}

function countCodesOnPlantRecords(rawPlants, brandKeyName) {
  const brandsByCode = new Map();
  let recordsWithBrand = 0;
  for (const row of rawPlants || []) {
    const code = plantCodeValue(row);
    if (!code) continue;
    const brands = brandList(row?.[brandKeyName]);
    if (!brands.length) continue;
    recordsWithBrand += 1;
    if (!brandsByCode.has(code)) brandsByCode.set(code, new Set());
    for (const brand of brands) brandsByCode.get(code).add(brand);
  }
  let codesOnTwoOrMoreBrands = 0;
  for (const brands of brandsByCode.values()) {
    if (brands.size >= 2) codesOnTwoOrMoreBrands += 1;
  }
  return {
    computable: true,
    source: "plants",
    field: brandKeyName,
    rowsWithCode: recordsWithBrand,
    distinctCodes: brandsByCode.size,
    codesOnTwoOrMoreBrands,
    linesWithCode: 0,
  };
}

function absentJoin(source) {
  return {
    computable: false,
    source,
    field: "",
    rowsWithCode: 0,
    distinctCodes: 0,
    codesOnTwoOrMoreBrands: null,
    linesWithCode: 0,
  };
}

/**
 * Registrant names as shown on the plant pages. Letter case is ignored.
 * A blank name is not a registrant. One name is not merged into another
 * when it contains that other name.
 */
export function countRegistrantNames(plants) {
  const byName = new Map();
  let blankNameCodes = 0;
  for (const plant of plants || []) {
    const key = nameKey(plant?.name);
    if (!key) {
      blankNameCodes += 1;
      continue;
    }
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(plant.code);
  }
  let namesOnMultipleCodes = 0;
  let codesSharingName = 0;
  for (const codes of byName.values()) {
    if (codes.length < 2) continue;
    namesOnMultipleCodes += 1;
    codesSharingName += codes.length;
  }
  return {
    plantCount: (plants || []).length,
    distinctNames: byName.size,
    namesOnMultipleCodes,
    codesSharingName,
    blankNameCodes,
  };
}

function countRow(label, value, singular, plural = `${singular}s`) {
  return {
    label,
    result: formatNumber(value),
    unit: noun(value, singular, plural),
    numeric: true,
    value,
  };
}

function textRow(label, result) {
  return { label, result, unit: "", numeric: false, value: null };
}

function joinResult(join) {
  if (!join.computable) return textRow(join.label, NOT_IN_FILES);
  return countRow(join.label, join.codesOnTwoOrMoreBrands, "plant code");
}

function recallNumbers(summary) {
  return {
    campaigns: summary?.campaigns ?? 0,
    brands: summary?.brands ?? 0,
    lines: summary?.lines ?? 0,
    brandsWithDifferentFiler: summary?.brandsWithDifferentFiler ?? 0,
    madeByRows: summary?.madeByRows ?? 0,
    filedByRows: summary?.filedByRows ?? 0,
  };
}

export function rebadgedReport({
  ratings = [],
  rawPlants = [],
  plants = [],
  recalls = [],
  meta = {},
  recallSummary = null,
  whoMakesPages = [],
} = {}) {
  const ratingKeys = keysOf(ratings);
  const plantKeys = keysOf(rawPlants);
  const recallKeys = keysOf(recalls);
  const ratingPlantKeys = matchingKeys(ratingKeys, isPlantLinkKey);
  const plantBrandKeys = matchingKeys(plantKeys, isBrandLinkKey);
  const plantLineKeys = matchingKeys(plantKeys, isLineLinkKey);
  const recallPlantKeys = matchingKeys(recallKeys, isPlantLinkKey);
  const sharedFromRatings = ratingPlantKeys.length
    ? countCodesAcrossBrands(ratings, ratingPlantKeys[0])
    : absentJoin("ratings");
  const sharedFromPlants = plantBrandKeys.length
    ? countCodesOnPlantRecords(rawPlants, plantBrandKeys[0])
    : absentJoin("plants");
  const shared = sharedFromRatings.computable
    ? sharedFromRatings
    : sharedFromPlants.computable
      ? sharedFromPlants
      : absentJoin("");
  const whoMakes = [...whoMakesPages]
    .map((page) => ({ name: page.name, url: page.url }))
    .filter((page) => page.name && page.url)
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.url.localeCompare(b.url));

  const report = {
    verifiedAt: meta?.verifiedAt || "",
    recallsRetrievedAt: meta?.recalls?.retrievedAt || "",
    ratingsSource: meta?.ratings?.source || "",
    plantsSource: meta?.plants?.source || "",
    recallsSource: meta?.recalls?.source || "",
    recallsLayout: meta?.recalls?.layout || "",
    ratingCount: ratings.length,
    recallCount: recalls.length,
    ratingKeys,
    plantKeys,
    recallKeys,
    ratingPlantKeys,
    plantBrandKeys,
    plantLineKeys,
    recallPlantKeys,
    ratingPlantKey: ratingPlantKeys[0] || "",
    plantBrandKey: plantBrandKeys[0] || "",
    plantLineKey: plantLineKeys[0] || "",
    recallPlantKey: recallPlantKeys[0] || "",
    plants: countRegistrantNames(plants),
    sharedFromRatings,
    sharedFromPlants,
    shared,
    recall: recallNumbers(recallSummary),
    whoMakes,
  };
  report.answers = rebadgedAnswer(report);
  report.faqs = rebadgedFaqs(report);
  return report;
}

export function rebadgedAnswer(report) {
  const when = formatVerified(report.verifiedAt);
  const plants = report.plants;
  let second;
  if (report.sharedFromRatings.computable) {
    const count = report.sharedFromRatings.codesOnTwoOrMoreBrands;
    second = `${formatNumber(count)} plant ${noun(count, "code")} in the ratings file verified ${when} (UTC) ${count === 1 ? "appears" : "appear"} on tire lines of two or more brands, and matching UTQG grades beside a plant code are not proof of one design.`;
  } else if (report.sharedFromPlants.computable) {
    const count = report.sharedFromPlants.codesOnTwoOrMoreBrands;
    second = `The plant file verified ${when} (UTC) stores a brand on the record, ${formatNumber(count)} plant ${noun(count, "code")} ${count === 1 ? "lists" : "list"} two or more brands, and the ratings file has no plant code on a tire line.`;
  } else {
    second = `The ratings file and the plant file verified ${when} (UTC) do not join a tire line to a plant code, so the number of plant codes on tire lines of two or more brands is not in these files, and ${formatNumber(plants.namesOnMultipleCodes)} registrant ${noun(plants.namesOnMultipleCodes, "name")} ${be(plants.namesOnMultipleCodes)} on two or more of the ${formatNumber(plants.plantCount)} plant codes.`;
  }
  return [
    `A DOT plant code is the identity NHTSA assigned to a new tire manufacturer or retreader, and the plant record verified ${when} (UTC) is that registrant's name and address, not a tire design or a brand.`,
    second,
    "The company that filed an NHTSA tire-recall report is the strongest public evidence on this site for who stands behind that recalled line, and a brand with no tire-recall row is not answered.",
  ];
}

export function fieldSentence(report) {
  const rating = report.ratingPlantKey
    ? `The ratings rows include a plant-code field named ${formatNameList(report.ratingPlantKeys)}.`
    : `The ratings rows have no plant-code field. The fields are ${fieldList(report.ratingKeys)}.`;
  const plant = report.plantBrandKey
    ? `The plant records include a brand field named ${formatNameList(report.plantBrandKeys)}.`
    : `The plant records have no brand field. The fields are ${fieldList(report.plantKeys)}.`;
  const lineNote = report.plantLineKey
    ? ` A tire-line field named ${formatNameList(report.plantLineKeys)} is not counted as a brand.`
    : "";
  const recall = report.recallPlantKey
    ? `The recall rows include a plant-code field named ${formatNameList(report.recallPlantKeys)}.`
    : `The recall rows have no plant-code field. The fields are ${fieldList(report.recallKeys)}.`;
  return `${rating} ${plant}${lineNote} ${recall}`;
}

export function applicationSentence(report) {
  const stored = report.plantBrandKey
    ? `This pull also stores ${formatNameList(report.plantBrandKeys)} on the plant record.`
    : "The published plant list used here stores the registrant name and address. It does not store that type list, and it does not store a brand.";
  return `49 CFR 574.6 is the application for that code. The applicant names itself, each plant, the corporate owner of each plant, and the type of tires manufactured at each plant. ${stored}`;
}

export function manufacturerCodeSentence(report) {
  const files = report.sharedFromRatings.computable
    ? "Where a rating row carries a plant code, that count is in the table below. The manufacturer's code itself is still not in these files."
    : "The files on this site do not list the brands, designs, or compounds built at a plant.";
  return `49 CFR 574.5(b)(2) allows the six-symbol manufacturer's code to identify significant characteristics of the tire or the brand name owner. One plant code can sit on tires whose manufacturer's codes identify different characteristics or different brand name owners. A design or a compound would be distinguished in that code, not by the plant code. NHTSA does not publish the legend. The manufacturer keeps the record and provides it on request. ${files}`;
}

export function clueSentence(report) {
  if (report.sharedFromRatings.computable) {
    return "Matching UTQG grades and a plant code stored on those rows are clues. They are not proof that two lines are one design.";
  }
  return "Matching UTQG grades and the same plant code would be clues, not proof that two lines are one design. The ratings file has no plant-code field, so this site does not join a grade to a plant code.";
}

export function nameRuleSentence() {
  return "A registrant name is the name stored on the plant record, as shown on the plant page. Letter case is ignored. A blank name is left out. A longer name is not merged into a shorter one when it contains that shorter name.";
}

export function makerGroupSentence() {
  return "Registered plant codes by maker and country uses a different match. A group there keeps a record when the registrant name contains the group name. The count on this page does not use that grouping.";
}

export function blankNameSentence(report) {
  const count = report.plants.blankNameCodes;
  if (!count) return "";
  return `${formatNumber(count)} plant ${noun(count, "code")} ${count === 1 ? "has" : "have"} no registrant name, so ${count === 1 ? "it is" : "they are"} left out of the name count.`;
}

export function repeatedNameSentence() {
  return "A tire-line name stored under more than one brand is counted on Known errors. That repeated name is not treated as a rebadge.";
}

export function recallRuleSentence() {
  return "A row on Who makes it says made by the filer only when the report's manufacturer field names that company and the filer's name contains tire, tyre, or rubber. Other rows say recall filed by. The wording covers that recalled line. It does not cover the rest of the brand, and it does not cover a line that was never recalled.";
}

export function whoMakesIntro(report) {
  const count = report.whoMakes.length;
  if (!count) {
    return "This pull publishes no separate brand page. A page is published only when the recall file has a row for that brand.";
  }
  return `${formatNumber(count)} ${count === 1 ? "page is" : "pages are"} published from those filings. A page exists only when the recall file has a row for that brand. A plant record is listed on that page only when the registrant name matches a company named in the filing. That match does not show that the plant made the brand.`;
}

export function checkStepTexts() {
  return [
    "Read the tire identification number on the sidewall. The plant code is the first group. The date code is the last group and names a manufacture week, not a maker.",
    "Look the plant code up on the plant list. The page names the registrant and the address NHTSA stored. It does not list brands.",
    "Open Who makes it. If the brand is one of the pages listed above, open that page. A page is published only when the recall file has a row for the brand. The filing company can be the factory, an importer, or the brand owner for the recalled line.",
    "Open the tire line in the UTQG list and compare its treadwear, traction, and temperature with the other line. Matching grades are not proof of one design. A repeated line name is not a rebadge.",
  ];
}

export function linkCaption(report) {
  return `Whether the NHTSA files verified ${formatVerified(report.verifiedAt)} (UTC) join a tire line to a plant code.`;
}

export function plantCaption(report) {
  return `Registrant names on NHTSA plant codes verified ${formatVerified(report.verifiedAt)} (UTC).`;
}

export function recallCaption(report) {
  return `Tire-recall filings retrieved ${formatVerified(report.recallsRetrievedAt)} (UTC). A filing covers the recalled line.`;
}

export function linkRows(report) {
  const ratingJoin = {
    ...report.sharedFromRatings,
    label: "Plant codes on tire lines of two or more brands",
  };
  const plantJoin = {
    ...report.sharedFromPlants,
    label: "Plant codes whose record lists two or more brands",
  };
  return [
    countRow("Rating rows", report.ratingCount, "rating row"),
    report.ratingPlantKey
      ? textRow("Plant-code field on rating rows", formatNameList(report.ratingPlantKeys))
      : textRow("Plant-code field on rating rows", "None"),
    report.sharedFromRatings.computable
      ? countRow("Rating rows that carry a plant code", report.sharedFromRatings.rowsWithCode, "rating row")
      : textRow("Rating rows that carry a plant code", NOT_IN_FILES),
    countRow("Plant records", report.plants.plantCount, "plant record"),
    report.plantBrandKey
      ? textRow("Brand field on plant records", formatNameList(report.plantBrandKeys))
      : textRow("Brand field on plant records", "None"),
    countRow("Recall rows", report.recallCount, "recall row"),
    report.recallPlantKey
      ? textRow("Plant-code field on recall rows", formatNameList(report.recallPlantKeys))
      : textRow("Plant-code field on recall rows", "None"),
    joinResult(ratingJoin),
    joinResult(plantJoin),
  ];
}

export function plantRows(report) {
  const plants = report.plants;
  return [
    countRow("Plant records", plants.plantCount, "plant record"),
    countRow("Registrant names", plants.distinctNames, "name"),
    countRow("Registrant names on two or more plant codes", plants.namesOnMultipleCodes, "name"),
    countRow("Plant codes that share a registrant name", plants.codesSharingName, "plant code"),
    countRow("Plant codes with no registrant name", plants.blankNameCodes, "plant code"),
  ];
}

export function recallRows(report) {
  const recall = report.recall;
  return [
    countRow("Tire campaigns", recall.campaigns, "campaign"),
    countRow("Brand strings", recall.brands, "brand string"),
    countRow("Recalled lines", recall.lines, "recalled line"),
    countRow("Brand strings whose filing company differs from the brand", recall.brandsWithDifferentFiler, "brand string"),
    countRow("Rows worded made by", recall.madeByRows, "row"),
    countRow("Rows worded recall filed by", recall.filedByRows, "row"),
    countRow("Brand pages published from those filings", report.whoMakes.length, "page"),
  ];
}

function sharedFaq(report) {
  const when = formatVerified(report.verifiedAt);
  if (report.sharedFromRatings.computable) {
    const count = report.sharedFromRatings.codesOnTwoOrMoreBrands;
    return `${formatNumber(count)} plant ${noun(count, "code")} in the ratings file verified ${when} (UTC) ${count === 1 ? "appears" : "appear"} on tire lines of two or more brands. Matching UTQG grades and a shared plant code are not proof of one design.`;
  }
  if (report.sharedFromPlants.computable) {
    const count = report.sharedFromPlants.codesOnTwoOrMoreBrands;
    return `The plant file verified ${when} (UTC) stores a brand, and ${formatNumber(count)} plant ${noun(count, "code")} ${count === 1 ? "lists" : "list"} two or more brands. The ratings file has no plant code on a tire line, so a count across tire lines is not in these files.`;
  }
  const plants = report.plants;
  return `The ratings file verified ${when} (UTC) does not store a plant code on a tire line, and the plant file does not store a brand. A count of plant codes on tire lines of two or more brands is not in these files. ${formatNumber(plants.namesOnMultipleCodes)} registrant ${noun(plants.namesOnMultipleCodes, "name")} ${be(plants.namesOnMultipleCodes)} on two or more plant codes, which is one stored name on many codes, not many brands on one code.`;
}

export function rebadgedFaqs(report) {
  const brandField = report.plantBrandKey
    ? `This pull stores ${formatNameList(report.plantBrandKeys)} on the plant record.`
    : "This pull does not store a brand field on the plant record.";
  return [
    {
      name: "Does a DOT plant code name the brand on the sidewall?",
      text: `No. Under 49 CFR 574.5(b)(1), the plant code represents the identity of the new tire manufacturer or retreader. The plant record is the registrant name and address NHTSA published. ${brandField} The manufacturer's code may identify the brand name owner, and NHTSA does not publish the legend for those symbols.`,
    },
    {
      name: "How often do two brands share a plant code?",
      text: sharedFaq(report),
    },
    {
      name: "Which public record names a company for a brand?",
      text: "The strongest public evidence on this site is the company that filed the NHTSA Part 573 tire-recall report for that brand. The filing covers the recalled line. It can be the factory, an importer, or the brand owner. A brand with no tire-recall row is not given a page.",
    },
    {
      name: "Do matching UTQG grades prove two lines are one design?",
      text: "No. Matching treadwear, traction, and temperature are grades stored in NHTSA's list. They are not a plant code, and they are not a finding that one line is a rebadge of another.",
    },
  ];
}

export function rebadgedJsonLd(report) {
  const description = report.answers.join(" ");
  const sources = [report.ratingsSource, report.plantsSource, report.recallsSource].filter((source) => /^https:\/\//.test(source));
  const dateModified = laterIso(report.verifiedAt, report.recallsRetrievedAt);
  return [
    dataset({
      name: "What a DOT plant code can prove about who made a tire, from NHTSA files as presented by TreadGrade",
      description,
      path: REBADGED_TIRES_PATH,
      dateModified,
      isBasedOn: sources,
      keywords: ["DOT", "plant code", "NHTSA", "UTQG", "tire recall"],
    }),
    article({
      headline: REBADGED_TITLE,
      description,
      path: REBADGED_TIRES_PATH,
      dateModified,
    }),
    {
      "@type": "FAQPage",
      mainEntity: report.faqs.map((item) => ({
        "@type": "Question",
        name: item.name,
        acceptedAnswer: { "@type": "Answer", text: item.text },
      })),
    },
  ];
}

export function rebadgedText(report) {
  return [
    ...report.answers,
    fieldSentence(report),
    applicationSentence(report),
    manufacturerCodeSentence(report),
    clueSentence(report),
    nameRuleSentence(),
    makerGroupSentence(),
    blankNameSentence(report),
    repeatedNameSentence(),
    recallRuleSentence(),
    whoMakesIntro(report),
    ...checkStepTexts(),
    linkCaption(report),
    plantCaption(report),
    recallCaption(report),
    ...linkRows(report).flatMap((row) => [row.label, row.result, row.unit]),
    ...plantRows(report).flatMap((row) => [row.label, row.result, row.unit]),
    ...recallRows(report).flatMap((row) => [row.label, row.result, row.unit]),
    PLANT_CODE_QUOTE,
    MANUFACTURER_CODE_QUOTE,
    TIRE_TYPE_QUOTE,
    ...report.faqs.flatMap((item) => [item.name, item.text]),
    ...report.whoMakes.flatMap((page) => [page.name, page.url]),
  ].join("\n");
}

export function mentionsStoreBrand(text) {
  return STORE_BRAND.test(text) ? text.match(STORE_BRAND)[0] : "";
}
