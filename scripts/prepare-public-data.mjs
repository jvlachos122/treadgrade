import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLineRecord, recallRowsForLine, toPublicSummary } from "../src/lib/compare.js";
import { buildCatalog } from "../src/lib/normalize.js";
import { compactPublicRow } from "../src/lib/ratings-table.js";
import { summarizeRecallRows } from "../src/lib/recalls.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ratings = JSON.parse(readFileSync(join(root, "data/ratings.json"), "utf8"));
const plants = JSON.parse(readFileSync(join(root, "data/plants.json"), "utf8"));
const recalls = JSON.parse(readFileSync(join(root, "data/recalls.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
const catalog = buildCatalog(ratings, plants, meta);
const recallSummary = summarizeRecallRows(recalls);

const ratingsPayload = {
  verifiedAt: meta.verifiedAt,
  source: meta.ratings.source,
  lines: catalog.lines.map((line) => ({ b: line.brand, l: line.line, u: line.url })),
  rows: catalog.lines.flatMap((line, index) => line.rows.map((row) => compactPublicRow(index, row))),
};

const plantsPayload = catalog.plants.map((plant) => ({
  code: plant.code,
  oldCode: plant.oldCode,
  name: plant.name,
  address: plant.address,
  city: plant.city,
  state: plant.state,
  postal: plant.postal,
  country: plant.country,
  status: plant.status,
  url: plant.url,
}));

const searchPayload = {
  lines: catalog.lines.map((line) => ({
    b: line.brand,
    l: line.line,
    u: line.url,
    w: line.wearMin == null ? "" : line.wearMin === line.wearMax ? String(line.wearMin) : `${line.wearMin}–${line.wearMax}`,
  })),
  brands: catalog.brands.map((brand) => ({
    n: brand.name,
    u: brand.url,
    c: brand.lineCount,
    ...(brand.aliases.length ? { a: brand.aliases.map((alias) => alias.name) } : {}),
  })),
  plants: catalog.plants.map((plant) => ({
    c: plant.code,
    o: plant.oldCode,
    n: plant.name,
    city: plant.city,
    country: plant.country,
    ...(plant.countryRaw && plant.countryRaw !== plant.country ? { raw: plant.countryRaw } : {}),
    u: plant.url,
  })),
};

const compareIndex = {
  lines: catalog.lines.map((line) => ({
    id: `${line.brandSlug}/${line.lineSlug}`,
    b: line.brand,
    l: line.line,
    n: line.rows.length,
  })),
};

const out = join(root, "public/data");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "ratings.json"), JSON.stringify(ratingsPayload));
writeFileSync(join(out, "plants.json"), JSON.stringify(plantsPayload));
writeFileSync(join(out, "search.json"), JSON.stringify(searchPayload));
writeFileSync(join(out, "compare-index.json"), JSON.stringify(compareIndex));
for (const line of catalog.lines) {
  const record = buildLineRecord(line, {
    recallRows: recallRowsForLine(line, recallSummary),
    plants: catalog.plants,
  });
  const file = join(out, "compare", line.brandSlug, `${line.lineSlug}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(toPublicSummary(record)));
}
console.log(
  `Public data: ${catalog.stats.brands} brands, ${catalog.stats.lines} tire lines, ${catalog.stats.rows} grade rows (${catalog.stats.sourceRows} source rows), ${catalog.stats.plants} plants, ${compareIndex.lines.length} compare summaries.`,
);
