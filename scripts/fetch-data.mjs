import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const RATINGS_SOURCE = "https://api.nhtsa.gov/tires?dataSet=ratings";
const PLANTS_ENDPOINT = "https://vpic.nhtsa.dot.gov/api/vehicles/GetEquipmentPlantCodes";
const PAGE_SIZE = 100;
const TOLERANCE = Number(process.env.FETCH_COUNT_TOLERANCE ?? 0.25);
const ALLOW_ANY = process.env.FETCH_ALLOW_ANY_COUNT === "1";
const HARD_MIN_RATINGS = 1000;
const HARD_MIN_PLANTS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "TreadGrade/1.0 (+https://treadgrade.com/methodology/)",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.json();
  } catch (error) {
    if (attempt >= 4) throw error;
    await sleep(400 * 2 ** attempt);
    return getJson(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool(items, limit, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return output;
}

function slimRating(row) {
  const missing = ["id", "brand", "tireline", "size", "trac", "temp"].filter((key) => row[key] == null || row[key] === "");
  if (missing.length) {
    throw new Error(`Rating ${row.id ?? "?"} is missing ${missing.join(", ")}`);
  }
  return {
    id: Number(row.id),
    brand: String(row.brand),
    tireline: String(row.tireline),
    size: String(row.size),
    const: row.const == null ? "" : String(row.const),
    wear: row.wear == null || String(row.wear).trim() === "" ? null : String(row.wear).trim(),
    trac: String(row.trac),
    temp: String(row.temp),
    active: Boolean(row.active),
    complaintsCount: Number(row.complaintsCount) || 0,
    recallsCount: Number(row.recallsCount) || 0,
    investigationsCount: Number(row.investigationsCount) || 0,
    manufacturerCommunicationsCount: Number(row.manufacturerCommunicationsCount) || 0,
  };
}

async function fetchRatings() {
  const firstUrl = `${RATINGS_SOURCE}&data=none&max=${PAGE_SIZE}&offset=0`;
  const first = await getJson(firstUrl);
  const total = first?.meta?.pagination?.total;
  if (!Number.isInteger(total) || total < HARD_MIN_RATINGS || total > 50000) {
    throw new Error(`Unexpected ratings total: ${total}`);
  }
  const pages = Math.ceil(total / PAGE_SIZE);
  console.log(`Ratings API reports ${total} rows across ${pages} pages.`);
  const offsets = [];
  for (let page = 1; page < pages; page += 1) offsets.push(page * PAGE_SIZE);
  const rest = await mapPool(offsets, 4, async (offset) => {
    const payload = await getJson(`${RATINGS_SOURCE}&data=none&max=${PAGE_SIZE}&offset=${offset}`);
    return payload.results || [];
  });
  const combined = [...(first.results || []), ...rest.flat()];
  const byId = new Map();
  for (const row of combined) {
    if (row?.id == null || byId.has(row.id)) continue;
    byId.set(row.id, slimRating(row));
  }
  if (byId.size !== total) {
    throw new Error(`Fetched ${byId.size} unique ratings, but the API total is ${total}.`);
  }
  const rows = [...byId.values()].sort((a, b) => a.id - b.id);
  return { rows, total };
}

async function fetchPlants() {
  const year = new Date().getUTCFullYear();
  const years = [...new Set([year, year - 1, 2016])];
  let lastError = null;
  for (const requestedYear of years) {
    const source = `${PLANTS_ENDPOINT}?year=${requestedYear}&equipmentType=1&reportType=All&format=json`;
    try {
      const payload = await getJson(source);
      const results = payload?.Results;
      if (!Array.isArray(results) || results.length < HARD_MIN_PLANTS) {
        throw new Error(`Plant list for ${requestedYear} has ${results?.length ?? 0} rows.`);
      }
      if (payload.Count != null && payload.Count !== results.length) {
        throw new Error(`Plant Count ${payload.Count} does not match Results length ${results.length}.`);
      }
      const rows = results.map((row) => ({
        dotCode: String(row.DOTCode ?? "").trim(),
        oldDotCode: String(row.OldDotCode ?? "").trim(),
        name: String(row.Name ?? "").trim(),
        address: String(row.Address ?? "").trim(),
        city: String(row.City ?? "").trim(),
        stateProvince: String(row.StateProvince ?? "").trim(),
        postalCode: String(row.PostalCode ?? "").trim(),
        country: String(row.Country ?? "").trim(),
        status: row.Status == null || String(row.Status).trim() === "" ? null : String(row.Status).trim(),
      }));
      const codes = new Set(rows.map((row) => row.dotCode));
      if (codes.size !== rows.length || [...codes].some((code) => !code)) {
        throw new Error("Plant DOT codes are missing or duplicated.");
      }
      return {
        rows,
        source,
        year: requestedYear,
        count: payload.Count,
        searchCriteria: payload.SearchCriteria || "",
      };
    } catch (error) {
      lastError = error;
      console.error(`Plant fetch for ${requestedYear} failed: ${error.message}`);
    }
  }
  throw lastError;
}

function previousCount(path, listKey) {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed.length : Array.isArray(parsed?.[listKey]) ? parsed[listKey].length : null;
  } catch {
    return null;
  }
}

function assertNear(label, next, previous) {
  if (previous == null || ALLOW_ANY) {
    console.log(`${label}: ${next} rows (no relative comparison).`);
    return;
  }
  const low = previous * (1 - TOLERANCE);
  const high = previous * (1 + TOLERANCE);
  if (next < low || next > high) {
    throw new Error(
      `${label} count ${next} is outside ${TOLERANCE * 100}% of the previous ${previous}. Refusing to replace the saved file. Set FETCH_ALLOW_ANY_COUNT=1 to override.`,
    );
  }
  console.log(`${label}: ${next} rows, previous ${previous}.`);
}

function writeJson(path, value) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

async function main() {
  mkdirSync(dataDir, { recursive: true });
  const ratings = await fetchRatings();
  const plants = await fetchPlants();
  assertNear("Ratings", ratings.rows.length, previousCount(join(dataDir, "ratings.json")));
  assertNear("Plants", plants.rows.length, previousCount(join(dataDir, "plants.json")));
  const meta = {
    verifiedAt: new Date().toISOString(),
    ratings: {
      source: RATINGS_SOURCE,
      rows: ratings.rows.length,
      totalReported: ratings.total,
      pageSize: PAGE_SIZE,
      fields: ["id", "brand", "tireline", "size", "const", "wear", "trac", "temp", "active", "complaintsCount", "recallsCount", "investigationsCount", "manufacturerCommunicationsCount"],
    },
    plants: {
      source: plants.source,
      yearRequested: plants.year,
      rows: plants.rows.length,
      countReported: plants.count,
      searchCriteria: plants.searchCriteria,
      fields: ["dotCode", "oldDotCode", "name", "address", "city", "stateProvince", "postalCode", "country", "status"],
    },
  };
  writeJson(join(dataDir, "ratings.json"), ratings.rows);
  writeJson(join(dataDir, "plants.json"), plants.rows);
  writeJson(join(dataDir, "meta.json"), meta);
  console.log(`Wrote data verified at ${meta.verifiedAt}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
