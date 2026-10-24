import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

const ratings = read("ratings.json");
const plants = read("plants.json");
const meta = read("meta.json");

assert.ok(Array.isArray(ratings), "ratings.json must be an array");
assert.ok(Array.isArray(plants), "plants.json must be an array");
assert.ok(ratings.length >= 4000 && ratings.length <= 30000, `ratings count ${ratings.length} is outside the absolute floor`);
assert.ok(plants.length >= 500 && plants.length <= 5000, `plants count ${plants.length} is outside the absolute floor`);
assert.equal(meta.ratings.rows, ratings.length, "meta ratings count does not match the file");
assert.equal(meta.plants.rows, plants.length, "meta plants count does not match the file");
assert.ok(!Number.isNaN(Date.parse(meta.verifiedAt)), "verifiedAt is not a date");
assert.equal(meta.ratings.source, "https://api.nhtsa.gov/tires?dataSet=ratings");
assert.match(meta.plants.source, /^https:\/\/vpic\.nhtsa\.dot\.gov\/api\/vehicles\/GetEquipmentPlantCodes\?/);

const ids = new Set();
for (const row of ratings) {
  assert.equal(typeof row.id, "number");
  assert.ok(!ids.has(row.id), `duplicate rating id ${row.id}`);
  ids.add(row.id);
  for (const key of ["brand", "tireline", "size", "trac", "temp"]) {
    assert.equal(typeof row[key], "string", `${row.id} ${key}`);
    assert.ok(row[key].trim(), `${row.id} blank ${key}`);
  }
  assert.ok(row.wear == null || typeof row.wear === "string");
  assert.equal(typeof row.const, "string");
  assert.equal(typeof row.active, "boolean");
  for (const key of ["complaintsCount", "recallsCount", "investigationsCount", "manufacturerCommunicationsCount"]) {
    assert.equal(typeof row[key], "number", `${row.id} ${key}`);
  }
}

const codes = new Set();
for (const row of plants) {
  assert.match(row.dotCode, /^[A-Z0-9]{2,3}$/, `bad plant code ${row.dotCode}`);
  assert.ok(!codes.has(row.dotCode), `duplicate plant ${row.dotCode}`);
  codes.add(row.dotCode);
  assert.equal(typeof row.name, "string");
  assert.ok(row.name.trim(), `plant ${row.dotCode} has no name`);
  if (row.oldDotCode) assert.match(row.oldDotCode, /^[A-Z0-9]{2,3}$/);
}

const recalls = read("recalls.json");
assert.ok(Array.isArray(recalls), "recalls.json must be an array");
assert.ok(recalls.length >= 100 && recalls.length <= 20000, `recall line count ${recalls.length} is outside the absolute floor`);
assert.equal(meta.recalls.lines, recalls.length, "meta recall line count does not match the file");
assert.equal(meta.recalls.source, "https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip");
assert.equal(meta.recalls.layout, "https://static.nhtsa.gov/odi/ffdd/rcl/RCL.txt");
assert.ok(!Number.isNaN(Date.parse(meta.recalls.retrievedAt)), "recalls.retrievedAt is not a date");
assert.ok(meta.recalls.campaigns >= 100 && meta.recalls.campaigns <= 1000, `recall campaigns ${meta.recalls.campaigns} outside the absolute floor`);
assert.ok(meta.recalls.brands >= 50 && meta.recalls.brands <= 1000, `recall brands ${meta.recalls.brands} outside the absolute floor`);
assert.ok(meta.recalls.tireRows >= recalls.length && meta.recalls.tireRows <= 200000, `tire row count ${meta.recalls.tireRows} is outside the absolute floor`);
assert.ok(
  meta.recalls.brandsWithDifferentFiler >= 0 && meta.recalls.brandsWithDifferentFiler <= meta.recalls.brands,
  "brandsWithDifferentFiler is outside the brand count",
);
assert.deepEqual(meta.recalls.fields, ["brand", "line", "filer", "manufacturers", "campaign", "reportDate", "units"]);

const recallKeys = new Set();
const recallCampaigns = new Set();
for (const row of recalls) {
  assert.match(row.campaign, /^[0-9]{2}T[0-9]{6}$/, `bad campaign ${row.campaign}`);
  assert.match(row.reportDate, /^\d{4}-\d{2}-\d{2}$/, `bad report date ${row.reportDate}`);
  assert.equal(typeof row.units, "number", `${row.campaign} units`);
  assert.ok(row.units >= 0, `${row.campaign} negative units`);
  for (const key of ["brand", "line", "filer"]) {
    assert.equal(typeof row[key], "string", `${row.campaign} ${key}`);
    assert.ok(row[key].trim(), `${row.campaign} blank ${key}`);
  }
  assert.ok(Array.isArray(row.manufacturers) && row.manufacturers.length > 0, `${row.campaign} manufacturers`);
  for (const name of row.manufacturers) assert.ok(String(name).trim(), `${row.campaign} blank manufacturer`);
  const key = `${row.campaign}\n${row.brand.toLowerCase()}\n${row.line.toLowerCase()}`;
  assert.ok(!recallKeys.has(key), `duplicate recall row ${row.campaign} ${row.brand} ${row.line}`);
  recallKeys.add(key);
  recallCampaigns.add(row.campaign);
}
assert.equal(recallCampaigns.size, meta.recalls.campaigns, "meta campaign count does not match the file");

console.log(`Data OK: ${ratings.length} ratings, ${plants.length} plants, ${recalls.length} recall lines, verified ${meta.verifiedAt}.`);
