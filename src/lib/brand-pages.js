import { brandAnswer, formatTreadwearMedian, treadwearMedian } from "./answers.js";
import { catalog } from "./catalog.js";
import { formatNumber, formatVerified, percent } from "./format.js";
import { brandKey } from "./normalize.js";
import { bandLabel, bandStart } from "./treadwear-numbers.js";
import { MISSING_VALUE, RECALLS_PATH, buildRecallList } from "./recall-list.js";
import { recallRows, recallMeta } from "./recall-catalog.js";
import { companyCore } from "./recalls.js";

/**
 * Brand pages recompute every count from the committed ratings, plant, and
 * recall files.
 *
 * Plant mapping rule (unambiguous names only):
 * The registrant and the brand are compared with companyCore: lower case,
 * punctuation removed, and legal suffixes such as Inc. and LLC dropped.
 * A leading "the" on the registrant is ignored. A brand core shorter than
 * four characters is not used. A brand is eligible only when at least one
 * registrant begins with that core. A plant is listed only when exactly one
 * eligible brand core occurs in the registrant and the registrant begins
 * with that core. A joint name such as Bridgestone/Firestone matches two
 * brands and is listed on neither page. A token that never begins a
 * registrant (America, Private, National) is not eligible, so it does not
 * pull a plant off the brand that actually leads the name. The list
 * includes closed and historic codes. A registration does not show where a
 * given tire was made.
 *
 * Recall matching rule:
 * A row matches when brandKey of the recall brand equals brandKey of the
 * UTQG brand. brandKey drops capitalization and punctuation and keeps
 * spaces, the same identity the catalog uses to merge brand spellings.
 * The match is the brand string. It does not say the recalled tire is the
 * graded tire.
 *
 * Brands with at least FULL_BRAND_MIN_LINES lines are full pages. A brand
 * with fewer lines keeps its address and links up to the A–Z index. A
 * one-line brand also shows that line in the index. Addresses are not
 * removed and are not marked noindex.
 */

export const FULL_BRAND_MIN_LINES = 5;

export const BANNED_BRAND_WORD = /\b(best|top-rated|top rated|recommend(?:ed|s|ing)?)\b/i;

export const BRAND_PLANT_RULE =
  "A plant code is listed only when the registrant name, ignoring capitalization, punctuation, and a legal suffix such as Inc. or LLC, begins with the brand. A leading The is ignored. A name that also matches another brand is left off. Registrations include closed and historic codes. A plant registered to a name does not show where a given tire was made.";

export const BRAND_RECALL_RULE =
  "A recall row is included when its brand string matches this brand after capitalization and punctuation are removed. The match is that string. It does not say the recalled tire is the graded tire, and it does not say who makes every tire of this brand. The filing company can be the factory, an importer, or the brand owner for that recalled line only.";

export const INDEX_FOLD_NOTE =
  "A brand with one tire line shows that line in this index. The brand address stays available.";

export const TREADWEAR_BAND_NOTE =
  "Each band is 100 wide, the same groups as the treadwear numbers guide. A row without a usable treadwear number is not in the share.";

export const GRADE_SHARE_NOTE =
  "Traction shares use AA, A, B, and C. Temperature shares use A, B, and C. Shares use every size row. A value outside those letters is counted as other.";

export const NOT_IN_SHARE = "Not in the share";
export const NOT_STORED = "Not stored";
export const WIDER_GROUP_NOTE =
  "A wider name match, which can include a sister name, is on the manufacturer page. That page does not say the plants make this brand.";

const TRACTION_GRADES = ["AA", "A", "B", "C"];
const TEMPERATURE_GRADES = ["A", "B", "C"];
const PLANT_CORE_MIN = 4;

export function brandIndexLetter(name) {
  const letter = String(name || "").slice(0, 1).toUpperCase();
  return /[A-Z]/.test(letter) ? letter : "#";
}

function leadCore(name) {
  return companyCore(name).replace(/^the /, "");
}

function containsPhrase(haystack, needle) {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function barWidth(count, total) {
  if (!total || !count) return 0;
  return Math.round((count / total) * 10000) / 100;
}

/**
 * @param {{ slug: string, name: string }[]} brands
 * @param {{ code: string, name: string }[]} plants
 * @returns {Map<string, object[]>}
 */
export function mapBrandPlants(brands, plants) {
  const items = [];
  for (const brand of brands) {
    const core = companyCore(brand.name);
    if (core.length < PLANT_CORE_MIN) continue;
    items.push({ brand, core });
  }
  const prefixCount = new Map(items.map((item) => [item.core, 0]));
  for (const plant of plants) {
    const lead = leadCore(plant.name);
    for (const item of items) {
      if (lead === item.core || lead.startsWith(`${item.core} `)) {
        prefixCount.set(item.core, prefixCount.get(item.core) + 1);
      }
    }
  }
  const strong = items.filter((item) => prefixCount.get(item.core) > 0);
  const bySlug = new Map(brands.map((brand) => [brand.slug, []]));
  for (const plant of plants) {
    const core = companyCore(plant.name);
    const lead = leadCore(plant.name);
    const hits = strong.filter((item) => containsPhrase(core, item.core));
    if (hits.length !== 1) continue;
    const item = hits[0];
    if (!(lead === item.core || lead.startsWith(`${item.core} `))) continue;
    bySlug.get(item.brand.slug).push(plant);
  }
  for (const list of bySlug.values()) list.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  return bySlug;
}

function letterShares(rows, grades, field) {
  const counts = new Map(grades.map((grade) => [grade, 0]));
  let other = 0;
  for (const row of rows) {
    const value = row[field];
    if (counts.has(value)) counts.set(value, counts.get(value) + 1);
    else other += 1;
  }
  const total = rows.length;
  const items = grades.map((grade) => {
    const count = counts.get(grade);
    return { grade, count, share: percent(count, total), width: barWidth(count, total) };
  });
  const otherRow = other
    ? { count: other, share: percent(other, total), width: barWidth(other, total) }
    : null;
  return { items, other: otherRow };
}

function wearBands(rows) {
  const counts = new Map();
  let usable = 0;
  let excluded = 0;
  for (const row of rows) {
    if (Number.isInteger(row.wearN) && row.wearN > 0) {
      usable += 1;
      const start = bandStart(row.wearN);
      counts.set(start, (counts.get(start) || 0) + 1);
    } else excluded += 1;
  }
  const bands = [...counts.keys()]
    .sort((a, b) => a - b)
    .map((start) => {
      const count = counts.get(start);
      return {
        label: bandLabel(start),
        count,
        share: percent(count, usable),
        width: barWidth(count, usable),
      };
    });
  return { bands, usable, excluded };
}

function noun(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function indexUplink(profile) {
  if (!profile.linksToIndex) return null;
  if (profile.folded) {
    return {
      before: `${profile.name} has one tire line, so the `,
      after: ` lists that line under ${profile.indexLetter}. This address stays in place.`,
    };
  }
  return {
    before: `${profile.name} has ${formatNumber(profile.lineCount)} tire lines. The `,
    after: ` lists this brand under ${profile.indexLetter}. This address stays in place.`,
  };
}

function buildFaqs(profile) {
  const verified = formatVerified(profile.verifiedAt);
  const faqs = [
    {
      name: `How many ${profile.name} tire lines and size rows does NHTSA list?`,
      text: `NHTSA's published UTQG list has ${formatNumber(profile.lineCount)} ${noun(profile.lineCount, "tire line")} and ${formatNumber(profile.rowCount)} ${noun(profile.rowCount, "size row")} under ${profile.name}, verified ${verified} (UTC).`,
    },
  ];
  const medianName = `What is the median treadwear NHTSA lists for ${profile.name}?`;
  const excludedNote = profile.excludedWear
    ? ` ${formatNumber(profile.excludedWear)} ${noun(profile.excludedWear, "size row")} ${profile.excludedWear === 1 ? "is" : "are"} left out of the median because treadwear is missing or not a positive whole number.`
    : "";
  if (profile.median == null) {
    faqs.push({
      name: medianName,
      text: `Treadwear is not reported as a usable number on the size rows NHTSA lists for ${profile.name}.`,
    });
  } else if (profile.wearMin === profile.wearMax) {
    faqs.push({
      name: medianName,
      text: `The median treadwear on size rows with a usable number is ${profile.medianText}.${excludedNote}`,
    });
  } else {
    faqs.push({
      name: medianName,
      text: `The median treadwear on size rows with a usable number is ${profile.medianText}, and treadwear on those rows runs from ${profile.wearMin} to ${profile.wearMax}.${excludedNote}`,
    });
  }
  if (profile.plants.length) {
    faqs.push({
      name: `Which plant codes are registered to a name that begins with ${profile.name}?`,
      text: `This page lists ${formatNumber(profile.plants.length)} ${noun(profile.plants.length, "plant code")} whose registrant name begins with ${profile.name}. ${BRAND_PLANT_RULE}`,
    });
  }
  if (profile.recalls.length) {
    faqs.push({
      name: `How many tire-recall rows name ${profile.name}?`,
      text: `The committed tire-recall file has ${formatNumber(profile.recallCount)} ${noun(profile.recallCount, "row")} across ${formatNumber(profile.campaignCount)} ${noun(profile.campaignCount, "campaign")} whose brand string matches ${profile.name} after capitalization and punctuation are removed.`,
    });
  }
  return faqs;
}

function plantBrief(plant) {
  return {
    code: plant.code,
    name: plant.name,
    city: plant.city || "",
    country: plant.country || "",
    status: plant.status || "",
    url: plant.url,
  };
}

function recallBrief(row) {
  return {
    id: row.id,
    brand: row.brand,
    campaign: row.campaign,
    line: row.line,
    lineUrl: row.lineUrl || "",
    filer: row.filer,
    reportDate: row.reportDate || "",
    units: row.units,
    unitsPresent: row.unitsPresent,
    href: `${RECALLS_PATH}#${row.id}`,
  };
}

function buildProfiles(brands, linesByBrand, plantsByBrand, recallsByKey, verifiedAt, recallsRetrievedAt) {
  return brands.map((brand) => {
    const lines = linesByBrand.get(brand.slug) || [];
    const rows = lines.flatMap((line) => line.rows);
    const wears = rows.map((row) => row.wearN);
    const median = treadwearMedian(wears);
    const usable = wears.filter((value) => Number.isInteger(value) && value > 0);
    const distribution = wearBands(rows);
    const traction = letterShares(rows, TRACTION_GRADES, "trac");
    const temperature = letterShares(rows, TEMPERATURE_GRADES, "temp");
    const plants = (plantsByBrand.get(brand.slug) || []).map(plantBrief);
    const recallMatches = recallsByKey.get(brandKey(brand.name)) || [];
    const recalls = recallMatches.map(recallBrief);
    const letter = brandIndexLetter(brand.name);
    const single = lines.length === 1 ? lines[0] : null;
    const profile = {
      slug: brand.slug,
      name: brand.name,
      url: brand.url,
      lineCount: lines.length,
      rowCount: rows.length,
      full: lines.length >= FULL_BRAND_MIN_LINES,
      linksToIndex: lines.length < FULL_BRAND_MIN_LINES,
      folded: lines.length === 1,
      indexLetter: letter,
      indexHref: `/brands/#letter-${letter}`,
      verifiedAt,
      recallsRetrievedAt,
      median,
      medianText: formatTreadwearMedian(median),
      wearMin: usable.length ? usable.reduce((min, value) => Math.min(min, value), usable[0]) : null,
      wearMax: usable.length ? usable.reduce((max, value) => Math.max(max, value), usable[0]) : null,
      usableWear: distribution.usable,
      excludedWear: distribution.excluded,
      bands: distribution.bands,
      traction: traction.items,
      tractionOther: traction.other,
      temperature: temperature.items,
      temperatureOther: temperature.other,
      plants,
      recalls,
      recallCount: recalls.length,
      campaignCount: new Set(recalls.map((row) => row.campaign)).size,
      singleLine: single
        ? {
            name: single.line,
            url: single.url,
            traction: single.traction.length ? single.traction.join(", ") : "not reported",
            temperature: single.temperature.length ? single.temperature.join(", ") : "not reported",
          }
        : null,
      summaryCaption: `${brand.name} tire lines, size rows, and median treadwear in NHTSA's published UTQG list verified ${formatVerified(verifiedAt)} (UTC).`,
      treadwearCaption: `Treadwear bands for ${brand.name}. Each band is 100 wide. Shares use size rows with a usable treadwear number.`,
      gradesCaption: `Traction and temperature shares for ${brand.name}. Shares use every size row.`,
      plantsCaption: plants.length
        ? `Plant codes whose registrant name begins with ${brand.name}. NHTSA's plant list was verified ${formatVerified(verifiedAt)} (UTC).`
        : "",
      recallsCaption: recalls.length
        ? `Tire-recall rows whose brand string matches ${brand.name}. The file was retrieved ${formatVerified(recallsRetrievedAt)} (UTC).`
        : "",
      missingValue: MISSING_VALUE,
    };
    profile.uplink = indexUplink(profile);
    profile.faqs = buildFaqs(profile);
    return profile;
  });
}

const linesByBrand = new Map();
for (const line of catalog.lines) {
  if (!linesByBrand.has(line.brandSlug)) linesByBrand.set(line.brandSlug, []);
  linesByBrand.get(line.brandSlug).push(line);
}

const plantsByBrand = mapBrandPlants(catalog.brands, catalog.plants);

const recallReport = buildRecallList(recallRows, {
  brands: catalog.brands,
  lines: catalog.lines,
});
const recallsByKey = new Map();
for (const row of recallReport.rows) {
  const key = brandKey(row.brand);
  if (!recallsByKey.has(key)) recallsByKey.set(key, []);
  recallsByKey.get(key).push(row);
}

export const brandProfiles = buildProfiles(
  catalog.brands,
  linesByBrand,
  plantsByBrand,
  recallsByKey,
  catalog.meta.verifiedAt,
  recallMeta.retrievedAt,
);

const profileBySlug = new Map(brandProfiles.map((profile) => [profile.slug, profile]));

export function brandProfile(slug) {
  const profile = profileBySlug.get(slug);
  if (!profile) throw new Error(`No brand profile ${slug}`);
  return profile;
}

export function foldedIndexText(profile) {
  if (!profile.singleLine) return "";
  const line = profile.singleLine;
  return `1 line · ${line.name} · median treadwear ${profile.medianText} · traction ${line.traction} · temperature ${line.temperature}`;
}

export function brandPageCopy(profile, answers = []) {
  return [
    ...answers,
    profile.uplink?.before,
    profile.uplink?.after,
    profile.summaryCaption,
    profile.treadwearCaption,
    profile.gradesCaption,
    profile.plantsCaption,
    profile.recallsCaption,
    profile.plants.length ? BRAND_PLANT_RULE : "",
    profile.recalls.length ? BRAND_RECALL_RULE : "",
    profile.folded ? foldedIndexText(profile) : "",
    TREADWEAR_BAND_NOTE,
    GRADE_SHARE_NOTE,
    NOT_IN_SHARE,
    NOT_STORED,
    WIDER_GROUP_NOTE,
    ...profile.faqs.flatMap((item) => [item.name, item.text]),
  ].filter(Boolean);
}

export function brandFaqLd(profile) {
  return {
    "@type": "FAQPage",
    mainEntity: profile.faqs.map((item) => ({
      "@type": "Question",
      name: item.name,
      acceptedAnswer: { "@type": "Answer", text: item.text },
    })),
  };
}

export function brandProfileSummary(profiles = brandProfiles) {
  const withPlants = profiles.filter((profile) => profile.plants.length);
  const withRecalls = profiles.filter((profile) => profile.recalls.length);
  return {
    brands: profiles.length,
    full: profiles.filter((profile) => profile.full).length,
    folded: profiles.filter((profile) => profile.folded).length,
    linksToIndex: profiles.filter((profile) => profile.linksToIndex).length,
    plantBrands: withPlants.length,
    plantCodes: withPlants.reduce((sum, profile) => sum + profile.plants.length, 0),
    recallBrands: withRecalls.length,
    recallRows: withRecalls.reduce((sum, profile) => sum + profile.recalls.length, 0),
  };
}

export function brandAnswersFor(profile, filings) {
  const brand = catalog.brands.find((item) => item.slug === profile.slug);
  const lines = linesByBrand.get(profile.slug) || [];
  return brandAnswer(brand, lines, filings, profile.verifiedAt);
}
