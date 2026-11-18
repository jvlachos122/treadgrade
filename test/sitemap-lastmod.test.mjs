import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "../src/lib/normalize.js";
import { indexablePathSet } from "../src/lib/sitemap.js";
import {
  brandData,
  contentHashes,
  countryData,
  currentDataset,
  lineData,
  plantData,
  ratingsData,
} from "../src/lib/sitemap-content.js";
import {
  isDay,
  isIgnoredInput,
  lastmodForPath,
  newestDay,
  pageHash,
  readLedger,
  reconcileLedger,
  rewriteBuiltSitemaps,
  sitemapBlocks,
  sourceHash,
  utcDay,
} from "../src/lib/sitemap-lastmod.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readRepo(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("shared layout, header, footer, and styles are not page content", () => {
  for (const rel of [
    "src/layouts/Base.astro",
    "src/components/Header.astro",
    "src/components/Footer.astro",
    "src/components/Breadcrumbs.astro",
    "src/styles/global.css",
  ]) {
    assert.equal(isIgnoredInput(rel), true, rel);
  }
  const source = sourceHash("src/pages/tires/[brand]/[line].astro");
  for (const file of source.files) {
    assert.equal(isIgnoredInput(file), false, file);
    assert.equal(file.startsWith("src/layouts/"), false, file);
    assert.equal(file.endsWith(".css"), false, file);
  }
});

test("a layout, footer, or style change does not move any lastmod hash", () => {
  const before = contentHashes().hashes;
  const after = contentHashes(null, {
    readFile(rel) {
      const text = readRepo(rel);
      if (
        rel === "src/layouts/Base.astro" ||
        rel === "src/components/Header.astro" ||
        rel === "src/components/Footer.astro" ||
        rel === "src/styles/global.css"
      ) {
        return `${text}\n/* chrome-only */`;
      }
      return text;
    },
  }).hashes;
  assert.equal(after.size, before.size);
  for (const [path, hash] of before) assert.equal(after.get(path), hash, path);
});

test("a refresh timestamp does not move a page whose rows did not change", () => {
  const dataset = currentDataset();
  const before = contentHashes(dataset).hashes;
  dataset.meta = {
    ...dataset.meta,
    verifiedAt: "2026-11-18T12:00:00.000Z",
    recalls: { ...dataset.meta.recalls, retrievedAt: "2026-11-18T12:00:00.000Z" },
  };
  const after = contentHashes(dataset).hashes;
  for (const [path, hash] of before) assert.equal(after.get(path), hash, path);
});

test("one line's grade change moves that line and the pages that render it", () => {
  const dataset = currentDataset();
  const catalog = buildCatalog(dataset.ratings, dataset.plants, dataset.meta);
  const line = catalog.lines.find((item) => item.wearMin != null && item.wearMin !== item.wearMax);
  assert.ok(line, "sample line");
  const sample = line.rows.find((row) => String(row.wear) === String(line.wearMin));
  const raw = dataset.ratings.find((row) => row.id === sample.id);
  const other = catalog.lines.find((item) => item.brandSlug !== line.brandSlug);
  const plant = catalog.plants[0];
  const before = contentHashes(dataset).hashes;
  raw.wear = String(line.wearMax + 50);
  const after = contentHashes(dataset).hashes;
  const moved = [...after.keys()].filter((path) => before.get(path) !== after.get(path));
  assert.ok(moved.includes(line.url), "the line page");
  assert.ok(moved.includes(`/brands/${line.brandSlug}/`), "the brand hub renders the treadwear range");
  assert.equal(moved.includes(other.url), false);
  assert.equal(moved.includes("/contact/"), false);
  assert.equal(moved.includes("/about/"), false);
  assert.equal(moved.includes(plant.url), false);
  for (const path of moved) {
    const otherEntity =
      (path.startsWith("/tires/") && path !== line.url) ||
      (path.startsWith("/brands/") && path !== `/brands/${line.brandSlug}/` && path !== "/brands/") ||
      (path.startsWith("/plants/") && path !== "/plants/") ||
      (path.startsWith("/who-makes/") && path !== "/who-makes-it/") ||
      (path.startsWith("/compare/") && path !== "/compare/");
    assert.equal(otherEntity, false, path);
  }
});

test("a field the brand hub does not render stays off that hub", () => {
  const line = {
    brand: "Acme",
    line: "Sport",
    url: "/tires/acme/sport/",
    wearMin: 400,
    wearMax: 600,
    traction: ["A"],
    temperature: ["A"],
    sameName: [],
    rows: [
      row(1, "195/65R15", "400"),
      row(2, "205/55R16", "500"),
      row(3, "225/45R17", "600"),
    ],
  };
  const other = {
    ...line,
    line: "Tour",
    url: "/tires/acme/tour/",
    rows: [row(4, "205/55R16", "400")],
    wearMin: 400,
    wearMax: 400,
  };
  const brand = {
    name: "Acme",
    url: "/brands/acme/",
    aliases: [],
    lineCount: 2,
    rowCount: 4,
    wearMin: 400,
    wearMax: 600,
    traction: { A: 4 },
    temperature: { A: 4 },
  };
  const plant = {
    code: "1FT",
    oldCode: "FT",
    name: "Acme",
    address: "Old road",
    city: "Akron",
    state: "Ohio",
    postal: "44301",
    country: "United States",
    status: "Active",
    sameName: [],
    oldCodeSharedWith: [],
  };
  const before = hashesFor(line, other, brand, plant);
  line.rows[1].wear = "510";
  const mid = hashesFor(line, other, brand, plant);
  assert.notEqual(mid.get(line.url), before.get(line.url));
  assert.equal(mid.get(brand.url), before.get(brand.url));
  assert.equal(mid.get(other.url), before.get(other.url));
  assert.equal(mid.get("/contact/"), before.get("/contact/"));
  line.rows[2].wear = "640";
  line.wearMax = 640;
  brand.wearMax = 640;
  const range = hashesFor(line, other, brand, plant);
  assert.notEqual(range.get(line.url), mid.get(line.url));
  assert.notEqual(range.get(brand.url), mid.get(brand.url));
  assert.notEqual(range.get("/ratings/"), mid.get("/ratings/"));
  assert.equal(range.get(other.url), mid.get(other.url));
  assert.equal(range.get("/plants/1ft/"), mid.get("/plants/1ft/"));

  plant.address = "New road";
  const address = hashesFor(line, other, brand, plant);
  assert.notEqual(address.get("/plants/1ft/"), range.get("/plants/1ft/"));
  assert.equal(address.get("/plants/country/united-states/"), range.get("/plants/country/united-states/"));
  plant.city = "Canton";
  const city = hashesFor(line, other, brand, plant);
  assert.notEqual(city.get("/plants/country/united-states/"), address.get("/plants/country/united-states/"));
  assert.equal(city.get(line.url), address.get(line.url));
});

test("ledger days stay put until the hash changes, and a new URL gets that day", () => {
  const first = reconcileLedger({ urls: {} }, new Map([["/tires/acme/sport/", "hash-a"]]), "2026-11-01");
  assert.equal(first.urls["/tires/acme/sport/"].date, "2026-11-01");
  const same = reconcileLedger(
    first,
    new Map([
      ["/tires/acme/sport/", "hash-a"],
      ["/brands/acme/", "hash-b"],
    ]),
    "2026-11-18",
  );
  assert.equal(same.urls["/tires/acme/sport/"].date, "2026-11-01");
  assert.equal(same.urls["/brands/acme/"].date, "2026-11-18");
  const changed = reconcileLedger(same, new Map([["/tires/acme/sport/", "hash-c"]]), "2026-11-18");
  assert.equal(changed.urls["/tires/acme/sport/"].date, "2026-11-18");
  const omitted = reconcileLedger({ urls: {} }, new Map([["/contact/", ""]]), "2026-11-18");
  assert.equal(omitted.urls["/contact/"], undefined);
  assert.deepEqual(omitted.omitted, ["/contact/"]);
  assert.throws(() => reconcileLedger({ urls: {} }, new Map([["/contact/", "hash"]]), "2099-01-01"));
});

test("the sitemap index lastmod is the newest child lastmod", () => {
  const dir = mkdtempSync(join(tmpdir(), "treadgrade-sitemap-"));
  const ledger = {
    urls: {
      "/about/": { hash: "a", date: "2026-11-01" },
      "/ratings/": { hash: "b", date: "2026-11-17" },
    },
  };
  writeFileSync(
    join(dir, "sitemap-0.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><urlset>
      <url><loc>https://treadgrade.com/about/</loc><lastmod>2020-01-01T00:00:00.000Z</lastmod></url>
      <url><loc>https://treadgrade.com/ratings/</loc><lastmod>2020-01-01T00:00:00.000Z</lastmod></url>
      <url><loc>https://treadgrade.com/contact/</loc><lastmod>2020-01-01T00:00:00.000Z</lastmod></url>
    </urlset>`,
  );
  writeFileSync(
    join(dir, "sitemap-index.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex>
      <sitemap><loc>https://treadgrade.com/sitemap-0.xml</loc><lastmod>2026-11-18T00:00:00.000Z</lastmod></sitemap>
    </sitemapindex>`,
  );
  rewriteBuiltSitemaps(dir, ledger);
  const child = sitemapBlocks(readFileSync(join(dir, "sitemap-0.xml"), "utf8"));
  const index = sitemapBlocks(readFileSync(join(dir, "sitemap-index.xml"), "utf8"));
  const byPath = new Map(child.map((item) => [item.pathname, item.lastmod]));
  assert.equal(byPath.get("/about/"), "2026-11-01");
  assert.equal(byPath.get("/ratings/"), "2026-11-17");
  assert.equal(byPath.get("/contact/"), "");
  assert.equal(index[0].lastmod, newestDay(["2026-11-01", "2026-11-17"]));
  assert.equal(index[0].lastmod, "2026-11-17");
  for (const day of byPath.values()) {
    if (!day) continue;
    assert.equal(isDay(day), true);
    assert.equal(day <= utcDay(), true);
  }
});

test("the committed ledger matches this tree and does not date the future", () => {
  const { hashes } = contentHashes();
  const expected = indexablePathSet();
  assert.equal(hashes.size, expected.size);
  for (const path of expected) assert.equal(hashes.has(path), true, path);
  for (const path of hashes.keys()) assert.equal(expected.has(path), true, path);
  const ledger = readLedger();
  const today = utcDay();
  assert.equal(Object.keys(ledger.urls).length, hashes.size);
  for (const [path, hash] of hashes) {
    const entry = ledger.urls[path];
    assert.ok(entry, path);
    assert.equal(entry.hash, hash, path);
    assert.equal(isDay(entry.date), true, path);
    assert.equal(entry.date <= today, true, `${path} ${entry.date}`);
    assert.equal(lastmodForPath(path, ledger), entry.date);
  }
});

function row(id, size, wear) {
  return {
    id,
    size,
    wear,
    wearN: Number(wear),
    trac: "A",
    temp: "A",
    construction: "Radial",
    active: true,
    complaintsCount: 0,
    recallsCount: 0,
    investigationsCount: 0,
    manufacturerCommunicationsCount: 0,
  };
}

function hashesFor(line, other, brand, plant) {
  const lines = [line, other];
  const source = "template";
  const map = new Map();
  map.set(line.url, pageHash(source, lineData(line)));
  map.set(other.url, pageHash(source, lineData(other)));
  map.set(brand.url, pageHash("brand", brandData(brand, lines)));
  map.set("/ratings/", pageHash("ratings", ratingsData(lines)));
  map.set("/plants/1ft/", pageHash("plant", plantData(plant)));
  map.set("/plants/country/united-states/", pageHash("country", countryData([plant])));
  map.set("/contact/", pageHash("contact", null));
  return map;
}
