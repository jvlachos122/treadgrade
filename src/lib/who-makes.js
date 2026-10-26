import { collectGradeFacts } from "./answers.js";
import { formatNumber } from "./format.js";
import { nameKey } from "./normalize.js";
import { formatNameList, phraseKey, sameCompany } from "./recalls.js";
import { slugify } from "./slug.js";

/**
 * Store brands from the measured "who makes [brand] tires" queries.
 * A page is published only when the recall file has tire rows for that
 * brand string. A plant record is listed only when its registrant name
 * matches a company named in those rows. A plant name is not a maker.
 */
export const WHO_MAKES_CANDIDATES = Object.freeze([
  "Ironman",
  "Douglas",
  "Milestar",
  "Kelly",
  "Westlake",
  "Sailun",
  "Atlas",
  "Cosmo",
]);

function briefBrand(brand) {
  return { name: brand.name, slug: brand.slug, url: brand.url };
}

function relatedBrands(brands, key) {
  return brands
    .filter((brand) => {
      const brandKey = nameKey(brand.name);
      return brandKey !== key && (brandKey.startsWith(`${key}/`) || brandKey.startsWith(`${key} `));
    })
    .map(briefBrand)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export function unansweredReason(label, { utqg, related, brandPlants }) {
  const sentences = [`NHTSA's tire-recall file has no row for ${label}.`];
  if (brandPlants.length === 1) {
    sentences.push(
      `The plant list has 1 record registered to a name that matches ${label}. A plant record has no brand field, so that record is not used as the maker.`,
    );
  } else if (brandPlants.length > 1) {
    sentences.push(
      `The plant list has ${formatNumber(brandPlants.length)} records registered to a name that matches ${label}. A plant record has no brand field, so those records are not used as the maker.`,
    );
  } else {
    sentences.push(`The plant list has no registrant whose name matches ${label}.`);
  }
  if (utqg) {
    sentences.push(`The UTQG list stores grades under ${utqg.name}. Those rows do not name a manufacturer.`);
  } else if (related.length === 1) {
    sentences.push(
      `The UTQG list has a brand string ${related[0].name}. That string is not a filing company and does not name a manufacturer.`,
    );
  } else if (related.length > 1) {
    sentences.push(
      `The UTQG list has brand strings ${formatNameList(related.map((brand) => brand.name))}. Those strings are not a filing company and do not name a manufacturer.`,
    );
  } else {
    sentences.push(`The UTQG list has no brand string ${label}.`);
  }
  return sentences.join(" ");
}

function addCompany(companies, name, role) {
  const key = phraseKey(name);
  if (!key) return;
  if (companies.some((company) => sameCompany(company.name, name))) return;
  companies.push({ name, role, key });
}

/**
 * Companies named on the recall rows, filers first, then a manufacturer
 * field that is a different company. Plant links use the same list.
 */
export function companiesOnRows(rows) {
  const companies = [];
  for (const row of rows) addCompany(companies, row.filer, "filer");
  for (const row of rows) {
    for (const manufacturer of row.manufacturers || []) addCompany(companies, manufacturer, "manufacturer");
  }
  return companies;
}

export function plantsMatchingFilings(plants, rows) {
  const companies = companiesOnRows(rows);
  const links = [];
  const used = new Set();
  for (const company of companies) {
    for (const plant of plants) {
      if (used.has(plant.code)) continue;
      if (!sameCompany(plant.name, company.name)) continue;
      used.add(plant.code);
      links.push({
        code: plant.code,
        slug: plant.slug,
        name: plant.name,
        city: plant.city,
        country: plant.country,
        status: plant.status,
        url: plant.url,
        matchedCompany: company.name,
        role: company.role,
      });
    }
  }
  links.sort((a, b) => a.code.localeCompare(b.code));
  return links;
}

function wordPlantCount(plants, key, listedCodes) {
  let count = 0;
  for (const plant of plants) {
    if (listedCodes.has(plant.code)) continue;
    const words = phraseKey(plant.name).split(" ").filter(Boolean);
    if (words.includes(key)) count += 1;
  }
  return count;
}

function gradeSpread(lines) {
  if (!lines.length) return null;
  const facts = collectGradeFacts(lines.flatMap((line) => line.rows));
  const wearMin = facts.wearValid.length ? Math.min(...facts.wearValid) : null;
  const wearMax = facts.wearValid.length ? Math.max(...facts.wearValid) : null;
  return {
    lineCount: lines.length,
    rowCount: facts.rows,
    wearMin,
    wearMax,
    traction: facts.tracValid,
    temperature: facts.tempValid,
    wearInvalid: facts.wearInvalid,
    tracInvalid: facts.tracInvalid,
    tempInvalid: facts.tempInvalid,
  };
}

export function inspectBrand(label, sources) {
  const key = nameKey(label);
  const filings = sources.summary.byBrand.get(key) || null;
  const utqgBrand = sources.brands.find((brand) => nameKey(brand.name) === key) || null;
  const related = relatedBrands(sources.brands, key);
  const brandPlants = sources.plants.filter((plant) => sameCompany(plant.name, label));
  const name = utqgBrand?.name || label;
  if (!filings) {
    return {
      key,
      label,
      name,
      publish: false,
      utqg: utqgBrand ? briefBrand(utqgBrand) : null,
      related,
      reason: unansweredReason(label, {
        utqg: utqgBrand ? { name: utqgBrand.name } : null,
        related,
        brandPlants,
      }),
    };
  }

  const utqgLines = utqgBrand ? sources.lines.filter((line) => line.brandSlug === utqgBrand.slug) : [];
  const byLine = new Map(utqgLines.map((line) => [line.lineKey, line]));
  const recalledInUtqg = [];
  const recalledMissing = [];
  const seenLines = new Set();
  for (const row of filings.rows) {
    const lineKey = nameKey(row.line);
    if (seenLines.has(lineKey)) continue;
    seenLines.add(lineKey);
    const match = byLine.get(lineKey);
    if (match) recalledInUtqg.push({ line: row.line, url: match.url });
    else recalledMissing.push(row.line);
  }
  const plants = plantsMatchingFilings(sources.plants, filings.rows);
  const slug = slugify(name);
  return {
    key,
    label,
    name,
    publish: true,
    slug,
    url: `/who-makes/${slug}/`,
    filers: [...filings.filers],
    rows: filings.rows,
    companies: companiesOnRows(filings.rows).map((company) => company.name),
    plants,
    wordPlantCount: wordPlantCount(
      sources.plants,
      key,
      new Set(plants.map((plant) => plant.code)),
    ),
    utqg: utqgBrand ? briefBrand(utqgBrand) : null,
    grades: gradeSpread(utqgLines),
    recalledInUtqg,
    recalledMissing,
    related,
  };
}

export function buildWhoMakesPages(labels, sources) {
  const pages = [];
  const skipped = [];
  const slugs = new Set();
  for (const label of labels) {
    const item = inspectBrand(label, sources);
    if (!item.publish) {
      skipped.push(item);
      continue;
    }
    if (slugs.has(item.slug)) throw new Error(`Who-makes slug collision ${item.slug}`);
    slugs.add(item.slug);
    pages.push(item);
  }
  return { pages, skipped };
}

export function unansweredBrands(labels, sources, skipped) {
  const skippedKeys = new Set(skipped.map((item) => item.key));
  return labels
    .filter((label) => !skippedKeys.has(nameKey(label)))
    .map((label) => inspectBrand(label, sources))
    .filter((item) => !item.publish);
}
