import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { brandPlantJump, brandProfile, brandProfiles, mapBrandPlants } from "../src/lib/brand-pages.js";
import { catalog } from "../src/lib/catalog.js";
import { exampleComparisonPaths } from "../src/lib/compare-pages.js";
import { formatVerified } from "../src/lib/format.js";
import { hubPaths } from "../src/lib/plant-hubs.js";
import {
  BANNED_PLANT_QUERY_WORD,
  DECODER_QUERY_HINT,
  PLANTS_QUERY_HINT,
  bareCodeLookup,
  brandLinkEntries,
  interpretPlantQuery,
  packBrandLinks,
  plantQueryResult,
  unpackBrandLinks,
} from "../src/lib/plant-query.js";
import { REBADGED_TIRES_PATH } from "../src/lib/rebadged-tires.js";
import { PINNED_STATIC_INDEXABLE_PATHS, STATIC_INDEXABLE_PATHS, indexablePathSet } from "../src/lib/sitemap.js";
import { decodeTin, exactPlantMatches, indexPlants } from "../src/lib/tin.js";
import { whoMakesPages } from "../src/lib/who-makes-pages.js";

const now = new Date(Date.UTC(2026, 10, 26));
const verified = catalog.meta.verifiedAt;
const verifiedLabel = formatVerified(verified);
const index = indexPlants(catalog.plants);
const entries = brandLinkEntries(catalog.brands, mapBrandPlants(catalog.brands, catalog.plants));
const SYMBOLS = "ABCDEFHJKLMNPRTUVWXY0123456789";

function codesOf(result) {
  return result.rows.map((row) => row.code);
}

function assertClean(text, label) {
  assert.equal(BANNED_PLANT_QUERY_WORD.test(text), false, `${label} ${text.match(BANNED_PLANT_QUERY_WORD)?.[0] || ""}`);
  assert.doesNotMatch(text, /\b(made by|manufactured by)\b/i, label);
}

function unusedCode(length) {
  const used = new Set(catalog.plants.flatMap((plant) => [plant.code, plant.oldCode].filter(Boolean)));
  const walk = (prefix) => {
    if (prefix.length === length) return used.has(prefix) ? "" : prefix;
    for (const symbol of SYMBOLS) {
      const found = walk(prefix + symbol);
      if (found) return found;
    }
    return "";
  };
  return walk("");
}

test("brand links pack the same plant codes the brand page lists", () => {
  assert.equal(entries.length, catalog.brands.length);
  for (const entry of entries) {
    assert.deepEqual(entry.codes, brandProfile(entry.slug).plants.map((plant) => plant.code), entry.slug);
  }
  const round = unpackBrandLinks(packBrandLinks(entries));
  assert.deepEqual(
    round,
    [...entries].sort((a, b) => a.slug.localeCompare(b.slug)),
  );
});

test("every brand name resolves to its linked plant codes, or says the list does not link it", () => {
  let linked = 0;
  for (const entry of entries) {
    for (const raw of [entry.name, entry.name.toLowerCase(), `plant codes for ${entry.name}`]) {
      const result = plantQueryResult(raw, index, entries, verified);
      assert.equal(result.mode, "brand", `${entry.slug} ${raw}`);
      assert.deepEqual(codesOf(result), entry.codes, `${entry.slug} ${raw}`);
      const text = result.sentences.join(" ");
      assert.match(text, new RegExp(verifiedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(text, /NHTSA's (equipment )?plant list/);
      assertClean(text, entry.slug);
      if (entry.codes.length) {
        assert.match(result.caption, new RegExp(`Plant codes for ${entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
        assert.equal(result.brandUrl, entry.url);
        linked += 1;
      } else {
        assert.equal(result.rows.length, 0, entry.slug);
        assert.match(text, new RegExp(`does not link ${entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
        assert.match(text, /does not assign a maker/);
        assert.equal(result.brandUrl, "");
      }
    }
    for (const alias of entry.aliases) {
      const result = plantQueryResult(alias, index, entries, verified);
      assert.equal(result.mode, "brand", alias);
      assert.deepEqual(codesOf(result), entry.codes, alias);
    }
  }
  assert.ok(linked > 0);
  console.log(`brand names with linked plant codes: ${entries.filter((entry) => entry.codes.length).length}`);
});

test("a typed brand the plant list does not link is not given a maker", () => {
  for (const raw of ["terramax", "Terramax", "what are the plant codes for terramax tires"]) {
    const result = plantQueryResult(raw, index, entries, verified);
    const known = entries.find(
      (entry) =>
        entry.name.toLowerCase() === "terramax" || entry.aliases.some((alias) => alias.toLowerCase() === "terramax"),
    );
    if (known?.codes.length) {
      assert.deepEqual(codesOf(result), known.codes, raw);
    } else {
      assert.equal(result.mode, "brand", raw);
      assert.equal(result.rows.length, 0, raw);
      assert.match(result.sentences.join(" "), /does not link terramax/i, raw);
      assert.match(result.sentences.join(" "), /does not assign a maker/);
      assert.doesNotMatch(result.sentences.join(" "), /\b(michelin|goodyear|bridgestone)\b/i);
    }
    assertClean(result.sentences.join(" "), raw);
  }
});

test("bare, lower-case, DOT, spaced, and punctuated plant codes keep every match", () => {
  const former = catalog.plants.find((plant) => plant.oldCode && !(plant.oldCodeSharedWith || []).length);
  const current = catalog.plants.find((plant) => plant.code.length === 3);
  assert.ok(former);
  assert.ok(current);
  const samples = [
    [former.oldCode, exactPlantMatches(former.oldCode, index).map((item) => item.code).sort()],
    [current.code, exactPlantMatches(current.code, index).map((item) => item.code).sort()],
  ];
  for (const [code, expected] of samples) {
    const forms = [
      code,
      code.toLowerCase(),
      `DOT ${code}`,
      `dot ${code.toLowerCase()}`,
      ` ${code} `,
      `(${code})`,
      `${code}.`,
      `dot/${code.toLowerCase()}`,
      `tire plant code ${code.toLowerCase()}`,
    ];
    for (const raw of forms) {
      const result = plantQueryResult(raw, index, entries, verified);
      assert.equal(result.mode, "tin", raw);
      const decoded = decodeTin(result.text, index, now);
      assert.deepEqual(
        decoded.matches.map((item) => item.code).sort(),
        expected,
        raw,
      );
      assert.ok(decoded.matches.some((item) => item.url), raw);
      const lookup = bareCodeLookup(decoded, verified);
      assert.ok(lookup, raw);
      assert.match(lookup.caption, /NHTSA's equipment plant list/);
      assert.match(lookup.sentences.join(" "), new RegExp(verifiedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assertClean(lookup.sentences.join(" "), raw);
    }
  }
});

test("a brand word next to a code lists every record for that code", () => {
  const groups = new Map();
  for (const plant of catalog.plants) {
    if (!plant.oldCode) continue;
    if (!groups.has(plant.oldCode)) groups.set(plant.oldCode, []);
    groups.get(plant.oldCode).push(plant.code);
  }
  const shared = [...groups.entries()].find(([, codes]) => codes.length > 1);
  assert.ok(shared);
  const [sharedCode, sharedPlants] = shared;
  const brand = entries.find((entry) => entry.codes.length && !entry.name.toUpperCase().includes(sharedCode));
  assert.ok(brand);
  const raw = `${brand.name.toLowerCase()} ${sharedCode.toLowerCase()}`;
  const result = plantQueryResult(raw, index, entries, verified);
  assert.equal(result.mode, "code", raw);
  assert.deepEqual(codesOf(result).sort(), [...sharedPlants].sort(), raw);
  assert.ok(result.rows.length > 1);
  assert.match(result.sentences.join(" "), /Each match is listed/);
  assert.match(result.sentences.join(" "), /NHTSA's equipment plant list/);
  assert.match(result.caption, /NHTSA's equipment plant list/);
  assertClean(result.sentences.join(" "), raw);

  const single = catalog.plants.find((plant) => plant.oldCode && (groups.get(plant.oldCode) || []).length === 1);
  assert.ok(single);
  const withBrand = plantQueryResult(`bridgestone ${single.oldCode.toLowerCase()}`, index, entries, verified);
  const bridge = entries.find((entry) => entry.name.toLowerCase() === "bridgestone");
  if (bridge) {
    assert.equal(withBrand.mode, "code");
    assert.deepEqual(
      codesOf(withBrand).sort(),
      exactPlantMatches(single.oldCode, index).map((item) => item.code).sort(),
    );
    assert.doesNotMatch(codesOf(withBrand).join(" "), /^BR$/);
    assertClean(withBrand.sentences.join(" "), "brand word");
  }

  const decodedShared = decodeTin(sharedCode, index, now);
  assert.deepEqual(decodedShared.matches.map((item) => item.code).sort(), [...sharedPlants].sort());
  assert.match(decodedShared.notes.map((note) => note.text).join(" "), /NHTSA's equipment plant list/);
});

test("a code that is both current and former lists every record", () => {
  for (const plant of catalog.plants) {
    assert.ok(exactPlantMatches(plant.code, index).some((item) => item.code === plant.code && item.matchedOn === "current"));
    if (!plant.oldCode) continue;
    assert.ok(
      exactPlantMatches(plant.oldCode, index).some((item) => item.code === plant.code && item.matchedOn === "old"),
      plant.code,
    );
  }
  const both = new Set();
  for (const plant of catalog.plants) {
    if (index.byCode.has(plant.code) && index.byOld.has(plant.code)) both.add(plant.code);
    if (plant.oldCode && index.byCode.has(plant.oldCode) && index.byOld.has(plant.oldCode)) both.add(plant.oldCode);
  }
  for (const code of both) {
    const exact = exactPlantMatches(code, index);
    const decoded = decodeTin(code, index, now);
    assert.deepEqual(
      decoded.matches.map((item) => `${item.matchedOn}:${item.code}`).sort(),
      exact.map((item) => `${item.matchedOn}:${item.code}`).sort(),
      code,
    );
    assert.match(decoded.notes.map((note) => note.text).join(" "), /current code and a former code/);
  }

  const [first, second] = catalog.plants;
  for (const length of [2, 3]) {
    const code = unusedCode(length);
    assert.ok(code, `unused ${length}-symbol code`);
    const synthetic = indexPlants([
      { ...first, code, oldCode: "", url: `/plants/${code.toLowerCase()}/` },
      { ...second, oldCode: code },
    ]);
    const decoded = decodeTin(code.toLowerCase(), synthetic, now);
    assert.equal(decoded.matches.length, 2, code);
    assert.ok(decoded.matches.some((item) => item.matchedOn === "current" && item.code === code));
    assert.ok(decoded.matches.some((item) => item.matchedOn === "old" && item.code === second.code));
    assert.match(decoded.notes.map((note) => note.text).join(" "), /Each match is listed/);
    assert.match(decoded.notes.map((note) => note.text).join(" "), /NHTSA's equipment plant list/);
    assertClean(decoded.notes.map((note) => note.text).join(" "), code);
    const queried = plantQueryResult(`(${code.toLowerCase()})`, synthetic, entries, verified);
    assert.equal(queried.mode, "tin");
    const again = decodeTin(queried.text, synthetic, now);
    assert.equal(again.matches.length, 2);
  }
});

test("a full TIN and a no-space partial stay on the TIN parser", () => {
  const full = plantQueryResult("DOT 1U2 ABCDEF 0109", index, entries, verified);
  assert.equal(full.mode, "tin");
  const decoded = decodeTin(full.text, index, now);
  assert.equal(decoded.format, "new-13");
  assert.equal(decoded.plantCode, "1U2");

  const sample = catalog.plants.find((plant) => plant.code.length === 3 && /[A-Z]/.test(plant.code));
  assert.ok(sample);
  const partial = plantQueryResult(`${sample.code.toLowerCase()}hd`, index, entries, verified);
  assert.equal(partial.mode, "tin");
  const read = decodeTin(partial.text, index, now);
  assert.equal(read.plantCode, sample.code);
  assert.equal(read.matches[0].url, sample.url);

  const invalid = interpretPlantQuery("DOT 00T GGGGGG 0109", index, entries);
  assert.equal(invalid.mode, "tin");
  assert.match(invalid.text, /GGG/);
});

test("the brand jump is present only where plant codes are linked", () => {
  let jumps = 0;
  for (const profile of brandProfiles) {
    const jump = brandPlantJump(profile);
    if (profile.plants.length) {
      assert.deepEqual(jump, { href: "#plant-codes", label: "Plant codes for this brand" });
      assert.match(profile.plantsCaption, new RegExp(`Plant codes for ${profile.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      assertClean(profile.plantsCaption, profile.slug);
      assertClean(jump.label, profile.slug);
      jumps += 1;
    } else {
      assert.equal(jump, null, profile.slug);
    }
  }
  assert.ok(jumps > 0);
  assert.equal(jumps, brandProfiles.filter((profile) => profile.plants.length).length);
  console.log(`brand pages with the plant-code jump: ${jumps}`);

  const page = readFileSync(new URL("../src/pages/brands/[brand].astro", import.meta.url), "utf8");
  const jumpBlock = page.slice(page.indexOf("plantJump ?"), page.indexOf('id="summary"'));
  assert.match(jumpBlock, /plantJump\.href/);
  assert.match(jumpBlock, /plantJump\.label/);
  assert.equal(BANNED_PLANT_QUERY_WORD.test(jumpBlock), false);
  assert.doesNotMatch(jumpBlock, /noindex|canonical|robots/i);
  const sectionStart = page.indexOf('id="plant-codes"');
  assert.ok(sectionStart > 0);
  const section = page.slice(sectionStart, page.indexOf("plantGroup", sectionStart));
  assert.match(section, /<caption>/);
  assert.match(section, /BRAND_PLANT_JUMP/);
  assert.equal(BANNED_PLANT_QUERY_WORD.test(section), false);
});

test("decoder and plant pages share the lookup, and the sitemap gains no URL", () => {
  const decoder = readFileSync(new URL("../src/scripts/decoder.js", import.meta.url), "utf8");
  const widget = readFileSync(new URL("../src/scripts/plant-decoder.js", import.meta.url), "utf8");
  const filter = readFileSync(new URL("../src/scripts/table-filter.js", import.meta.url), "utf8");
  const decoderPage = readFileSync(new URL("../src/pages/decoder.astro", import.meta.url), "utf8");
  const plantsPage = readFileSync(new URL("../src/pages/plants/index.astro", import.meta.url), "utf8");
  for (const source of [decoder, widget]) {
    assert.match(source, /plantQueryResult/);
    assert.match(source, /import \{ decodeTin(?:,|\s)/);
    assert.match(source, /from "\.\.\/lib\/tin\.js"/);
  }
  assert.match(filter, /plantQueryResult/);
  assert.match(filter, /bareCodeLookup/);
  assert.match(filter, /dataset\.search\.includes/);
  assert.doesNotMatch(widget, /\bfetch\s*\(/);
  assert.match(decoderPage, /DECODER_QUERY_HINT/);
  assert.match(decoderPage, /data-verified=/);
  assert.match(plantsPage, /data-lookup/);
  assert.match(plantsPage, /data-code=/);
  assert.match(plantsPage, /PLANTS_QUERY_HINT/);
  assertClean(DECODER_QUERY_HINT, "decoder hint");
  assertClean(PLANTS_QUERY_HINT, "plants hint");
  assert.match(decoderPage, /DECODER_QUERY_HINT/);
  assert.doesNotMatch(DECODER_QUERY_HINT, /\b(best|recommend)/i);
  assert.doesNotMatch(PLANTS_QUERY_HINT, /\b(best|recommend)/i);

  const added = STATIC_INDEXABLE_PATHS.filter((path) => !PINNED_STATIC_INDEXABLE_PATHS.includes(path));
  const removed = PINNED_STATIC_INDEXABLE_PATHS.filter((path) => !STATIC_INDEXABLE_PATHS.includes(path));
  assert.deepEqual(added, [REBADGED_TIRES_PATH]);
  assert.deepEqual(removed, []);
  const expected = new Set(STATIC_INDEXABLE_PATHS);
  for (const brand of catalog.brands) expected.add(brand.url);
  for (const line of catalog.lines) expected.add(line.url);
  for (const plant of catalog.plants) expected.add(plant.url);
  for (const path of hubPaths) expected.add(path);
  for (const page of whoMakesPages) expected.add(page.url);
  for (const path of exampleComparisonPaths) expected.add(path);
  const live = indexablePathSet();
  assert.equal(live.size, expected.size);
  for (const path of live) assert.equal(expected.has(path), true, path);
  for (const path of expected) assert.equal(live.has(path), true, path);
  assert.equal([...live].some((path) => /plant-query|plant-codes/.test(path)), false);
});
