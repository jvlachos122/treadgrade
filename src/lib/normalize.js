import { slugify } from "./slug.js";
import { cleanSpace, softenCaps } from "./format.js";

const TRACTION = ["AA", "A", "B", "C"];
const TEMPERATURE = ["A", "B", "C"];

export function nameKey(value) {
  return cleanSpace(value).toLowerCase();
}

/**
 * Brand identity ignores punctuation. Spaces stay, so "BF Goodrich" and
 * "BFGoodrich" remain different brands. Line keys keep using nameKey.
 */
export function brandKey(value) {
  const stripped = nameKey(value)
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || nameKey(value);
}

function chooseSpelling(counts) {
  let best = "";
  let bestCount = -1;
  let bestLower = -1;
  for (const [spelling, count] of counts) {
    const lower = (spelling.match(/[a-z]/g) || []).length;
    const cleaner = cleanSpace(spelling);
    if (
      count > bestCount ||
      (count === bestCount && lower > bestLower) ||
      (count === bestCount && lower === bestLower && cleaner.localeCompare(best) < 0)
    ) {
      best = cleaner;
      bestCount = count;
      bestLower = lower;
    }
  }
  return best;
}

function uniqueGrades(values, order) {
  const present = new Set(values.filter(Boolean));
  const known = order.filter((grade) => present.has(grade));
  const other = [...present].filter((grade) => !order.includes(grade)).sort();
  return [...known, ...other];
}

function takeSlug(used, base) {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  const slug = `${base}-${n}`;
  used.add(slug);
  return slug;
}

function chooseSurvivorSlug(groupedKey, displayName, legacyBrands) {
  if (!legacyBrands) return slugify(displayName);
  const members = legacyBrands.filter((brand) => brandKey(brand.name) === groupedKey);
  if (members.length <= 1) return slugify(displayName);
  const preferred = slugify(displayName);
  members.sort(
    (a, b) =>
      b.lineCount - a.lineCount ||
      b.rowCount - a.rowCount ||
      Number(b.slug === preferred) - Number(a.slug === preferred) ||
      a.slug.localeCompare(b.slug),
  );
  return members[0].slug;
}

function redirectsBetween(legacy, catalog) {
  const lineById = new Map();
  for (const line of catalog.lines) {
    for (const id of line.sourceIds) {
      const previous = lineById.get(id);
      if (previous && previous !== line) throw new Error(`Row ${id} is on two tire lines`);
      lineById.set(id, line);
    }
  }
  const brandBySlug = new Map(catalog.brands.map((brand) => [brand.slug, brand]));
  const live = new Set([...catalog.brands.map((brand) => brand.url), ...catalog.lines.map((line) => line.url)]);
  const redirects = [];

  function survivorLine(sourceIds) {
    for (const id of sourceIds) {
      const line = lineById.get(id);
      if (line) return line;
    }
    return null;
  }

  for (const brand of legacy.brands) {
    if (live.has(brand.url)) continue;
    const sample = legacy.lines.find((line) => line.brandSlug === brand.slug);
    const targetLine = sample ? survivorLine(sample.sourceIds) : null;
    const target = targetLine ? brandBySlug.get(targetLine.brandSlug) : null;
    if (!target) throw new Error(`No surviving brand for ${brand.url}`);
    redirects.push({
      from: brand.url,
      to: target.url,
      kind: "brand",
      brandSlug: brand.slug,
      lineSlug: "",
      fromName: brand.name,
      toName: target.name,
      fromLine: "",
      toLine: "",
    });
  }

  for (const line of legacy.lines) {
    if (live.has(line.url)) continue;
    const target = survivorLine(line.sourceIds);
    if (!target) throw new Error(`No surviving tire line for ${line.url}`);
    redirects.push({
      from: line.url,
      to: target.url,
      kind: "line",
      brandSlug: line.brandSlug,
      lineSlug: line.lineSlug,
      fromName: line.brand,
      toName: target.brand,
      fromLine: line.line,
      toLine: target.line,
    });
  }

  const liveBrandSlugs = new Set(catalog.brands.map((brand) => brand.slug));
  const liveLineKeys = new Set(catalog.lines.map((line) => `${line.brandSlug}/${line.lineSlug}`));
  for (const redirect of redirects) {
    if (!live.has(redirect.to)) throw new Error(`Redirect target missing ${redirect.to}`);
    if (redirect.kind === "brand" && liveBrandSlugs.has(redirect.brandSlug)) {
      throw new Error(`Redirect collides with a live brand ${redirect.from}`);
    }
    if (redirect.kind === "line" && liveLineKeys.has(`${redirect.brandSlug}/${redirect.lineSlug}`)) {
      throw new Error(`Redirect collides with a live tire line ${redirect.from}`);
    }
  }

  redirects.sort((a, b) => a.from.localeCompare(b.from));
  return redirects;
}

function buildCatalogFrom(ratings, plants, meta, keyFn, legacyBrands) {
  const brandSpellings = new Map();
  const lineGroups = new Map();

  for (const row of ratings) {
    const brand = cleanSpace(row.brand);
    const line = cleanSpace(row.tireline);
    if (!brand || !line) continue;
    const groupedKey = keyFn(brand);
    if (!brandSpellings.has(groupedKey)) brandSpellings.set(groupedKey, new Map());
    const spellings = brandSpellings.get(groupedKey);
    spellings.set(brand, (spellings.get(brand) || 0) + 1);

    const lineSlug = slugify(line);
    const groupKey = `${groupedKey}\n${lineSlug}`;
    if (!lineGroups.has(groupKey)) {
      lineGroups.set(groupKey, { brandKey: groupedKey, lineSlug, lineSpells: new Map(), rows: [] });
    }
    const group = lineGroups.get(groupKey);
    group.lineSpells.set(line, (group.lineSpells.get(line) || 0) + 1);

    const wear = row.wear == null || String(row.wear).trim() === "" ? null : String(row.wear).trim();
    const wearN = wear != null && /^\d+$/.test(wear) ? Number(wear) : null;
    const constructionRaw = cleanSpace(row.const);
    const construction = constructionRaw.toLowerCase() === "radial" ? "Radial" : constructionRaw;
    const size = String(row.size ?? "").trim();
    const trac = cleanSpace(row.trac).toUpperCase();
    const temp = cleanSpace(row.temp).toUpperCase();
    const complaintsCount = Number(row.complaintsCount) || 0;
    const recallsCount = Number(row.recallsCount) || 0;
    const investigationsCount = Number(row.investigationsCount) || 0;
    const manufacturerCommunicationsCount = Number(row.manufacturerCommunicationsCount) || 0;
    group.rows.push({
      id: Number(row.id),
      size,
      wear,
      wearN,
      trac,
      temp,
      construction,
      active: Boolean(row.active),
      complaintsCount,
      recallsCount,
      investigationsCount,
      manufacturerCommunicationsCount,
      dedupeKey: [
        size.toLowerCase(),
        wear ?? "",
        trac,
        temp,
        construction.toLowerCase(),
        row.active ? "1" : "0",
        complaintsCount,
        recallsCount,
        investigationsCount,
        manufacturerCommunicationsCount,
      ].join("|"),
    });
  }

  const brandName = new Map();
  for (const [brandKey, spellings] of brandSpellings) brandName.set(brandKey, chooseSpelling(spellings));

  const brandSlugByKey = new Map();
  const usedBrandSlugs = new Set();
  const brandKeys = [...brandName.keys()].sort((a, b) => brandName.get(a).localeCompare(brandName.get(b)));
  for (const groupedKey of brandKeys) {
    const displayName = brandName.get(groupedKey);
    brandSlugByKey.set(groupedKey, takeSlug(usedBrandSlugs, chooseSurvivorSlug(groupedKey, displayName, legacyBrands)));
  }

  const lines = [];
  const usedLineSlugs = new Map();
  const groups = [...lineGroups.values()].sort((a, b) => {
    const byBrand = brandName.get(a.brandKey).localeCompare(brandName.get(b.brandKey));
    if (byBrand) return byBrand;
    return chooseSpelling(a.lineSpells).localeCompare(chooseSpelling(b.lineSpells));
  });

  for (const group of groups) {
    const brand = brandName.get(group.brandKey);
    const brandSlug = brandSlugByKey.get(group.brandKey);
    const line = chooseSpelling(group.lineSpells);
    if (!usedLineSlugs.has(brandSlug)) usedLineSlugs.set(brandSlug, new Set());
    const lineSlug = takeSlug(usedLineSlugs.get(brandSlug), group.lineSlug || slugify(line));
    const sourceIds = group.rows.map((row) => row.id);
    const kept = new Map();
    for (const row of group.rows) {
      const previous = kept.get(row.dedupeKey);
      if (!previous || row.id < previous.id) kept.set(row.dedupeKey, row);
    }
    const rows = [...kept.values()].sort((a, b) => a.size.localeCompare(b.size, "en") || a.id - b.id);
    const wearNums = rows.map((row) => row.wearN).filter((value) => value != null);
    lines.push({
      brand,
      brandSlug,
      line,
      lineSlug,
      lineKey: nameKey(line),
      sourceIds,
      rows,
      wearMin: wearNums.length ? Math.min(...wearNums) : null,
      wearMax: wearNums.length ? Math.max(...wearNums) : null,
      traction: uniqueGrades(
        rows.map((row) => row.trac),
        TRACTION,
      ),
      temperature: uniqueGrades(
        rows.map((row) => row.temp),
        TEMPERATURE,
      ),
      nonstandard: rows.some(
        (row) => !TRACTION.includes(row.trac) || !TEMPERATURE.includes(row.temp) || (row.wear != null && row.wearN == null),
      ),
      url: `/tires/${brandSlug}/${lineSlug}/`,
    });
  }

  const byLineName = new Map();
  for (const line of lines) {
    if (!byLineName.has(line.lineKey)) byLineName.set(line.lineKey, []);
    byLineName.get(line.lineKey).push(line);
  }
  for (const line of lines) {
    line.sameName = byLineName
      .get(line.lineKey)
      .filter((other) => other.url !== line.url)
      .map((other) => ({ brand: other.brand, line: other.line, url: other.url }));
  }

  const linesByBrand = new Map();
  for (const line of lines) {
    if (!linesByBrand.has(line.brandSlug)) linesByBrand.set(line.brandSlug, []);
    linesByBrand.get(line.brandSlug).push(line);
  }

  const brands = brandKeys
    .map((groupedKey) => {
      const slug = brandSlugByKey.get(groupedKey);
      const displayName = brandName.get(groupedKey);
      const aliases = [...brandSpellings.get(groupedKey).entries()]
        .filter(([spelling]) => nameKey(spelling) !== nameKey(displayName))
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "en"));
      const brandLines = linesByBrand.get(slug) || [];
      const wears = [];
      const traction = Object.fromEntries(TRACTION.map((grade) => [grade, 0]));
      traction.other = 0;
      const temperature = Object.fromEntries(TEMPERATURE.map((grade) => [grade, 0]));
      temperature.other = 0;
      let rowCount = 0;
      for (const line of brandLines) {
        for (const row of line.rows) {
          rowCount += 1;
          if (row.wearN != null) wears.push(row.wearN);
          if (TRACTION.includes(row.trac)) traction[row.trac] += 1;
          else traction.other += 1;
          if (TEMPERATURE.includes(row.temp)) temperature[row.temp] += 1;
          else temperature.other += 1;
        }
      }
      return {
        name: displayName,
        slug,
        url: `/brands/${slug}/`,
        aliases,
        lineCount: brandLines.length,
        rowCount,
        wearMin: wears.length ? Math.min(...wears) : null,
        wearMax: wears.length ? Math.max(...wears) : null,
        traction,
        temperature,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  const plantObjects = [];
  const seenCodes = new Set();
  for (const raw of plants) {
    const code = cleanSpace(raw.dotCode || raw.DOTCode).toUpperCase();
    if (!code) continue;
    if (seenCodes.has(code)) throw new Error(`Duplicate DOT plant code ${code}`);
    seenCodes.add(code);
    const slug = code.toLowerCase();
    const countryRaw = cleanSpace(raw.country || raw.Country);
    plantObjects.push({
      code,
      slug,
      oldCode: cleanSpace(raw.oldDotCode || raw.OldDotCode).toUpperCase(),
      name: softenCaps(raw.name || raw.Name),
      address: softenCaps(raw.address || raw.Address),
      city: softenCaps(raw.city || raw.City),
      state: softenCaps(raw.stateProvince || raw.StateProvince),
      postal: cleanSpace(raw.postalCode || raw.PostalCode),
      country: softenCaps(countryRaw),
      countryKey: nameKey(countryRaw),
      status: cleanSpace(raw.status || raw.Status) || null,
      url: `/plants/${slug}/`,
    });
  }
  plantObjects.sort((a, b) => a.code.localeCompare(b.code));

  const slugCounts = new Map();
  for (const plant of plantObjects) slugCounts.set(plant.slug, (slugCounts.get(plant.slug) || 0) + 1);
  for (const [slug, count] of slugCounts) {
    if (count > 1) throw new Error(`Plant slug collision ${slug}`);
  }

  const byPlantName = new Map();
  const byOld = new Map();
  for (const plant of plantObjects) {
    const nameKeyValue = plant.name.toLowerCase();
    if (!byPlantName.has(nameKeyValue)) byPlantName.set(nameKeyValue, []);
    byPlantName.get(nameKeyValue).push(plant);
    if (!plant.oldCode) continue;
    if (!byOld.has(plant.oldCode)) byOld.set(plant.oldCode, []);
    byOld.get(plant.oldCode).push(plant);
  }
  for (const plant of plantObjects) {
    plant.sameName = (byPlantName.get(plant.name.toLowerCase()) || [])
      .filter((other) => other.code !== plant.code)
      .map((other) => ({ code: other.code, city: other.city, country: other.country, url: other.url }));
    plant.oldCodeSharedWith = plant.oldCode
      ? (byOld.get(plant.oldCode) || []).filter((other) => other.code !== plant.code).map((other) => other.code)
      : [];
  }

  const countries = new Map();
  for (const plant of plantObjects) {
    if (!plant.countryKey) continue;
    if (!countries.has(plant.countryKey)) {
      countries.set(plant.countryKey, { key: plant.countryKey, label: plant.country, count: 0 });
    }
    const entry = countries.get(plant.countryKey);
    entry.count += 1;
    if (plant.country.length > entry.label.length) entry.label = plant.country;
  }

  const traction = Object.fromEntries(TRACTION.map((grade) => [grade, 0]));
  traction.other = 0;
  const temperature = Object.fromEntries(TEMPERATURE.map((grade) => [grade, 0]));
  temperature.other = 0;
  const wearBuckets = {
    under200: 0,
    from200to300: 0,
    from301to400: 0,
    from401to500: 0,
    from501to600: 0,
    over600: 0,
    missing: 0,
  };
  let rowCount = 0;
  let activeRows = 0;
  let safetyRows = 0;
  for (const line of lines) {
    for (const row of line.rows) {
      rowCount += 1;
      if (row.active) activeRows += 1;
      if (row.complaintsCount || row.recallsCount || row.investigationsCount || row.manufacturerCommunicationsCount) {
        safetyRows += 1;
      }
      if (TRACTION.includes(row.trac)) traction[row.trac] += 1;
      else traction.other += 1;
      if (TEMPERATURE.includes(row.temp)) temperature[row.temp] += 1;
      else temperature.other += 1;
      if (row.wearN == null) wearBuckets.missing += 1;
      else if (row.wearN < 200) wearBuckets.under200 += 1;
      else if (row.wearN <= 300) wearBuckets.from200to300 += 1;
      else if (row.wearN <= 400) wearBuckets.from301to400 += 1;
      else if (row.wearN <= 500) wearBuckets.from401to500 += 1;
      else if (row.wearN <= 600) wearBuckets.from501to600 += 1;
      else wearBuckets.over600 += 1;
    }
  }

  const lineByKey = new Map(lines.map((line) => [`${line.brandSlug}/${line.lineSlug}`, line]));
  const brandBySlug = new Map(brands.map((brand) => [brand.slug, brand]));
  const plantBySlug = new Map(plantObjects.map((plant) => [plant.slug, plant]));

  return {
    meta,
    brands,
    lines,
    plants: plantObjects,
    countries: [...countries.values()].sort((a, b) => a.label.localeCompare(b.label, "en")),
    stats: {
      brands: brands.length,
      lines: lines.length,
      rows: rowCount,
      plants: plantObjects.length,
      sourceRows: ratings.length,
      activeRows,
      safetyRows,
      traction,
      temperature,
      wearBuckets,
    },
    redirects: [],
    getBrand: (slug) => brandBySlug.get(slug) || null,
    getBrandLines: (slug) => linesByBrand.get(slug) || [],
    getLine: (brandSlug, lineSlug) => lineByKey.get(`${brandSlug}/${lineSlug}`) || null,
    getPlant: (slug) => plantBySlug.get(String(slug || "").toLowerCase()) || null,
  };
}

export function buildCatalog(ratings, plants, meta) {
  const legacy = buildCatalogFrom(ratings, plants, meta, nameKey, null);
  const catalog = buildCatalogFrom(ratings, plants, meta, brandKey, legacy.brands);
  catalog.redirects = redirectsBetween(legacy, catalog);
  return catalog;
}
