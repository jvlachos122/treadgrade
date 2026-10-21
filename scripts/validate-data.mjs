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

console.log(`Data OK: ${ratings.length} ratings, ${plants.length} plants, verified ${meta.verifiedAt}.`);
